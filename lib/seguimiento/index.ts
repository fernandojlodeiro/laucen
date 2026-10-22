// Seguimiento de publicaciones de la competencia (pedido de Fer, 10/10;
// tablas en db/seguimiento.sql). En cada producto se eligen publicaciones de
// otros vendedores y Laucen las relee cada tantos días: precio, estado, tipo
// de publicación, vendedor, envío. Más adelante, reglas de precio.
//
// Mercado Libre no deja buscar ni leer publicaciones ajenas por la API
// (probado de todas las maneras, bitácora: prueba 35 de /admin/meli), así que:
// - Buscar para elegir: Apify (scrapesage~mercadolibre-scraper), unos
//   US$ 0,10 por búsqueda de 50 resultados. Se guarda la última por producto.
// - Leer las seguidas de catálogo: la API (/products/{id}/items), gratis.
// - Leer las seguidas comunes: Apify, por su dirección.
// Todo lo pago respeta el tope mensual (config 'seguimiento').

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { correrConEntrada, costosFinales } from "@/lib/apify";
import { ml, cuentasDe, type CuentaMl } from "@/lib/mercadolibre/api";
import { revisarReglasDe } from "@/lib/seguimiento/regla";
import { SQL_A_LA_VENTA } from "@/lib/seguimiento/a-la-venta";

const ACTOR = "scrapesage~mercadolibre-scraper";
// Lo que cobra el actor (bitácora #102): US$ 2 cada 1.000 resultados; con el detalle de cada publicación, 8.
const POR_RESULTADO = { busqueda: 0.002, lectura: 0.008 };

// ── Configuración general ───────────────────────────────────

/** `demoraDias`: una publicación que tarda más que esto en llegar no compite (se esconde en la búsqueda y se marca en rojo). */
/** `autoMax`: cuántas publicaciones comparables sigue sola la búsqueda de precio de mercado en cada producto (0 = ninguna). */
/** `pausadasDias` / `pausadasMeses` (Fer, 22/10): una publicación de la competencia que está pausada se relee cada
 *  `pausadasDias`, y después de `pausadasMeses` pausada deja de releerse sola hasta que alguien toca «Reanudar» (0 = nunca deja). */
export type ConfigSeguimiento = { frecuenciaDias: number; topeUsd: number; demoraDias: number; autoMax: number; pausadasDias: number; pausadasMeses: number };
export const CONFIG_DEFECTO: ConfigSeguimiento = { frecuenciaDias: 7, topeUsd: 30, demoraDias: 10, autoMax: 8, pausadasDias: 30, pausadasMeses: 3 };

export async function configSeguimiento(org: string): Promise<ConfigSeguimiento> {
  const r = await una<{ valor: { frecuencia_dias?: number; tope_usd?: number; demora_dias?: number; auto_max?: number; pausadas_dias?: number; pausadas_meses?: number } }>(
    "select valor from config_org where organizacion_id = $1 and clave = 'seguimiento'", [org]).catch(() => null);
  return {
    frecuenciaDias: Number(r?.valor?.frecuencia_dias) > 0 ? Number(r!.valor.frecuencia_dias) : CONFIG_DEFECTO.frecuenciaDias,
    topeUsd: r?.valor?.tope_usd != null && Number(r.valor.tope_usd) >= 0 ? Number(r.valor.tope_usd) : CONFIG_DEFECTO.topeUsd,
    demoraDias: Number(r?.valor?.demora_dias) > 0 ? Number(r!.valor.demora_dias) : CONFIG_DEFECTO.demoraDias,
    autoMax: r?.valor?.auto_max != null && Number(r.valor.auto_max) >= 0 ? Number(r.valor.auto_max) : CONFIG_DEFECTO.autoMax,
    pausadasDias: Number(r?.valor?.pausadas_dias) > 0 ? Number(r!.valor.pausadas_dias) : CONFIG_DEFECTO.pausadasDias,
    pausadasMeses: r?.valor?.pausadas_meses != null && Number(r.valor.pausadas_meses) >= 0 ? Number(r.valor.pausadas_meses) : CONFIG_DEFECTO.pausadasMeses,
  };
}

export async function guardarConfigSeguimiento(org: string, c: ConfigSeguimiento): Promise<void> {
  if (!Number.isInteger(c.frecuenciaDias) || c.frecuenciaDias < 1 || c.frecuenciaDias > 90) throw new ErrorErp("Cada cuántos días: de 1 a 90.");
  if (!(c.topeUsd >= 0) || c.topeUsd > 1000) throw new ErrorErp("El tope de gasto va de US$ 0 a US$ 1.000 por mes.");
  if (!Number.isInteger(c.demoraDias) || c.demoraDias < 1 || c.demoraDias > 120) throw new ErrorErp("«No compite si tarda más de»: de 1 a 120 días.");
  if (!Number.isInteger(c.autoMax) || c.autoMax < 0 || c.autoMax > 30) throw new ErrorErp("«Seguir solas por producto»: de 0 a 30.");
  if (!Number.isInteger(c.pausadasDias) || c.pausadasDias < 1 || c.pausadasDias > 365) throw new ErrorErp("«Pausadas: leer cada»: de 1 a 365 días.");
  if (!Number.isInteger(c.pausadasMeses) || c.pausadasMeses < 0 || c.pausadasMeses > 36) throw new ErrorErp("«Pausadas: dejar de leer después de»: de 0 a 36 meses (0 = nunca).");
  await consulta(`
    insert into config_org (organizacion_id, clave, valor) values ($1, 'seguimiento', $2::jsonb)
    on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`,
    [org, JSON.stringify({ frecuencia_dias: c.frecuenciaDias, tope_usd: c.topeUsd, demora_dias: c.demoraDias, auto_max: c.autoMax, pausadas_dias: c.pausadasDias, pausadas_meses: c.pausadasMeses })]);
}

/** Lo gastado en Apify por el seguimiento este mes (hora argentina). */
export async function gastoDelMes(org: string): Promise<number> {
  const r = await una<{ usd: number }>(`
    select coalesce(sum(costo_usd), 0)::float8 usd from seguimiento_corrida
     where organizacion_id = $1 and ts >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'`, [org]);
  return Number(r?.usd ?? 0);
}

/** Apify asienta el cobro un rato después de la corrida: se relee el costo de las de los últimos días
 *  (nunca por debajo de lo que cobra por resultado), así el tope cuenta bien. */
