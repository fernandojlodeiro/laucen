// Reclamos y devoluciones: lo común a todos (notas internas, "Recibir
// devolución", el resumen del panel) y los reclamos de la web o el local, que
// se cargan a mano ("Nuevo reclamo"). Los de Mercado Libre entran solos
// (lib/mercadolibre/reclamos.ts). Tablas en db/reclamos.sql.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { crearRecepcion } from "@/lib/deposito/recepcion";

export const ESTADOS_RECLAMO = { abierto: "Abierto", en_proceso: "En proceso", resuelto: "Resuelto" } as const;
export type EstadoReclamo = keyof typeof ESTADOS_RECLAMO;
export const esEstadoReclamo = (x: unknown): x is EstadoReclamo => typeof x === "string" && Object.hasOwn(ESTADOS_RECLAMO, x);

export const TIPOS_RECLAMO = { reclamo: "Reclamo", devolucion: "Devolución", cancelacion: "Cancelación", mediacion: "Mediación", cambio: "Cambio" } as const;
export type TipoReclamo = keyof typeof TIPOS_RECLAMO;
export const esTipoReclamo = (x: unknown): x is TipoReclamo => typeof x === "string" && Object.hasOwn(TIPOS_RECLAMO, x);

export const ORIGENES_RECLAMO = { mercadolibre: "Mercado Libre", web: "Web", local: "Local" } as const;

/** Las pestañas de la lista y su condición (sobre reclamo, alias r). */
export const PESTANAS_RECLAMOS = [
  ["abiertos", "Abiertos"], ["mediacion", "En mediación"], ["camino", "Devoluciones en camino"], ["cerrados", "Cerrados"],
] as const;
export type PestanaReclamos = (typeof PESTANAS_RECLAMOS)[number][0];
export const esPestanaReclamos = (x: unknown): x is PestanaReclamos => PESTANAS_RECLAMOS.some(([k]) => k === x);
const EN_CAMINO = "coalesce(r.devolucion_estado in ('label_generated', 'shipped') or r.devolucion_envio_estado in ('ready_to_ship', 'shipped'), false)";
export const CONDICION_RECLAMOS: Record<PestanaReclamos, string> = {
  abiertos: `r.estado <> 'resuelto' and coalesce(r.etapa, '') <> 'dispute' and not ${EN_CAMINO}`,
  mediacion: "r.estado <> 'resuelto' and r.etapa = 'dispute'",
  camino: `r.estado <> 'resuelto' and coalesce(r.etapa, '') <> 'dispute' and ${EN_CAMINO}`,
  cerrados: "r.estado = 'resuelto'",
};
/** El orden de los abiertos: los que esperan tu respuesta primero, por vencimiento. */
export const ORDEN_ABIERTOS = "r.espera_respuesta desc, r.vence_ts asc nulls last, r.fecha desc, r.id desc";

async function evento(org: string, reclamo: number, tipo: string, detalle: string | null, usuario: string | null) {
  await consulta("insert into reclamo_evento (organizacion_id, reclamo_id, tipo, detalle, usuario_id) values ($1, $2, $3, $4, $5)",
    [org, reclamo, tipo, detalle, usuario]);
}

export type DatosReclamoManual = {
  pedidoId?: number | null; clienteId?: number | null; origen?: "web" | "local" | null;
  tipo?: TipoReclamo | null; motivo: string | null; notas?: string | null; monto?: number | null;
};

/** "Nuevo reclamo" de la web o del local (los de Mercado Libre entran solos). */
export async function crearReclamoManual(org: string, d: DatosReclamoManual, usuario: string | null): Promise<number> {
  const motivo = d.motivo?.trim();
  if (!motivo) throw new ErrorErp("Poné el motivo del reclamo.");
  let canalId: number | null = null, clienteId = d.clienteId ?? null, origen: "web" | "local" = d.origen === "local" ? "local" : "web";
  let monto = d.monto ?? null;
  if (d.pedidoId) {
    const p = await una<{ canal_id: number; tipo: string; cliente_id: number | null; total_ars: string }>(`
      select p.canal_id::int, c.tipo, p.cliente_id::int, p.total_ars from pedido p join canal c on c.id = p.canal_id
       where p.id = $1 and p.organizacion_id = $2`, [d.pedidoId, org]);
    if (!p) throw new ErrorErp("Ese pedido no existe.");
    if (p.tipo === "mercadolibre") throw new ErrorErp("Los reclamos de Mercado Libre entran solos: no se cargan a mano.");
    canalId = p.canal_id;
    clienteId = clienteId ?? p.cliente_id;
    origen = p.tipo === "local" ? "local" : "web";
    monto = monto ?? Number(p.total_ars);
  }
  if (!d.pedidoId && !clienteId) throw new ErrorErp("Elegí el pedido o el cliente del reclamo.");
  if (clienteId && !(await una("select 1 from cliente where id = $1 and organizacion_id = $2", [clienteId, org]))) throw new ErrorErp("Ese cliente no existe.");
  const r = await una<{ id: string }>(`
    insert into reclamo (organizacion_id, canal_id, origen, pedido_id, cliente_id, tipo, motivo, estado, notas, monto, creado_por)
    values ($1, $2, $3, $4, $5, $6, $7, 'abierto', $8, $9, $10) returning id`,
    [org, canalId, origen, d.pedidoId ?? null, clienteId, d.tipo && esTipoReclamo(d.tipo) ? d.tipo : "reclamo", motivo, d.notas?.trim() || null, monto, usuario]);
  const id = Number(r!.id);
  await evento(org, id, "alta", `Cargado a mano: ${motivo}`, usuario);
  return id;
}

