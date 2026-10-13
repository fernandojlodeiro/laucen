// Precio de mercado (pedido de Fer, 13/10): ¿la Clásica está al día? Una búsqueda en Mercado Libre por producto (Apify,
// el mismo actor del seguimiento de publicaciones y dentro de su tope de gasto del mes) con el título del producto.
// De lo que aparece cuentan las publicaciones que se parecen (la mitad o más de las palabras de nuestro título; si
// quedan menos de 3, un tercio), sin packs, sin las nuestras, en pesos y sin las internacionales (Fer, 13/10: no
// compiten con nuestro stock local; como en el seguimiento: las que dicen «internacional» o tardan en llegar más que
// la demora de Configuración › Seguimiento de publicaciones, leída por la API): el mínimo, el cuarto más barato (p25) y la
// mediana. Se pide en tandas desde la Sugerencia de compra; cada vuelta procesa unos cuantos productos a la vez
// y se relanza sola hasta terminar (/api/precios-mercado). Tablas en db/compras.sql. Sólo lee: no cambia precios.

import { revalidateTag } from "next/cache";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { correrConEntrada } from "@/lib/apify";
import { cuentasDe } from "@/lib/mercadolibre/api";
import { aPubEncontrada, configSeguimiento, diasDeEntrega, esPack, parecido, quedaParaGastar } from "@/lib/seguimiento";
import { urlPanel } from "@/lib/tienda/dominios";

const ACTOR = "scrapesage~mercadolibre-scraper";
/** Resultados por búsqueda y lo que cobra el actor por cada uno (US$ 2 cada 1.000). */
export const RESULTADOS_POR_BUSQUEDA = 30;
export const USD_POR_RESULTADO = 0.002;
/** Productos que se buscan a la vez y segundos de trabajo por vuelta (antes de relanzarse). */
const A_LA_VEZ = 5;
const SEGUNDOS_POR_VUELTA = 60; // + la última tanda de búsquedas (hasta ~3 minutos): entra en los 5 minutos de la ruta
/** Máximo de productos por tanda. */
export const TOPE_TANDA = 300;

export type PubMercado = { itemId: string; titulo: string; precio: number; vendedor: string | null; permalink: string | null; parecido: number; entregaDias?: number | null };
export type Estadistica = { encontradas: number; minimo: number | null; p25: number | null; mediana: number | null; resultados: PubMercado[] };

const cuantil = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q, b = Math.floor(i);
  return s[b] + (s[Math.min(b + 1, s.length - 1)] - s[b]) * (i - b);
};

/** El texto de búsqueda: el título sin lo que estorba (paréntesis, códigos SKU), hasta 60 letras. Pura. */
export function textoBusqueda(titulo: string): string {
  return titulo.replace(/\(.*?\)/g, " ").replace(/\bSKU\S*/gi, " ").replace(/[^\p{L}\p{N}.,+ -]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60).trim();
}

/** ¿El resultado de Apify dice que es internacional? Pura. */
const diceInternacional = (x: Record<string, unknown>) => /internacional|international|compra internacional/i.test(JSON.stringify(x));

/** Las que se parecen, sin packs, sin las nuestras, en pesos y sin las que dicen internacional. Pura. */
export function candidatas(nuestro: string, items: Record<string, unknown>[], propios: Set<string>, propiasIds: Set<string> = new Set()): PubMercado[] {
  const todas = items.filter((x) => !diceInternacional(x)).map(aPubEncontrada).filter((p): p is NonNullable<typeof p> => !!p)
    .filter((p) => p.precio != null && p.precio > 0 && (p.moneda ?? "ARS") === "ARS" && !esPack(p.titulo) && !propios.has((p.vendedor ?? "").toUpperCase().trim()) && !propiasIds.has(p.itemId))
    .map((p) => ({ itemId: p.itemId, titulo: p.titulo, precio: p.precio!, vendedor: p.vendedor, permalink: p.permalink, parecido: Math.round(parecido(nuestro, p.titulo) * 100) / 100 }));
  const vistos = new Set<string>();
  const unicas = todas.filter((p) => !vistos.has(p.itemId) && !!vistos.add(p.itemId));
  const cuentan = unicas.filter((p) => p.parecido >= 0.5);
  return cuentan.length >= 3 ? cuentan : unicas.filter((p) => p.parecido >= 0.34);
}