export async function asentarCostos(org: string): Promise<void> {
  const filas = await consulta<{ id: number; run_id: string; tipo: "busqueda" | "lectura"; publicaciones: number }>(`
    select id::int, run_id, tipo, publicaciones from seguimiento_corrida
     where organizacion_id = $1 and run_id is not null and ts > now() - interval '3 days' and ts < now() - interval '3 minutes'`, [org]);
  if (!filas.length) return;
  const finales = await costosFinales(filas.map((f) => f.run_id));
  for (const f of filas) {
    const usd = Math.max(finales[f.run_id]?.usd ?? 0, f.publicaciones * POR_RESULTADO[f.tipo]);
    await consulta("update seguimiento_corrida set costo_usd = $2 where id = $1 and coalesce(costo_usd, 0) <> $2", [f.id, usd]);
  }
}

const costoDe = (tipo: "busqueda" | "lectura", usd: number | null, n: number) => Math.max(usd ?? 0, n * POR_RESULTADO[tipo]);

export async function quedaParaGastar(org: string): Promise<number> {
  await asentarCostos(org).catch(() => {});
  const [c, g] = await Promise.all([configSeguimiento(org), gastoDelMes(org)]);
  return Math.max(0, c.topeUsd - g);
}

// ── Lo que trae Apify de una publicación ────────────────────

export type PubEncontrada = {
  itemId: string; catalogoId: string | null; titulo: string; foto: string | null; permalink: string | null;
  vendedor: string | null; tiendaOficial: boolean | null; precio: number | null; precioOriginal: number | null; moneda: string | null;
  cuotas: string | null; envioGratis: boolean | null; publicidad: boolean; estado: string | null; tipoPublicacion: string | null;
  /** El resultado de la búsqueda es un producto de catálogo (no una publicación): se abre en sus vendedores por la API. */
  esCatalogo?: boolean;
  vendedorId?: number | null;
  /** En cuántos días llega (a un código postal de Capital), de las opciones de envío de ML. */
  entregaDias?: number | null;
  propia?: boolean;
  /** Vendedor de afuera o entrega internacional: no se compara (le faltan los impuestos). */
  internacional?: boolean;
};

/** ¿Es un pack o varias unidades? («Pack de 2», «5 X …», «x10», «kit», «combo», «lote», «10 unidades»). Pura. */
export function esPack(titulo: string): boolean {
  return /\b(pack|kit|combo|lote|set)\b|\b\d+\s*x\s|\bx\s*\d+\b|\b\d+\s*(unidades|unid|uds|u)\b/i.test(titulo);
}

const palabras = (t: string) => new Set(t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1));

/** Cuánto se parece un título al nuestro (0 a 1: palabras del nuestro que están en el otro). Pura. */
export function parecido(nuestro: string, otro: string): number {
  const a = palabras(nuestro), b = palabras(otro);
  if (!a.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / a.size;
}

const txt = (x: Record<string, unknown>, ...k: string[]) => {
  for (const c of k) {
    const v = x[c];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  }
  return null;
};
const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);

/** Un resultado de Apify como publicación para seguir (null si no se reconoce su número). Pura. */
export function aPubEncontrada(x: Record<string, unknown>): PubEncontrada | null {
  const url = txt(x, "url", "permalink", "productUrl", "link");
  // La publicación: MLA… (9 cifras o más) o, la de un «producto de vendedor», MLAU….
  const id = (txt(x, "id", "itemId", "item_id", "publicationId") ?? "").replace("-", "").match(/^MLAU?\d{9,}$/)?.[0]
    ?? String(x.clickUrl ?? "").match(/[?&]wid=(MLA\d+)/)?.[1]
    ?? url?.match(/\/up\/(MLAU\d+)/)?.[1]
    ?? url?.match(/articulo\.mercadolibre\.com\.ar\/(MLA-?\d{9,})/)?.[1]?.replace("-", "") ?? null;
  if (!id) return null;
  // Un resultado con dirección /p/MLA… es un producto de catálogo: el número es el del catálogo, no el
  // de una publicación (la publicación sale de la API, con todos los que compiten).
  const enCatalogo = url?.match(/\/p\/(MLA\d+)/)?.[1] ?? null;
  const catalogo = enCatalogo ?? txt(x, "catalogProductId", "catalog_product_id");
  const estadoTxt = (txt(x, "status", "itemStatus") ?? "").toLowerCase();
  return {
    itemId: id, catalogoId: catalogo, titulo: txt(x, "title", "name") ?? "(sin título)", foto: txt(x, "image", "thumbnail", "imageUrl", "images", "pictures"),
    permalink: url, vendedor: txt(x, "sellerName", "seller", "sellerNickname"), tiendaOficial: bool(x.officialStore),
    precio: num(x.price ?? x.currentPrice), precioOriginal: num(x.originalPrice), moneda: txt(x, "currency") ?? "ARS",
    // El envío gratis de la búsqueda de Apify no es confiable: el de verdad sale de la API (catálogo).
    cuotas: txt(x, "installments"), envioGratis: null, publicidad: x.sponsored === true, esCatalogo: !!enCatalogo,
    estado: /paus/.test(estadoTxt) ? "pausada" : /clos|finaliz/.test(estadoTxt) ? "cerrada" : estadoTxt ? "activa" : null,
    tipoPublicacion: txt(x, "listingType", "listing_type_id"),
  };
}

/** Nuestras cuentas (para marcar como propias las publicaciones que aparecen en la búsqueda). */
export async function nuestras(org: string): Promise<{ cuentas: CuentaMl[]; apodos: Set<string> }> {
  const cuentas = (await cuentasDe(org)).filter((c) => c.estado === "activa");
  return { cuentas, apodos: new Set(cuentas.map((c) => (c.nickname ?? "").toUpperCase().trim()).filter(Boolean)) };
}

// ── Buscar para elegir ──────────────────────────────────────

/** ¿Entrega internacional? (el campo international_delivery_mode de ML: "none" = local). Pura. */
export function esInternacional(modo: string | null | undefined, pais?: string | null): boolean {
  return (!!modo && modo !== "none") || (!!pais && pais !== "AR");
}

/** Lo que completa una lista de publicaciones encontradas (búsqueda o catálogo pegado): el apodo de cada vendedor,
 *  cuáles son nuestras y en cuántos días llegan (todo por la API, gratis). Sin repetidas. */
