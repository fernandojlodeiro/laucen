// Los precios web ya calculados (db/precio_web.sql): el listado de la tienda y los catálogos de publicidad
// los leen de la tabla precio_web en vez de calcular el precio de cada producto en cada visita.
// La ficha, el carrito y el cobro no: calculan en vivo con precio_de.

import { una } from "@/lib/erp/base";

/** ¿La tabla está lista para este canal? Recién después de llenarse entera y pasar un control completo
 *  contra la cuenta en vivo (precio_web_control). Hasta entonces se calcula en vivo como siempre. */
export async function precioWebListo(canalId: number, listaId: number): Promise<boolean> {
  const r = await una<{ ok: boolean }>(`
    select exists (select 1 from precio_web where canal_id = $1 and lista_id = $2)
       and exists (select 1 from precio_web_control where tipo = 'completo') ok`, [canalId, listaId]).catch(() => null);
  return !!r?.ok;
}