/** Lo que cuenta de una búsqueda y sus números: las candidatas sin las que tardan más de `demora` días. Pura. */
export function estadistica(nuestro: string, items: Record<string, unknown>[], propios: Set<string>, entrega: Map<string, number | null> = new Map(), demora = Infinity, propiasIds: Set<string> = new Set()): Estadistica {
  const cuentan = candidatas(nuestro, items, propios, propiasIds)
    .map((p) => ({ ...p, entregaDias: entrega.get(p.itemId) ?? null }))
    .filter((p) => p.entregaDias == null || p.entregaDias <= demora);
  const precios = cuentan.map((p) => p.precio);
  return {
    encontradas: cuentan.length, minimo: precios.length ? Math.min(...precios) : null, p25: cuantil(precios, 0.25), mediana: cuantil(precios, 0.5),
    resultados: cuentan.sort((a, b) => a.precio - b.precio).slice(0, 15),
  };
}

/** Pide una tanda: los productos quedan pendientes y arranca la primera vuelta. Devuelve cuántos y el costo estimado. */
export async function pedirTanda(org: string, usuarioId: string, productos: { id: number; titulo: string }[]): Promise<{ total: number; usd: number }> {
  const lista = productos.filter((p) => textoBusqueda(p.titulo).length >= 3).slice(0, TOPE_TANDA);
  if (!lista.length) throw new ErrorErp("No hay productos para buscar.");
  const usd = lista.length * RESULTADOS_POR_BUSQUEDA * USD_POR_RESULTADO;
  const queda = await quedaParaGastar(org);
  if (queda < usd) throw new ErrorErp(`La búsqueda costaría unos US$ ${usd.toFixed(2)} y en el mes quedan US$ ${queda.toFixed(2)} del tope del seguimiento (Configuración › Seguimiento de publicaciones).`);
  const t = await una<{ id: number; token: string }>("insert into precio_mercado_tanda (organizacion_id, total, usuario_id) values ($1, $2, $3) returning id::int, token::text", [org, lista.length, usuarioId]);
  await consulta(`
    insert into precio_mercado (organizacion_id, producto_id, tanda_id, texto, estado)
    select $1, (x->>'id')::bigint, $2, x->>'texto', 'pendiente' from jsonb_array_elements($3::jsonb) x
    on conflict (organizacion_id, producto_id) do update set tanda_id = excluded.tanda_id, texto = excluded.texto, estado = 'pendiente', error = null`,
    [org, t!.id, JSON.stringify(lista.map((p) => ({ id: p.id, texto: textoBusqueda(p.titulo) })))]);
  await relanzar(t!.id, t!.token);
  return { total: lista.length, usd };
}

/** Llama a la ruta que procesa la tanda (sin esperar a que termine). */
async function relanzar(tanda: number, token: string): Promise<void> {
  const base = urlPanel();
  if (!base) return;
  await fetch(`${base}/api/precios-mercado?tanda=${tanda}&token=${token}`, { cache: "no-store", signal: AbortSignal.timeout(3000) }).catch(() => {});
}

