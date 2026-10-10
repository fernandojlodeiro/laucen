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
import { correrConEntrada } from "@/lib/apify";
import { ml, cuentasDe, type CuentaMl } from "@/lib/mercadolibre/api";

const ACTOR = "scrapesage~mercadolibre-scraper";

// ── Configuración general ───────────────────────────────────

export type ConfigSeguimiento = { frecuenciaDias: number; topeUsd: number };
export const CONFIG_DEFECTO: ConfigSeguimiento = { frecuenciaDias: 7, topeUsd: 30 };

export async function configSeguimiento(org: string): Promise<ConfigSeguimiento> {
  const r = await una<{ valor: { frecuencia_dias?: number; tope_usd?: number } }>(
    "select valor from config_org where organizacion_id = $1 and clave = 'seguimiento'", [org]).catch(() => null);
  return {
    frecuenciaDias: Number(r?.valor?.frecuencia_dias) > 0 ? Number(r!.valor.frecuencia_dias) : CONFIG_DEFECTO.frecuenciaDias,
    topeUsd: r?.valor?.tope_usd != null && Number(r.valor.tope_usd) >= 0 ? Number(r.valor.tope_usd) : CONFIG_DEFECTO.topeUsd,
  };
}

export async function guardarConfigSeguimiento(org: string, c: ConfigSeguimiento): Promise<void> {
  if (!Number.isInteger(c.frecuenciaDias) || c.frecuenciaDias < 1 || c.frecuenciaDias > 90) throw new ErrorErp("Cada cuántos días: de 1 a 90.");
  if (!(c.topeUsd >= 0) || c.topeUsd > 1000) throw new ErrorErp("El tope de gasto va de US$ 0 a US$ 1.000 por mes.");
  await consulta(`
    insert into config_org (organizacion_id, clave, valor) values ($1, 'seguimiento', $2::jsonb)
    on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`,
    [org, JSON.stringify({ frecuencia_dias: c.frecuenciaDias, tope_usd: c.topeUsd })]);
}

/** Lo gastado en Apify por el seguimiento este mes (hora argentina). */
export async function gastoDelMes(org: string): Promise<number> {
  const r = await una<{ usd: number }>(`
    select coalesce(sum(costo_usd), 0)::float8 usd from seguimiento_corrida
     where organizacion_id = $1 and ts >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'`, [org]);
  return Number(r?.usd ?? 0);
}

async function quedaParaGastar(org: string): Promise<number> {
  const [c, g] = await Promise.all([configSeguimiento(org), gastoDelMes(org)]);
  return Math.max(0, c.topeUsd - g);
}

// ── Lo que trae Apify de una publicación ────────────────────

export type PubEncontrada = {
  itemId: string; catalogoId: string | null; titulo: string; foto: string | null; permalink: string | null;
  vendedor: string | null; tiendaOficial: boolean | null; precio: number | null; precioOriginal: number | null; moneda: string | null;
  cuotas: string | null; envioGratis: boolean | null; publicidad: boolean; estado: string | null; tipoPublicacion: string | null;
  propia?: boolean;
};

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
  const id = (txt(x, "id", "itemId", "item_id", "publicationId") ?? "").replace("-", "").match(/^MLA\d{9,}$/)?.[0]
    ?? url?.match(/MLA-?(\d{9,})/)?.[0]?.replace("-", "")
    ?? String(x.clickUrl ?? "").match(/[?&]wid=(MLA\d+)/)?.[1] ?? null;
  if (!id) return null;
  const catalogo = url?.match(/\/p\/(MLA\d+)/)?.[1] ?? txt(x, "catalogProductId", "catalog_product_id");
  const estadoTxt = (txt(x, "status", "itemStatus") ?? "").toLowerCase();
  return {
    itemId: id, catalogoId: catalogo, titulo: txt(x, "title", "name") ?? "(sin título)", foto: txt(x, "image", "thumbnail", "imageUrl", "images", "pictures"),
    permalink: url, vendedor: txt(x, "sellerName", "seller", "sellerNickname"), tiendaOficial: bool(x.officialStore),
    precio: num(x.price ?? x.currentPrice), precioOriginal: num(x.originalPrice), moneda: txt(x, "currency") ?? "ARS",
    cuotas: txt(x, "installments"), envioGratis: bool(x.freeShipping), publicidad: x.sponsored === true,
    estado: /paus/.test(estadoTxt) ? "pausada" : /clos|finaliz/.test(estadoTxt) ? "cerrada" : estadoTxt ? "activa" : null,
    tipoPublicacion: txt(x, "listingType", "listing_type_id"),
  };
}

