// Duplicar un producto (Fer, 5/10): "agarro una notebook, la duplico y el
// sistema me la crea dentro de Laucen totalmente igual, para que yo vaya
// cambiando sólo lo que cambió". La copia queda PAUSADA (no sale a ningún lado
// hasta que Fer la active) con SKU nuevo, y trae: datos, variaciones con sus
// atributos, fotos, precios de hoy, cucardas, atributos, kit y costo de
// importación.
//
// NO trae lo que es de la cosa física o de cada canal: stock, código de barras,
// costos reales (último / promedio), publicaciones (web y ML) ni reglas de
// precio de ML. Las fotos se copian por dirección (la copia no es dueña del
// archivo: si se borra la foto de la copia, el original no se rompe).

import { una, enTransaccion, ErrorErp, type Consultor } from "@/lib/erp/base";

/** Los SKU de la copia: el base lleva "-COPIA" (o "-COPIA2", "-COPIA3"…, el
 *  primero cuyos SKU estén todos libres). Una variación que empieza con el SKU
 *  base viejo conserva el resto ("ABC-ROJO" → "ABC-COPIA-ROJO"); las demás
 *  quedan "<base nuevo>-<n.º de variación>". `ocupados` va en minúsculas.
 *  Pura: se prueba sin base. */
export function planSkus(skuBase: string, skusVariaciones: string[], ocupados: ReadonlySet<string>): { base: string; variaciones: string[] } {
  for (let n = 1; n < 1000; n++) {
    const base = `${skuBase}-COPIA${n > 1 ? n : ""}`;
    const variaciones = skusVariaciones.map((v, i) =>
      v.toLowerCase().startsWith(skuBase.toLowerCase()) ? base + v.slice(skuBase.length) : `${base}-${i + 1}`);
    // La variación default de un simple/kit se llama igual que el base: eso no cuenta como repetido.
    const vs = variaciones.map((s) => s.toLowerCase());
    if (new Set(vs).size === vs.length && [base.toLowerCase(), ...vs].every((s) => !ocupados.has(s))) return { base, variaciones };
  }
  throw new ErrorErp("No se pudo encontrar un SKU libre para la copia.");
}

const NO_PRODUCTO = ["id", "organizacion_id", "sku_base", "codigo_barras", "estado", "creado_ts", "actualizado_ts"];
const NO_VARIACION = ["id", "organizacion_id", "producto_id", "sku", "codigo_barras", "creado_ts",
  "costo_ultimo_ars", "costo_ultimo_usd", "costo_promedio_ars", "costo_promedio_usd", "costo_actualizado_ts"];

/** Las columnas de una tabla que se pueden copiar (sin las generadas ni las de identidad) menos `excluir`.
 *  Se leen de la base: una columna que se agregue al producto mañana se copia sola. */
async function columnas(c: Consultor, tabla: string, excluir: string[]): Promise<string[]> {
  const r = await c.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' and is_identity = 'NO' order by ordinal_position`, [tabla]);
  return r.rows.map((x) => x.column_name).filter((x) => !excluir.includes(x));
}

