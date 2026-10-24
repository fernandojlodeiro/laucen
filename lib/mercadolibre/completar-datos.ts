// Completar en la madre los datos que ML exige para crear la copia agrupada (Fer, 24/10: «dale con la 1»).
// Las altas agrupadas que ML no aceptó quedaron en ml_agrupado_auto.rechazadas con su motivo («The attributes
// [MODEL] are required…», «seller_package_*…»). Para cada una se toma la madre actual del producto en la cuenta
// (madreDe) y se buscan los datos que le faltan en Laucen, en este orden:
//   1. las características de ML guardadas en el producto (producto.atributos_ml);
//   2. la misma característica en otra publicación del mismo producto (cualquier cuenta);
//   3. las columnas del producto: modelo, código de barras, peso y medidas del paquete.
// Arma un lote con botón (PUT /items/{madre} con sólo lo que falta). Lo que no tiene dato queda listado.
// Las que se completan salen de rechazadas y el agrupado vuelve a correr sólo para esos SKU
// (ml_agrupado_auto.solo_skus), recién cuando el lote salió (espera_lote).

import { consulta, una } from "@/lib/erp/base";
import { encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";
import { madreDe } from "@/lib/mercadolibre/agrupar";

const PAQUETE = ["SELLER_PACKAGE_HEIGHT", "SELLER_PACKAGE_WIDTH", "SELLER_PACKAGE_LENGTH", "SELLER_PACKAGE_WEIGHT"];

/** Las características que pide el motivo del rechazo. */
export function atributosFaltantes(motivo: string): string[] {
  if (/seller[._]package/i.test(motivo)) return PAQUETE;
  const m = motivo.match(/attributes \[([^\]]+)\]/i);
  return m ? m[1].split(",").map((x) => x.trim()).filter(Boolean) : [];
}

type Valor = { id: string; value_id?: string; value_name: string };

async function valorDe(org: string, sku: string, attr: string): Promise<Valor | null> {
  const r = await una<{ value_id: string | null; value_name: string | null }>(`
    with v as (select v.id, v.codigo_barras cb_v, p.* from variacion v join producto p on p.id = v.producto_id
                where v.organizacion_id = $1 and lower(v.sku) = lower($2) limit 1)
    select * from (
      select null value_id, a ->> 'value_name' value_name, 1 o from v, jsonb_array_elements(coalesce(v.atributos_ml, '[]')) a
       where a ->> 'id' = $3 and coalesce(a ->> 'value_name', '') <> ''
      union all
      select nullif(a ->> 'value_id', '-1'), a ->> 'value_name', 2 from v
        join publicacion p on p.variacion_id = v.id join meli_item m on m.canal_id = p.canal_id and m.item_id = p.id_externo,
        jsonb_array_elements(coalesce(m.datos_externos -> 'ml' -> 'attributes', '[]')) a
       where a ->> 'id' = $3 and coalesce(a ->> 'value_name', '') <> '' and coalesce(a ->> 'value_id', '') <> '-1'
      union all
      select null, case $3 when 'GTIN' then coalesce(v.cb_v, v.codigo_barras) when 'MODEL' then v.modelo
                          when 'SELLER_PACKAGE_WEIGHT' then v.peso_g || ' g' when 'SELLER_PACKAGE_HEIGHT' then v.alto_cm || ' cm'
                          when 'SELLER_PACKAGE_WIDTH' then v.ancho_cm || ' cm' when 'SELLER_PACKAGE_LENGTH' then v.largo_cm || ' cm' end, 3 from v
    ) x where coalesce(value_name, '') <> '' order by o, (value_id is not null) desc limit 1`, [org, sku, attr]);
  return r?.value_name ? { id: attr, ...(r.value_id ? { value_id: r.value_id } : {}), value_name: r.value_name } : null;
}

export type ResultadoCompletar = { loteId: number | null; madres: number; skus: string[]; sinDato: string[] };

export async function prepararCompletarDatos(org: string, canal: number, usuarioId: string | null): Promise<ResultadoCompletar> {
  const fila = await una<{ rechazadas: Record<string, string> }>(
    "select rechazadas from ml_agrupado_auto where organizacion_id = $1 and canal_id = $2", [org, canal]);
  const nombre = (await una<{ nombre: string }>("select nombre from canal where id = $1", [canal]))?.nombre ?? "la cuenta";
  const res: ResultadoCompletar = { loteId: null, madres: 0, skus: [], sinDato: [] };
  // Por SKU, todas las características que faltan (de todos sus planes rechazados).
  const porSku = new Map<string, { claves: string[]; attrs: Set<string> }>();
  for (const [k, motivo] of Object.entries(fila?.rechazadas ?? {})) {
    if (!k.startsWith("agrupar:")) continue;
    const attrs = atributosFaltantes(motivo);
    if (!attrs.length) { res.sinDato.push(`${k.split(":")[1]}: ${motivo.slice(0, 120)}`); continue; }
    const sku = k.split(":")[1];
    const x = porSku.get(sku) ?? { claves: [], attrs: new Set<string>() };
    x.claves.push(k); attrs.forEach((a) => x.attrs.add(a)); porSku.set(sku, x);
  }
  const cambios: CambioMl[] = [];
  const claves: string[] = [];
  for (const [sku, x] of porSku) {
    const madre = await madreDe(org, canal, sku);
    if (!madre) { res.sinDato.push(`${sku}: no tiene publicación base en la cuenta`); continue; }
    const tiene = new Set((madre.ml.attributes ?? []).filter((a) => a.value_name || (a.value_id && a.value_id !== "-1")).map((a) => a.id));
    const agregar: Valor[] = [];
    const faltan: string[] = [];
    for (const attr of x.attrs) {
      if (tiene.has(attr)) continue;
      const v = await valorDe(org, sku, attr);
      if (v) agregar.push(v); else faltan.push(attr);
    }
    if (faltan.length) { res.sinDato.push(`${sku}: Laucen no tiene ${faltan.join(", ")}`); continue; }
    claves.push(...x.claves);
    res.skus.push(sku);
    if (!agregar.length) continue; // ya los tiene: sólo se vuelve a probar
    res.madres++;
    cambios.push({
      canalId: canal, itemId: madre.itemId, tipo: "atributos", antes: { estado: `le faltan ${agregar.map((a) => a.id).join(", ")}` },
      payload: {
        descripcion: `Completar en ${madre.itemId} (${sku}, base del agrupado en ${nombre}): ${agregar.map((a) => `${a.id} = ${a.value_name}`).join(" · ")}`,
        cuerpo: { attributes: agregar },
      },
    });
  }
  if (cambios.length) res.loteId = await encolarLoteConBoton(org, canal, cambios, `Completar datos de ${res.madres} publicaciones base para agrupar en ${nombre}`, usuarioId);
  if (res.skus.length) {
    // Las completadas salen de rechazadas y el agrupado vuelve a correr sólo para ellas, cuando salga el lote.
    await consulta(`
      update ml_agrupado_auto set rechazadas = rechazadas - $3::text[], solo_skus = $4::text[], espera_lote = $5,
             estado = 'andando', terminado_ts = null, ultimo_error = null, proxima_ts = now()
       where organizacion_id = $1 and canal_id = $2`, [org, canal, claves, res.skus, res.loteId]);
  }
  return res;
}