export async function completar(org: string, cuentas: CuentaMl[], apodos: Set<string>, lista: PubEncontrada[]): Promise<PubEncontrada[]> {
  // Los apodos de los vendedores (la API pública de usuarios), de a uno; los nuestros ya se saben.
  const ids = new Map(cuentas.map((x) => [x.meliUserId, x.nickname ?? "Nuestra"]));
  const nuestrosIds = new Set(cuentas.map((x) => x.meliUserId));
  // También su país: un vendedor de afuera es internacional (Fer, 12/10).
  const paises = new Map<number, string>();
  const sinApodo = [...new Set(lista.map((p) => p.vendedorId).filter((v): v is number => !!v && !ids.has(v)))].slice(0, 80);
  for (let i = 0; i < sinApodo.length; i += 10) {
    await Promise.all(sinApodo.slice(i, i + 10).map(async (v) => {
      const u = cuentas[0] ? await ml<{ nickname?: string; country_id?: string }>(cuentas[0], "GET", `/users/${v}`).catch(() => null) : null;
      if (u?.status === 200 && u.datos.nickname) ids.set(v, u.datos.nickname);
      if (u?.status === 200 && u.datos.country_id) paises.set(v, u.datos.country_id);
    }));
  }
  // Las nuestras: por el número de publicación o, en un «producto de vendedor» (MLAU…), por el suyo.
  const propiasIds = new Set((await consulta<{ id: string }>(`
    select item_id id from meli_item where organizacion_id = $1 and item_id = any($2::text[])
    union select datos_externos #>> '{ml,user_product_id}' from meli_item where organizacion_id = $1 and datos_externos #>> '{ml,user_product_id}' = any($2::text[])`,
    [org, lista.map((p) => p.itemId)])).map((r) => r.id));
  const vistos = new Set<string>();
  const resultados: PubEncontrada[] = lista
    .filter((p) => !vistos.has(p.itemId) && !!vistos.add(p.itemId))
    .map((p) => {
      const vendedor = p.vendedor ?? (p.vendedorId ? ids.get(p.vendedorId) ?? null : null);
      const internacional = !!p.internacional || esInternacional(null, p.vendedorId ? paises.get(p.vendedorId) : null);
      return { ...p, vendedor, internacional, propia: propiasIds.has(p.itemId) || (!!p.vendedorId && nuestrosIds.has(p.vendedorId)) || (!!vendedor && apodos.has(vendedor.toUpperCase().trim())) };
    });
  // Cuánto tardan en llegar (gratis, por la API), salvo las nuestras: las que tardan mucho no compiten.
  if (cuentas[0]) {
    const ajenas = resultados.filter((p) => !p.propia).slice(0, 150);
    for (let i = 0; i < ajenas.length; i += 10) {
      await Promise.all(ajenas.slice(i, i + 10).map(async (p) => { p.entregaDias = await diasDeEntrega(cuentas[0], p.itemId); }));
    }
  }
  return resultados;
}

/** Busca en Mercado Libre (Apify) y guarda el resultado como la última búsqueda del producto. */
export async function buscarParaSeguir(org: string, productoId: number, texto: string): Promise<{ cantidad: number; costoUsd: number | null }> {
  const q = texto.replace(/\s+/g, " ").trim();
  if (q.length < 3) throw new ErrorErp("Escribí qué buscar (al menos 3 letras).");
  const queda = await quedaParaGastar(org);
  if (queda < 0.2) throw new ErrorErp("Se llegó al tope de gasto del mes del seguimiento (Configuración › Seguimiento de publicaciones).");
  const c = await correrConEntrada(ACTOR, { site: "MLA", searchQueries: [q], maxItems: 50, maxPagesPerQuery: 1, includeProductDetails: false },
    { max: 50, esperaSeg: 240, topeUsd: Math.min(0.5, queda) });
  await consulta("insert into seguimiento_corrida (organizacion_id, tipo, producto_id, run_id, costo_usd, publicaciones, error) values ($1, 'busqueda', $2, $3, $4, $5, $6)",
    [org, productoId, c.runId ?? null, costoDe("busqueda", c.costoUsd, c.items.length), c.items.length, c.error ?? null]);
  if (!c.items.length) throw new ErrorErp(c.error ? `Mercado Libre no devolvió resultados (${c.error.slice(0, 120)}).` : "Mercado Libre no devolvió resultados para esa búsqueda.");
  const resultados = await armarEncontradas(org, c.items as Record<string, unknown>[]);
  await guardarBusqueda(org, productoId, q, resultados);
  return { cantidad: resultados.length, costoUsd: costoDe("busqueda", c.costoUsd, c.items.length) };
}

/** Lo que trajo una búsqueda de Apify, como publicaciones: cada producto de catálogo se abre en sus vendedores por la
 *  API (gratis: publicación, vendedor, precio, tipo y envío reales) y se completa (apodos, nuestras, entrega). */
export async function armarEncontradas(org: string, items: Record<string, unknown>[]): Promise<PubEncontrada[]> {
  const { cuentas, apodos } = await nuestras(org);
  const crudos = items.map(aPubEncontrada).filter((p): p is PubEncontrada => !!p);
  const lista: PubEncontrada[] = [];
  for (const p of crudos) {
    if (!p.esCatalogo || !cuentas[0]) { lista.push({ ...p, esCatalogo: false }); continue; }
    lista.push(...await vendedoresDelCatalogo(cuentas[0], p.catalogoId ?? p.itemId, p));
  }
  return completar(org, cuentas, apodos, lista);
}

/** Guarda una búsqueda como la última del producto (la que se ve en su pestaña Seguimiento). */
export async function guardarBusqueda(org: string, productoId: number, texto: string, resultados: PubEncontrada[]): Promise<void> {
  await consulta(`
    insert into seguimiento_busqueda (organizacion_id, producto_id, texto, ts, resultados) values ($1, $2, $3, now(), $4::jsonb)
    on conflict (organizacion_id, producto_id) do update set texto = excluded.texto, ts = now(), resultados = excluded.resultados`,
    [org, productoId, texto, JSON.stringify(resultados)]);
}

/** El código postal de referencia para calcular la entrega (Capital Federal). */
const CP_REFERENCIA = "1425";

/** En cuántos días llega una publicación (la opción de envío más rápida), por la API: las opciones de envío
 *  a un código postal sí se pueden leer de publicaciones ajenas. null si no se pudo. */
export async function diasDeEntrega(cuenta: CuentaMl, itemId: string): Promise<number | null> {
  if (!/^MLA\d+$/.test(itemId)) return null;
  const r = await ml<{ options?: { estimated_delivery_time?: { date?: string | null } }[] }>(cuenta, "GET", `/items/${itemId}/shipping_options?zip_code=${CP_REFERENCIA}`).catch(() => null);
  if (!r || r.status !== 200) return null;
  return diasHasta((r.datos.options ?? []).map((o) => o.estimated_delivery_time?.date).filter((d): d is string => !!d));
}

