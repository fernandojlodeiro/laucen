// Precio de mercado (pedido de Fer, 13/10): ¿la Clásica está al día? Una búsqueda en Mercado Libre por producto (Apify,
// el mismo actor del seguimiento de publicaciones y dentro de su tope de gasto del mes) con el título del producto.
// Cada resultado de catálogo se abre en sus vendedores (API, gratis) y se marcan las nuestras (por cuenta y por número
// de publicación), las internacionales y cuánto tardan en llegar. Después la IA dice cuáles son el mismo producto
// (lib/seguimiento/comparables.ts): con ésas, el mínimo, el cuarto más barato (p25) y la mediana. La búsqueda queda
// guardada en el producto (pestaña Seguimiento, con la marca de la IA) y las comparables más baratas se siguen solas,
// sin confirmar (lib/seguimiento/auto.ts). Se pide en tandas desde la Sugerencia de compra; cada vuelta procesa unos
// cuantos productos a la vez y se relanza sola hasta terminar (/api/precios-mercado). Tablas en db/compras.sql.
// No cambia precios.

import { revalidateTag } from "next/cache";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { correrConEntrada } from "@/lib/apify";
import { aPubEncontrada, armarEncontradas, completar, nuestras, quedaParaGastar, ultimaBusqueda, type PubEncontrada } from "@/lib/seguimiento";
import { analizarBusqueda } from "@/lib/seguimiento/auto";
import type { PubJuzgada } from "@/lib/seguimiento/comparables";
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

/** Lo que se guarda de cada comparable (las 15 más baratas). */
export type PubMercado = { itemId: string; titulo: string; precio: number; vendedor: string | null; permalink: string | null; motivo: string | null; entregaDias?: number | null };

/** El texto de búsqueda: el título sin lo que estorba (paréntesis, códigos SKU), hasta 60 letras. Pura. */
export function textoBusqueda(titulo: string): string {
  return titulo.replace(/\(.*?\)/g, " ").replace(/\bSKU\S*/gi, " ").replace(/[^\p{L}\p{N}.,+ -]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60).trim();
}

/** Las comparables como se guardan en precio_mercado. Pura. */
export const aGuardar = (comparables: PubJuzgada[]): PubMercado[] => comparables.slice(0, 15).map((p) => ({
  itemId: p.itemId, titulo: p.titulo, precio: p.precio!, vendedor: p.vendedor, permalink: p.permalink, motivo: p.motivoIa ?? null, entregaDias: p.entregaDias ?? null,
}));

/** Analiza lo encontrado de un producto, lo guarda (búsqueda, seguidas automáticas y números) y lo da por hecho. */
async function cerrarProducto(org: string, productoId: number, texto: string, lista: PubEncontrada[], ts?: Date): Promise<void> {
  const a = await analizarBusqueda(org, productoId, texto, lista, { seguir: true, ts });
  await consulta(`update precio_mercado set estado = 'ok', error = null, ts = now(), encontradas = $3, minimo = $4, p25 = $5, mediana = $6, resultados = $7::jsonb
                   where organizacion_id = $1 and producto_id = $2`, [org, productoId, a.comparables.length, a.minimo, a.p25, a.mediana, JSON.stringify(aGuardar(a.comparables))]);
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
async function relanzar(tanda: number, token: string, extra = ""): Promise<void> {
  const base = urlPanel();
  if (!base) return;
  await fetch(`${base}/api/precios-mercado?tanda=${tanda}&token=${token}${extra}`, { cache: "no-store", signal: AbortSignal.timeout(3000) }).catch(() => {});
}

/** Una vuelta de la tanda: busca de a varios productos hasta el tiempo de la vuelta y, si quedan, se relanza. */
export async function procesarTanda(tanda: number, token: string): Promise<{ hechos: number; quedan: number; estado: string }> {
  const t = await una<{ organizacion_id: string; estado: string }>("select organizacion_id, estado from precio_mercado_tanda where id = $1 and token = $2::uuid", [tanda, token]);
  if (!t) throw new ErrorErp("Tanda desconocida.");
  if (t.estado !== "corriendo") return { hechos: 0, quedan: 0, estado: t.estado };
  const org = t.organizacion_id;
  // Marca que está trabajando (el reanudador de la base no la relanza mientras tanto).
  await consulta("update precio_mercado_tanda set actualizado_ts = now() where id = $1", [tanda]);
  const t0 = Date.now();
  let hechos = 0;
  while (Date.now() - t0 < SEGUNDOS_POR_VUELTA * 1000) {
    // Se toman de a varios marcándolos (otra vuelta en paralelo no los repite).
    const lote = await consulta<{ producto_id: number; texto: string }>(`
      update precio_mercado pm set ts = now() from producto p
       where pm.organizacion_id = $1 and pm.tanda_id = $2 and p.id = pm.producto_id
         and (pm.organizacion_id, pm.producto_id) in (
           select organizacion_id, producto_id from precio_mercado
            where organizacion_id = $1 and tanda_id = $2 and estado = 'pendiente' and (ts is null or ts < now() - interval '10 minutes')
            order by producto_id limit $3 for update skip locked)
      returning pm.producto_id::int, pm.texto`, [org, tanda, A_LA_VEZ]);
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
      // La cuenta de Apify llegó a su límite del mes: no es error del producto, la tanda se corta (queda pendiente).
      if (!c.items.length && /usage hard limit|limit exceeded/i.test(c.error ?? "")) {
        await consulta("update precio_mercado set ts = null where organizacion_id = $1 and producto_id = $2", [org, p.producto_id]);
        await consulta("update precio_mercado_tanda set estado = 'cortada', mensaje = 'La cuenta de Apify llegó a su límite de uso del mes (se sube en Apify › Billing).', actualizado_ts = now() where id = $1", [tanda]);
        return;
      }
      if (!c.items.length) {
        await consulta("update precio_mercado set estado = 'error', error = $3, ts = now() where organizacion_id = $1 and producto_id = $2",
          [org, p.producto_id, c.error ? c.error.slice(0, 200) : "Sin resultados"]);
        return;
      }
      try {
        await cerrarProducto(org, p.producto_id, p.texto, await armarEncontradas(org, c.items as Record<string, unknown>[]));
      } catch (e) {
        await consulta("update precio_mercado set estado = 'error', error = $3, ts = now() where organizacion_id = $1 and producto_id = $2",
          [org, p.producto_id, (e instanceof Error ? e.message : String(e)).slice(0, 200)]);
      }
    }));
    hechos += lote.length;
    const sigue = await una<{ estado: string }>("select estado from precio_mercado_tanda where id = $1", [tanda]);
    if (sigue?.estado !== "corriendo") {
      await consulta("update precio_mercado set ts = null where organizacion_id = $1 and tanda_id = $2 and estado = 'pendiente'", [org, tanda]);
      return { hechos, quedan: -1, estado: sigue?.estado ?? "cortada" };
    }
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

