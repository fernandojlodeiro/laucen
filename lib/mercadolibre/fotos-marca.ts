// Pauta de las publicaciones nuevas (Fer, 10/10): una foto con la marca «Tiendavirtual» (el logo o
// el texto puesto encima) no se usa. Las mira Claude (el modelo chico) por su dirección en ML; cada
// foto se mira una sola vez (ml_foto_revisada, por el id de la foto en ML). Si Claude no contesta,
// la foto queda; si todas tienen la marca, quedan todas (una publicación necesita fotos).

import { consulta } from "@/lib/erp/base";
import { pedirClaude, hayClaude, jsonDe, type Contenido } from "@/lib/claude";

type Foto = { id?: string | null; url?: string | null; secure_url?: string | null };

const SISTEMA = "Revisás fotos de productos de una tienda. Para cada imagen, en orden, decí si se ve el logo o la palabra «Tiendavirtual» " +
  "(también «Tienda Virtual» o «tiendavirtual.com») escrita o estampada en la imagen. Contestá sólo una lista JSON de true/false, una por imagen.";

const TANDA = 8;

export async function sinFotosConMarca<T extends Foto>(fotos: T[]): Promise<T[]> {
  const conId = fotos.filter((f) => f.id && (f.secure_url ?? f.url));
  if (!conId.length || !hayClaude()) return fotos;
  const ids = conId.map((f) => f.id!);
  const sabidas = new Map((await consulta<{ id: string; con_marca: boolean }>(
    "select picture_id id, con_marca from ml_foto_revisada where picture_id = any($1)", [ids])).map((x) => [x.id, x.con_marca]));
  const faltan = conId.filter((f) => !sabidas.has(f.id!));
  for (let i = 0; i < faltan.length; i += TANDA) {
    const tanda = faltan.slice(i, i + TANDA);
    const contenido: Contenido = [
      ...tanda.map((f) => ({ type: "image" as const, source: { type: "url" as const, url: (f.secure_url ?? f.url)!.replace(/\.webp$/, ".jpg") } })),
      { type: "text" as const, text: `Son ${tanda.length} imágenes. Lista JSON de ${tanda.length} true/false.` },
    ];
    const r = await pedirClaude({ system: SISTEMA, contenido, maxTokens: 200, modelo: "chico" });
    const lista = "texto" in r ? jsonDe<boolean[]>(r.texto) : null;
    if (!Array.isArray(lista) || lista.length !== tanda.length) continue;
    for (let j = 0; j < tanda.length; j++) {
      sabidas.set(tanda[j].id!, lista[j] === true);
      await consulta("insert into ml_foto_revisada (picture_id, con_marca) values ($1, $2) on conflict (picture_id) do update set con_marca = excluded.con_marca, revisada_ts = now()",
        [tanda[j].id, lista[j] === true]);
    }
  }
  const limpias = fotos.filter((f) => !(f.id && sabidas.get(f.id) === true));
  return limpias.length ? limpias : fotos;
}