/** Días desde hoy hasta la fecha más cercana (redondeado para arriba; 0 = hoy). Pura. */
export function diasHasta(fechas: string[], hoy = new Date()): number | null {
  const ms = fechas.map((f) => Date.parse(f)).filter(Number.isFinite);
  if (!ms.length) return null;
  return Math.max(0, Math.ceil((Math.min(...ms) - hoy.getTime()) / 86_400_000));
}

/** Los vendedores que compiten en un producto de catálogo (API, gratis), como publicaciones para seguir. */
async function vendedoresDelCatalogo(cuenta: CuentaMl, catalogo: string, base: PubEncontrada): Promise<PubEncontrada[]> {
  const r = await ml<{ results?: { item_id: string; price?: number; original_price?: number | null; currency_id?: string; listing_type_id?: string; seller_id?: number;
    official_store_id?: number | null; shipping?: { free_shipping?: boolean }; international_delivery_mode?: string | null }[] }>(cuenta, "GET", `/products/${catalogo}/items?limit=30`).catch(() => null);
  if (!r || r.status !== 200 || !r.datos.results?.length) return [];
  // El título que ve el comprador es el del catálogo: el de la búsqueda puede ser el de una publicación (Fer, 11/10).
  const nombre = await nombreCatalogo(cuenta, catalogo);
  return r.datos.results.map((x) => ({
    ...base, titulo: nombre ?? base.titulo, itemId: x.item_id, catalogoId: catalogo, esCatalogo: false, permalink: enlaceDe(x.item_id), vendedor: null, vendedorId: x.seller_id ?? null,
    tiendaOficial: x.official_store_id != null, precio: x.price ?? null, precioOriginal: x.original_price ?? null, moneda: x.currency_id ?? "ARS",
    tipoPublicacion: x.listing_type_id ?? null, envioGratis: x.shipping?.free_shipping ?? null, estado: "activa", publicidad: false,
    internacional: esInternacional(x.international_delivery_mode),
  }));
}

/** El nombre de un producto de catálogo (el título que ve el comprador). */
async function nombreCatalogo(cuenta: CuentaMl, catalogo: string): Promise<string | null> {
  return (await datosCatalogo(cuenta, catalogo))?.nombre ?? null;
}

async function datosCatalogo(cuenta: CuentaMl, catalogo: string): Promise<{ nombre: string; foto: string | null; permalink: string | null } | null> {
  const r = await ml<{ name?: string; pictures?: { url?: string; secure_url?: string }[]; permalink?: string }>(cuenta, "GET", `/products/${catalogo}`).catch(() => null);
  if (r?.status !== 200 || !r.datos.name) return null;
  const f = r.datos.pictures?.[0];
  return { nombre: r.datos.name, foto: f?.secure_url ?? f?.url ?? null, permalink: r.datos.permalink ?? null };
}

// ── Un catálogo pegado: sus vendedores, para elegir ─────────

/** Lo que trae un renglón pegado en «Agregar por número». Pura.
 *  · link de catálogo con vendedor (…/p/MLA…?pdp_filters=item_id:MLA…) → esa publicación, en ese catálogo;
 *  · link de catálogo solo (…/p/MLA…) → el catálogo, para elegir vendedores;
 *  · si no, los números MLA/MLAU que tenga. */
export function leerRenglon(renglon: string): { catalogo: string | null; items: string[] } {
  const r = renglon.toUpperCase();
  const cat = r.match(/\/P\/(MLA\d{6,})/)?.[1] ?? null;
  const item = decodeURIComponent(r).match(/ITEM_ID[:=](MLAU?\d{6,})/)?.[1] ?? null;
  if (cat) return { catalogo: cat, items: item ? [item] : [] };
  return { catalogo: null, items: [...new Set((r.match(/MLAU?-?\d{9,}/g) ?? []).map((x) => x.replace("-", "")))] };
}

export type CatalogoPegado = { catalogoId: string; titulo: string | null; ts: Date; resultados: PubEncontrada[] };

/** Arma (o rearma) la lista de vendedores de un catálogo, por la API (gratis). */
export async function listarCatalogo(org: string, productoId: number, catalogo: string): Promise<number> {
  const { cuentas, apodos } = await nuestras(org);
  if (!cuentas[0]) throw new ErrorErp("No hay ninguna cuenta de Mercado Libre conectada para leer el catálogo.");
  const d = await datosCatalogo(cuentas[0], catalogo);
  if (!d) throw new ErrorErp(`Mercado Libre no encuentra el catálogo ${catalogo}.`);
  const base: PubEncontrada = {
    itemId: catalogo, catalogoId: catalogo, titulo: d.nombre, foto: d.foto, permalink: d.permalink, vendedor: null, tiendaOficial: null, precio: null,
    precioOriginal: null, moneda: "ARS", cuotas: null, envioGratis: null, publicidad: false, estado: "activa", tipoPublicacion: null,
  };
  const resultados = await completar(org, cuentas, apodos, await vendedoresDelCatalogo(cuentas[0], catalogo, base));
  await consulta(`
    insert into seguimiento_catalogo (organizacion_id, producto_id, catalogo_id, titulo, ts, resultados) values ($1, $2, $3, $4, now(), $5::jsonb)
    on conflict (organizacion_id, producto_id, catalogo_id) do update set titulo = excluded.titulo, ts = now(), resultados = excluded.resultados`,
    [org, productoId, catalogo, d.nombre, JSON.stringify(resultados)]);
  return resultados.length;
}

export function catalogosPegados(org: string, productoId: number): Promise<CatalogoPegado[]> {
  return consulta<CatalogoPegado>(`select catalogo_id "catalogoId", titulo, ts, resultados from seguimiento_catalogo
    where organizacion_id = $1 and producto_id = $2 order by ts desc`, [org, productoId]);
}

export async function cerrarCatalogo(org: string, productoId: number, catalogo: string): Promise<void> {
  await consulta("delete from seguimiento_catalogo where organizacion_id = $1 and producto_id = $2 and catalogo_id = $3", [org, productoId, catalogo]);
}

export async function ultimaBusqueda(org: string, productoId: number): Promise<{ texto: string; ts: Date; resultados: PubEncontrada[] } | null> {
  return una("select texto, ts, resultados from seguimiento_busqueda where organizacion_id = $1 and producto_id = $2", [org, productoId]);
}

/** La dirección de una publicación por su número (MLA… común, MLAU… producto de vendedor). */
export const enlaceDe = (id: string) => id.startsWith("MLAU")
  ? `https://www.mercadolibre.com.ar/up/${id}` : `https://articulo.mercadolibre.com.ar/${id.replace("MLA", "MLA-")}`;

// ── Seguir / dejar de seguir ────────────────────────────────