/** Vuelve a analizar lo ya buscado, sin pagar otra búsqueda: la última búsqueda guardada del producto o, si no hay, lo
 *  que quedó en precio_mercado. Saca las nuestras, juzga con la IA, sigue las comparables y recalcula los números.
 *  Sirve para lo buscado antes de que existiera el seguimiento automático. Devuelve cuántos productos hizo. */
export async function reanalizarGuardados(org: string, o: { productos?: number[]; segundos?: number; antes?: Date } = {}): Promise<{ hechos: number; quedan: number }> {
  const t0 = Date.now();
  const filas = await consulta<{ producto_id: number; texto: string; resultados: { itemId?: string; titulo: string; precio: number; vendedor: string | null; permalink: string | null }[] }>(`
    select producto_id::int, texto, resultados from precio_mercado
     where organizacion_id = $1 and ($2::bigint[] is null or producto_id = any($2::bigint[]))
       and (jsonb_array_length(resultados) > 0 or exists (select 1 from seguimiento_busqueda b where b.organizacion_id = $1 and b.producto_id = precio_mercado.producto_id))
       -- Lo ya analizado por la IA guarda el motivo de cada comparable; con «antes», se rehace lo analizado antes de esa hora.
       and (case when $3::timestamptz is null then not coalesce(resultados -> 0 ? 'motivo', false) else estado = 'ok' and ts < $3 end)
     order by producto_id`, [org, o.productos?.length ? o.productos : null, o.antes ?? null]);
  const { cuentas, apodos } = await nuestras(org);
  let n = 0;
  for (const f of filas) {
    if (o.segundos && Date.now() - t0 > o.segundos * 1000) break;
    try {
      const b = await ultimaBusqueda(org, f.producto_id).catch(() => null);
      let lista: PubEncontrada[];
      if (b?.resultados.length) lista = await completar(org, cuentas, apodos, b.resultados.map((x) => ({ ...x, propia: undefined })));
      else lista = await completar(org, cuentas, apodos, f.resultados
        .map((r) => aPubEncontrada({ id: r.itemId, url: r.permalink, title: r.titulo, price: r.precio, sellerName: r.vendedor, currency: "ARS" }))
        .filter((x): x is PubEncontrada => !!x));
      await cerrarProducto(org, f.producto_id, b?.texto ?? f.texto, lista, b?.ts);
    } catch (e) {
      console.error("[precios-mercado] reanalizar", f.producto_id, e);
      await consulta("update precio_mercado set error = $3 where organizacion_id = $1 and producto_id = $2",
        [org, f.producto_id, `Reanálisis: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`]).catch(() => {});
      continue;
    }
    n++;
  }
  try { revalidateTag(`sugerencia-compra-${org}`); } catch { /* fuera de Next */ }
  return { hechos: n, quedan: filas.length - n };
}

/** reanalizarGuardados de la organización de una tanda (la ruta lo pide con el token de la tanda). */
export async function reanalizarDeTanda(tanda: number, token: string, antes?: Date): Promise<number> {
  const t = await una<{ organizacion_id: string }>("select organizacion_id from precio_mercado_tanda where id = $1 and token = $2::uuid", [tanda, token]);
  if (!t) throw new ErrorErp("Tanda desconocida.");
  // Hasta unos minutos por vuelta (la ruta tiene 5); si quedan, se relanza. Lo que pasó queda anotado en la tanda.
  let r: { hechos: number; quedan: number };
  try {
    r = await reanalizarGuardados(t.organizacion_id, { segundos: 180, antes });
  } catch (e) {
    await consulta("update precio_mercado_tanda set mensaje = $2 where id = $1", [tanda, `Reanálisis: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`]);
    throw e;
  }
  await consulta("update precio_mercado_tanda set mensaje = $2 where id = $1", [tanda, `Reanálisis: ${r.hechos} hechos, quedan ${r.quedan}.`]);
  if (r.quedan > 0 && r.hechos > 0) await relanzar(tanda, token, antes ? `&reanalizar=1&antes=${encodeURIComponent(antes.toISOString())}` : "&reanalizar=1");
  return r.hechos;
}