async function manual(org: string, id: number) {
  const r = await una<{ origen: string; estado: EstadoReclamo }>("select origen, estado from reclamo where id = $1 and organizacion_id = $2", [id, org]);
  if (!r) throw new ErrorErp("Ese reclamo no existe.");
  if (r.origen === "mercadolibre") throw new ErrorErp("Un reclamo de Mercado Libre se maneja con los botones de ML.");
  return r;
}

/** Corrige los datos de un reclamo manual (la ficha en edición). */
export async function editarReclamoManual(org: string, id: number, d: { tipo: TipoReclamo | null; motivo: string | null; notas: string | null; monto: number | null; estado: EstadoReclamo | null }, usuario: string | null) {
  const r = await manual(org, id);
  if (!d.motivo?.trim()) throw new ErrorErp("Poné el motivo del reclamo.");
  const estado = d.estado && esEstadoReclamo(d.estado) ? d.estado : r.estado;
  await consulta(`update reclamo set tipo = coalesce($3, tipo), motivo = $4, notas = $5, monto = $6, estado = $7, actualizado_ts = now()
                   where id = $1 and organizacion_id = $2`,
    [id, org, d.tipo && esTipoReclamo(d.tipo) ? d.tipo : null, d.motivo.trim(), d.notas?.trim() || null, d.monto, estado]);
  if (estado !== r.estado) await evento(org, id, "estado", `${ESTADOS_RECLAMO[r.estado]} → ${ESTADOS_RECLAMO[estado]}`, usuario);
}

/** Cambia el estado de un reclamo manual (abierto, en proceso, resuelto). */
export async function cambiarEstadoReclamo(org: string, id: number, estado: EstadoReclamo, usuario: string | null) {
  if (!esEstadoReclamo(estado)) throw new ErrorErp("Estado desconocido.");
  const r = await manual(org, id);
  if (r.estado === estado) return;
  await consulta("update reclamo set estado = $3, actualizado_ts = now() where id = $1 and organizacion_id = $2", [id, org, estado]);
  await evento(org, id, "estado", `${ESTADOS_RECLAMO[r.estado]} → ${ESTADOS_RECLAMO[estado]}`, usuario);
}

