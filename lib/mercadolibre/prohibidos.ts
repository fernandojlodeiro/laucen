// Productos que Mercado Libre prohibió en una cuenta (Fer, 29/10, bitácora #986). Una publicación que ML deja
// «forbidden» (prohibida o dada de baja: categoría incorrecta, duplicada, Decodificadores, propiedad intelectual…)
// anota su SKU en esa cuenta en meli_sku_prohibido, y Laucen no lo vuelve a dar de alta ahí por ningún camino:
//   · la cola descarta el alta antes de mandarla (altaProhibida), venga de donde venga;
//   · publicar en todas las cuentas, las altas automáticas, los planes faltantes y el agrupado ni lo proponen.
// Antes (11/10) una prohibida contaba como que no estaba y se volvía a crear: cada alta sumaba otra infracción.
// La anotación queda aunque la publicación se elimine en ML. Un alta que Fer prepara a propósito para probar
// (payload.permitirProhibido) pasa igual: sale con su clic.
//
// «Jamás publicar en Mercado Libre» (producto.nunca_ml, Fer 29/10): lo mismo para TODAS las cuentas y sin excepción,
// y además la cola descarta cualquier reactivación (también «Sacar la pausa»). Al prenderla se pausan sus activas.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import type { CuentaMl } from "@/lib/mercadolibre/api";

/** El SKU sin el «DE-» que tienen adelante las cuentas DEIROLAB y TIENDAVIRTUAL S. */
export const skuNormal = (sku: string) => sku.trim().replace(/^DE-/i, "");

export const MOTIVO_PROHIBIDO = "Mercado Libre prohibió este producto en esta cuenta: no se vuelve a publicar ahí";
export const MOTIVO_NUNCA_ML = "El producto está marcado «Jamás publicar en Mercado Libre»";

/** SQL: los SKU (sin «DE-») de los productos marcados «Jamás publicar en Mercado Libre» de la organización `$org`. */
const skusNuncaMl = (org: string) => `select regexp_replace(v.sku, '^DE-', '', 'i') sku from variacion v join producto p on p.id = v.producto_id
   where p.organizacion_id = ${org} and p.nunca_ml`;

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

/** Los SKU (sin «DE-») que no se dan de alta en la cuenta: los que ML prohibió ahí y los «Jamás publicar en Mercado Libre». */
export async function skusProhibidos(org: string, canal: number): Promise<Set<string>> {
  return new Set((await consulta<{ sku: string }>(
    `select sku from meli_sku_prohibido where organizacion_id = $1 and canal_id = $2 union ${skusNuncaMl("$1")}`, [org, canal])).map((x) => x.sku));
}

/** Las cuentas en que el SKU no se da de alta, con el motivo: las que ML lo prohibió o, si es «Jamás publicar en
 *  Mercado Libre», todas. */