/** Nuestras cuentas (para marcar como propias las publicaciones que aparecen en la búsqueda). */
async function nuestras(org: string): Promise<{ cuentas: CuentaMl[]; apodos: Set<string> }> {
  const cuentas = (await cuentasDe(org)).filter((c) => c.estado === "activa");
  return { cuentas, apodos: new Set(cuentas.map((c) => (c.nickname ?? "").toUpperCase().trim()).filter(Boolean)) };
}

// ── Buscar para elegir ──────────────────────────────────────

/** Busca en Mercado Libre (Apify) y guarda el resultado como la última búsqueda del producto. */
export async function buscarParaSeguir(org: string, productoId: number, texto: string): Promise<{ cantidad: number; costoUsd: number | null }> {
  const q = texto.replace(/\s+/g, " ").trim();
  if (q.length < 3) throw new ErrorErp("Escribí qué buscar (al menos 3 letras).");
  const queda = await quedaParaGastar(org);
  if (queda < 0.2) throw new ErrorErp("Se llegó al tope de gasto del mes del seguimiento (Configuración › Seguimiento de publicaciones).");
  const c = await correrConEntrada(ACTOR, { site: "MLA", searchQueries: [q], maxItems: 50, maxPagesPerQuery: 1, includeProductDetails: false },
    { max: 50, esperaSeg: 240, topeUsd: Math.min(0.5, queda) });
  await consulta("insert into seguimiento_corrida (organizacion_id, tipo, producto_id, run_id, costo_usd, publicaciones, error) values ($1, 'busqueda', $2, $3, $4, $5, $6)",
    [org, productoId, c.runId ?? null, c.costoUsd, c.items.length, c.error ?? null]);
  if (!c.items.length) throw new ErrorErp(c.error ? `Mercado Libre no devolvió resultados (${c.error.slice(0, 120)}).` : "Mercado Libre no devolvió resultados para esa búsqueda.");
  const { apodos } = await nuestras(org);
  const vistos = new Set<string>();
  const resultados = (c.items as Record<string, unknown>[]).map(aPubEncontrada)
    .filter((p): p is PubEncontrada => !!p && !vistos.has(p.itemId) && !!vistos.add(p.itemId))
    .map((p) => ({ ...p, propia: !!p.vendedor && apodos.has(p.vendedor.toUpperCase().trim()) }));
  await consulta(`
    insert into seguimiento_busqueda (organizacion_id, producto_id, texto, ts, resultados) values ($1, $2, $3, now(), $4::jsonb)
    on conflict (organizacion_id, producto_id) do update set texto = excluded.texto, ts = now(), resultados = excluded.resultados`,
    [org, productoId, q, JSON.stringify(resultados)]);
  return { cantidad: resultados.length, costoUsd: c.costoUsd };
}

export async function ultimaBusqueda(org: string, productoId: number): Promise<{ texto: string; ts: Date; resultados: PubEncontrada[] } | null> {
  return una("select texto, ts, resultados from seguimiento_busqueda where organizacion_id = $1 and producto_id = $2", [org, productoId]);
}

// ── Seguir / dejar de seguir ────────────────────────────────

/** Sigue una publicación de la última búsqueda (con lo que trajo, que vale como primera lectura). */
export async function seguirDeBusqueda(org: string, productoId: number, itemId: string): Promise<void> {
  const b = await ultimaBusqueda(org, productoId);
  const p = b?.resultados.find((x) => x.itemId === itemId);
  if (!p) throw new ErrorErp("Esa publicación ya no está en la búsqueda: buscá de nuevo.");
  const r = await una<{ id: number }>(`
    insert into seguimiento_pub (organizacion_id, producto_id, item_id, catalogo_id, titulo, foto, permalink, vendedor, tienda_oficial,
                                 precio, precio_original, moneda, estado, tipo_publicacion, cuotas, envio_gratis, origen, leido_ts, intento_ts)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, coalesce($13, 'activa'), $14, $15, $16, 'busqueda', $17, $17)
    on conflict (organizacion_id, producto_id, item_id) do nothing returning id::int`,
    [org, productoId, p.itemId, p.catalogoId, p.titulo, p.foto, p.permalink, p.vendedor, p.tiendaOficial, p.precio, p.precioOriginal, p.moneda,
      p.estado, p.tipoPublicacion, p.cuotas, p.envioGratis, b!.ts]);
  if (r) await anotarLectura(org, r.id, "busqueda", p);
}

