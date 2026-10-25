// Completar en la madre los datos que ML exige para crear la copia agrupada (Fer, 24/10: «dale con la 1»).
// Las altas agrupadas que ML no aceptó quedaron en ml_agrupado_auto.rechazadas con su motivo («The attributes
// [MODEL] are required…», «seller_package_*…»). Para cada una se toma la madre actual del producto en la cuenta
// (madreDe) y se buscan los datos que le faltan en Laucen, en este orden:
//   1. las características de ML guardadas en el producto (producto.atributos_ml);
//   2. la misma característica en otra publicación del mismo producto (cualquier cuenta);
//   3. las columnas del producto: modelo, código de barras, peso y medidas del paquete.
// Arma un lote con botón (PUT /items/{madre} con sólo lo que falta). Lo que no tiene dato queda listado.
// Las que se completan salen de rechazadas y el agrupado vuelve a correr sólo para esos SKU
// (ml_agrupado_auto.solo_skus), recién cuando no queda ningún lote de completar de la cuenta sin salir.

import { consulta, una } from "@/lib/erp/base";
import { encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";
import { gruposSeparados, type ItemMadre } from "@/lib/mercadolibre/agrupar";

export const SIN_GTIN: Valor = { id: "EMPTY_GTIN_REASON", value_id: "17055160", value_name: "El producto no tiene código registrado" };
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
    with v as (select v.id var_id, v.codigo_barras cb_v, p.atributos_ml, p.codigo_barras, p.modelo, p.peso_g, p.alto_cm, p.ancho_cm, p.largo_cm
                 from variacion v join producto p on p.id = v.producto_id
                where v.organizacion_id = $1 and lower(v.sku) = lower($2) limit 1)
    select * from (
      select null::text value_id, a ->> 'value_name' value_name, 1 o from v, jsonb_array_elements(coalesce(v.atributos_ml, '[]')) a
       where a ->> 'id' = $3::text and coalesce(a ->> 'value_name', '') <> ''
      union all
      select nullif(a ->> 'value_id', '-1'), a ->> 'value_name', 2 from v
        join publicacion pu on pu.variacion_id = v.var_id join meli_item m on m.canal_id = pu.canal_id and m.item_id = pu.id_externo,
        jsonb_array_elements(coalesce(m.datos_externos -> 'ml' -> 'attributes', '[]')) a
       where a ->> 'id' = $3 and coalesce(a ->> 'value_name', '') <> '' and coalesce(a ->> 'value_id', '') <> '-1'
      union all
      select null, case $3::text when 'GTIN' then coalesce(v.cb_v, v.codigo_barras) when 'MODEL' then v.modelo
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
  const grupos = new Map((await gruposSeparados(org, canal)).map((g) => [g.sku, g]));
  for (const [sku, x] of porSku) {
    // La misma madre que va a copiar el agrupado (gruposSeparados): con dos productos de ML empatados, madreDe podía
    // elegir el otro y el dato quedaba en una publicación que no se copia (25/10).
    const g = grupos.get(sku);
    const ml = g ? (await una<{ ml: ItemMadre }>("select datos_externos -> 'ml' ml from meli_item where canal_id = $1 and item_id = $2 and variation_id = ''", [canal, g.madre]))?.ml : null;
    if (!g || !ml) { res.sinDato.push(`${sku}: ya no tiene planes separados o no tiene publicación base en la cuenta`); continue; }
    const madre = { itemId: g.madre, ml };
    const tiene = new Set((madre.ml.attributes ?? []).filter((a) => a.value_name || (a.value_id && a.value_id !== "-1")).map((a) => a.id));
    const agregar: Valor[] = [];
    const faltan: string[] = [];
    for (const attr of x.attrs) {
      if (tiene.has(attr)) continue;
      const v = await valorDe(org, sku, attr);
      if (v) agregar.push(v);
      // Sin código de barras en ningún lado: ML lo pide «condicional» cuando la marca no es propia (ej. «OEM»), y se
      // cumple diciendo por qué no tiene (EMPTY_GTIN_REASON, valor de ML «El producto no tiene código registrado»).
      else if (attr === "GTIN") { if (!tiene.has("EMPTY_GTIN_REASON")) agregar.push(SIN_GTIN); }
      else faltan.push(attr);
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
      update ml_agrupado_auto set rechazadas = rechazadas - $3::text[],
             -- Si ya había una vuelta pendiente para otros SKU (otro lote de completar), se suman.
             solo_skus = (select array_agg(distinct x) from unnest(coalesce(solo_skus, '{}') || $4::text[]) x), espera_lote = coalesce($5, espera_lote),
             estado = 'andando', terminado_ts = null, ultimo_error = null, proxima_ts = now()
       where organizacion_id = $1 and canal_id = $2`, [org, canal, claves, res.skus, res.loteId]);
  }
  return res;
}