export async function cuentasConProhibido(org: string, sku: string): Promise<Map<number, string>> {
  const filas = await consulta<{ canal_id: number; nunca: boolean }>(`
    select x.canal_id::int, false nunca from meli_sku_prohibido x where x.organizacion_id = $1 and x.sku = $2
    union all
    select c.id::int, true from canal c where c.organizacion_id = $1 and c.tipo = 'mercadolibre' and exists (${skusNuncaMl("$1")} and regexp_replace(v.sku, '^DE-', '', 'i') = $2)`,
    [org, skuNormal(sku)]);
  const res = new Map<number, string>();
  for (const f of filas) if (!res.has(f.canal_id) || f.nunca) res.set(f.canal_id, f.nunca ? MOTIVO_NUNCA_ML : MOTIVO_PROHIBIDO);
  return res;
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

/** ¿El alta no puede salir? Devuelve el motivo (ML prohibió el producto en esa cuenta, o es «Jamás publicar en
 *  Mercado Libre»), o null si puede salir. */
export async function altaProhibida(f: Alta): Promise<string | null> {
  const skus = skusDeAlta(f);
  const origen = (f.payload as { origen?: { canal?: number; item_id?: string } } | null)?.origen;
  const v = f.efecto?.vincular?.variacionId
    ? await una<{ sku: string }>("select sku from variacion where id = $1", [f.efecto.vincular.variacionId])
    : origen?.item_id ? await una<{ sku: string }>(`select v.sku from publicacion pu join variacion v on v.id = pu.variacion_id
                                                     where pu.canal_id = $1 and pu.id_externo = $2 limit 1`, [origen.canal ?? Number(f.canal_id), origen.item_id]) : null;
  if (v) skus.push(skuNormal(v.sku));
  if (!skus.length) return null;
  if (await una(`select 1 from (${skusNuncaMl("$1")}) n where n.sku = any($2::text[]) limit 1`, [f.organizacion_id, skus])) return MOTIVO_NUNCA_ML;
  if ((f.payload as { permitirProhibido?: boolean } | null)?.permitirProhibido) return null;
  return await una("select 1 from meli_sku_prohibido where canal_id = $1 and sku = any($2::text[]) limit 1", [Number(f.canal_id), skus]) ? MOTIVO_PROHIBIDO : null;
}

/** ¿Es un cambio que reactiva (o le devuelve stock vendible a) una publicación de un producto «Jamás publicar en
 *  Mercado Libre»? Esos se descartan en la cola, vengan de donde vengan. */
export async function reactivaNuncaMl(f: Alta & { tipo: string; variation_id: string }): Promise<boolean> {
  if (f.tipo !== "stock" && f.tipo !== "estado") return false;
  const pl = (f.payload ?? {}) as { estado?: string; cantidad?: number };
  if (pl.estado !== "active" && !(f.variation_id && Number(pl.cantidad) > 0)) return false;
  return !!(await una(`
    select 1 from publicacion pu join variacion v on v.id = pu.variacion_id join producto p on p.id = v.producto_id
     where pu.canal_id = $1 and pu.id_externo = $2 and p.nunca_ml
    union all
    select 1 from meli_item m join variacion v on v.organizacion_id = m.organizacion_id and regexp_replace(v.sku, '^DE-', '', 'i') = regexp_replace(m.sku, '^DE-', '', 'i')
      join producto p on p.id = v.producto_id
     where m.canal_id = $1 and m.item_id = $2 and p.nunca_ml limit 1`, [Number(f.canal_id), f.item_id]));
}

/** Prende o apaga «Jamás publicar en Mercado Libre». Al prenderla, cada publicación de ML del producto queda pausada a
 *  mano (la automatización de stock no la reactiva) y las activas se pausan ya (la pausa sale por la cola: el
 *  interruptor es el clic). Devuelve cuántas pausas salieron. Al apagarla no se reactiva nada: se hace a mano. */
export async function marcarNuncaMl(org: string, productoId: number, valor: boolean, usuario: string | null): Promise<number> {
  const r = await consulta("update producto set nunca_ml = $3, actualizado_ts = now() where id = $1 and organizacion_id = $2 returning id", [productoId, org, valor]);
  if (!r.length) throw new ErrorErp("Ese producto no existe.");
  if (!valor) return 0;
  const pubs = await consulta<{ id: number; canal_id: number; id_externo: string; variacion_externa: string | null; estado: string; activa_ml: boolean }>(`
    update publicacion pu set pausada_manual = true from variacion v, canal c
     where v.id = pu.variacion_id and c.id = pu.canal_id and v.producto_id = $2 and pu.organizacion_id = $1 and c.tipo = 'mercadolibre' and pu.id_externo is not null
    returning pu.id::int, pu.canal_id::int, pu.id_externo, pu.variacion_externa, pu.estado,
      exists (select 1 from meli_item m where m.canal_id = pu.canal_id and m.item_id = pu.id_externo and m.estado = 'active') activa_ml`, [org, productoId]);
  const activas = pubs.filter((p) => p.estado === "activa" || p.activa_ml);
  if (activas.length) {
    const { encolar, PRIORIDAD } = await import("@/lib/mercadolibre/cola");
    await encolar(org, activas.map((p) => ({
      canalId: p.canal_id, itemId: p.id_externo, variationId: p.variacion_externa, publicacionId: p.id, tipo: "stock" as const, prioridad: PRIORIDAD.pausa,
      antes: { estado: p.estado },
      // Una variación no se pausa sola en ML: se le informa 0 (igual que la pausa por stock).
      payload: p.variacion_externa ? { cantidad: 0 } : { estado: "paused" },
      efecto: { publicacion: { id: p.id, estado: "pausada" as const, pausada_por_stock: false, pausada_manual: true, ...(p.variacion_externa ? { cantidad_publicada: 0 } : {}) } },
    })), { origen: "boton", usuarioId: usuario });
  }
  return activas.length;
}
