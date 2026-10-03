// La configuración del asistente de cada organización (config_org, clave
// 'asistente'): cómo se llama, si se ve la carita o el signo de pregunta, si
// contesta preguntas fuera del sistema (con búsqueda en internet) y el tope
// de gasto por mes en dólares. Se cambia en Configuración → Asistente.

import { consulta, una } from "@/lib/erp/base";

export type ConfigAsistente = { nombre: string; carita: boolean; fueraDelSistema: boolean; topeUsd: number };

export const CONFIG_DEFECTO: ConfigAsistente = { nombre: "Asistente", carita: true, fueraDelSistema: false, topeUsd: 20 };

export async function configAsistente(org: string): Promise<ConfigAsistente> {
  const r = await una<{ valor: Partial<ConfigAsistente> }>(
    "select valor from config_org where organizacion_id = $1 and clave = 'asistente'", [org]).catch(() => null);
  const v = r?.valor ?? {};
  return {
    nombre: typeof v.nombre === "string" && v.nombre.trim() ? v.nombre.trim() : CONFIG_DEFECTO.nombre,
    carita: typeof v.carita === "boolean" ? v.carita : CONFIG_DEFECTO.carita,
    fueraDelSistema: typeof v.fueraDelSistema === "boolean" ? v.fueraDelSistema : CONFIG_DEFECTO.fueraDelSistema,
    topeUsd: Number.isFinite(Number(v.topeUsd)) && Number(v.topeUsd) >= 0 ? Number(v.topeUsd) : CONFIG_DEFECTO.topeUsd,
  };
}

export async function guardarConfigAsistente(org: string, c: ConfigAsistente) {
  await consulta(`
    insert into config_org (organizacion_id, clave, valor) values ($1, 'asistente', $2::jsonb)
    on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`,
  [org, JSON.stringify(c)]);
}

/** Lo gastado este mes (hora argentina), en dólares. */
export async function gastoDelMes(org: string): Promise<number> {
  const r = await una<{ usd: number }>(`
    select coalesce(sum(usd), 0)::float usd from asistente_mensaje
     where organizacion_id = $1
       and ts >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'`, [org]);
  return r?.usd ?? 0;
}
