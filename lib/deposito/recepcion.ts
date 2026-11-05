// Recepción de mercadería (sesión 4): compras, devoluciones y otras
// entradas, escaneando cada producto y eligiendo (o escaneando) la
// ubicación. Cada línea mueve stock con moverStock (ingreso o devolución).

import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { moverStock } from "@/lib/stock";
import { cambiarEstado } from "@/lib/pedidos";
import { sincronizarStockMl } from "@/lib/mercadolibre/stock";
import { codigoCaja } from "@/lib/compras/ordenes";

export type TipoRecepcion = "compra" | "devolucion" | "otro";

export async function crearRecepcion(org: string, d: { tipo: TipoRecepcion; depositoId: number; proveedorId?: number | null; pedidoId?: number | null; documento?: string | null; nota?: string | null;
  /** La orden de compra al exterior que se recibe (por cajas). */
  ordenCompraId?: number | null;
  /** Devolución de una venta anterior a Laucen (sin pedido acá): la referencia que se escribió. */
  ventaExterna?: string | null }, usuarioId: string): Promise<number> {
  const dep = await una("select 1 from deposito where id = $1 and organizacion_id = $2 and estado = 'activo'", [d.depositoId, org]);
  if (!dep) throw new ErrorErp("Elegí un depósito.");
  if (d.proveedorId && !(await una("select 1 from proveedor where id = $1 and organizacion_id = $2", [d.proveedorId, org]))) throw new ErrorErp("El proveedor no existe.");
  if (d.pedidoId && !(await una("select 1 from pedido where id = $1 and organizacion_id = $2", [d.pedidoId, org]))) throw new ErrorErp("El pedido no existe.");
  if (d.ordenCompraId) {
    const o = await una<{ estado: string }>("select estado from orden_compra where id = $1 and organizacion_id = $2", [d.ordenCompraId, org]);
    if (!o) throw new ErrorErp("La orden de compra no existe.");
    if (o.estado !== "en_camino") throw new ErrorErp(o.estado === "borrador" ? "La orden todavía está a revisar: confirmala antes de recibirla." : "La orden ya se recibió.");
    const abierta = await una<{ id: number }>("select id::int from recepcion where orden_compra_id = $1 and estado = 'abierta' limit 1", [d.ordenCompraId]);
    if (abierta) return abierta.id;
  }
  const r = await una<{ id: string }>(`
    insert into recepcion (organizacion_id, tipo, deposito_id, proveedor_id, pedido_id, documento, nota, usuario_id, venta_externa, orden_compra_id)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [org, d.ordenCompraId ? "compra" : d.tipo, d.depositoId, d.proveedorId ?? null, d.pedidoId ?? null, d.documento ?? null, d.nota ?? null, usuarioId,
      d.tipo === "devolucion" && !d.pedidoId ? d.ventaExterna?.trim().slice(0, 100) || null : null, d.ordenCompraId ?? null]);
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
  // En la recepción de una orden de compra, lo que entra es primero de los que lo compraron en preventa.
  const orden = await una<{ id: number | null }>("select orden_compra_id::int id from recepcion where id = $1", [recepcionId]);
  if (orden?.id) await (await import("@/lib/preventa")).cubrirPreventas(org, orden.id, usuarioId);
  await sincronizarStockMl(org, [v.id]).catch((e) => console.error("[meli] stock tras recepción", e));
  return { variacion: v, ubicacion: u.codigo, cantidad: d.cantidad, condicion };
}

/** Cierra la recepción. Una devolución de un pedido lo deja "devuelto". La de una orden de compra la deja
 *  «recibida» y les reserva el stock que llegó a los pedidos en preventa de esa orden (lib/preventa). */
export async function cerrarRecepcion(org: string, recepcionId: number, usuarioId: string) {
  const rec = await una<{ tipo: string; pedido_id: string | null; estado: string; orden_compra_id: number | null }>(
    "select tipo, pedido_id, estado, orden_compra_id::int from recepcion where id = $1 and organizacion_id = $2", [recepcionId, org]);
  if (!rec) throw new ErrorErp("Esa recepción no existe.");
  if (rec.estado !== "abierta") throw new ErrorErp("Ya estaba cerrada.");
  await consulta("update recepcion set estado = 'cerrada', cerrada_ts = now() where id = $1", [recepcionId]);
  if (rec.orden_compra_id) await ordenRecibida(org, rec.orden_compra_id, usuarioId);
  if (rec.tipo === "devolucion" && rec.pedido_id) {
    const p = await una<{ estado: string }>("select estado from pedido where id = $1", [rec.pedido_id]);
    if (p && !["devuelto", "cancelado"].includes(p.estado)) {
      await enTransaccion((c) => cambiarEstado(org, Number(rec.pedido_id), "devuelto", usuarioId, `recepción #${recepcionId}`, c));
    }
  }
}