/** Sigue publicaciones pegadas a mano (links o números MLA). Se leen en la próxima vuelta. */
export async function seguirPorNumero(org: string, productoId: number, texto: string, origen: "manual" | "importado" = "manual"): Promise<{ nuevas: number; repetidas: number }> {
  const ids = [...new Set((texto.toUpperCase().match(/MLA-?\d{9,}/g) ?? []).map((x) => x.replace("-", "")))];
  if (!ids.length) throw new ErrorErp("Pegá links o números de publicación (MLA… de 9 cifras o más).");
  let nuevas = 0;
  for (const id of ids) {
    const r = await una(`insert into seguimiento_pub (organizacion_id, producto_id, item_id, origen, estado, permalink)
                          values ($1, $2, $3, $4, 'sin_dato', $5) on conflict (organizacion_id, producto_id, item_id) do nothing returning id`,
      [org, productoId, id, origen, `https://articulo.mercadolibre.com.ar/${id.replace("MLA", "MLA-")}`]);
    if (r) nuevas++;
  }
  return { nuevas, repetidas: ids.length - nuevas };
}

export async function dejarDeSeguir(org: string, id: number): Promise<void> {
  await consulta("delete from seguimiento_pub where id = $1 and organizacion_id = $2", [id, org]);
}

// ── Leer las seguidas ───────────────────────────────────────

