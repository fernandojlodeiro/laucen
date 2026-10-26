// El seguimiento de los pedidos sin pagar (Fer, 25/10). Mientras un pedido guarda stock sin estar pago, se le
// escribe al cliente por mail y por WhatsApp —por WhatsApp aunque no lo haya tildado—:
//   - recibido: al crearse (la tienda, por transferencia o efectivo; o cargado a mano): el pedido, la
//     reserva y cómo pagar.
//   - pago_incompleto: tarjeta o Mercado Pago que a los 10 minutos no se pagó. La reserva pasa a 24 horas
//     desde el aviso (pedido.reserva_vence_ts) y el link lleva a la página del pedido, donde puede
//     reintentar o cambiar la forma de pago.
//   - recordatorio: a los 2 días, si todavía falta para el último.
//   - ultimo_dia: el último día de la reserva, desde las 9.
//   - reserva_anulada: cuando se cancela solo por la reserva vencida.
// Quedan afuera Mercado Libre, los clientes con cuenta corriente y los pedidos de antes de que esto existiera
// (pedido.avisos_reserva en false; pedido_en_seguimiento, db/correo.sql). Los tres del medio los encola pg_cron (pedido_seguimiento_encolar);
// el primero y el último, el código. Todos salen por la cola de los avisos (correo_cola, lib/correo/mails.ts),
// y al mandarse se vuelve a mirar que el pedido siga sin pagar.

import { randomBytes } from "node:crypto";
import { una, consulta } from "@/lib/erp/base";

export const TIPOS_SEGUIMIENTO = ["recibido", "pago_incompleto", "recordatorio", "ultimo_dia", "reserva_anulada"] as const;
export type TipoSeguimiento = (typeof TIPOS_SEGUIMIENTO)[number];
export const esSeguimiento = (tipo: string): tipo is TipoSeguimiento => (TIPOS_SEGUIMIENTO as readonly string[]).includes(tipo);

/** El código del link público del pedido; un pedido cargado a mano no lo tiene hasta que se le escribe. */
export async function asegurarCodigo(org: string, pedidoId: number): Promise<string | null> {
  const r = await una<{ codigo: string | null }>(`
    update pedido set codigo_seguimiento = coalesce(codigo_seguimiento, $3) where id = $1 and organizacion_id = $2 returning codigo_seguimiento codigo`,
  [pedidoId, org, randomBytes(6).toString("base64url")]);
  return r?.codigo ?? null;
}

/** El primer aviso, al crearse el pedido (si le corresponde seguimiento). */
export async function encolarRecibido(org: string, pedidoId: number): Promise<void> {
  const ok = await una<{ ok: boolean }>("select pedido_en_seguimiento($1) ok", [pedidoId]);
  if (!ok?.ok) return;
  await asegurarCodigo(org, pedidoId);
  await consulta(`insert into correo_cola (organizacion_id, pedido_id, tipo) values ($1, $2, 'recibido') on conflict (pedido_id, tipo) do nothing`, [org, pedidoId]);
}

/** El aviso de la reserva anulada (lo llama el vencimiento, que ya sabe si el pedido estaba en seguimiento). */
export async function encolarAnulada(org: string, pedidoId: number): Promise<void> {
  await consulta(`insert into correo_cola (organizacion_id, pedido_id, tipo) values ($1, $2, 'reserva_anulada') on conflict (pedido_id, tipo) do nothing`, [org, pedidoId]);
}

/** ¿Sigue valiendo mandarlo? Un recordatorio no sale si el pedido ya se pagó o se canceló; la anulación, sólo si sigue cancelado. */
export async function sigueCorrespondiendo(pedidoId: number, tipo: TipoSeguimiento): Promise<boolean> {
  if (tipo === "reserva_anulada") return !!(await una("select 1 from pedido where id = $1 and estado = 'cancelado'", [pedidoId]));
  if (tipo === "recibido") return !!(await una("select 1 from pedido where id = $1 and estado <> 'cancelado' and estado_pago <> 'pagado'", [pedidoId]));
  return !!(await una<{ ok: boolean }>("select pedido_en_seguimiento($1) ok", [pedidoId]))?.ok;
}

/** Hasta cuándo se guarda, en criollo: «el martes 28/10» o, si es por horas, «mañana a las 15:40». */
export async function reservaLegible(pedidoId: number): Promise<string | null> {
  const r = await una<{ dia: string | null; dow: number; hora: string | null; manana: boolean }>(`
    select to_char(reserva_hasta, 'DD/MM') dia, extract(isodow from reserva_hasta)::int dow,
           to_char(reserva_vence_ts at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') hora,
           coalesce((reserva_vence_ts at time zone 'America/Argentina/Buenos_Aires')::date = (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1, false) manana
      from pedido where id = $1`, [pedidoId]);
  if (!r?.dia) return null;
  if (r.hora) return `${r.manana ? "mañana" : `el ${r.dia}`} a las ${r.hora}`;
  return `el ${DIAS[r.dow] ?? ""} ${r.dia}`.replace("el  ", "el ");
}

const DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