/** Crea la copia del producto `pid` y devuelve su id y SKU base. */
export async function duplicarProducto(org: string, pid: number): Promise<{ id: number; sku_base: string }> {
  const origen = await una<{ id: number; sku_base: string; tipo: string }>(
    "select id::int, sku_base, tipo from producto where id = $2 and organizacion_id = $1", [org, pid]);
  if (!origen) throw new ErrorErp("Ese producto no existe.");

  return enTransaccion(async (c) => {
    const vars = (await c.query<{ id: string; sku: string; es_default: boolean }>(
      "select id, sku, es_default from variacion where producto_id = $2 and organizacion_id = $1 order by es_default desc, orden, id", [org, pid])).rows;
    const ocupados = new Set((await c.query<{ s: string }>(
      `select lower(sku_base) s from producto where organizacion_id = $1 and lower(sku_base) like lower($2) || '%'
       union select lower(sku) from variacion where organizacion_id = $1 and lower(sku) like lower($2) || '%'`, [org, origen.sku_base])).rows.map((r) => r.s));
    const skus = planSkus(origen.sku_base, vars.map((v) => v.sku), ocupados);

    // El producto. Pausado, y sin código de barras (identifica a la cosa física).
    const cp = (await columnas(c, "producto", NO_PRODUCTO)).map((x) => `"${x}"`).join(", ");
    const nuevo = Number((await c.query<{ id: string }>(
      `insert into producto (organizacion_id, sku_base, estado, ${cp})
       select organizacion_id, $3::text, 'pausado', ${cp} from producto where id = $2 and organizacion_id = $1 returning id`,
      [org, pid, skus.base])).rows[0].id);

    // Las variaciones. Un simple o kit ya trae su variación default (la crea la
    // base al insertar el producto): a ésa se le copian los datos. Las demás se crean.
    const cv = (await columnas(c, "variacion", NO_VARIACION)).map((x) => `"${x}"`).join(", ");
    const nuevaDeId = new Map<string, number>();
    const defaultNueva = (await c.query<{ id: string }>("select id from variacion where producto_id = $1 and es_default", [nuevo])).rows[0];
    for (const [i, v] of vars.entries()) {
      if (v.es_default && defaultNueva) {
        await c.query(
          `update variacion set (${cv}) = (select ${cv} from variacion where id = $1) where id = $2`, [v.id, defaultNueva.id]);
        nuevaDeId.set(v.id, Number(defaultNueva.id));
      } else {
        const r = await c.query<{ id: string }>(
          `insert into variacion (organizacion_id, producto_id, sku, ${cv})
           select organizacion_id, $2::bigint, $3::text, ${cv} from variacion where id = $1 returning id`, [v.id, nuevo, skus.variaciones[i]]);
        nuevaDeId.set(v.id, Number(r.rows[0].id));
      }
    }
    for (const [viejaId, nuevaId] of nuevaDeId) {
      await c.query(`insert into variacion_atributo (organizacion_id, variacion_id, nombre, valor, orden)
                     select organizacion_id, $2::bigint, nombre, valor, orden from variacion_atributo where variacion_id = $1`, [viejaId, nuevaId]);
      await c.query(`insert into variacion_foto (organizacion_id, variacion_id, orden, url)
                     select organizacion_id, $2::bigint, orden, url from variacion_foto where variacion_id = $1`, [viejaId, nuevaId]);
      // El precio de hoy en cada lista (no la historia).
      await c.query(`insert into precio (organizacion_id, lista_id, variacion_id, importe_ars, importe_usd, moneda_origen, vigente_desde)
                     select distinct on (lista_id) organizacion_id, lista_id, $2::bigint, importe_ars, importe_usd, moneda_origen, current_date
                       from precio where variacion_id = $1 and vigente_desde <= current_date order by lista_id, vigente_desde desc`, [viejaId, nuevaId]);
      // Si es un kit, sus componentes.
      await c.query(`insert into kit_componente (organizacion_id, variacion_kit_id, variacion_componente_id, cantidad)
                     select organizacion_id, $2::bigint, variacion_componente_id, cantidad from kit_componente where variacion_kit_id = $1`, [viejaId, nuevaId]);
    }

    // Lo que cuelga del producto.
    await c.query(`insert into producto_foto (organizacion_id, producto_id, orden, url)
                   select organizacion_id, $2::bigint, orden, url from producto_foto where producto_id = $1`, [pid, nuevo]);
    await c.query(`insert into producto_cucarda (organizacion_id, producto_id, cucarda_id, desde, hasta)
                   select organizacion_id, $2::bigint, cucarda_id, desde, hasta from producto_cucarda where producto_id = $1`, [pid, nuevo]);
    await c.query(`insert into producto_atributo (organizacion_id, producto_id, nombre, valor, orden)
                   select organizacion_id, $2::bigint, nombre, valor, orden from producto_atributo where producto_id = $1`, [pid, nuevo]);
    const cc = (await columnas(c, "producto_costo", ["producto_id", "actualizado_ts"])).map((x) => `"${x}"`).join(", ");
    await c.query(`insert into producto_costo (producto_id, ${cc}) select $2::bigint, ${cc} from producto_costo where producto_id = $1`, [pid, nuevo]);

    return { id: nuevo, sku_base: skus.base };
  });
}