// ── Recepción de una orden de compra al exterior, por cajas (Fer, 5/11) ──────
// Cada caja recibida queda entera en una ubicación del depósito con su código (M0226-34): el stock está «en la caja».
// «Sacar productos de la caja» los pasa a un estante (transferencia). La ubicación de una caja vacía se archiva sola.

/** Recibe una caja de la orden: crea (o reactiva) la ubicación con el código de la caja y entra cada producto ahí,
 *  con las cantidades que se contaron (las del packing list si no se cambian). */
export async function recibirCaja(org: string, recepcionId: number, cajaId: number, cantidades: Record<number, number>, usuarioId: string) {
  const rec = await una<{ deposito_id: number; estado: string; orden_compra_id: number | null }>(
    "select deposito_id::int, estado, orden_compra_id::int from recepcion where id = $1 and organizacion_id = $2", [recepcionId, org]);
  if (!rec) throw new ErrorErp("Esa recepción no existe.");
  if (rec.estado !== "abierta") throw new ErrorErp("Esa recepción ya está cerrada.");
  const caja = await una<{ id: number; numero: number; codigo: string; recibida_ts: Date | null; orden_id: number }>(`
    select k.id::int, k.numero, o.codigo, k.recibida_ts, k.orden_id::int from orden_compra_caja k join orden_compra o on o.id = k.orden_id
     where k.id = $1 and k.organizacion_id = $2`, [cajaId, org]);
  if (!caja || caja.orden_id !== rec.orden_compra_id) throw new ErrorErp("Esa caja no es de la orden de esta recepción.");
  if (caja.recibida_ts) throw new ErrorErp(`La caja ${codigoCaja(caja.codigo, caja.numero)} ya se recibió.`);
  const items = await consulta<{ id: number; sku: string; variacion_id: number | null; cantidad: number; es_kit: boolean }>(`
    select ci.id::int, ci.sku, ci.variacion_id::int, ci.cantidad, coalesce(es_kit(ci.variacion_id), false) es_kit
      from orden_compra_caja_item ci where ci.caja_id = $1 order by ci.fila, ci.id`, [cajaId]);
  const contar = items.map((i) => {
    const n = cantidades[i.id] ?? i.cantidad;
    if (!Number.isInteger(n) || n < 0) throw new ErrorErp(`${i.sku}: la cantidad tiene que ser un entero.`);
    return { ...i, n };
  }).filter((i) => i.n > 0);
  const sinProducto = contar.filter((i) => !i.variacion_id || i.es_kit);
  if (sinProducto.length) throw new ErrorErp(`${sinProducto.map((i) => i.sku).join(", ")}: no está en el sistema (o es un kit). Dalo de alta o corregí el SKU en la orden y volvé a subir el packing list.`);
  const codigo = codigoCaja(caja.codigo, caja.numero);
  await enTransaccion(async (c) => {
    const u = (await c.query<{ id: number }>(`
      insert into ubicacion (organizacion_id, deposito_id, codigo, descripcion)
      values ($1, $2, $3, $4)
      on conflict (deposito_id, codigo) do update set estado = 'activa'
      returning id::int`, [org, rec.deposito_id, codigo, `Caja de la orden ${caja.codigo}`])).rows[0];
    for (const i of contar) {
      await moverStock(org, { variacionId: i.variacion_id!, tipo: "ingreso", cantidad: i.n, destinoId: u.id, referencia: { tipo: "recepcion", id: recepcionId }, usuarioId, nota: `caja ${codigo}` }, c);
      await c.query(`insert into recepcion_linea (organizacion_id, recepcion_id, variacion_id, ubicacion_id, cantidad, condicion, usuario_id)
                     values ($1, $2, $3, $4, $5, 'nuevo', $6)`, [org, recepcionId, i.variacion_id, u.id, i.n, usuarioId]);
    }
    await c.query("update orden_compra_caja set recibida_ts = now(), ubicacion_id = $2 where id = $1", [cajaId, u.id]);
  });
  // Lo que entró es primero de los que lo compraron en preventa (por orden de compra).
  const { cubrirPreventas } = await import("@/lib/preventa");
  await cubrirPreventas(org, caja.orden_id, usuarioId);
  await sincronizarStockMl(org, contar.map((i) => i.variacion_id!)).catch((e) => console.error("[meli] stock tras recibir caja", e));
  return { codigo, unidades: contar.reduce((t, i) => t + i.n, 0), productos: contar.length };
}

