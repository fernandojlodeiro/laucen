// Productos que Mercado Libre prohibió en una cuenta (Fer, 29/10, bitácora #986). Una publicación que ML deja
// «forbidden» (prohibida o dada de baja: categoría incorrecta, duplicada, Decodificadores, propiedad intelectual…)
// anota su SKU en esa cuenta en meli_sku_prohibido, y Laucen no lo vuelve a dar de alta ahí por ningún camino:
//   · la cola descarta el alta antes de mandarla (altaProhibida), venga de donde venga;
//   · publicar en todas las cuentas, las altas automáticas, los planes faltantes y el agrupado ni lo proponen.
// Antes (11/10) una prohibida contaba como que no estaba y se volvía a crear: cada alta sumaba otra infracción.
// La anotación queda aunque la publicación se elimine en ML. Un alta que Fer prepara a propósito para probar
// (payload.permitirProhibido) pasa igual: sale con su clic.

import { consulta, una } from "@/lib/erp/base";
import type { CuentaMl } from "@/lib/mercadolibre/api";

/** El SKU sin el «DE-» que tienen adelante las cuentas DEIROLAB y TIENDAVIRTUAL S. */
export const skuNormal = (sku: string) => sku.trim().replace(/^DE-/i, "");

export const MOTIVO_PROHIBIDO = "Mercado Libre prohibió este producto en esta cuenta: no se vuelve a publicar ahí";

/** Anota el SKU de una publicación prohibida (el de ML o, si no tiene, el del producto de Laucen al que está vinculada)
 *  y, si es la primera vez que Laucen la ve prohibida, la registra para el aviso (meli_prohibicion) y lee su motivo. */
export async function anotarProhibido(cuenta: CuentaMl, itemId: string): Promise<void> {
  const nueva = await una(`
    insert into meli_prohibicion (organizacion_id, canal_id, item_id, sku, titulo)
    select m.organizacion_id, m.canal_id, m.item_id, m.sku, m.titulo from meli_item m where m.canal_id = $1 and m.item_id = $2 limit 1
    on conflict (canal_id, item_id) do nothing returning item_id`, [cuenta.canalId, itemId]);
  // El motivo, para que el aviso diga por qué (sólo lectura; si ML no contesta, lo lee después el proceso de fondo).
  if (nueva) await (await import("@/lib/mercadolibre/moderaciones")).leerMotivo(cuenta, itemId).catch(() => {});
  await consulta(`
    insert into meli_sku_prohibido (organizacion_id, canal_id, sku, item_id)
    select distinct $1, $2::bigint, regexp_replace(coalesce(nullif(m.sku, ''), v.sku), '^DE-', '', 'i'), m.item_id
      from meli_item m
      left join publicacion p on p.canal_id = m.canal_id and p.id_externo = m.item_id
      left join variacion v on v.id = p.variacion_id
     where m.canal_id = $2 and m.item_id = $3 and coalesce(nullif(m.sku, ''), v.sku) is not null
    on conflict (canal_id, sku) do nothing`, [cuenta.organizacionId, cuenta.canalId, itemId]);
}

/** Los SKU (sin «DE-») que ML prohibió en la cuenta. */
export async function skusProhibidos(org: string, canal: number): Promise<Set<string>> {
  return new Set((await consulta<{ sku: string }>("select sku from meli_sku_prohibido where organizacion_id = $1 and canal_id = $2", [org, canal])).map((x) => x.sku));
}

/** Las cuentas en que ML prohibió el SKU. */
export async function cuentasConProhibido(org: string, sku: string): Promise<Set<number>> {
  return new Set((await consulta<{ canal_id: number }>("select canal_id::int from meli_sku_prohibido where organizacion_id = $1 and sku = $2", [org, skuNormal(sku)])).map((x) => x.canal_id));
}

type Alta = { organizacion_id: string; canal_id: string | number; item_id: string; payload: Record<string, unknown> | null; efecto: { vincular?: { variacionId: number } } | null };

/** Los SKU de un alta de la cola: el de su clave (esquema:SKU:plan, agrupar:SKU:plan, nueva:SKU), el del producto al
 *  que se vincula y el que lleva el cuerpo. Pura. */
export function skusDeAlta(f: Pick<Alta, "item_id" | "payload">): string[] {
  const skus = new Set<string>();
  const clave = /^(esquema|agrupar):(.+):[^:]+$/.exec(f.item_id) ?? /^(nueva):(.+)$/.exec(f.item_id);
  if (clave) skus.add(clave[2]);
  const pedidos = (f.payload as { pedidos?: { metodo?: string; ruta?: string; cuerpo?: unknown }[] } | null)?.pedidos ?? [];
  for (const p of pedidos) {
    if (p.metodo !== "POST" || p.ruta !== "/items") continue;
    const c = p.cuerpo as { seller_custom_field?: string | null; attributes?: { id: string; value_name?: string | null }[] } | null;
    if (c?.seller_custom_field) skus.add(c.seller_custom_field);
    const a = c?.attributes?.find((x) => x.id === "SELLER_SKU")?.value_name;
    if (a) skus.add(a);
  }
  return [...skus].map(skuNormal).filter(Boolean);
}

/** ¿El alta es de un producto que ML prohibió en esa cuenta? Devuelve el SKU, o null si puede salir. */
export async function altaProhibida(f: Alta): Promise<string | null> {
  if ((f.payload as { permitirProhibido?: boolean } | null)?.permitirProhibido) return null;
  const skus = skusDeAlta(f);
  if (f.efecto?.vincular?.variacionId) {
    const v = await una<{ sku: string }>("select sku from variacion where id = $1", [f.efecto.vincular.variacionId]);
    if (v) skus.push(skuNormal(v.sku));
  }
  if (!skus.length) return null;
  const x = await una<{ sku: string }>("select sku from meli_sku_prohibido where canal_id = $1 and sku = any($2::text[]) limit 1", [Number(f.canal_id), skus]);
  return x?.sku ?? null;
}