/** Una vuelta de la tanda: busca de a varios productos hasta el tiempo de la vuelta y, si quedan, se relanza. */
export async function procesarTanda(tanda: number, token: string): Promise<{ hechos: number; quedan: number; estado: string }> {
  const t = await una<{ organizacion_id: string; estado: string }>("select organizacion_id, estado from precio_mercado_tanda where id = $1 and token = $2::uuid", [tanda, token]);
  if (!t) throw new ErrorErp("Tanda desconocida.");
  if (t.estado !== "corriendo") return { hechos: 0, quedan: 0, estado: t.estado };
  const org = t.organizacion_id;
  // Marca que está trabajando (el reanudador de la base no la relanza mientras tanto).
  await consulta("update precio_mercado_tanda set actualizado_ts = now() where id = $1", [tanda]);
  const cuentas = (await cuentasDe(org).catch(() => [])).filter((c) => c.estado === "activa");
  const propios = new Set(cuentas.map((c) => (c.nickname ?? "").toUpperCase().trim()).filter(Boolean));
  const demora = (await configSeguimiento(org)).demoraDias;
  const t0 = Date.now();
  let hechos = 0;
  while (Date.now() - t0 < SEGUNDOS_POR_VUELTA * 1000) {
    // Se toman de a varios marcándolos (otra vuelta en paralelo no los repite).
    const lote = await consulta<{ producto_id: number; texto: string; titulo: string }>(`
      update precio_mercado pm set ts = now() from producto p
       where pm.organizacion_id = $1 and pm.tanda_id = $2 and p.id = pm.producto_id
         and (pm.organizacion_id, pm.producto_id) in (
           select organizacion_id, producto_id from precio_mercado
            where organizacion_id = $1 and tanda_id = $2 and estado = 'pendiente' and (ts is null or ts < now() - interval '10 minutes')
            order by producto_id limit $3 for update skip locked)
      returning pm.producto_id::int, pm.texto, p.titulo`, [org, tanda, A_LA_VEZ]);
    if (!lote.length) break;
    const queda = await quedaParaGastar(org);
    if (queda < lote.length * RESULTADOS_POR_BUSQUEDA * USD_POR_RESULTADO) {
      await consulta("update precio_mercado_tanda set estado = 'cortada', mensaje = 'Se llegó al tope de gasto del mes del seguimiento.', actualizado_ts = now() where id = $1", [tanda]);
      await consulta("update precio_mercado set ts = null where organizacion_id = $1 and tanda_id = $2 and estado = 'pendiente'", [org, tanda]);
      return { hechos, quedan: -1, estado: "cortada" };
    }
    await Promise.all(lote.map(async (p) => {
      const c = await correrConEntrada(ACTOR, { site: "MLA", searchQueries: [p.texto], maxItems: RESULTADOS_POR_BUSQUEDA, maxPagesPerQuery: 1, includeProductDetails: false },
        { max: RESULTADOS_POR_BUSQUEDA, esperaSeg: 120, topeUsd: 0.2 });
      const costo = Math.max(c.costoUsd ?? 0, c.items.length * USD_POR_RESULTADO);
      await consulta("insert into seguimiento_corrida (organizacion_id, tipo, producto_id, run_id, costo_usd, publicaciones, error) values ($1, 'busqueda', $2, $3, $4, $5, $6)",
        [org, p.producto_id, c.runId ?? null, costo, c.items.length, c.error ?? null]);
      if (!c.items.length) {
        await consulta("update precio_mercado set estado = 'error', error = $3, ts = now() where organizacion_id = $1 and producto_id = $2",
          [org, p.producto_id, c.error ? c.error.slice(0, 200) : "Sin resultados"]);
        return;
      }
      // Cuánto tardan en llegar las que cuentan (API de ML, gratis): las internacionales tardan más que la demora.
      const items = c.items as Record<string, unknown>[];
      // Las nuestras, por número de publicación (Apify no siempre trae el vendedor).
      const ids0 = items.map(aPubEncontrada).filter((x): x is NonNullable<typeof x> => !!x).map((x) => x.itemId);
      const propiasIds = new Set((await consulta<{ id: string }>(`
        select item_id id from meli_item where organizacion_id = $1 and item_id = any($2::text[])
        union select datos_externos #>> '{ml,user_product_id}' from meli_item where organizacion_id = $1 and datos_externos #>> '{ml,user_product_id}' = any($2::text[])`,
        [org, ids0])).map((r) => r.id));
      const entrega = new Map<string, number | null>();
      if (cuentas[0]) {
        const ids = candidatas(p.titulo, items, propios, propiasIds).map((x) => x.itemId).filter((id) => /^MLA\d+$/.test(id)).slice(0, 16);
        for (let i = 0; i < ids.length; i += 8) {
          await Promise.all(ids.slice(i, i + 8).map(async (id) => { entrega.set(id, await diasDeEntrega(cuentas[0], id).catch(() => null)); }));
        }
      }
      const e = estadistica(p.titulo, items, propios, entrega, demora, propiasIds);
      await consulta(`update precio_mercado set estado = 'ok', error = null, ts = now(), encontradas = $3, minimo = $4, p25 = $5, mediana = $6, resultados = $7::jsonb
                       where organizacion_id = $1 and producto_id = $2`, [org, p.producto_id, e.encontradas, e.minimo, e.p25, e.mediana, JSON.stringify(e.resultados)]);
    }));
    hechos += lote.length;
  }
  // La sugerencia de compra guarda su cálculo: se descarta para que muestre los precios nuevos.
  try { revalidateTag(`sugerencia-compra-${org}`); } catch { /* fuera de Next */ }
  const r = await una<{ n: number }>("select count(*)::int n from precio_mercado where organizacion_id = $1 and tanda_id = $2 and estado = 'pendiente'", [org, tanda]);
  const quedan = r?.n ?? 0;
  if (quedan > 0) {
    await consulta("update precio_mercado_tanda set actualizado_ts = now() where id = $1", [tanda]);
    await relanzar(tanda, token);
    return { hechos, quedan, estado: "corriendo" };
  }
  await consulta("update precio_mercado_tanda set estado = 'terminada', actualizado_ts = now() where id = $1", [tanda]);
  return { hechos, quedan: 0, estado: "terminada" };
}

