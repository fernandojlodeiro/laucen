// Cambio de SKU en Mercado Libre (pedido de Fer, 10/10: "que todo quede igual
// en todos lados"). Cuando cambia el SKU de un producto o de una variación en
// Laucen, sus publicaciones de ML quedan con el SKU viejo (atributo SELLER_SKU).
// Esto PREPARA el cambio en un lote con botón (AGENTS.md: nada sale a ML sin el
// clic de Fer); al mandarlo, la cola lo cambia en cada publicación.

import { consulta } from "@/lib/erp/base";
import { encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";

/** Prepara el lote para que las publicaciones de esas variaciones lleven su SKU de hoy en Laucen.
 *  Devuelve el id del lote, o null si ninguna publicación de ML tiene un SKU distinto. */
export async function prepararSkuMl(org: string, variaciones: number[], usuario: string | null, motivo: string): Promise<number | null> {
  if (!variaciones.length) return null;
  // Cada fila de ML (publicación y variación de ML) vinculada a esas variaciones, con el SKU que tiene que llevar.
  const filas = await consulta<{ canal_id: number; item_id: string; variation_id: string; publicacion_id: number; sku: string | null; nuevo: string }>(`
    select mi.canal_id::int, mi.item_id, mi.variation_id, mi.publicacion_id::int, mi.sku, v.sku nuevo
      from meli_item mi join publicacion p on p.id = mi.publicacion_id join variacion v on v.id = p.variacion_id
     where mi.organizacion_id = $1 and v.id = any($2::bigint[]) and mi.sku is distinct from v.sku`, [org, variaciones]);
  if (!filas.length) return null;

  // Las otras variaciones de ML de cada publicación (se mandan por su id, sin tocarlas: así ML no las borra).
  const items = [...new Set(filas.map((f) => `${f.canal_id}|${f.item_id}`))];
  const todas = await consulta<{ canal_id: number; item_id: string; variation_id: string }>(`
    select canal_id::int, item_id, variation_id from meli_item
     where organizacion_id = $1 and (canal_id::text || '|' || item_id) = any($2::text[]) and variation_id <> ''`, [org, items]);

  const cambios: CambioMl[] = items.map((k) => {
    const [canal, item] = k.split("|");
    const suyas = filas.filter((f) => `${f.canal_id}|${f.item_id}` === k);
    const atributo = (sku: string) => [{ id: "SELLER_SKU", value_name: sku }];
    const conVariaciones = suyas.some((f) => f.variation_id);
    const cuerpo = conVariaciones
      ? {
        variations: todas.filter((t) => `${t.canal_id}|${t.item_id}` === k).map((t) => {
          const f = suyas.find((x) => x.variation_id === t.variation_id);
          return f ? { id: Number(t.variation_id), attributes: atributo(f.nuevo) } : { id: Number(t.variation_id) };
        }),
      }
      : { attributes: atributo(suyas[0].nuevo) };
    return {
      canalId: Number(canal), itemId: item, publicacionId: suyas[0].publicacion_id, tipo: "atributos",
      antes: { sku: suyas.map((f) => f.sku ?? "(sin SKU)").join(", ") },
      payload: { cuerpo, descripcion: `SKU ${suyas.map((f) => `${f.sku ?? "(sin SKU)"} → ${f.nuevo}`).join(", ")}` },
    };
  });
  const canales = [...new Set(cambios.map((c) => c.canalId))];
  return encolarLoteConBoton(org, canales.length === 1 ? canales[0] : null, cambios, `Cambiar el SKU en Mercado Libre: ${motivo}`, usuario);
}
