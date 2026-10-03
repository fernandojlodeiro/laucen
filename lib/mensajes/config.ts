// La configuración de los mensajes de cada organización (config_org, clave
// 'mensajes'): si la IA de la tienda contesta, cómo se llama, lo que sabe para
// los clientes (envíos, pagos, horarios…), su tope de gasto por mes, el
// límite de respuestas por chat y por hora, la marca del teléfono y cuántos
// segundos espera a que el cliente termine de escribir. Se cambia en
// Ventas › WhatsApp › Configuración.

import { consulta, una } from "@/lib/erp/base";
import { MARCA_POR_DEFECTO } from "./reglas";

export type ConfigMensajes = {
  iaActiva: boolean;
  nombre: string;
  /** Lo que la IA sabe para contestarle a los clientes (texto libre). */
  info: string;
  topeUsd: number;
  porHora: number;
  marca: string;
  esperaSeg: number;
};

export const CONFIG_DEFECTO: ConfigMensajes = {
  iaActiva: true, nombre: "Estela", info: "", topeUsd: 20, porHora: 15, marca: MARCA_POR_DEFECTO, esperaSeg: 12,
};

const numero = (v: unknown, def: number, min = 0, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
};

export async function configMensajes(org: string): Promise<ConfigMensajes> {
  const r = await una<{ valor: Partial<ConfigMensajes> }>(
    "select valor from config_org where organizacion_id = $1 and clave = 'mensajes'", [org]).catch(() => null);
  const v = r?.valor ?? {};
  return {
    iaActiva: typeof v.iaActiva === "boolean" ? v.iaActiva : CONFIG_DEFECTO.iaActiva,
    nombre: typeof v.nombre === "string" && v.nombre.trim() ? v.nombre.trim() : CONFIG_DEFECTO.nombre,
    info: typeof v.info === "string" ? v.info : CONFIG_DEFECTO.info,
    topeUsd: numero(v.topeUsd, CONFIG_DEFECTO.topeUsd),
    porHora: numero(v.porHora, CONFIG_DEFECTO.porHora, 1, 200),
    marca: typeof v.marca === "string" && v.marca.trim() ? v.marca.trim() : CONFIG_DEFECTO.marca,
    esperaSeg: numero(v.esperaSeg, CONFIG_DEFECTO.esperaSeg, 0, 40),
  };
}

export async function guardarConfigMensajes(org: string, c: ConfigMensajes) {
  await consulta(`
    insert into config_org (organizacion_id, clave, valor) values ($1, 'mensajes', $2::jsonb)
    on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`,
  [org, JSON.stringify(c)]);
}

/** Lo que gastó la IA de los mensajes este mes (hora argentina), en dólares. */
export async function gastoMensajesDelMes(org: string): Promise<number> {
  const r = await una<{ usd: number }>(`
    select coalesce(sum(usd), 0)::float usd from chat_mensaje
     where organizacion_id = $1 and clase = 'ia'
       and ts >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'`, [org]);
  return r?.usd ?? 0;
}
