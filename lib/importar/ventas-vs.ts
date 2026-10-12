// Historial de ventas de Virtual Seller (pedido de Fer, 12/10): guarda en venta_historica los renglones de unos
// pedidos de VS ya leídos (lib/importar/ventas-vs-renglones.ts) y deja marcada cada fila de la importación.
// NUNCA crea pedidos, clientes ni movimientos de stock: el producto y el cliente se BUSCAN (por SKU; por CUIT o
// documento) y, si no están, el renglón entra igual sin enlace. Todo de a tandas, en pocas consultas.

import { consulta } from "@/lib/erp/base";
import type { Valor } from "@/lib/importar/leer";
import { renglonesVs, skuSinPrefijo, type RenglonVs } from "@/lib/importar/ventas-vs-renglones";

type Fila = { n: number; datos: Record<string, Valor> };

/** El canal del sistema de cada nombre de canal de VS que aparece. Lo nuevo se asocia solo: un canal con el
 *  mismo nombre, o la cuenta de ML donde ya están leídas sus ventas. Lo elegido a mano no se toca. */
async function asociarCanales(org: string, renglones: RenglonVs[]) {
  const porNombre = new Map<string, string[]>();
  for (const r of renglones) {
    const l = porNombre.get(r.canal) ?? [];
    if (r.mlOrder && l.length < 50) l.push(r.mlOrder);
    porNombre.set(r.canal, l);
  }
  const ya = await consulta<{ nombre_vs: string }>(
    "select nombre_vs from venta_vs_canal where organizacion_id = $1 and nombre_vs = any($2::text[]) and (canal_id is not null or elegido_a_mano)",
    [org, [...porNombre.keys()]]);
  const resueltos = new Set(ya.map((y) => y.nombre_vs));
  for (const [nombre, ordenes] of porNombre) {
    if (resueltos.has(nombre)) continue;
    await consulta(`
      insert into venta_vs_canal (organizacion_id, nombre_vs, canal_id)
      values ($1, $2, coalesce(
        (select id from canal where organizacion_id = $1 and lower(nombre) = lower($2) limit 1),
        (select canal_id from ml_venta where organizacion_id = $1 and order_id = any($3::bigint[]) group by canal_id order by count(*) desc limit 1)))
      on conflict (organizacion_id, nombre_vs) do update set canal_id = excluded.canal_id
       where venta_vs_canal.canal_id is null and not venta_vs_canal.elegido_a_mano`, [org, nombre, ordenes]);
  }
}