/** Sigue las tandas que quedaron a medias (una vuelta que se cortó o que nunca arrancó): la llaman el cron del
 *  seguimiento (todas) y la Sugerencia de compra al abrirse (las de su organización). */
export async function seguirTandas(org?: string): Promise<number> {
  const ts = await consulta<{ id: number; token: string }>(`
    select id::int, token::text from precio_mercado_tanda
     where estado = 'corriendo' and actualizado_ts < now() - interval '7 minutes' and ($1::text is null or organizacion_id = $1)`, [org ?? null]);
  for (const t of ts) await relanzar(t.id, t.token);
  return ts.length;
}

/** La última tanda de la organización (para mostrar el avance). */
export async function ultimaTanda(org: string): Promise<{ id: number; total: number; hechos: number; errores: number; estado: string; mensaje: string | null; creado: Date } | null> {
  return una(`
    select t.id::int, t.total, t.estado, t.mensaje, t.creado_ts creado,
           (select count(*)::int from precio_mercado pm where pm.tanda_id = t.id and pm.estado = 'ok') hechos,
           (select count(*)::int from precio_mercado pm where pm.tanda_id = t.id and pm.estado = 'error') errores
      from precio_mercado_tanda t where t.organizacion_id = $1 order by t.id desc limit 1`, [org]);
}

/** Precio de mercado de cada producto (los que tienen). */
export async function preciosDeMercado(org: string, productos: number[]): Promise<Map<number, { mediana: number | null; p25: number | null; minimo: number | null; encontradas: number; ts: Date }>> {
  if (!productos.length) return new Map();
  const r = await consulta<{ producto_id: number; mediana: number | null; p25: number | null; minimo: number | null; encontradas: number; ts: Date }>(`
    select producto_id::int, mediana::float8, p25::float8, minimo::float8, encontradas, ts from precio_mercado
     where organizacion_id = $1 and producto_id = any($2::bigint[]) and estado = 'ok'`, [org, productos]);
  return new Map(r.map((x) => [x.producto_id, x]));
}