async function anotarLectura(org: string, segId: number, fuente: "api" | "apify" | "busqueda", p: Partial<PubEncontrada>, datos: unknown = {}) {
  await consulta(`insert into seguimiento_lectura (organizacion_id, seguimiento_id, fuente, precio, precio_original, estado, tipo_publicacion, datos)
                  values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [org, segId, fuente, p.precio ?? null, p.precioOriginal ?? null, p.estado ?? null, p.tipoPublicacion ?? null, JSON.stringify(datos ?? {})]);
}

type Seguida = { id: number; item_id: string; catalogo_id: string | null; permalink: string | null };

/** Las de catálogo, por la API (gratis): /products/{catálogo}/items trae a todos los que compiten. */
async function leerCatalogo(org: string, cuenta: CuentaMl, seguidas: Seguida[]): Promise<number> {
  let leidas = 0;
  const porCatalogo = new Map<string, Seguida[]>();
  for (const s of seguidas) porCatalogo.set(s.catalogo_id!, [...(porCatalogo.get(s.catalogo_id!) ?? []), s]);
  for (const [cat, lista] of porCatalogo) {
    const r = await ml<{ results?: { item_id: string; price?: number; original_price?: number | null; currency_id?: string; listing_type_id?: string; seller_id?: number;
      official_store_id?: number | null; shipping?: { free_shipping?: boolean } }[] }>(cuenta, "GET", `/products/${cat}/items?limit=100`);
    for (const s of lista) {
      if (r.status !== 200) {
        await consulta("update seguimiento_pub set intento_ts = now(), error = $2 where id = $1", [s.id, `Mercado Libre contestó ${r.status} al leer el catálogo ${cat}.`]);
        continue;
      }
      const x = (r.datos.results ?? []).find((y) => y.item_id === s.item_id);
      const p: Partial<PubEncontrada> = x
        ? { precio: x.price ?? null, precioOriginal: x.original_price ?? null, moneda: x.currency_id ?? "ARS", estado: "activa", tipoPublicacion: x.listing_type_id ?? null,
            envioGratis: x.shipping?.free_shipping ?? null, tiendaOficial: x.official_store_id != null }
        // No figura entre los que compiten: pausada, sin stock o fuera del catálogo.
        : { estado: "no_figura" };
      await consulta(`update seguimiento_pub set precio = coalesce($2, precio), precio_original = $3, moneda = coalesce($4, moneda), estado = $5,
                             tipo_publicacion = coalesce($6, tipo_publicacion), envio_gratis = coalesce($7, envio_gratis), tienda_oficial = coalesce($8, tienda_oficial),
                             vendedor_id = coalesce($9, vendedor_id), leido_ts = now(), intento_ts = now(), error = null where id = $1`,
        [s.id, p.precio ?? null, p.precioOriginal ?? null, p.moneda ?? null, p.estado, p.tipoPublicacion ?? null, p.envioGratis ?? null, p.tiendaOficial ?? null, x?.seller_id ?? null]);
      await anotarLectura(org, s.id, "api", p, x ?? { no_figura: true });
      leidas++;
    }
  }
  return leidas;
}

/** Las comunes, con Apify por su dirección (de a 100 por corrida), dentro del tope. */
async function leerComunes(org: string, seguidas: Seguida[]): Promise<{ leidas: number; sinPresupuesto: number }> {
  let leidas = 0, sinPresupuesto = 0;
  for (let i = 0; i < seguidas.length; i += 100) {
    const tanda = seguidas.slice(i, i + 100);
    const queda = await quedaParaGastar(org);
    const estimado = tanda.length * 0.01;
    if (queda < Math.max(0.05, estimado)) { sinPresupuesto += seguidas.length - i; break; }
    const urls = tanda.map((s) => ({ url: s.permalink ?? `https://articulo.mercadolibre.com.ar/${s.item_id.replace("MLA", "MLA-")}` }));
    const c = await correrConEntrada(ACTOR, { site: "MLA", startUrls: urls, maxItems: tanda.length, includeProductDetails: true },
      { max: tanda.length, esperaSeg: 280, topeUsd: Math.min(queda, Math.max(0.2, estimado * 2)) });
    await consulta("insert into seguimiento_corrida (organizacion_id, tipo, run_id, costo_usd, publicaciones, error) values ($1, 'lectura', $2, $3, $4, $5)",
      [org, c.runId ?? null, c.costoUsd, c.items.length, c.error ?? null]);
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
                             leido_ts = now(), intento_ts = now(), error = null where id = $1`,
        [s.id, p.titulo !== "(sin título)" ? p.titulo : null, p.foto, p.vendedor, p.tiendaOficial, p.precio, p.precioOriginal, p.moneda, p.estado,
          p.tipoPublicacion, p.cuotas, p.envioGratis, p.catalogoId]);
      await anotarLectura(org, s.id, "apify", p, e.x);
      leidas++;
    }
  }
  return { leidas, sinPresupuesto };
}

/** Lee las seguidas que tocan (pasaron los días de la configuración, o nunca se leyeron), o las de un producto. */
export async function leerSeguidas(org: string, o: { productoId?: number; todas?: boolean } = {}): Promise<{ catalogo: number; comunes: number; sinPresupuesto: number }> {
  const { frecuenciaDias } = await configSeguimiento(org);
  const seguidas = await consulta<Seguida>(`
    select id::int, item_id, catalogo_id, permalink from seguimiento_pub
     where organizacion_id = $1 and ($2::bigint is null or producto_id = $2)
       and ($3 or leido_ts is null or leido_ts < now() - make_interval(days => $4) + interval '2 hours')
       -- Lo que falló hace poco no se reintenta enseguida (salvo pedido a mano).
       and ($3 or intento_ts is null or intento_ts < now() - interval '20 hours')
     order by leido_ts nulls first limit 2000`, [org, o.productoId ?? null, !!o.todas, frecuenciaDias]);
  if (!seguidas.length) return { catalogo: 0, comunes: 0, sinPresupuesto: 0 };
  const cuenta = (await nuestras(org)).cuentas[0];
  const deCatalogo = cuenta ? seguidas.filter((s) => s.catalogo_id) : [];
  const catalogo = deCatalogo.length ? await leerCatalogo(org, cuenta, deCatalogo) : 0;
  const { leidas, sinPresupuesto } = await leerComunes(org, seguidas.filter((s) => !deCatalogo.includes(s)));
  return { catalogo, comunes: leidas, sinPresupuesto };
}

/** Las organizaciones con algo seguido (para la vuelta diaria). */
export async function orgsConSeguimiento(): Promise<string[]> {
  return (await consulta<{ o: string }>("select distinct organizacion_id o from seguimiento_pub")).map((r) => r.o);
}