/** Procesa los pedidos de VS de una tanda (todas las filas de cada pedido) y marca cada fila. */
export async function importarVentasVs(org: string, importacionId: number, mapeo: Record<string, string>, pedidos: Fila[][]): Promise<number> {
  const marcas: { n: number; resultado: "ok" | "error"; motivo: string }[] = [];
  const renglones: RenglonVs[] = [];
  for (const filas of pedidos) {
    const { ok, errores } = renglonesVs(filas, mapeo);
    renglones.push(...ok);
    for (const e of errores) marcas.push({ n: e.n, resultado: "error", motivo: e.motivo });
  }
  if (renglones.length) {
    await asociarCanales(org, renglones);
    // Producto: el SKU tal cual o sin el «DE-».
    const skus = [...new Set(renglones.flatMap((r) => [r.sku.toLowerCase(), skuSinPrefijo(r.sku).toLowerCase()]))];
    const variaciones = new Map((await consulta<{ k: string; id: string }>(
      "select lower(sku) k, min(id) id from variacion where organizacion_id = $1 and lower(sku) = any($2::text[]) group by 1", [org, skus]))
      .map((v) => [v.k, Number(v.id)]));
    // Cliente: sólo si ya existe, por CUIT o por documento.
    const cuits = [...new Set(renglones.map((r) => r.cuit).filter((x): x is string => !!x))];
    const docs = [...new Set(renglones.map((r) => r.documento).filter((x): x is string => !!x))];
    const clientes = new Map<string, number>();
    if (cuits.length) {
      for (const c of await consulta<{ k: string; id: string }>("select cuit k, min(id) id from cliente where organizacion_id = $1 and cuit = any($2::text[]) group by 1", [org, cuits])) clientes.set(`c${c.k}`, Number(c.id));
    }
    if (docs.length) {
      for (const c of await consulta<{ k: string; id: string }>(`select regexp_replace(documento_numero, '\\D', '', 'g') k, min(id) id from cliente
          where organizacion_id = $1 and documento_numero is not null and regexp_replace(documento_numero, '\\D', '', 'g') = any($2::text[]) group by 1`, [org, docs])) clientes.set(`d${c.k}`, Number(c.id));
    }
    // Las ventas de ML que el sistema ya tiene leídas: entran igual, pero no se cuentan dos veces (la vista las saltea).
    const ordenes = [...new Set(renglones.map((r) => r.mlOrder).filter((x): x is string => !!x))];
    const yaLeidas = new Set(ordenes.length ? (await consulta<{ o: string }>(
      "select distinct order_id::text o from ml_venta where organizacion_id = $1 and order_id = any($2::bigint[])", [org, ordenes])).map((x) => x.o) : []);

    const datos = renglones.map((r) => {
      const variacionId = variaciones.get(r.sku.toLowerCase()) ?? variaciones.get(skuSinPrefijo(r.sku).toLowerCase()) ?? null;
      const clienteId = (r.cuit && clientes.get(`c${r.cuit}`)) || (r.documento && clientes.get(`d${r.documento}`)) || null;
      const notas = [
        r.mlOrder && yaLeidas.has(r.mlOrder) ? "la venta de ML ya estaba leída: no se cuenta dos veces" : null,
        variacionId ? null : `el SKU ${r.sku} no está en el catálogo: queda sin enlace`,
      ].filter(Boolean);
      marcas.push({ n: r.n, resultado: "ok", motivo: `Importada${notas.length ? ` (${notas.join("; ")})` : ""}` });
      return {
        clave: r.clave, pedido_vs: r.pedido, canal_nombre: r.canal, ml_order_id: r.mlOrder, fecha: `${r.fecha}T12:00:00-03:00`, variacion_id: variacionId,
        sku: r.sku, titulo: r.titulo, cantidad: r.cantidad, precio_unit: r.precio, descuento: r.descuento, total: r.total,
        cliente_nombre: r.cliente, documento: r.documento, cuit: r.cuit, cliente_id: clienteId,
      };
    });
    await consulta(`
      insert into venta_historica (organizacion_id, importacion_id, clave, pedido_vs, canal_nombre, ml_order_id, fecha, variacion_id, sku, titulo,
                                   cantidad, precio_unit, descuento, total, cliente_nombre, documento, cuit, cliente_id)
      select $1, $2, x.clave, x.pedido_vs, x.canal_nombre, x.ml_order_id::bigint, x.fecha, x.variacion_id, x.sku, x.titulo,
             x.cantidad, x.precio_unit, x.descuento, x.total, x.cliente_nombre, x.documento, x.cuit, x.cliente_id
        from jsonb_to_recordset($3::jsonb) as x(clave text, pedido_vs text, canal_nombre text, ml_order_id text, fecha timestamptz, variacion_id bigint,
             sku text, titulo text, cantidad int, precio_unit numeric, descuento numeric, total numeric, cliente_nombre text, documento text, cuit text, cliente_id bigint)
      on conflict (organizacion_id, clave) do update set
        importacion_id = excluded.importacion_id, canal_nombre = excluded.canal_nombre, fecha = excluded.fecha,
        variacion_id = coalesce(excluded.variacion_id, venta_historica.variacion_id), titulo = excluded.titulo, cantidad = excluded.cantidad,
        precio_unit = excluded.precio_unit, descuento = excluded.descuento, total = excluded.total, cliente_nombre = excluded.cliente_nombre,
        documento = excluded.documento, cuit = excluded.cuit, cliente_id = coalesce(excluded.cliente_id, venta_historica.cliente_id)`,
      [org, importacionId, JSON.stringify(datos)]);
  }
  if (marcas.length) {
    await consulta(`
      update importacion_fila f set resultado = x.resultado, motivo = x.motivo
        from jsonb_to_recordset($3::jsonb) as x(n int, resultado text, motivo text)
       where f.importacion_id = $1 and f.organizacion_id = $2 and f.n = x.n`, [importacionId, org, JSON.stringify(marcas)]);
  }
  return marcas.length;
}
