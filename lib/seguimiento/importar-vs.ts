// Importar los seguimientos de Virtual Seller (Fer, 14/10): el informe «Seguimientos totales» que exporta Virtual
// Seller (un .xls que por dentro es una tabla HTML). Cada renglón es una publicación de la competencia que se seguía,
// con su vendedor, último precio y estado. En Virtual Seller el seguimiento era sobre una publicación nuestra, no sobre
// el producto: el producto sale del «ID Seguimiento» (nuestro SKU, un guión, el año y un número: «SKU00680-U-2026-1»;
// los viejos, con «SEG-» adelante). La columna SKU del informe no sirve (es la del vendedor de enfrente).
//   · Las de nuestras cuentas no entran (son las publicaciones nuestras que se monitoreaban).
//   · Entran revisadas (las eligió una persona en Virtual Seller), con origen «importado» y de dónde vienen.
//   · Las pausadas entran igual: se ven aparte y la regla de precio no las usa (sólo mira las activas). Las terminadas,
//     no (Fer, 22/10: una terminada no vuelve; si una seguida aparece terminada al leerla, se deja de seguir).
//   · Si ya se seguía, no se pisa su origen; el precio y el estado se ponen al día si lo nuestro era más viejo.
//   · No entran (Fer, 22/10): las de notebooks, las de un SKU que ya no está en el catálogo y las de un producto sin
//     ninguna publicación activa ni pausada en Mercado Libre. Las que entran se releen solas sólo si el producto está a
//     la venta (lib/seguimiento/a-la-venta.ts); las de un producto pausado quedan de referencia para cuando se compre.

import { consulta, ErrorErp } from "@/lib/erp/base";
import { nuestras } from "@/lib/seguimiento";
import { revisarReglasDe } from "@/lib/seguimiento/regla";
import { SQL_CON_ML_VIVA, SQL_A_LA_VENTA, SQL_ES_NOTEBOOK, esTituloNotebook } from "@/lib/seguimiento/a-la-venta";
import { numeroVs } from "@/lib/importar/virtualseller";
import type { Hoja, Valor } from "@/lib/importar/leer";

/** Nuestro SKU a partir del ID del seguimiento: sin «SEG-» adelante ni «-AAAA-N» al final. null si no queda nada. Pura.
 *  Si trae un «SKU» + número en cualquier lado (Fer, 22/10: «A8SEG-SKU03373-2025-1», «SKU00452-19», «SKU03514.2024-1»,
 *  «SKU017852021-1», «SKU003305-2019-2»), ése: cinco cifras (con «-U» si lo trae). Con varios SKU distintos, no se adivina. */
export function skuDeIdSeguimiento(id: string | null | undefined): string | null {
  if (!id) return null;
  const t = id.trim().toUpperCase();
  const skus = [...t.matchAll(/SKU(\d{5,})(-U(?![A-Z0-9]))?/g)].map((m) => {
    let d = m[1];
    if (d.length === 6 && d.startsWith("0")) d = d.slice(1);   // un cero de más
    else if (d.length > 5) d = d.slice(0, 5);                   // el año pegado
    return `SKU${d}${m[2] ?? ""}`;
  });
  if (new Set(skus).size === 1) return skus[0];
  if (skus.length > 1) return t;
  const s = t.replace(/^SEG[\s_-]+/, "").replace(/[\s_.-]+(19|20)\d{2}([\s_.-]+\d+)?$/, "").trim();
  return s || null;
}

/** Los viejos tienen de ID el número de nuestra publicación y la fecha («MLA754852459 21/04/2023 12:43»). Pura. */
export function itemDeIdSeguimiento(id: string | null | undefined): string | null {
  return (id ?? "").trim().toUpperCase().match(/^(MLAU?\d{6,})\b/)?.[1] ?? null;
}