/** Anota lo que se devolvió de plata en un reclamo manual (no mueve nada: sólo queda registrado). */
export async function registrarReembolso(org: string, id: number, monto: number, usuario: string | null) {
  await manual(org, id);
  if (!Number.isFinite(monto) || monto <= 0) throw new ErrorErp("Poné cuánto se devolvió.");
  await consulta("update reclamo set reembolso_ars = coalesce(reembolso_ars, 0) + $3, actualizado_ts = now() where id = $1 and organizacion_id = $2", [id, org, monto]);
  await evento(org, id, "reembolso", `Se devolvieron $ ${monto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, usuario);
}

/** Una nota interna (sólo se ve en Laucen; en ML no sale). */
export async function anotarNota(org: string, id: number, texto: string | null, usuario: string | null) {
  const t = texto?.trim();
  if (!t) throw new ErrorErp("La nota está vacía.");
  if (!(await una("select 1 from reclamo where id = $1 and organizacion_id = $2", [id, org]))) throw new ErrorErp("Ese reclamo no existe.");
  await consulta("insert into reclamo_mensaje (organizacion_id, reclamo_id, de, texto, usuario_id) values ($1, $2, 'interno', $3, $4)", [org, id, t, usuario]);
}

/** "Recibir devolución": abre la recepción de devolución del pedido del
 *  reclamo (la que ya está abierta, o una nueva en el depósito del pedido o
 *  el primero propio). Devuelve el id de la recepción. */
export async function recibirDevolucion(org: string, id: number, usuario: string): Promise<number> {
  const r = await una<{ pedido_id: number | null; recepcion_id: number | null; id_externo: string | null; origen: string; orden_externa: string | null }>(
    "select pedido_id::int, recepcion_id::int, id_externo, origen, orden_externa from reclamo where id = $1 and organizacion_id = $2", [id, org]);
  if (!r) throw new ErrorErp("Ese reclamo no existe.");
  if (!r.pedido_id && !r.orden_externa) throw new ErrorErp("El reclamo no tiene un pedido de Laucen: recibí la devolución en Recepción, como «Venta anterior a Laucen».");
  if (r.recepcion_id && await una("select 1 from recepcion where id = $1 and organizacion_id = $2", [r.recepcion_id, org])) return r.recepcion_id;
  // Venta anterior a Laucen (Virtual Seller): sin pedido acá, la orden de ML queda de referencia (bitácora #341).
  if (!r.pedido_id) {
    const dep = await una<{ id: number }>(`select id::int from deposito where organizacion_id = $1 and estado = 'activo' and tipo in ('propio', 'tercerizado')
                                            order by (tipo = 'propio') desc, id limit 1`, [org]);
    if (!dep) throw new ErrorErp("No hay un depósito propio activo donde recibir la devolución.");
    const recepcion = await crearRecepcion(org, {
      tipo: "devolucion", depositoId: dep.id, ventaExterna: `ML ${r.orden_externa}`,
      documento: r.id_externo ? `Reclamo ML ${r.id_externo}` : `Reclamo ${id}`, nota: `Devolución del reclamo #${id} (venta anterior a Laucen)`,
    }, usuario);
    await consulta("update reclamo set recepcion_id = $3, actualizado_ts = now() where id = $1 and organizacion_id = $2", [id, org, recepcion]);
    await evento(org, id, "recepcion", `Recepción de devolución #${recepcion} (venta anterior a Laucen)`, usuario);
    return recepcion;
  }
  const abierta = await una<{ id: number }>(`select id::int from recepcion where organizacion_id = $1 and pedido_id = $2 and tipo = 'devolucion' and estado = 'abierta'
                                             order by id desc limit 1`, [org, r.pedido_id]);
  let recepcion = abierta?.id ?? null;
  if (!recepcion) {
    const dep = await una<{ id: number }>(`
      select d.id::int from deposito d
       where d.organizacion_id = $1 and d.estado = 'activo' and d.tipo in ('propio', 'tercerizado')
       order by (d.id = (select deposito_id from pedido where id = $2)) desc, (d.tipo = 'propio') desc, d.id limit 1`, [org, r.pedido_id]);
    if (!dep) throw new ErrorErp("No hay un depósito propio activo donde recibir la devolución.");
    recepcion = await crearRecepcion(org, {
      tipo: "devolucion", depositoId: dep.id, pedidoId: r.pedido_id,
      documento: r.id_externo ? `Reclamo ML ${r.id_externo}` : `Reclamo ${id}`, nota: `Devolución del reclamo #${id}`,
    }, usuario);
  }
  await consulta("update reclamo set recepcion_id = $3, actualizado_ts = now() where id = $1 and organizacion_id = $2", [id, org, recepcion]);
  await evento(org, id, "recepcion", `Recepción de devolución #${recepcion}`, usuario);
  return recepcion;
}

/** El resumen para el panel: cuántos esperan tu respuesta y cuántos vencen en menos de 24 h. */
export async function resumenReclamos(org: string) {
  const [x] = await consulta<{ por_responder: number; urgentes: number; abiertos: number; mediacion: number; camino: number }>(`
    select count(*) filter (where r.espera_respuesta or (r.origen <> 'mercadolibre' and r.estado = 'abierto'))::int por_responder,
           count(*) filter (where r.espera_respuesta and r.vence_ts < now() + interval '24 hours')::int urgentes,
           count(*) filter (where ${CONDICION_RECLAMOS.abiertos})::int abiertos,
           count(*) filter (where ${CONDICION_RECLAMOS.mediacion})::int mediacion,
           count(*) filter (where ${CONDICION_RECLAMOS.camino})::int camino
      from reclamo r where r.organizacion_id = $1 and r.estado <> 'resuelto'`, [org]);
  return x;
}
