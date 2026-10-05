// Publicaciones "fantasma": están en Laucen (meli_item / publicacion) pero en
// Mercado Libre ya no existen (Fer, 5/10: "no quiero que haya en Laucen
// publicaciones que en ML no existen"). Traer publicaciones sólo agrega y
// actualiza, nunca saca las que ML dejó de devolver; esto las compara.
//
// Revisar es sólo lectura. Borrar vuelve a leer ML en el momento y saca de
// Laucen (nunca de ML) las publicaciones, no los productos.

import { consulta, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";

/** Los item_id de Laucen que ML no devolvió. Puro: se prueba sin base ni red. */
export function faltantesEnMl(enLaucen: string[], enMl: ReadonlySet<string>): string[] {
  return [...new Set(enLaucen)].filter((i) => !enMl.has(i)).sort();
}

/** Todos los item_id de la cuenta que ML devuelve (cualquier estado). `completo`
 *  es falso si se cortó por tiempo o ML no contestó: con una lista incompleta
 *  no se borra nada. `total` es lo que ML dice que hay, para cotejar. */
export async function idsEnMl(cuenta: CuentaMl, hastaMs: number): Promise<{ ids: Set<string>; completo: boolean; total: number | null }> {
  const ids = new Set<string>();
  let scroll: string | null = null;
  let total: number | null = null;
  for (;;) {
    if (Date.now() > hastaMs) return { ids, completo: false, total };
    const r: { status: number; datos: { results?: string[]; scroll_id?: string; paging?: { total?: number } } } = await ml(cuenta, "GET",
      `/users/${cuenta.meliUserId}/items/search?search_type=scan&limit=100${scroll ? `&scroll_id=${scroll}` : ""}`);
    if (r.status !== 200) return { ids, completo: false, total };
    if (total == null && typeof r.datos.paging?.total === "number") total = r.datos.paging.total;
    const pagina = r.datos.results ?? [];
    for (const i of pagina) ids.add(i);
    scroll = r.datos.scroll_id ?? null;
    if (!pagina.length || !scroll) return { ids, completo: true, total };
  }
}

export type RevisionFantasmas = {
  enLaucen: number; enMl: number; fantasmas: string[];
  ejemplos: { item_id: string; titulo: string | null; sku: string | null; estado: string | null }[];
  /** Verdadero si la lectura de ML quedó completa y coincide con lo que ML dice que hay. */
  confiable: boolean; motivo?: string;
};

async function cuentaDe(org: string, canalId: number): Promise<CuentaMl> {
  const c = await cuentaDelCanal(org, canalId);
  if (!c) throw new ErrorErp("Ese canal no tiene una cuenta de Mercado Libre conectada.");
  if (c.estado !== "activa") throw new ErrorErp("La cuenta de Mercado Libre está desconectada: hay que volver a conectarla.");
  return c;
}

/** Compara las publicaciones del canal con las que ML devuelve ahora. Sólo lectura. */
export async function revisarFantasmas(org: string, canalId: number, hastaMs: number): Promise<RevisionFantasmas> {
  const cuenta = await cuentaDe(org, canalId);
  const lectura = await idsEnMl(cuenta, hastaMs);
  const filas = await consulta<{ item_id: string; titulo: string | null; sku: string | null; estado: string | null }>(
    "select distinct on (item_id) item_id, titulo, sku, estado from meli_item where organizacion_id = $1 and canal_id = $2 order by item_id", [org, canalId]);
  const fantasmas = faltantesEnMl(filas.map((f) => f.item_id), lectura.ids);
  let motivo: string | undefined;
  if (!lectura.completo) motivo = "La lectura de Mercado Libre no terminó (se cortó por tiempo o ML no contestó). Probá de nuevo.";
  else if (!lectura.ids.size) motivo = "Mercado Libre no devolvió ninguna publicación: no se puede comparar.";
  else if (lectura.total != null && lectura.ids.size < lectura.total * 0.98) {
    motivo = `Mercado Libre dice que hay ${lectura.total} publicaciones pero la lectura trajo ${lectura.ids.size}. Probá de nuevo.`;
  }
  const marcados = new Set(fantasmas);
  return {
    enLaucen: filas.length, enMl: lectura.ids.size, fantasmas,
    ejemplos: filas.filter((f) => marcados.has(f.item_id)).slice(0, 15),
    confiable: !motivo, motivo,
  };
}

/** Borra de Laucen las publicaciones que ML ya no tiene. Vuelve a leer ML y,
 *  si la lectura no es confiable, no borra nada. Devuelve cuántas. */
export async function borrarFantasmas(org: string, canalId: number, hastaMs: number): Promise<{ publicaciones: number; filas: number }> {
  const r = await revisarFantasmas(org, canalId, hastaMs);
  if (!r.confiable) throw new ErrorErp(r.motivo ?? "No se pudo leer Mercado Libre: no se borró nada.");
  if (!r.fantasmas.length) return { publicaciones: 0, filas: 0 };
  return enTransaccion(async (c) => {
    const p = await c.query("delete from publicacion where organizacion_id = $1 and canal_id = $2 and id_externo = any($3::text[])", [org, canalId, r.fantasmas]);
    const m = await c.query("delete from meli_item where organizacion_id = $1 and canal_id = $2 and item_id = any($3::text[])", [org, canalId, r.fantasmas]);
    return { publicaciones: p.rowCount ?? 0, filas: m.rowCount ?? 0 };
  });
}
