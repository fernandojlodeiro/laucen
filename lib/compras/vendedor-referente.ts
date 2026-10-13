// Vendedores referentes (Fer, 13/10): el listado entero de un vendedor de Mercado Libre (Apify, el mismo actor del
// seguimiento), para buscar productos que no tenemos y pedirle cotización al proveedor. Lo pedido queda en la tabla
// vendedor_referente (db/compras.sql) y lo corre /api/vendedor-referente con el token de la fila. El gasto cuenta en el
// tope del mes del seguimiento.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { correrConEntrada } from "@/lib/apify";
import { quedaParaGastar } from "@/lib/seguimiento";

const ACTOR = "scrapesage~mercadolibre-scraper";
const POR_RESULTADO = { listado: 0.002, detalle: 0.008 };

/** El listado de un vendedor en Mercado Libre (todas sus publicaciones activas). */
export const listadoDe = (vendedorId: number) => `https://listado.mercadolibre.com.ar/_CustId_${vendedorId}`;

/** Corre una fila pendiente: trae el listado y lo guarda tal cual vino. */
export async function correrVendedor(id: number, token: string): Promise<number> {
  const f = await una<{ organizacion_id: string; vendedor_id: number; detalle: boolean; maximo: number; estado: string }>(
    "select organizacion_id, vendedor_id::float8 vendedor_id, detalle, maximo, estado from vendedor_referente where id = $1 and token = $2::uuid", [id, token]);
  if (!f) throw new ErrorErp("Pedido desconocido.");
  if (f.estado !== "pendiente") return 0;
  const tope = f.maximo * (f.detalle ? POR_RESULTADO.detalle : POR_RESULTADO.listado) * 1.2;
  const queda = await quedaParaGastar(f.organizacion_id);
  if (queda < tope) {
    await consulta("update vendedor_referente set estado = 'error', error = $2, actualizado_ts = now() where id = $1",
      [id, `Costaría hasta US$ ${tope.toFixed(2)} y en el mes quedan US$ ${queda.toFixed(2)} del tope del seguimiento.`]);
    return 0;
  }
  await consulta("update vendedor_referente set estado = 'corriendo', actualizado_ts = now() where id = $1", [id]);
  const c = await correrConEntrada(ACTOR, {
    site: "MLA", startUrls: [{ url: listadoDe(f.vendedor_id) }], maxItems: f.maximo, maxPagesPerQuery: Math.ceil(f.maximo / 48), includeProductDetails: f.detalle,
  }, { max: f.maximo, esperaSeg: 200, topeUsd: tope }); // 200 s: con lo que tarda guardar, entra en los 5 minutos de la ruta (lo leído hasta ahí se guarda igual)
  const costo = Math.max(c.costoUsd ?? 0, c.items.length * (f.detalle ? POR_RESULTADO.detalle : POR_RESULTADO.listado));
  await consulta("insert into seguimiento_corrida (organizacion_id, tipo, run_id, costo_usd, publicaciones, error) values ($1, 'busqueda', $2, $3, $4, $5)",
    [f.organizacion_id, c.runId ?? null, costo, c.items.length, c.error ?? null]);
  await consulta(`update vendedor_referente set estado = $2, items = $3::jsonb, costo_usd = $4, error = $5, actualizado_ts = now() where id = $1`,
    [id, c.items.length ? "terminada" : "error", JSON.stringify(c.items), costo, c.error ?? (c.items.length ? null : "No trajo publicaciones.")]);
  return c.items.length;
}
