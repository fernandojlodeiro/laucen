// Publicaciones "fantasma": están en Laucen (meli_item / publicacion) pero en
// Mercado Libre ya no existen (Fer, 5/10: "no quiero que haya en Laucen
// publicaciones que en ML no existen"). Traer publicaciones sólo agrega y
// actualiza, nunca saca las que ML dejó de devolver; esto las compara.
//
// Revisar es sólo lectura. Borrar vuelve a leer ML en el momento y saca de
// Laucen (nunca de ML) las publicaciones, no los productos.

import { consulta, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { guardarItem, skusDeItem, variacionPorSku, type ItemMl } from "@/lib/mercadolibre/publicaciones";
import { esNotebook } from "@/lib/mercadolibre/es-notebook";

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

/** Lo que ML devuelve y Laucen no guarda: las que se descartaron a propósito (meli_item_descartado,
 *  borradas de Laucen o eliminadas desde acá) y las demás, con una muestra de cómo están en ML. */
export type SoloEnMl = { total: number; descartadas: number; otras: number;
  /** `sku` es el que tiene la publicación en ML; `producto` lo que hay en Laucen con ese SKU (si hay). */
  muestra: { item_id: string; titulo: string | null; estado: string | null; sku: string | null; producto: string | null }[] };

export type RevisionFantasmas = {
  enLaucen: number; enMl: number; fantasmas: string[]; soloEnMl: SoloEnMl;
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
  // La otra dirección (sólo informa; no se borra nada): lo que ML tiene y Laucen no.
  const enLaucen = new Set(filas.map((f) => f.item_id));
  const descartadas = new Set((await consulta<{ item_id: string }>("select item_id from meli_item_descartado where organizacion_id = $1 and canal_id = $2", [org, canalId])).map((f) => f.item_id));
  const soloMl = [...lectura.ids].filter((i) => !enLaucen.has(i));
  const otras = soloMl.filter((i) => !descartadas.has(i));
  const muestra: SoloEnMl["muestra"] = [];
  if (lectura.completo) {
    type Item = { id: string; title?: string; status?: string; sub_status?: string[]; seller_custom_field?: string | null; attributes?: { id: string; value_name?: string | null }[] };
    for (let i = 0; i < Math.min(otras.length, 60); i += 20) {
      const r = await ml<{ code: number; body: Item }[]>(cuenta, "GET",
        `/items?ids=${otras.slice(i, i + 20).join(",")}&attributes=id,title,status,sub_status,seller_custom_field,attributes`);
      if (r.status !== 200 || !Array.isArray(r.datos)) break;
      for (const x of r.datos) {
        if (x.code !== 200 || !x.body?.id) continue;
        const sku = x.body.attributes?.find((a) => a.id === "SELLER_SKU")?.value_name?.trim() || x.body.seller_custom_field?.trim() || null;
        muestra.push({ item_id: x.body.id, titulo: x.body.title ?? null, sku, producto: null,
          estado: [x.body.status, ...(x.body.sub_status ?? [])].filter(Boolean).join(" / ") });
      }
    }
    // Qué hay en Laucen con ese SKU (con o sin el "DE-" de adelante): producto y si está activo o inactivo.
    const skus = [...new Set(muestra.map((m) => m.sku).filter((x): x is string => !!x).flatMap((x) => [x.toLowerCase(), x.replace(/^DE-/i, "").toLowerCase()]))];
    if (skus.length) {
      const prods = await consulta<{ sku: string; estado: string; sku_base: string }>(
        `select lower(v.sku) sku, p.estado, p.sku_base from variacion v join producto p on p.id = v.producto_id where v.organizacion_id = $1 and lower(v.sku) = any($2::text[])`, [org, skus]);
      const porSku = new Map(prods.map((p) => [p.sku, p]));
      for (const m of muestra) {
        const p = m.sku ? porSku.get(m.sku.toLowerCase()) ?? porSku.get(m.sku.replace(/^DE-/i, "").toLowerCase()) : undefined;
        m.producto = m.sku ? (p ? `${p.sku_base} (${p.estado === "archivado" ? "inactivo" : p.estado})` : "no hay producto con ese SKU") : "la publicación no tiene SKU";
      }
    }
  }
  return {
    enLaucen: filas.length, enMl: lectura.ids.size, fantasmas,
    soloEnMl: { total: soloMl.length, descartadas: soloMl.length - otras.length, otras: otras.length, muestra },
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

export type RecuperadasPausadas = {
  recuperadas: number;
  /** Lo que ML tiene y Laucen no, y no se recuperó, por motivo. */
  omitidas: { sinProducto: number; notebooks: number; otroEstado: Record<string, number> };
  quedan: number; completo: boolean;
};

/** Recupera en Laucen las publicaciones que están PAUSADAS en ML y Laucen no guarda (Fer, 5/10),
 *  vinculadas por SKU a su producto (aunque el producto esté Inactivo). No se recuperan: las que
 *  no están pausadas (cerradas, en revisión, inactivas…), las que no tienen producto en Laucen,
 *  las notebooks (se borran de ML aparte) ni las que se descartaron a propósito. No toca ML y no
 *  borra nada. Si no alcanza el tiempo, dice cuántas quedan: se aprieta de nuevo. */
export async function recuperarPausadas(org: string, canalId: number, hastaMs: number): Promise<RecuperadasPausadas> {
  const cuenta = await cuentaDe(org, canalId);
  const lectura = await idsEnMl(cuenta, hastaMs);
  if (!lectura.completo || !lectura.ids.size) throw new ErrorErp("La lectura de Mercado Libre no terminó: probá de nuevo.");
  const yaEstan = new Set((await consulta<{ item_id: string }>("select item_id from meli_item where organizacion_id = $1 and canal_id = $2", [org, canalId])).map((f) => f.item_id));
  const descartadas = new Set((await consulta<{ item_id: string }>("select item_id from meli_item_descartado where organizacion_id = $1 and canal_id = $2", [org, canalId])).map((f) => f.item_id));
  const faltan = [...lectura.ids].filter((i) => !yaEstan.has(i) && !descartadas.has(i)).sort();
  const r: RecuperadasPausadas = { recuperadas: 0, omitidas: { sinProducto: 0, notebooks: 0, otroEstado: {} }, quedan: 0, completo: true };
  for (let i = 0; i < faltan.length; i += 20) {
    if (Date.now() > hastaMs - 5_000) { r.completo = false; r.quedan = faltan.length - i; break; }
    const m = await ml<{ code: number; body: ItemMl }[]>(cuenta, "GET", `/items?ids=${faltan.slice(i, i + 20).join(",")}&include_attributes=all`);
    if (m.status !== 200 || !Array.isArray(m.datos)) throw new ErrorErp("Mercado Libre no contestó: probá de nuevo (lo ya recuperado queda).");
    for (const x of m.datos) {
      const it = x.body;
      if (x.code !== 200 || !it) continue;
      if (it.status !== "paused") { r.omitidas.otroEstado[it.status] = (r.omitidas.otroEstado[it.status] ?? 0) + 1; continue; }
      if (esNotebook(it.title, it.category_id)) { r.omitidas.notebooks++; continue; }
      let conProducto = false;
      for (const sku of skusDeItem(it)) if (await variacionPorSku(org, sku)) { conProducto = true; break; }
      if (!conProducto) { r.omitidas.sinProducto++; continue; }
      await guardarItem(cuenta, it);
      r.recuperadas++;
    }
  }
  return r;
}