/** El estado de Virtual Seller (el de Mercado Libre, en inglés) como lo guarda el seguimiento. Pura. */
export function estadoVs(t: string | null | undefined): "activa" | "pausada" | "cerrada" | "sin_dato" {
  const s = (t ?? "").trim().toLowerCase();
  if (/^activ/.test(s)) return "activa";
  if (/paus|under_review|inactiv/.test(s)) return "pausada";
  if (/clos|finaliz|cerrad|termin/.test(s)) return "cerrada";
  return "sin_dato";
}

/** El tipo de publicación («Clásica», «Premium») como lo guarda Mercado Libre. Pura. */
export function tipoVs(t: string | null | undefined): string | null {
  const s = (t ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!s) return null;
  if (s.startsWith("clasic")) return "gold_special";
  if (s.startsWith("premium")) return "gold_pro";
  if (s.startsWith("gratu") || s === "free") return "free";
  return null;
}

/** El número de publicación (MLA…), de la columna o del link. Pura. */
export function itemDe(pub: string | null | undefined, link: string | null | undefined): string | null {
  const m = (pub ?? "").toUpperCase().match(/MLAU?-?\d{6,}/) ?? (link ?? "").toUpperCase().match(/MLAU?-?\d{6,}/);
  return m ? m[0].replace("-", "") : null;
}

/** Vendedor chino de Mercado Libre (CBT): sus apodos son «CN…ARR». No cuenta para la regla (le faltan los impuestos). Pura. */
export const apodoInternacional = (apodo: string | null | undefined) => /^CN[A-Z0-9]{3,}ARR$/.test((apodo ?? "").trim().toUpperCase());

