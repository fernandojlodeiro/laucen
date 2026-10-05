"use server";

// Acciones de "Copiar entre cuentas": preparar el lote que crea en otra cuenta las
// publicaciones elegidas (queda esperando el clic en la cola).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp } from "@/lib/erp/base";
import { intentar, texto, id, tildado } from "@/lib/erp/acciones";
import { prepararCopia } from "@/lib/mercadolibre/copiar";

const BASE = "/catalogo/publicaciones/copiar";

/** A dónde volver: esta pantalla con los mismos filtros. */
const volverDe = (fd: FormData) => {
  const v = texto(fd, "volver");
  return v && v.startsWith(BASE) ? v : BASE;
};

export async function accionPrepararCopia(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  const volver = volverDe(fd);
  await intentar(volver, async () => {
    const origen = id(fd, "origen"), destino = id(fd, "destino");
    if (!origen || !destino) throw new ErrorErp("Elegí la cuenta de origen y la de destino.");
    const items = fd.getAll("item").map(String).filter((x) => /^MLA\d+$/.test(x));
    const r = await prepararCopia(s.org.id, origen, destino, items, { variarTitulo: tildado(fd, "variar_titulo"), rotarFotos: tildado(fd, "rotar_fotos") }, s.usuario.id);
    revalidatePath(BASE);
    const rechazos = r.rechazadas.length
      ? ` No entraron ${r.rechazadas.length}: ${r.rechazadas.slice(0, 5).map((x) => `${x.titulo ?? x.item_id} (${x.motivo})`).join("; ")}${r.rechazadas.length > 5 ? "; …" : ""}.`
      : "";
    const avisos = r.conAvisos.length
      ? ` ${r.conAvisos.length} entraron con avisos de Mercado Libre (no frenan; los resuelve ML al crear): ${r.conAvisos.slice(0, 3).map((x) => `${x.titulo ?? x.item_id} → ${x.avisos}`).join("; ")}${r.conAvisos.length > 3 ? "; …" : ""}.`
      : "";
    if (!r.loteId) throw new ErrorErp(`No se preparó nada.${rechazos}`);
    return { ir: `/config/canales/cola?ver=lotes&lote=${r.loteId}&ok=${encodeURIComponent(`Lote preparado: crear ${r.preparadas} publicaciones. Todavía no salió nada: revisalo y apretá "Mandar a Mercado Libre".${avisos}${rechazos}`)}` };
  });
}