/** Sigue una publicación de la última búsqueda (con lo que trajo, que vale como primera lectura). */
export async function seguirDeBusqueda(org: string, productoId: number, itemId: string): Promise<void> {
  const b = await ultimaBusqueda(org, productoId);
  let p = b?.resultados.find((x) => x.itemId === itemId);
  let ts = b?.ts ?? new Date();
  // O de un catálogo pegado en «Agregar por número».
  if (!p) for (const c of await catalogosPegados(org, productoId)) {
    const x = c.resultados.find((y) => y.itemId === itemId);
    if (x) { p = x; ts = c.ts; break; }
  }
  if (!p) throw new ErrorErp("Esa publicación ya no está en la búsqueda: buscá de nuevo.");
  if (p.esCatalogo) throw new ErrorErp("Es un producto de catálogo: buscá de nuevo para ver a cada vendedor.");
  const r = await una<{ id: number }>(`
    insert into seguimiento_pub (organizacion_id, producto_id, item_id, catalogo_id, titulo, foto, permalink, vendedor, tienda_oficial,
                                 precio, precio_original, moneda, estado, tipo_publicacion, cuotas, envio_gratis, origen, leido_ts, intento_ts, vendedor_id, entrega_dias, internacional)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, coalesce($13, 'activa'), $14, $15, $16, 'busqueda', $17, $17, $18, $19, $20)
    on conflict (organizacion_id, producto_id, item_id) do nothing returning id::int`,
    [org, productoId, p.itemId, p.catalogoId, p.titulo, p.foto, p.permalink, p.vendedor, p.tiendaOficial, p.precio, p.precioOriginal, p.moneda,
      p.estado, p.tipoPublicacion, p.cuotas, p.envioGratis, ts, p.vendedorId ?? null, p.entregaDias ?? null, p.internacional ?? null]);
  if (r) await anotarLectura(org, r.id, "busqueda", p);
}

/** Sigue publicaciones pegadas a mano (links o números MLA). Se leen en la próxima vuelta. */
export async function seguirPorNumero(org: string, productoId: number, texto: string, origen: "manual" | "importado" = "manual"): Promise<{ nuevas: number; repetidas: number; ids: number[]; catalogos: string[] }> {
  const items = new Map<string, string | null>(); // número → catálogo (si vino en el link)
  const catalogos = new Set<string>();
  for (const renglon of texto.split(/[\n\s]+/).filter(Boolean)) {
    const r = leerRenglon(renglon);
    if (r.catalogo && !r.items.length) catalogos.add(r.catalogo);
    for (const it of r.items) items.set(it, r.catalogo ?? items.get(it) ?? null);
  }
  if (!items.size && !catalogos.size) throw new ErrorErp("Pegá links o números de publicación (MLA… o MLAU…), o el link de un catálogo (…/p/MLA…).");
  const nuevos: number[] = [];
  for (const [id, cat] of items) {
    const r = await una<{ id: number }>(`insert into seguimiento_pub (organizacion_id, producto_id, item_id, catalogo_id, origen, estado, permalink)
                          values ($1, $2, $3, $4, $5, 'sin_dato', $6) on conflict (organizacion_id, producto_id, item_id) do nothing returning id::int`,
      [org, productoId, id, cat, origen, enlaceDe(id)]);
    if (r) nuevos.push(r.id);
  }
  return { nuevas: nuevos.length, repetidas: items.size - nuevos.length, ids: nuevos, catalogos: [...catalogos] };
}

/** «Reanudar» una pausada que dejó de releerse: vuelve a contar los meses desde hoy. */
export async function reanudarSeguida(org: string, id: number): Promise<void> {
  await consulta("update seguimiento_pub set pausada_desde = now() where id = $1 and organizacion_id = $2", [id, org]);
}

export async function dejarDeSeguir(org: string, id: number): Promise<void> {
  await consulta("delete from seguimiento_pub where id = $1 and organizacion_id = $2", [id, org]);
}

/** Sigue solas las publicaciones comparables (origen «auto», sin confirmar), con lo que trajo la búsqueda como
 *  primera lectura. Las que ya se siguen no se tocan. Devuelve cuántas agregó. */
export async function seguirAutomaticas(org: string, productoId: number, pubs: (PubEncontrada & { motivoIa?: string | null })[], ts: Date = new Date()): Promise<number> {
  // Las automáticas que nadie revisó y que esta búsqueda ya no elige se dejan de seguir (las revisadas quedan).
  await consulta(`delete from seguimiento_pub where organizacion_id = $1 and producto_id = $2 and origen = 'auto' and not confirmada
                   and not (item_id = any($3::text[]))`, [org, productoId, pubs.map((p) => p.itemId)]);
  let n = 0;
  for (const p of pubs) {
    if (p.esCatalogo || p.propia) continue;
    const r = await una<{ id: number }>(`
      insert into seguimiento_pub (organizacion_id, producto_id, item_id, catalogo_id, titulo, foto, permalink, vendedor, tienda_oficial,
                                   precio, precio_original, moneda, estado, tipo_publicacion, cuotas, envio_gratis, origen, leido_ts, intento_ts, vendedor_id,
                                   entrega_dias, internacional, confirmada, motivo_ia)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, coalesce($13, 'activa'), $14, $15, $16, 'auto', $17, $17, $18, $19, $20, false, $21)
      on conflict (organizacion_id, producto_id, item_id) do nothing returning id::int`,
      [org, productoId, p.itemId, p.catalogoId, p.titulo, p.foto, p.permalink, p.vendedor, p.tiendaOficial, p.precio, p.precioOriginal, p.moneda,
        p.estado, p.tipoPublicacion, p.cuotas, p.envioGratis, ts, p.vendedorId ?? null, p.entregaDias ?? null, p.internacional ?? null, p.motivoIa ?? null]);
    if (r) { await anotarLectura(org, r.id, "busqueda", p); n++; }
  }
  return n;
}

/** Una persona revisó (o des-revisó) seguidas: por id, o todas las sin confirmar del producto. Devuelve cuántas cambió. */
export async function confirmarSeguidas(org: string, productoId: number, o: { ids?: number[]; confirmada: boolean; usuario: string | null }): Promise<number> {
  const r = await consulta<{ id: number }>(`
    update seguimiento_pub set confirmada = $3, confirmada_ts = case when $3 then now() end, confirmada_por = case when $3 then $4 end
     where organizacion_id = $1 and producto_id = $2 and confirmada <> $3 and ($5::bigint[] is null or id = any($5::bigint[])) returning id::int`,
    [org, productoId, o.confirmada, o.usuario, o.ids?.length ? o.ids : null]);
  return r.length;
}