export type FilaVs = {
  n: number; vendedor: string | null; itemId: string | null; titulo: string | null; catalogo: boolean; estado: ReturnType<typeof estadoVs>;
  precio: number | null; precioOriginal: number | null; tipo: string | null; cuotas: string | null; link: string | null; idSeguimiento: string | null; sku: string | null;
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const txt = (v: Valor | undefined) => (v == null ? null : String(v).trim() || null);

/** Lee las filas del informe. Tira ErrorErp si no es el informe de seguimientos. Pura. */
export function leerSeguimientosVs(h: Hoja): FilaVs[] {
  const col = (prueba: (c: string) => boolean) => h.columnas.find((c) => prueba(norm(c))) ?? null;
  const cId = col((c) => c.includes("id seguimiento"));
  const cPub = col((c) => c.includes("publicacion") && !c.includes("link") && !c.includes("tipo") && !c.includes("id seguimiento"));
  if (!cId || !cPub) throw new ErrorErp("No parece el informe de seguimientos de Virtual Seller: faltan las columnas «Publicación» e «ID Seguimiento».");
  const cUsuario = col((c) => c.startsWith("usuario")), cTitulo = col((c) => c === "titulo"), cCatalogo = col((c) => c.startsWith("catalogo"));
  const cEstado = col((c) => c === "estado"), cTachado = col((c) => c.includes("tachado")), cPrecio = col((c) => c === "precio");
  const cTipo = col((c) => c.startsWith("tipo publicacion")), cCuotas = col((c) => c.includes("cuotas")), cLink = col((c) => c.startsWith("link"));
  return h.filas.map((f) => {
    const d = f.datos, idSeguimiento = txt(d[cId]), link = cLink ? txt(d[cLink]) : null;
    const cat = cCatalogo ? txt(d[cCatalogo]) : null;
    return {
      n: f.n, vendedor: cUsuario ? txt(d[cUsuario]) : null, itemId: itemDe(txt(d[cPub]), link), titulo: cTitulo ? txt(d[cTitulo]) : null,
      catalogo: cat === "1" || /^s[ií]|true/i.test(cat ?? ""), estado: estadoVs(cEstado ? txt(d[cEstado]) : null),
      precio: cPrecio ? numeroVs(d[cPrecio]) : null, precioOriginal: cTachado ? numeroVs(d[cTachado]) : null,
      tipo: tipoVs(cTipo ? txt(d[cTipo]) : null), cuotas: cCuotas ? txt(d[cCuotas]) : null, link, idSeguimiento, sku: skuDeIdSeguimiento(idSeguimiento),
    };
  });
}

export type ResumenVs = {
  filas: number; propias: number; sinPublicacion: number; sinId: number; repetidas: number;
  nuevas: number; actualizadas: number; yaEstaban: number; productos: number; activas: number; pausadas: number; internacionales: number;
  /** Terminadas: no se importan (Fer, 22/10: una terminada no vuelve). */
  terminadas?: number;
  /** Notebooks: no se importan (Fer, 22/10). */
  notebooks: number;
  /** Productos sin ninguna publicación activa ni pausada en Mercado Libre (sólo cerradas o ninguna): no se importan (Fer, 22/10). */
  sinPublicacionActiva: { sku: string; filas: number }[];
  /** De los importados, cuántos productos están a la venta (publicación activa y stock): sólo ésos se releen solos. */
  productosALaVenta: number;
  /** Los SKU del ID de seguimiento que no están en el catálogo (con un ejemplo del ID y cuántas filas). */
  noEncontrados: { sku: string; id: string; filas: number }[];
};

const LOTE = 400;

/** Graba las filas leídas. `cuando`: la fecha del informe (la de la primera lectura). */
export async function importarSeguimientosVs(org: string, filas: FilaVs[], archivo: string, cuando: Date = new Date()): Promise<ResumenVs> {
  const { apodos } = await nuestras(org);
  const r: ResumenVs = { filas: filas.length, propias: 0, sinPublicacion: 0, sinId: 0, repetidas: 0, nuevas: 0, actualizadas: 0, yaEstaban: 0, productos: 0, activas: 0, pausadas: 0, internacionales: 0,
    notebooks: 0, sinPublicacionActiva: [], productosALaVenta: 0, noEncontrados: [] };
  // Las publicaciones nuestras (también las de cuentas viejas, si quedaron en Laucen).
  const items = [...new Set(filas.map((f) => f.itemId).filter(Boolean))] as string[];
  const propiasIds = new Set((await consulta<{ id: string }>("select item_id id from meli_item where organizacion_id = $1 and item_id = any($2::text[])", [org, items])).map((x) => x.id));
  // SKU → producto (de la variación o el SKU base).
  const skus = [...new Set(filas.map((f) => f.sku).filter(Boolean))] as string[];
  const porSku = new Map<string, number>();
  for (const x of await consulta<{ sku: string; producto_id: number }>(`
    select upper(p.sku_base) sku, p.id::int producto_id from producto p where p.organizacion_id = $1 and upper(p.sku_base) = any($2::text[])
    union all
    select upper(v.sku), v.producto_id::int from variacion v where v.organizacion_id = $1 and upper(v.sku) = any($2::text[])`, [org, skus]))
    if (!porSku.has(x.sku)) porSku.set(x.sku, x.producto_id);
  // Los que tienen de ID el número de nuestra publicación: el producto de esa publicación (vinculada en Laucen).
  const propiosId = [...new Set(filas.map((f) => itemDeIdSeguimiento(f.idSeguimiento)).filter(Boolean))] as string[];
  const porItem = new Map<string, number>();
  if (propiosId.length) for (const x of await consulta<{ item_id: string; producto_id: number }>(`
    select distinct on (m.item_id) m.item_id, v.producto_id::int from meli_item m join publicacion pu on pu.id = m.publicacion_id join variacion v on v.id = pu.variacion_id
     where m.organizacion_id = $1 and m.item_id = any($2::text[])`, [org, propiosId])) porItem.set(x.item_id, x.producto_id);
  const productoDe = (f: FilaVs) => (f.sku ? porSku.get(f.sku) : undefined) ?? porItem.get(itemDeIdSeguimiento(f.idSeguimiento) ?? "");
  // De cada producto: si es una notebook, si tiene publicación activa en Mercado Libre y si está a la venta.
  const info = new Map<number, { notebook: boolean; conMl: boolean; aLaVenta: boolean }>();
  for (const x of await consulta<{ id: number; notebook: boolean; con_ml: boolean; a_la_venta: boolean }>(`
    select p.id::int, ${SQL_ES_NOTEBOOK} notebook, ${SQL_CON_ML_VIVA} con_ml, ${SQL_A_LA_VENTA} a_la_venta
      from producto p where p.organizacion_id = $1 and p.id = any($2::bigint[])`, [org, [...new Set([...porSku.values(), ...porItem.values()])]]))
    info.set(x.id, { notebook: x.notebook, conMl: x.con_ml, aLaVenta: x.a_la_venta });
  const sinMl = new Map<string, number>();
  const faltan = new Map<string, { id: string; filas: number }>();
  const datos = new Map<string, Record<string, unknown>>();
  for (const f of filas) {
    if (!f.sku) { r.sinId++; continue; }
    if (!f.itemId) { r.sinPublicacion++; continue; }
    if (apodos.has((f.vendedor ?? "").toUpperCase().trim()) || propiasIds.has(f.itemId)) { r.propias++; continue; }
    if (f.estado === "cerrada") { r.terminadas = (r.terminadas ?? 0) + 1; continue; }
    const pid = productoDe(f);
    // Las notebooks no interesan (Fer, 22/10), ni las de un producto que ya no está o sólo tiene publicaciones cerradas.
    if (esTituloNotebook(f.titulo) || /^(SEG\s+)?NOT(EBOOK)?\b/i.test(f.idSeguimiento ?? "") || (pid && info.get(pid)?.notebook)) { r.notebooks++; continue; }
    if (pid && !info.get(pid)?.conMl) { sinMl.set(f.sku, (sinMl.get(f.sku) ?? 0) + 1); continue; }
    if (!pid) { const x = faltan.get(f.sku) ?? { id: f.idSeguimiento ?? f.sku, filas: 0 }; x.filas++; faltan.set(f.sku, x); continue; }
    const k = `${pid}|${f.itemId}`;
    if (datos.has(k)) r.repetidas++;
    datos.set(k, {
      producto_id: pid, item_id: f.itemId, titulo: f.titulo, permalink: f.link, vendedor: f.vendedor, precio: f.precio, precio_original: f.precioOriginal,
      estado: f.estado, tipo: f.tipo, cuotas: f.cuotas, internacional: apodoInternacional(f.vendedor) ? true : null,
      detalle: `Virtual Seller, seguimiento ${f.idSeguimiento}`,
    });
  }
  r.sinPublicacionActiva = [...sinMl].map(([sku, filas]) => ({ sku, filas })).sort((a, b) => b.filas - a.filas);
  r.noEncontrados = [...faltan].map(([sku, x]) => ({ sku, ...x })).sort((a, b) => b.filas - a.filas);
  const lista = [...datos.values()];
  for (const d of lista) {
    if (d.estado === "activa") r.activas++; else r.pausadas++;
    if (d.internacional) r.internacionales++;
  }
  const pids = new Set(lista.map((d) => d.producto_id as number));
  r.productos = pids.size;
  r.productosALaVenta = [...pids].filter((x) => info.get(x)?.aLaVenta).length;
  for (let i = 0; i < lista.length; i += LOTE) {
    const lote = lista.slice(i, i + LOTE);
    // Nuevas: revisadas, origen «importado». Ya seguidas: no se pisa el origen (salvo una automática sin revisar, que
    // pasa a importada y revisada); precio y estado, sólo si lo nuestro es más viejo que el informe.
    const hechas = await consulta<{ id: number; nueva: boolean; al_dia: boolean }>(`
      with d as (select * from jsonb_to_recordset($2::jsonb) as x(producto_id bigint, item_id text, titulo text, permalink text, vendedor text,
                   precio numeric, precio_original numeric, estado text, tipo text, cuotas text, internacional boolean, detalle text))
      insert into seguimiento_pub as s (organizacion_id, producto_id, item_id, titulo, permalink, vendedor, precio, precio_original, moneda, estado,
                                        tipo_publicacion, cuotas, internacional, origen, origen_detalle, confirmada, confirmada_ts, leido_ts, intento_ts)
      select $1, producto_id, item_id, titulo, permalink, vendedor, precio, precio_original, 'ARS', estado, tipo, cuotas, internacional,
             'importado', detalle, true, $3::timestamptz, $3::timestamptz, $3::timestamptz from d
      on conflict (organizacion_id, producto_id, item_id) do update set
        vendedor = coalesce(s.vendedor, excluded.vendedor), titulo = coalesce(s.titulo, excluded.titulo), permalink = coalesce(s.permalink, excluded.permalink),
        internacional = coalesce(s.internacional, excluded.internacional),
        precio = case when s.leido_ts is null or s.leido_ts < excluded.leido_ts then coalesce(excluded.precio, s.precio) else s.precio end,
        precio_original = case when s.leido_ts is null or s.leido_ts < excluded.leido_ts then excluded.precio_original else s.precio_original end,
        estado = case when s.leido_ts is null or s.leido_ts < excluded.leido_ts then excluded.estado else s.estado end,
        tipo_publicacion = case when s.leido_ts is null or s.leido_ts < excluded.leido_ts then coalesce(excluded.tipo_publicacion, s.tipo_publicacion) else s.tipo_publicacion end,
        leido_ts = greatest(s.leido_ts, excluded.leido_ts),
        origen = case when s.origen = 'auto' and not s.confirmada then 'importado' else s.origen end,
        origen_detalle = coalesce(s.origen_detalle, excluded.origen_detalle),
        confirmada = true, confirmada_ts = coalesce(s.confirmada_ts, excluded.confirmada_ts)
      returning s.id::int, (s.xmax = 0) nueva, s.leido_ts = $3::timestamptz al_dia`, [org, JSON.stringify(lote), cuando]);
    for (const h of hechas) { if (h.nueva) r.nuevas++; else if (h.al_dia) r.actualizadas++; else r.yaEstaban++; }
    // La primera lectura (o la que puso al día): el precio y estado del informe, en el historial.
    const conLectura = hechas.filter((h) => h.al_dia).map((h) => h.id);
    if (conLectura.length) await consulta(`
      insert into seguimiento_lectura (organizacion_id, seguimiento_id, ts, fuente, precio, precio_original, estado, tipo_publicacion, datos)
      select organizacion_id, id, $3::timestamptz, 'importado', precio, precio_original, estado, tipo_publicacion, jsonb_build_object('archivo', $4::text)
        from seguimiento_pub where organizacion_id = $1 and id = any($2::bigint[])`, [org, conLectura, cuando, archivo]);
  }
  // Con lo nuevo, la regla de precio de los productos que la tengan prendida.
  await revisarReglasDe(org, [...new Set(lista.map((d) => d.producto_id as number))]).catch((e) => console.error("[seguimiento vs] reglas", e));
  return r;
}

/** El resumen en una frase, para el cartel. Pura. */
export function textoResumen(r: ResumenVs): string {
  const p = [`${r.nuevas} nuevas`, r.actualizadas ? `${r.actualizadas} puestas al día` : null, r.yaEstaban ? `${r.yaEstaban} ya estaban` : null].filter(Boolean).join(", ");
  return `Seguimientos de Virtual Seller: ${p}, en ${r.productos} productos (${r.activas} activas, ${r.pausadas} pausadas).`
    + (r.productos ? ` Se releen solos los de ${r.productosALaVenta} productos a la venta.` : "")
    + (r.notebooks ? ` ${r.notebooks} de notebooks no entraron.` : "")
    + (r.terminadas ? ` ${r.terminadas} terminadas no entraron.` : "")
    + (r.sinPublicacionActiva.length ? ` ${r.sinPublicacionActiva.length} SKU sin publicación activa ni pausada no entraron.` : "")
    + (r.noEncontrados.length ? ` ${r.noEncontrados.length} SKU no están en el catálogo.` : "")
    + (r.propias ? ` ${r.propias} eran nuestras y no entraron.` : "");
}
