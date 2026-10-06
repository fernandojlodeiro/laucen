// ¿Es el mismo producto? (Fer, 5/10: "de similar no tiene nada" con sólo
// comparar palabras). Claude, el modelo chico, compara el producto de Laucen
// con cada candidata (publicación propia o producto del catálogo de ML) y dice
// si es el mismo, parecido o distinto, con el motivo en una frase. Si no hay
// Claude o falla, queda el orden por palabras y la pantalla lo avisa.

import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { pedirClaude, jsonDe } from "@/lib/claude";

export type Veredicto = "mismo" | "parecido" | "distinto";
export type Juicio = { veredicto: Veredicto; motivo: string };
export type Referencia = { titulo: string; marca: string | null; modelo: string | null; datos: string | null };
export type Candidata = { id: string; titulo: string; datos: string | null };

const SISTEMA = `Comparás un producto de una tienda de electrónica e insumos (Argentina) con publicaciones o productos de catálogo de Mercado Libre.
Para cada candidata decidí:
- "mismo": es exactamente el mismo producto (mismo tipo, mismo modelo o código de pieza, mismos valores: tensión, capacidad, medidas, cantidad de pines, etc.). La cantidad del pack TAMBIÉN cuenta: una unidad y un pack de 5 NO son el mismo.
- "parecido": mismo tipo de producto con alguna diferencia menor (color, pack distinto, versión), que sirve de base cambiando algún dato.
- "distinto": otro producto.
La marca no decide el veredicto (se controla aparte).
Contestá SOLO un JSON: [{"id": "...", "v": "mismo|parecido|distinto", "m": "motivo en una frase corta, en castellano rioplatense"}], una entrada por candidata.`;

async function juzgarSinCache(ref: Referencia, cands: Candidata[]): Promise<Record<string, Juicio> | null> {
  if (!cands.length) return {};
  const texto = `PRODUCTO DE LA TIENDA:\nTítulo: ${ref.titulo}\nMarca: ${ref.marca ?? "—"}\nModelo: ${ref.modelo ?? "—"}${ref.datos ? `\nDatos: ${ref.datos}` : ""}\n\nCANDIDATAS:\n`
    + cands.map((c) => `id ${c.id}: ${c.titulo}${c.datos ? ` | ${c.datos}` : ""}`).join("\n");
  const r = await pedirClaude({ system: SISTEMA, contenido: texto.slice(0, 30_000), maxTokens: 4000, modelo: "chico" });
  if ("error" in r) { console.error("[juez similar]", r.error); return null; }
  const lista = jsonDe<{ id: string; v: string; m?: string }[]>(r.texto);
  if (!Array.isArray(lista)) return null;
  const salida: Record<string, Juicio> = {};
  for (const x of lista) {
    const v = x.v === "mismo" || x.v === "parecido" || x.v === "distinto" ? x.v : null;
    if (x.id && v) salida[String(x.id)] = { veredicto: v, motivo: String(x.m ?? "").slice(0, 200) };
  }
  return salida;
}

/** El juicio de cada candidata (por id), o null si no se pudo preguntar. Se guarda un día
 *  por producto + candidatas (escribir en el buscador no vuelve a pagar lo ya preguntado). */
export async function juzgar(ref: Referencia, cands: Candidata[]): Promise<Record<string, Juicio> | null> {
  const clave = createHash("sha1").update(JSON.stringify([ref, cands])).digest("hex");
  try {
    // Si falla se tira (y no queda guardado): la próxima vez se vuelve a preguntar.
    return await unstable_cache(async () => {
      const r = await juzgarSinCache(ref, cands);
      if (!r) throw new Error("sin juicio");
      return r;
    }, ["juez-similar", clave], { revalidate: 86_400 })();
  } catch {
    return null;
  }
}

/** Orden: mismo, parecido, distinto. */
export const PESO_VEREDICTO: Record<Veredicto, number> = { mismo: 0, parecido: 1, distinto: 2 };