/** Marca las internacionales en la búsqueda guardada y en los catálogos pegados (por el país de cada vendedor, gratis):
 *  las búsquedas de antes no traían el dato. Devuelve cuántas marcó. */
export async function marcarInternacionales(org: string, productoId: number): Promise<number> {
  const { cuentas } = await nuestras(org);
  if (!cuentas[0]) return 0;
  const b = await ultimaBusqueda(org, productoId);
  const cats = await catalogosPegados(org, productoId);
  const todas = [...(b?.resultados ?? []), ...cats.flatMap((c) => c.resultados)];
  const vendedores = [...new Set(todas.filter((x) => x.internacional == null && x.vendedorId).map((x) => x.vendedorId!))].slice(0, 120);
  const afuera = new Set<number>();
  for (let i = 0; i < vendedores.length; i += 10) {
    await Promise.all(vendedores.slice(i, i + 10).map(async (v) => {
      const u = await ml<{ country_id?: string }>(cuentas[0], "GET", `/users/${v}`).catch(() => null);
      if (u?.status === 200 && esInternacional(null, u.datos.country_id)) afuera.add(v);
    }));
  }
  const marcar = (lista: PubEncontrada[]) => lista.map((x) => (x.internacional == null && x.vendedorId ? { ...x, internacional: afuera.has(x.vendedorId) } : x));
  if (b) await consulta("update seguimiento_busqueda set resultados = $3::jsonb where organizacion_id = $1 and producto_id = $2", [org, productoId, JSON.stringify(marcar(b.resultados))]);
  for (const c of cats) await consulta("update seguimiento_catalogo set resultados = $4::jsonb where organizacion_id = $1 and producto_id = $2 and catalogo_id = $3",
    [org, productoId, c.catalogoId, JSON.stringify(marcar(c.resultados))]);
  return afuera.size;
}

/** Seguirla pero que no cuente para la regla de precio (o volver a contarla). */
export async function excluirDeRegla(org: string, id: number, excluido: boolean): Promise<number | null> {
  const r = await una<{ producto_id: number }>("update seguimiento_pub set excluido = $3 where id = $1 and organizacion_id = $2 returning producto_id::int", [id, org, excluido]);
  return r?.producto_id ?? null;
}

// ── Leer las seguidas ───────────────────────────────────────