/** Saca unidades de una caja recibida a otra ubicación del mismo depósito (un estante). Si la caja queda vacía, su
 *  ubicación se archiva. */
export async function sacarDeCaja(org: string, cajaId: number, d: { variacionId: number; cantidad: number; destino: string }, usuarioId: string) {
  if (!Number.isInteger(d.cantidad) || d.cantidad <= 0) throw new ErrorErp("La cantidad tiene que ser un entero mayor que cero.");
  const caja = await una<{ ubicacion_id: number | null; deposito_id: number | null; codigo: string; numero: number }>(`
    select k.ubicacion_id::int, u.deposito_id::int, o.codigo, k.numero from orden_compra_caja k join orden_compra o on o.id = k.orden_id
      left join ubicacion u on u.id = k.ubicacion_id where k.id = $1 and k.organizacion_id = $2`, [cajaId, org]);
  if (!caja?.ubicacion_id || !caja.deposito_id) throw new ErrorErp("Esa caja todavía no se recibió.");
  const hay = await una<{ n: number }>("select coalesce(sum(cantidad - reservado), 0)::int n from stock where ubicacion_id = $1 and variacion_id = $2", [caja.ubicacion_id, d.variacionId]);
  if ((hay?.n ?? 0) < d.cantidad) throw new ErrorErp(`En la caja quedan ${hay?.n ?? 0} libres de ese producto.`);
  const destino = await ubicacionPorCodigo(org, caja.deposito_id, d.destino);
  if (destino.id === caja.ubicacion_id) throw new ErrorErp("Elegí otra ubicación: ésa es la misma caja.");
  await moverStock(org, { variacionId: d.variacionId, tipo: "transferencia", cantidad: d.cantidad, origenId: caja.ubicacion_id, destinoId: destino.id,
    referencia: { tipo: "caja", id: cajaId }, usuarioId, nota: `sacado de la caja ${codigoCaja(caja.codigo, caja.numero)}` });
  await archivarCajasVacias(org);
  return { destino: destino.codigo };
}

/** Archiva las ubicaciones de las cajas recibidas que quedaron vacías (sin stock ni reservas). */
export async function archivarCajasVacias(org: string): Promise<number> {
  const r = await consulta(`
    update ubicacion u set estado = 'archivada'
      from orden_compra_caja k
     where k.ubicacion_id = u.id and k.organizacion_id = $1 and u.estado = 'activa' and not u.es_default
       and not exists (select 1 from stock s where s.ubicacion_id = u.id and (s.cantidad <> 0 or s.reservado <> 0))
    returning u.id`, [org]);
  return r.length;
}

/** Cierre de la recepción de una orden: la orden queda recibida (con la fecha real en su invoice y su compra por
 *  courier) y los pedidos en preventa de esa orden pasan a tener su stock físico. */
async function ordenRecibida(org: string, ordenId: number, usuarioId: string) {
  await consulta(`update orden_compra set estado = 'recibida', recibida_ts = now(), publicar_web = false, publicar_ml = false where id = $1 and organizacion_id = $2`, [ordenId, org]);
  await consulta(`update compra_invoice i set llegada = (now() at time zone 'America/Argentina/Buenos_Aires')::date
                    from orden_compra o where o.id = $1 and i.id = o.invoice_id`, [ordenId]);
  await consulta(`update compra_courier c set ingreso_ts = coalesce(c.ingreso_ts, now())
                    from orden_compra o where o.id = $1 and c.id = o.compra_courier_id`, [ordenId]);
  await archivarCajasVacias(org);
  const { cubrirPreventas } = await import("@/lib/preventa");
  await cubrirPreventas(org, ordenId, usuarioId);
}
