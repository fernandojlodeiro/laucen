// Limpieza de notebooks (pedido de Fer 7/10, bitácora #425): eliminar de
// Mercado Libre —en todas las cuentas y en cualquier estado— todas las
// notebooks salvo las de la lista, y sacarlas de Laucen. Las activas que no
// son de la lista NO se eliminan: se informan (Fer: "no debería haber ninguna").
// En ML se prepara UN lote por cuenta que sale recién con el clic de Fer en
// "Mandar a Mercado Libre" (lib/mercadolibre/cola.ts). En Laucen, la que no
// tiene historia (ventas, picking, recepciones, compras) se borra y la que la
// tiene se archiva, para no romper esa historia (respuesta de Fer: 2.1).

import { consulta, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { encolar, encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";
import { idsEnMl } from "@/lib/mercadolibre/fantasmas";
import { esNotebook } from "@/lib/mercadolibre/es-notebook";

/** Las notebooks que se conservan (lista de Fer, 7/10). G3-3500-1 la sumó Fer (respuesta 1.1);
 *  F412DA-NH77-12GB es la de 12 GB, que en ML se publicó como F412DA-NH77-1. */
export const SKUS_CONSERVAR = [
  "81VS0001US", "S532FA-SB77", "F412DA-NH77", "F412DA-NH77-1", "15-EF0022NR", "14-DK1022WM", "15-DK0056WM", "G3-3500", "15-DK0056WM-1",
  "G3-3500-1", "F412DA-NH77-12GB",
];

const DESCRIPCION_LOTE = "Eliminar en Mercado Libre notebooks que no son de la lista (7/10)";

/** El SKU como se compara: mayúsculas, sin espacios y sin el "DE-" de las cuentas DEIROLAB. */
const limpio = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace(/^DE-/, "");
const conservar = new Set(SKUS_CONSERVAR.map(limpio));
export const seConserva = (skus: (string | null | undefined)[]) => skus.some((s) => conservar.has(limpio(s)));

type Atributo = { id?: string; value_name?: string | null };
type ItemMl = {
  id: string; title?: string; status?: string; sub_status?: string[]; category_id?: string; seller_custom_field?: string | null;
  attributes?: Atributo[]; variations?: { seller_custom_field?: string | null; attributes?: Atributo[] }[];
};

/** Todos los SKU de una publicación de ML: el suyo, el atributo SELLER_SKU y los de sus variaciones. */
export function skusDeItem(it: ItemMl): string[] {
  const sku = (a?: Atributo[]) => (a ?? []).filter((x) => x.id === "SELLER_SKU").map((x) => x.value_name ?? "");
  return [it.seller_custom_field ?? "", ...sku(it.attributes), ...(it.variations ?? []).flatMap((v) => [v.seller_custom_field ?? "", ...sku(v.attributes)])]
    .filter(Boolean);
}

export type ResultadoMl = {
  cuenta: string; loteId: number | null; preparadas: number; sinSku: number; revisadas: number; quedan: number;
  porEstado: Record<string, number>; conservadas: number;
  /** Activas que no son de la lista: no se tocan, se informan. */
  activasFuera: { id: string; titulo: string; skus: string }[];
};

/** Lee la cuenta en ML y prepara el lote que elimina sus notebooks que no son de la lista. Si
 *  no alcanza el tiempo, lo leído queda en el lote y `quedan` dice cuántas faltan (se vuelve a
 *  apretar; lo ya preparado no se repite). */
export async function prepararNotebooksMl(org: string, canalId: number, usuarioId: string, hastaMs: number): Promise<ResultadoMl> {
  const cuenta: CuentaMl | null = await cuentaDelCanal(org, canalId);
  if (!cuenta || cuenta.estado !== "activa") throw new ErrorErp("Esa cuenta de Mercado Libre no está conectada.");
  const nombre = (await consulta<{ nombre: string }>("select nombre from canal where id = $1", [canalId]))[0]?.nombre ?? `canal ${canalId}`;
  const lectura = await idsEnMl(cuenta, hastaMs);
  if (!lectura.completo || !lectura.ids.size) throw new ErrorErp(`${nombre}: la lectura de Mercado Libre no terminó. Probá de nuevo.`);

  // Lo que Laucen ya sabe: lo que seguro NO es notebook no se vuelve a pedir; y sus SKU (también el del producto vinculado).
  const conocidas = new Map<string, { notebook: boolean; skus: string[] }>();
  for (const f of await consulta<{ item_id: string; titulo: string | null; categoria: string | null; sku: string | null; sku_laucen: string | null }>(`
    select i.item_id, i.titulo, i.categoria, i.sku, v.sku sku_laucen
      from meli_item i left join publicacion p on p.id = i.publicacion_id left join variacion v on v.id = p.variacion_id
     where i.organizacion_id = $1 and i.canal_id = $2`, [org, canalId])) {
    const c = conocidas.get(f.item_id) ?? { notebook: false, skus: [] };
    c.notebook ||= esNotebook(f.titulo, f.categoria);
    c.skus.push(f.sku ?? "", f.sku_laucen ?? "");
    conocidas.set(f.item_id, c);
  }
  // Lo que ya tiene pedida su eliminación (preparado, en la cola o enviado): no se repite.
  const yaPedidas = new Set((await consulta<{ item_id: string }>(
    `select distinct item_id from ml_cola where canal_id = $1 and estado in ('preparado', 'pendiente', 'enviando', 'ok')
        and payload::text like '%"deleted"%'`, [canalId])).map((f) => f.item_id));

  const aRevisar = [...lectura.ids].filter((i) => !yaPedidas.has(i) && (!conocidas.has(i) || conocidas.get(i)!.notebook)).sort();
  const r: ResultadoMl = { cuenta: nombre, loteId: null, preparadas: 0, sinSku: 0, revisadas: 0, quedan: 0, porEstado: {}, conservadas: 0, activasFuera: [] };
  const cambios: CambioMl[] = [];
  for (let i = 0; i < aRevisar.length; i += 20) {
    if (Date.now() > hastaMs - 4_000) { r.quedan = aRevisar.length - i; break; }
    const lote = aRevisar.slice(i, i + 20);
    const x = await ml<{ code: number; body: ItemMl }[]>(cuenta, "GET",
      `/items?ids=${lote.join(",")}&attributes=id,title,status,sub_status,category_id,seller_custom_field,attributes,variations`);
    if (x.status !== 200 || !Array.isArray(x.datos)) throw new ErrorErp(`${nombre}: Mercado Libre no contestó. Probá de nuevo (lo ya preparado no se pierde).`);
    r.revisadas += lote.length;
    for (const { code, body: it } of x.datos) {
      if (code !== 200 || !it?.id || !esNotebook(it.title, it.category_id)) continue;
      if ((it.sub_status ?? []).includes("deleted")) continue; // ya eliminada en ML
      const skus = [...skusDeItem(it), ...(conocidas.get(it.id)?.skus ?? [])].filter(Boolean);
      if (seConserva(skus)) { r.conservadas++; continue; }
      if (it.status === "active") { r.activasFuera.push({ id: it.id, titulo: it.title ?? "", skus: [...new Set(skus)].join(", ") || "sin SKU" }); continue; }
      const estado = it.status ?? "?";
      r.porEstado[estado] = (r.porEstado[estado] ?? 0) + 1;
      if (!skus.length) r.sinSku++;
      cambios.push({
        canalId, itemId: it.id, tipo: "otro", antes: { titulo: it.title, estado },
        payload: {
          marca: "eliminar_notebook",
          descripcion: `${estado === "closed" ? "Eliminar" : "Finalizar y eliminar"} en ML (${estado}${skus.length ? `, SKU ${[...new Set(skus)].join("/")}` : ", sin SKU"}): ${it.title ?? it.id}`,
          pedidos: [
            ...(estado === "closed" ? [] : [{ metodo: "PUT" as const, ruta: `/items/${it.id}`, cuerpo: { status: "closed" }, seguirSiFalla: true }]),
            { metodo: "PUT" as const, ruta: `/items/${it.id}`, cuerpo: { deleted: "true" } },
          ],
        },
      });
    }
  }
  r.preparadas = cambios.length;
  if (!cambios.length) return r;
  // Un solo lote preparado por cuenta: si ya hay uno de una vuelta anterior, se suma a ése.
  const previo = (await consulta<{ id: string }>(
    "select id from ml_lote where organizacion_id = $1 and canal_id = $2 and estado = 'preparado' and descripcion = $3 order by id desc limit 1",
    [org, canalId, DESCRIPCION_LOTE]))[0];
  if (previo) { r.loteId = Number(previo.id); await encolar(org, cambios, { origen: "boton", usuarioId, loteId: r.loteId }); }
  else r.loteId = await encolarLoteConBoton(org, canalId, cambios, DESCRIPCION_LOTE, usuarioId);
  return r;
}

/** El texto del cartel al terminar una cuenta. */
export function textoResultadoMl(r: ResultadoMl): string {
  const n = (x: number) => x.toLocaleString("es-AR");
  const partes = [`${r.cuenta}: se revisaron ${n(r.revisadas)} publicaciones.`];
  if (r.preparadas) {
    partes.push(`${n(r.preparadas)} notebooks preparadas para eliminar (${Object.entries(r.porEstado).map(([k, v]) => `${n(v)} ${k}`).join(", ")}${r.sinSku ? `; ${n(r.sinSku)} sin SKU` : ""}): revisá el lote en Configuración › Canales › Cola de Mercado Libre y apretá «Mandar a Mercado Libre».`);
  } else partes.push("No hay notebooks para eliminar.");
  if (r.conservadas) partes.push(`${n(r.conservadas)} de la lista no se tocan.`);
  if (r.activasFuera.length) partes.push(`OJO: ${n(r.activasFuera.length)} activas que no son de la lista (no se tocan): ${r.activasFuera.slice(0, 5).map((a) => `${a.id} (${a.skus})`).join(", ")}${r.activasFuera.length > 5 ? "…" : ""}.`);
  if (r.quedan) partes.push(`No alcanzó el tiempo: quedan ${n(r.quedan)} por revisar, apretá de nuevo.`);
  return partes.join(" ");
}

// ── En Laucen ────────────────────────────────────────────────────────────

/** Notebook en Laucen = categoría de ML Notebooks o título que empieza con "Notebook". */
const NOTEBOOKS = `
  from producto p
 where p.organizacion_id = $1 and p.estado <> 'archivado'
   and (p.categoria_ml = 'MLA1652' or p.titulo ~* '^notebook\\M')
   and not exists (select 1 from variacion v where v.producto_id = p.id
                    and upper(regexp_replace(trim(v.sku), '^DE-', '', 'i')) = any($2::text[]))`;

/** Tiene historia: algo que no se puede (o no conviene) borrar la apunta. Esa se archiva. */
const CON_HISTORIA = `exists (select 1 from variacion v where v.producto_id = p.id and (
     exists (select 1 from pedido_linea x where x.variacion_id = v.id)
  or exists (select 1 from picking_item x where x.variacion_id = v.id or x.kit_variacion_id = v.id)
  or exists (select 1 from recepcion_linea x where x.variacion_id = v.id)
  or exists (select 1 from factura_compra_linea x where x.variacion_id = v.id)
  or exists (select 1 from despacho_linea x where x.variacion_id = v.id)
  or exists (select 1 from comprobante_linea x where x.variacion_id = v.id)
  or exists (select 1 from movimiento_stock x where x.kit_variacion_id = v.id)
  or exists (select 1 from kit_componente k where k.variacion_componente_id = v.id)))`;

export type NotebookLaucen = { id: number; sku: string; titulo: string; stock: number; historia: boolean };

/** Las notebooks de Laucen que no son de la lista: qué va a pasar con cada una. */
export async function notebooksLaucenFuera(org: string): Promise<NotebookLaucen[]> {
  return consulta<NotebookLaucen>(`
    select p.id::int, coalesce((select string_agg(v.sku, ', ') from variacion v where v.producto_id = p.id), p.sku_base) sku, left(p.titulo, 70) titulo,
           coalesce((select sum(s.cantidad) from variacion v join stock s on s.variacion_id = v.id where v.producto_id = p.id), 0)::int stock,
           ${CON_HISTORIA} historia
    ${NOTEBOOKS} order by p.id`, [org, SKUS_CONSERVAR.map(limpio)]);
}

/** Borra las que no tienen historia y archiva las que sí (y su stock, si tuvieran, queda). */
export async function limpiarNotebooksLaucen(org: string): Promise<{ borradas: number; archivadas: number }> {
  return enTransaccion(async (c) => {
    const v = [org, SKUS_CONSERVAR.map(limpio)];
    const archivadas = await c.query(`update producto set estado = 'archivado' where id in (select p.id ${NOTEBOOKS} and ${CON_HISTORIA})`, v);
    // Primero los kits (sus componentes no se pueden borrar mientras haya un kit que los use).
    const kits = await c.query(`delete from producto where id in (select p.id ${NOTEBOOKS} and p.tipo = 'kit' and not ${CON_HISTORIA})`, v);
    const simples = await c.query(`delete from producto where id in (select p.id ${NOTEBOOKS} and not ${CON_HISTORIA})`, v);
    return { borradas: (kits.rowCount ?? 0) + (simples.rowCount ?? 0), archivadas: archivadas.rowCount ?? 0 };
  });
}