async function anotarLectura(org: string, segId: number, fuente: "api" | "apify" | "busqueda", p: Partial<PubEncontrada>, datos: unknown = {}) {
  await consulta(`insert into seguimiento_lectura (organizacion_id, seguimiento_id, fuente, precio, precio_original, estado, tipo_publicacion, datos)
                  values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [org, segId, fuente, p.precio ?? null, p.precioOriginal ?? null, p.estado ?? null, p.tipoPublicacion ?? null, JSON.stringify(datos ?? {})]);
}

type Seguida = { id: number; item_id: string; catalogo_id: string | null; permalink: string | null; producto_id: number; vendedor_id: number | null };

/** Las de catálogo, por la API (gratis): /products/{catálogo}/items trae a todos los que compiten. */
async function leerCatalogo(org: string, cuenta: CuentaMl, seguidas: Seguida[]): Promise<number> {
  let leidas = 0;
  const porCatalogo = new Map<string, Seguida[]>();
  for (const s of seguidas) porCatalogo.set(s.catalogo_id!, [...(porCatalogo.get(s.catalogo_id!) ?? []), s]);
  for (const [cat, lista] of porCatalogo) {
    // El título del catálogo (el que ve el comprador), también en la búsqueda guardada.
    const nombre = await nombreCatalogo(cuenta, cat);
    if (nombre) {
      await consulta("update seguimiento_pub set titulo = $3 where organizacion_id = $1 and catalogo_id = $2", [org, cat, nombre]);
      await consulta(`
        update seguimiento_busqueda b set resultados = (
          select jsonb_agg(case when e ->> 'catalogoId' = $2 then jsonb_set(e, '{titulo}', to_jsonb($3::text)) else e end order by n)
            from jsonb_array_elements(b.resultados) with ordinality t(e, n))
         where b.organizacion_id = $1 and b.resultados @> jsonb_build_array(jsonb_build_object('catalogoId', $2::text))`, [org, cat, nombre]);
    }
    const r = await ml<{ results?: { item_id: string; price?: number; original_price?: number | null; currency_id?: string; listing_type_id?: string; seller_id?: number;
      official_store_id?: number | null; shipping?: { free_shipping?: boolean }; international_delivery_mode?: string | null }[] }>(cuenta, "GET", `/products/${cat}/items?limit=100`);
    for (const s of lista) {
      if (r.status !== 200) {
        await consulta("update seguimiento_pub set intento_ts = now(), error = $2 where id = $1", [s.id, `Mercado Libre contestó ${r.status} al leer el catálogo ${cat}.`]);
        continue;
      }
      // Una MLAU (producto de vendedor) no figura por su número: se la reconoce por el vendedor.
      const x = (r.datos.results ?? []).find((y) => y.item_id === s.item_id)
        ?? (s.item_id.startsWith("MLAU") && s.vendedor_id ? (r.datos.results ?? []).find((y) => y.seller_id === s.vendedor_id) : undefined);
      const p: Partial<PubEncontrada> = x
        ? { precio: x.price ?? null, precioOriginal: x.original_price ?? null, moneda: x.currency_id ?? "ARS", estado: "activa", tipoPublicacion: x.listing_type_id ?? null,
            envioGratis: x.shipping?.free_shipping ?? null, tiendaOficial: x.official_store_id != null }
        // No figura entre los que compiten: pausada, sin stock o fuera del catálogo.
        : { estado: "no_figura" };
      if (x) p.entregaDias = await diasDeEntrega(cuenta, s.item_id);
      // El apodo del vendedor, si todavía no se sabe (las agregadas por número llegan sin él).
      // Y si es internacional (entrega internacional o vendedor de afuera): no cuenta para la regla.
      if (x?.seller_id) {
        const u = await ml<{ nickname?: string; country_id?: string }>(cuenta, "GET", `/users/${x.seller_id}`).catch(() => null);
        const ok = u?.status === 200;
        await consulta("update seguimiento_pub set vendedor = coalesce(vendedor, $2), internacional = $3 where id = $1",
          [s.id, ok ? u!.datos.nickname ?? null : null, esInternacional(x.international_delivery_mode, ok ? u!.datos.country_id : null)]);
      }
      await consulta(`update seguimiento_pub set precio = coalesce($2, precio), precio_original = $3, moneda = coalesce($4, moneda), estado = $5,
                             tipo_publicacion = coalesce($6, tipo_publicacion), envio_gratis = coalesce($7, envio_gratis), tienda_oficial = coalesce($8, tienda_oficial),
                             vendedor_id = coalesce($9, vendedor_id), entrega_dias = coalesce($10, entrega_dias), leido_ts = now(), intento_ts = now(), error = null where id = $1`,
        [s.id, p.precio ?? null, p.precioOriginal ?? null, p.moneda ?? null, p.estado, p.tipoPublicacion ?? null, p.envioGratis ?? null, p.tiendaOficial ?? null, x?.seller_id ?? null, p.entregaDias ?? null]);
      await anotarLectura(org, s.id, "api", p, x ?? { no_figura: true });
      leidas++;
    }
  }
  return leidas;
}

/** Las comunes, con Apify por su dirección, dentro del tope. De a tandas chicas que corren en paralelo (Fer, 12/10:
 *  una sola corrida de 33 tardaba más que los 5 minutos que tiene la vuelta, y se cortaba sin grabar nada). Cada
 *  corrida espera como mucho ESPERA_SEG: lo que trajo hasta ahí se graba igual y lo demás queda para la próxima vuelta. */
const TANDA_APIFY = 5;
const EN_PARALELO = 4;
const ESPERA_SEG = 200;

/** La dirección que se le pasa a Apify: con un número MLA, siempre la de la publicación (articulo.mercadolibre.com.ar/MLA-…);
 *  Apify no lee bien los links de catálogo (…/p/…) ni de producto de vendedor (…/up/…) aunque traigan el número. */
function urlParaLeer(s: Seguida): string {
  return /^MLA\d+$/.test(s.item_id) ? enlaceDe(s.item_id) : (s.permalink ?? enlaceDe(s.item_id));
}

async function leerComunes(org: string, seguidas: Seguida[]): Promise<{ leidas: number; sinPresupuesto: number }> {
  let leidas = 0, sinPresupuesto = 0;
  const tandas: Seguida[][] = [];
  for (let i = 0; i < seguidas.length; i += TANDA_APIFY) tandas.push(seguidas.slice(i, i + TANDA_APIFY));
  for (let g = 0; g < tandas.length; g += EN_PARALELO) {
    // El presupuesto se mira una vez por grupo y se reparte entre las corridas del grupo.
    let queda = await quedaParaGastar(org);
    const grupo: { tanda: Seguida[]; tope: number }[] = [];
    for (const tanda of tandas.slice(g, g + EN_PARALELO)) {
      const estimado = tanda.length * 0.01;
      if (queda < Math.max(0.05, estimado)) { sinPresupuesto += tanda.length; continue; }
      const tope = Math.min(queda, Math.max(0.2, estimado * 2));
      queda -= tope;
      grupo.push({ tanda, tope });
    }
    if (!grupo.length) { sinPresupuesto += tandas.slice(g + EN_PARALELO).reduce((a, t) => a + t.length, 0); break; }
    const resultados = await Promise.all(grupo.map(async ({ tanda, tope }) => ({
      tanda,
      c: await correrConEntrada(ACTOR, { site: "MLA", startUrls: tanda.map((s) => ({ url: urlParaLeer(s) })), maxItems: tanda.length, includeProductDetails: true },
        { max: tanda.length, esperaSeg: ESPERA_SEG, topeUsd: tope }),
    })));
    for (const { tanda, c } of resultados) leidas += await grabarComunes(org, tanda, c);
  }
  return { leidas, sinPresupuesto };
}

/** Graba lo que trajo una corrida de Apify para su tanda. Devuelve cuántas leyó. */
async function grabarComunes(org: string, tanda: Seguida[], c: Awaited<ReturnType<typeof correrConEntrada>>): Promise<number> {
  let leidas = 0;
  await consulta("insert into seguimiento_corrida (organizacion_id, tipo, run_id, costo_usd, publicaciones, error) values ($1, 'lectura', $2, $3, $4, $5)",
    [org, c.runId ?? null, costoDe("lectura", c.costoUsd, c.items.length), c.items.length, c.error ?? null]);
  const porId = new Map<string, { p: PubEncontrada; x: unknown }>();
  for (const x of c.items as Record<string, unknown>[]) {
    const p = aPubEncontrada(x);
    if (p) porId.set(p.itemId, { p, x });
  }
  for (const s of tanda) {
    const e = porId.get(s.item_id);
    if (!e) {
      await consulta("update seguimiento_pub set intento_ts = now(), error = $2 where id = $1",
        [s.id, c.error ? `No se pudo leer (${c.error.slice(0, 100)}).` : "Mercado Libre no devolvió esta publicación (puede estar terminada)."]);
      continue;
    }
    const p = e.p;
    await consulta(`update seguimiento_pub set titulo = coalesce($2, titulo), foto = coalesce($3, foto), vendedor = coalesce($4, vendedor),
                           tienda_oficial = coalesce($5, tienda_oficial), precio = coalesce($6, precio), precio_original = $7, moneda = coalesce($8, moneda),
                           estado = coalesce($9, case when $6 is not null then 'activa' else estado end), tipo_publicacion = coalesce($10, tipo_publicacion),
                           cuotas = coalesce($11, cuotas), envio_gratis = coalesce($12, envio_gratis), catalogo_id = coalesce(catalogo_id, $13),
                           disponible = $14, vendidos = coalesce($15, vendidos),
                           leido_ts = now(), intento_ts = now(), error = null where id = $1`,
      [s.id, p.titulo !== "(sin título)" ? p.titulo : null, p.foto, p.vendedor, p.tiendaOficial, p.precio, p.precioOriginal, p.moneda, p.estado,
        p.tipoPublicacion, p.cuotas, p.envioGratis, p.catalogoId ?? catalogoDeApify(e.x, s.item_id), ...stockDeApify(e.x)]);
    await anotarLectura(org, s.id, "apify", p, e.x);
    leidas++;
  }
  return leidas;
}

/** Stock y vendidos de la publicación según Apify (availableQuantity / soldQuantity; null si no vino). Pura. */
export function stockDeApify(x: unknown): [number | null, number | null] {
  const o = (x ?? {}) as { availableQuantity?: unknown; soldQuantity?: unknown };
  const n = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
  return [n(o.availableQuantity), n(o.soldQuantity)];
}

/** El catálogo en el que compite, según lo que trae Apify de la publicación («sku»: MLA… del producto de catálogo). Pura. */
export function catalogoDeApify(x: unknown, itemId: string): string | null {
  const sku = (x as { sku?: unknown } | null)?.sku;
  return typeof sku === "string" && /^MLA\d{8,}$/.test(sku) && sku !== itemId ? sku : null;
}

/** Una MLAU (producto de vendedor): la API dice de quién es y en qué catálogo compite, si lo hay. */
async function leerUserProduct(cuenta: CuentaMl, s: Seguida): Promise<boolean> {
  const r = await ml<{ user_id?: number; catalog_product_id?: string | null; name?: string }>(cuenta, "GET", `/user-products/${s.item_id}`).catch(() => null);
  if (!r || r.status !== 200) {
    await consulta("update seguimiento_pub set intento_ts = now(), error = $2 where id = $1",
      [s.id, `Mercado Libre no deja leer las publicaciones MLAU de otros vendedores (contestó ${r?.status ?? "sin respuesta"}). Seguí su número MLA si lo tenés.`]);
    return false;
  }
  await consulta("update seguimiento_pub set vendedor_id = coalesce($2, vendedor_id), catalogo_id = coalesce(catalogo_id, $3), titulo = coalesce(titulo, $4) where id = $1",
    [s.id, r.datos.user_id ?? null, r.datos.catalog_product_id ?? null, r.datos.name ?? null]);
  if (!r.datos.catalog_product_id) {
    await consulta("update seguimiento_pub set intento_ts = now(), error = $2 where id = $1",
      [s.id, "Es una publicación MLAU que no compite en un catálogo: Mercado Libre no deja leer su precio. Seguí su número MLA si lo tenés."]);
    return false;
  }
  s.catalogo_id = r.datos.catalog_product_id;
  s.vendedor_id = r.datos.user_id ?? s.vendedor_id;
  return true;
}

/** Lee las seguidas que tocan (pasaron los días de la configuración, o nunca se leyeron), o las de un producto. En la vuelta
 *  sola (sin producto ni ids), las comunes sólo de productos a la venta. */
export async function leerSeguidas(org: string, o: { productoId?: number; todas?: boolean; ids?: number[] } = {}): Promise<{ catalogo: number; comunes: number; sinPresupuesto: number }> {
  const { frecuenciaDias, pausadasDias, pausadasMeses } = await configSeguimiento(org);
  const seguidas = await consulta<Seguida>(`
    select sp.id::int, sp.item_id, sp.catalogo_id, sp.permalink, sp.producto_id::int, sp.vendedor_id::float8 vendedor_id from seguimiento_pub sp
     where sp.organizacion_id = $1 and ($2::bigint is null or sp.producto_id = $2) and ($5::bigint[] is null or sp.id = any($5::bigint[]))
       -- Las pausadas de la competencia, cada «pausadas_dias» (Fer, 22/10).
       and ($3 or sp.leido_ts is null or sp.leido_ts < now() - make_interval(days => case when sp.estado = 'pausada' then $7::int else $4::int end) + interval '2 hours')
       -- Lo que falló hace poco no se reintenta enseguida (salvo pedido a mano).
       and ($3 or sp.intento_ts is null or sp.intento_ts < now() - interval '20 hours')
       -- En la vuelta sola, las que cuestan (las comunes, con Apify) sólo de productos a la venta: con publicación activa
       -- en Mercado Libre y stock disponible (Fer, 22/10). Las de catálogo y MLAU se leen gratis por la API.
       and (not $6::boolean or sp.catalogo_id is not null or sp.item_id like 'MLAU%'
            or exists (select 1 from producto p where p.id = sp.producto_id and ${SQL_A_LA_VENTA}))
       -- Pausada hace más de «pausadas_meses»: frenada hasta «Reanudar».
       and (not $6::boolean or not (sp.estado = 'pausada' and $8::int > 0 and sp.pausada_desde < now() - make_interval(months => $8::int)))
     order by sp.leido_ts nulls first limit 2000`, [org, o.productoId ?? null, !!o.todas, frecuenciaDias, o.ids?.length ? o.ids : null, !o.productoId && !o.ids?.length, pausadasDias, pausadasMeses]);
  if (!seguidas.length) return { catalogo: 0, comunes: 0, sinPresupuesto: 0 };
  const cuenta = (await nuestras(org)).cuentas[0];
  // Las MLAU (productos de vendedor) no se leen con Apify: la API dice en qué catálogo compiten (si compiten).
  const mlau = seguidas.filter((s) => s.item_id.startsWith("MLAU") && !s.catalogo_id);
  const mlauOk = new Set<number>();
  if (cuenta) for (const s of mlau) if (await leerUserProduct(cuenta, s)) mlauOk.add(s.id);
  const deCatalogo = cuenta ? seguidas.filter((s) => s.catalogo_id) : [];
  let catalogo = deCatalogo.length ? await leerCatalogo(org, cuenta, deCatalogo) : 0;
  const comunes = seguidas.filter((s) => !deCatalogo.includes(s) && !mlau.includes(s));
  const { leidas, sinPresupuesto } = await leerComunes(org, comunes);
  if (cuenta) {
    // Si Apify dijo que compite en un catálogo, se completa por la API (gratis): vendedor, tipo y el título del catálogo.
    const ahoraCatalogo = await consulta<Seguida>(`select id::int, item_id, catalogo_id, permalink, producto_id::int, vendedor_id::float8 vendedor_id
      from seguimiento_pub where id = any($1::bigint[]) and catalogo_id is not null`, [comunes.map((s) => s.id)]);
    if (ahoraCatalogo.length) catalogo += await leerCatalogo(org, cuenta, ahoraCatalogo);
    // La entrega de las comunes, por la API (gratis), aunque no haya quedado presupuesto para leerlas con Apify.
    for (const x of comunes.filter((s) => !ahoraCatalogo.some((c) => c.id === s.id))) {
      const d = await diasDeEntrega(cuenta, x.item_id);
      if (d != null) await consulta("update seguimiento_pub set entrega_dias = $2 where id = $1", [x.id, d]);
    }
  }
  // Las que Mercado Libre dice terminadas se dejan de seguir (Fer, 22/10): una terminada no vuelve.
  await consulta("delete from seguimiento_pub where organizacion_id = $1 and id = any($2::bigint[]) and estado = 'cerrada'", [org, seguidas.map((x) => x.id)]);
  // Con lo recién leído, la regla de precio de cada producto (lib/seguimiento/regla.ts).
  await revisarReglasDe(org, [...new Set(seguidas.map((x) => x.producto_id))]).catch((e) => console.error("[seguimiento] reglas", e));
  return { catalogo, comunes: leidas, sinPresupuesto };
}

/** Las organizaciones con algo seguido (para la vuelta diaria). */
export async function orgsConSeguimiento(): Promise<string[]> {
  return (await consulta<{ o: string }>("select distinct organizacion_id o from seguimiento_pub")).map((r) => r.o);
}
