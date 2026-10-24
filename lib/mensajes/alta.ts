// El final del alta de WhatsApp (Ventas › WhatsApp › Configuración → Meta → vuelta). Si Meta dio
// permiso sobre un solo número, se conecta directo; si sobre varios (bitácora #868: Fer eligió en
// Meta el portfolio de CadaMes, y vinieron la cuenta de CadaMes y la nueva de Daitom), la persona
// elige cuál en pantalla. Nunca se ofrece un número cuya cuenta ya recibe otro sistema (CadaMes):
// la suscripción es por cuenta y conectarla le cortaría a CadaMes sus mensajes.

import { consulta, una } from "@/lib/erp/base";
import { urlPanel } from "@/lib/tienda/dominios";
import { claveNueva, numerosDeLaWaba, quienRecibe, registrarNumero, suscribirApp } from "@/lib/mensajes/meta";

export type OpcionAlta = { waba: string; id: string; numero: string; nombre: string; ocupado: boolean };

/** Todos los números de las cuentas que vinieron en el permiso, con si su cuenta ya la usa otro sistema. */
export async function opcionesDelPermiso(wabas: string[], token: string): Promise<OpcionAlta[]> {
  const r: OpcionAlta[] = [];
  for (const waba of wabas) {
    const [numeros, quien] = await Promise.all([numerosDeLaWaba(waba, token).catch(() => []), quienRecibe(waba, token)]);
    for (const n of numeros) r.push({ waba, ...n, ocupado: quien === "otro" });
  }
  return r;
}

/** Guarda el permiso mientras la persona elige el número (vence en una hora). */
export async function guardarPendiente(org: string, token: string, expiraEl: string, coexistencia: boolean, opciones: OpcionAlta[]): Promise<number> {
  await consulta("delete from wa_alta_pendiente where creado_ts < now() - interval '1 hour'");
  const f = await una<{ id: string }>(`insert into wa_alta_pendiente (organizacion_id, token, expira_el, coexistencia, opciones)
                                       values ($1, $2, $3, $4, $5::jsonb) returning id`, [org, token, expiraEl || null, coexistencia, JSON.stringify(opciones)]);
  return Number(f!.id);
}

export async function pendienteDe(org: string, id: number) {
  return una<{ id: number; token: string; expira_el: string | null; coexistencia: boolean; opciones: OpcionAlta[] }>(`
    select id::int, token, expira_el::text, coexistencia, opciones from wa_alta_pendiente
     where id = $1 and organizacion_id = $2 and creado_ts > now() - interval '1 hour'`, [id, org]);
}

/** Conecta ese número: guarda la credencial y suscribe su cuenta con la dirección de Laucen. Devuelve
 *  la clave del cartel de la vuelta (conectado, otro_dueno, ocupado, webhooks). */
export async function terminarAlta(org: string, token: string, expiraEl: string | null, num: OpcionAlta, coexistencia: boolean): Promise<string> {
  if (num.ocupado) return "ocupado";
  const dueno = await una<{ organizacion_id: string }>("select organizacion_id from wa_credencial where phone_number_id = $1", [num.id]);
  if (dueno && dueno.organizacion_id !== org) return "otro_dueno";
  // La credencial va antes de suscribir: Meta verifica la dirección en el momento y el webhook busca la clave en esta tabla.
  const verify = claveNueva();
  await consulta("update wa_credencial set estado = 'desconectado' where organizacion_id = $1 and phone_number_id <> $2", [org, num.id]);
  await consulta(`
    insert into wa_credencial (organizacion_id, phone_number_id, waba_id, numero, nombre, token, verify_token, coexistencia, expira_el, estado)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'activo')
    on conflict (phone_number_id) do update set waba_id = excluded.waba_id, numero = excluded.numero, nombre = excluded.nombre, token = excluded.token,
      verify_token = excluded.verify_token, coexistencia = excluded.coexistencia, expira_el = excluded.expira_el, estado = 'activo', conectado_ts = now()`,
  [org, num.id, num.waba, num.numero, num.nombre, token, verify, coexistencia, expiraEl || null]);
  try {
    await suscribirApp(num.waba, token, `${urlPanel()}/api/whatsapp/webhook`, verify);
  } catch (e) {
    console.error("[wa-alta-suscribir]", org, e);
    await consulta("update wa_credencial set estado = 'desconectado' where phone_number_id = $1", [num.id]);
    return "webhooks";
  }
  if (!coexistencia) await registrarNumero(num.id, token);
  return "conectado";
}
