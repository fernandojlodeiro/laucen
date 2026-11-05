// La llave de Market Pro de cada organización (mpro_llave): nunca se muestra, sólo si hay o no (AGENTS.md).

import { consulta, una } from "@/lib/erp/base";
import { probarLlaveMarketPro } from "./api";
import { llamarMotor, planInicial } from "./motor";

export type EstadoMotor = {
  cargada: string | null; pausado: boolean; trabajando: boolean; ultimoLatido: string | null; error: string | null; errorTs: string | null;
};

export async function estadoMarketPro(org: string): Promise<EstadoMotor | null> {
  return una<EstadoMotor>(`
    select to_char(cargada_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY') cargada, pausado,
           coalesce(motor_hasta > now(), false) trabajando,
           to_char(motor_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') "ultimoLatido",
           ultimo_error error, to_char(ultimo_error_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') "errorTs"
      from mpro_llave where organizacion_id = $1`, [org]);
}

/** Prueba la llave y, si anda, la graba y arranca la descarga. Devuelve el motivo en criollo si no sirve. */
export async function cargarLlave(org: string, llave: string, usuarioId: string): Promise<string | null> {
  const motivo = await probarLlaveMarketPro(llave);
  if (motivo) return motivo;
  await consulta(`insert into mpro_llave (organizacion_id, llave, usuario_id) values ($1, $2, $3)
                  on conflict (organizacion_id) do update set llave = excluded.llave, usuario_id = excluded.usuario_id, cargada_ts = now(),
                     pausado = false, ultimo_error = null, ultimo_error_ts = null`, [org, llave, usuarioId]);
  // Lo que quedó con error por la llave anterior vuelve a la cola.
  await consulta("update mpro_descarga set estado = 'pendiente', intentos = 0, error = null where organizacion_id = $1 and estado = 'error'", [org]);
  await planInicial(org);
  await llamarMotor(org);
  return null;
}

export async function borrarLlave(org: string): Promise<void> {
  await consulta("delete from mpro_llave where organizacion_id = $1", [org]);
}

/** Pausar o seguir la descarga. Al seguir, lo que dio error vuelve a probarse. */
export async function pausarMotor(org: string, pausar: boolean): Promise<void> {
  await consulta("update mpro_llave set pausado = $2 where organizacion_id = $1", [org, pausar]);
  if (!pausar) {
    await consulta("update mpro_descarga set estado = 'pendiente', intentos = 0 where organizacion_id = $1 and estado = 'error'", [org]);
    await llamarMotor(org);
  }
}
