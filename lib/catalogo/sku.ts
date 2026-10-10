// SKU sugerido y SKU que no se repite (pedido de Fer, 10/10).
// El SKU de la casa es "SKU" + un número de 5 o 6 cifras (SKU03542). Al crear
// o duplicar un producto se propone el que sigue al más alto que exista
// (contando los de las variaciones, y los que siguen con un sufijo como
// "SKU03542-BC"); el usuario lo puede cambiar. Ningún SKU se repite, sin
// importar mayúsculas: ni entre productos, ni entre variaciones de otros.

import { una, ErrorErp, type Consultor } from "@/lib/erp/base";

/** "SKU" + el número con 5 cifras (6 si ya pasó de 99999). Pura: se prueba sin base. */
export function armarSku(n: number): string {
  return `SKU${String(n).padStart(n > 99999 ? 6 : 5, "0")}`;
}

/** El número del SKU de la casa (SKU03542 → 3542; SKU03542-BC → 3542), o null si no tiene ese formato. */
export function numeroDeSku(sku: string): number | null {
  const m = /^SKU(\d{5,6})(?!\d)/i.exec(sku.trim());
  return m ? Number(m[1]) : null;
}

const MAXIMO = `
  select greatest(
    (select max(substring(sku_base from '^[Ss][Kk][Uu]([0-9]{5,6})(?![0-9])')::int) from producto where organizacion_id = $1),
    (select max(substring(sku from '^[Ss][Kk][Uu]([0-9]{5,6})(?![0-9])')::int) from variacion where organizacion_id = $1)) n`;

/** El SKU que sigue al más alto de la organización. */
export async function siguienteSku(org: string, c?: Consultor): Promise<string> {
  const r = c ? (await c.query<{ n: number | null }>(MAXIMO, [org])).rows[0] : await una<{ n: number | null }>(MAXIMO, [org]);
  return armarSku((r?.n ?? 0) + 1);
}

/** ¿Ese SKU ya lo usa otro producto u otra variación? `producto`: el producto que lo
 *  lleva (su variación default se llama igual y no cuenta); `variacion`: la variación que lo lleva. */
export async function skuOcupado(org: string, sku: string, o: { producto?: number; variacion?: number } = {}): Promise<boolean> {
  const r = await una(`
    select 1 from producto where organizacion_id = $1 and lower(sku_base) = lower($2) and id <> coalesce($3::bigint, -1)
       and id is distinct from (select producto_id from variacion where id = $4::bigint and es_default)
    union all
    select 1 from variacion where organizacion_id = $1 and lower(sku) = lower($2)
       and producto_id <> coalesce($3::bigint, -1) and id <> coalesce($4::bigint, -1)
    limit 1`, [org, sku.trim(), o.producto ?? null, o.variacion ?? null]);
  return !!r;
}

export async function exigirSkuLibre(org: string, sku: string, o: { producto?: number; variacion?: number } = {}): Promise<void> {
  if (await skuOcupado(org, sku, o)) throw new ErrorErp(`El SKU ${sku} ya existe: elegí otro.`);
}
