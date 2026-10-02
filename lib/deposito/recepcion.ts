// Recepción de mercadería (sesión 4): compras, devoluciones y otras
// entradas, escaneando cada producto y eligiendo (o escaneando) la
// ubicación. Cada línea mueve stock con moverStock (ingreso o devolución).

import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { moverStock } from "@/lib/stock";
import { cambiarEstado } from "@/lib/pedidos";
import { sincronizarStockMl } from "@/lib/mercadolibre/stock";

export type TipoRecepcion = "compra" | "devolucion" | "otro";

export async function crearRecepcion(org: string, d: { tipo: TipoRecepcion; depositoId: number; proveedorId?: number | null; pedidoId?: number | null; documento?: string | null; nota?: string | null }, usuarioId: string): Promise<number> {
  const dep = await una("select 1 from deposito where id = $1 and organizacion_id = $2 and estado = 'activo'", [d.depositoId, org]);
  if (!dep) throw new ErrorErp("Elegí un depósito.");
  if (d.proveedorId && !(await una("select 1 from proveedor where id = $1 and organizacion_id = $2", [d.proveedorId, org]))) throw new ErrorErp("El proveedor no existe.");
  if (d.pedidoId && !(await una("select 1 from pedido where id = $1 and organizacion_id = $2", [d.pedidoId, org]))) throw new ErrorErp("El pedido no existe.");
  const r = await una<{ id: string }>(`
    insert into recepcion (organizacion_id, tipo, deposito_id, proveedor_id, pedido_id, documento, nota, usuario_id)
    values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [org, d.tipo, d.depositoId, d.proveedorId ?? null, d.pedidoId ?? null, d.documento ?? null, d.nota ?? null, usuarioId]);
  return Number(r!.id);
}

/** La variación por código de barras o SKU (no kits: un kit se recibe por sus componentes). */
export async function variacionPorCodigo(org: string, codigo: string) {
  const t = codigo.trim();
  const v = await una<{ id: number; sku: string; titulo: string; es_kit: boolean }>(`
    select id::int, sku, titulo_variacion(id) titulo, es_kit(id) es_kit from variacion
     where organizacion_id = $1 and (codigo_barras = $2 or lower(sku) = lower($2)) order by (codigo_barras = $2) desc limit 1`, [org, t]);
  if (!v) throw new ErrorErp(`No hay ningún producto con el código ${t}.`);
  if (v.es_kit) throw new ErrorErp(`${v.sku} es un kit: se recibe por sus componentes.`);
  return v;
}

/** Una ubicación del depósito por su código (vacío = la general). */
export async function ubicacionPorCodigo(org: string, depositoId: number, codigo?: string | null) {
  const u = await una<{ id: number; codigo: string }>(codigo?.trim()
    ? "select id::int, codigo from ubicacion where organizacion_id = $1 and deposito_id = $2 and lower(codigo) = lower($3) and estado = 'activa'"
    : "select id::int, codigo from ubicacion where organizacion_id = $1 and deposito_id = $2 and es_default", codigo?.trim() ? [org, depositoId, codigo.trim()] : [org, depositoId]);
  if (!u) throw new ErrorErp(`El depósito no tiene la ubicación ${codigo}.`);
  return u;
}

/** Suma una línea a la recepción y mueve el stock. En una devolución, lo que
 *  vuelve como "caja abierta" va al depósito de caja abierta. */
export async function recibir(org: string, recepcionId: number, d: { codigo: string; cantidad: number; ubicacion?: string | null; condicion?: "nuevo" | "caja_abierta" }, usuarioId: string) {
  if (!Number.isInteger(d.cantidad) || d.cantidad <= 0) throw new ErrorErp("La cantidad tiene que ser un entero mayor que cero.");
  const rec = await una<{ tipo: TipoRecepcion; deposito_id: string; estado: string }>(
    "select tipo, deposito_id, estado from recepcion where id = $1 and organizacion_id = $2", [recepcionId, org]);
  if (!rec) throw new ErrorErp("Esa recepción no existe.");
  if (rec.estado !== "abierta") throw new ErrorErp("Esa recepción ya está cerrada.");
  const v = await variacionPorCodigo(org, d.codigo);
  const condicion = d.condicion === "caja_abierta" ? "caja_abierta" : "nuevo";
  let depositoId = Number(rec.deposito_id);
  if (condicion === "caja_abierta") {
    const ca = await una<{ id: string }>("select id from deposito where organizacion_id = $1 and tipo = 'caja_abierta' and estado = 'activo' order by id limit 1", [org]);
    if (!ca) throw new ErrorErp("No hay ningún depósito de caja abierta: crealo en Stock → Depósitos.");
    depositoId = Number(ca.id);
  }
  const u = await ubicacionPorCodigo(org, depositoId, condicion === "caja_abierta" ? null : d.ubicacion);
  await enTransaccion(async (c) => {
    await moverStock(org, {
      variacionId: v.id, tipo: rec.tipo === "devolucion" ? "devolucion" : "ingreso", cantidad: d.cantidad, destinoId: u.id,
      referencia: { tipo: "recepcion", id: recepcionId }, usuarioId, nota: condicion === "caja_abierta" ? "caja abierta" : null,
    }, c);
    await c.query(`insert into recepcion_linea (organizacion_id, recepcion_id, variacion_id, ubicacion_id, cantidad, condicion, usuario_id)
                   values ($1, $2, $3, $4, $5, $6, $7)`, [org, recepcionId, v.id, u.id, d.cantidad, condicion, usuarioId]);
  });
  await sincronizarStockMl(org, [v.id]).catch((e) => console.error("[meli] stock tras recepción", e));
  return { variacion: v, ubicacion: u.codigo, cantidad: d.cantidad, condicion };
}

/** Cierra la recepción. Una devolución de un pedido lo deja "devuelto". */
export async function cerrarRecepcion(org: string, recepcionId: number, usuarioId: string) {
  const rec = await una<{ tipo: string; pedido_id: string | null; estado: string }>(
    "select tipo, pedido_id, estado from recepcion where id = $1 and organizacion_id = $2", [recepcionId, org]);
  if (!rec) throw new ErrorErp("Esa recepción no existe.");
  if (rec.estado !== "abierta") throw new ErrorErp("Ya estaba cerrada.");
  await consulta("update recepcion set estado = 'cerrada', cerrada_ts = now() where id = $1", [recepcionId]);
  if (rec.tipo === "devolucion" && rec.pedido_id) {
    const p = await una<{ estado: string }>("select estado from pedido where id = $1", [rec.pedido_id]);
    if (p && !["devuelto", "cancelado"].includes(p.estado)) {
      await enTransaccion((c) => cambiarEstado(org, Number(rec.pedido_id), "devuelto", usuarioId, `recepción #${recepcionId}`, c));
    }
  }
}
