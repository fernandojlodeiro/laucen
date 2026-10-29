// Vendedores referentes (Fer, 13/10): el listado entero de un vendedor de Mercado Libre (Apify, la herramienta de
// lib/apify.ts en modo «seller»), para buscar productos que no tenemos y pedirle cotización al proveedor. Lo pedido queda
// en la tabla vendedor_referente (db/compras.sql) y lo corre /api/vendedor-referente con el token de la fila. El gasto
// cuenta en el tope del mes del seguimiento. Al terminar se rearma el cruce con nuestro catálogo (lib/compras/referentes.ts)
// y la IA agrupa y compara lo nuevo (lib/compras/referentes-ia.ts).

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ACTOR_ML, correrConEntrada } from "@/lib/apify";
import { quedaParaGastar } from "@/lib/seguimiento";
import { armarCruce, vendedorDeLink } from "@/lib/compras/referentes";
import { pedirIa } from "@/lib/compras/referentes-ia";
import { urlPanel } from "@/lib/tienda/dominios";

/** Lo que cobra la herramienta por cada publicación del listado de un vendedor (modo «seller»). */
export const USD_POR_PUBLICACION = 0.004;
/** Cuántas publicaciones se leen de un vendedor como mucho. */
export const MAXIMO_POR_VENDEDOR = 1000;

/** El listado de un vendedor en Mercado Libre (todas sus publicaciones activas). */
export const listadoDe = (vendedorId: number) => `https://listado.mercadolibre.com.ar/_CustId_${vendedorId}`;

/** Pide leer un vendedor (por su número, el link de su listado o el de su tienda) y arranca la lectura de fondo. */
export async function pedirVendedor(org: string, link: string, nombre: string, maximo = MAXIMO_POR_VENDEDOR): Promise<{ id: number; usd: number }> {
  const id = vendedorDeLink(link);
  const url = id ? listadoDe(id) : /^https?:\/\/[^\s]*mercadolibre\.com\.ar\//i.test(link.trim()) ? link.trim() : null;
  if (!url) throw new ErrorErp("Pegá el link del listado o de la tienda del vendedor en Mercado Libre, o su número.");
  const usd = maximo * USD_POR_PUBLICACION;
  const queda = await quedaParaGastar(org);
  if (queda < usd) throw new ErrorErp(`Leerlo costaría hasta US$ ${usd.toFixed(2)} y en el mes quedan US$ ${queda.toFixed(2)} del tope (Configuración › Seguimiento de publicaciones).`);
  const f = await una<{ id: number; token: string }>(`insert into vendedor_referente (organizacion_id, vendedor_id, url, nombre, maximo, detalle)
    values ($1, $2, $3, $4, $5, false) returning id::int, token::text`, [org, id, url, nombre.trim() || null, maximo]);
  const base = urlPanel();
  if (base) await fetch(`${base}/api/vendedor-referente?id=${f!.id}&token=${f!.token}`, { cache: "no-store", signal: AbortSignal.timeout(3000) }).catch(() => {});
  return { id: f!.id, usd };
}

/** Corre una fila pendiente: trae el listado, lo guarda tal cual vino y rearma el cruce. */
export async function correrVendedor(id: number, token: string): Promise<number> {
  const f = await una<{ organizacion_id: string; vendedor_id: number | null; url: string | null; maximo: number; estado: string }>(
    "select organizacion_id, vendedor_id::float8 vendedor_id, url, maximo, estado from vendedor_referente where id = $1 and token = $2::uuid", [id, token]);
  if (!f) throw new ErrorErp("Pedido desconocido.");
  if (f.estado !== "pendiente") return 0;
  const tope = f.maximo * USD_POR_PUBLICACION * 1.2;
  const queda = await quedaParaGastar(f.organizacion_id);
  if (queda < tope) {
    await consulta("update vendedor_referente set estado = 'error', error = $2, actualizado_ts = now() where id = $1",
      [id, `Costaría hasta US$ ${tope.toFixed(2)} y en el mes quedan US$ ${queda.toFixed(2)} del tope del seguimiento.`]);
    return 0;
  }
  await consulta("update vendedor_referente set estado = 'corriendo', actualizado_ts = now() where id = $1", [id]);
  const c = await correrConEntrada(ACTOR_ML, {
    mode: "seller", country: "AR", sellerUrls: [f.url ?? listadoDe(f.vendedor_id!)], maxItems: f.maximo, maxItemsPerSeller: f.maximo, includeSellerProfile: false,
  }, { max: f.maximo, esperaSeg: 200, topeUsd: tope }); // 200 s: con lo que tarda guardar, entra en los 5 minutos de la ruta (lo leído hasta ahí se guarda igual)
  const costo = Math.max(c.costoUsd ?? 0, c.items.length * USD_POR_PUBLICACION);
  await consulta("insert into seguimiento_corrida (organizacion_id, tipo, run_id, costo_usd, publicaciones, error) values ($1, 'busqueda', $2, $3, $4, $5)",
    [f.organizacion_id, c.runId ?? null, costo, c.items.length, c.error ?? null]);
  // El número del vendedor, si vino en los datos (para un link de tienda) y no lo teníamos.
  const vid = f.vendedor_id ?? (Number((c.items[0] as { sellerId?: unknown } | undefined)?.sellerId) || null);
  await consulta(`update vendedor_referente set estado = $2, items = $3::jsonb, costo_usd = $4, error = $5, vendedor_id = coalesce(vendedor_id, $6), actualizado_ts = now() where id = $1`,
    [id, c.items.length ? "terminada" : "error", JSON.stringify(c.items), costo, c.error ?? (c.items.length ? null : c.mensaje ?? "No trajo publicaciones."), vid]);
  if (c.items.length) { await armarCruce(f.organizacion_id); await pedirIa(f.organizacion_id); } // la IA agrupa y compara lo nuevo
  return c.items.length;
}
