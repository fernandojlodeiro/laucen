// Los interruptores "Responde sola la IA" de Preguntas y de Mensajes (Fer,
// 5/10): generales de la organización, en config_org (clave
// 'ml_respuesta_auto'). Qué se manda solo y qué no: lib/mercadolibre/sugerencia.ts.

import { una, consulta } from "@/lib/erp/base";

export type RespuestaAuto = { preguntas: boolean; mensajes: boolean };

/** Los dos interruptores de la organización (apagados si no se tocaron). */
export async function respuestaAuto(org: string): Promise<RespuestaAuto> {
  const r = await una<{ valor: Partial<RespuestaAuto> }>(
    "select valor from config_org where organizacion_id = $1 and clave = 'ml_respuesta_auto'", [org]).catch(() => null);
  return { preguntas: r?.valor?.preguntas === true, mensajes: r?.valor?.mensajes === true };
}

export async function guardarRespuestaAuto(org: string, cual: keyof RespuestaAuto, prendido: boolean) {
  const v = { ...(await respuestaAuto(org)), [cual]: prendido };
  await consulta(`
    insert into config_org (organizacion_id, clave, valor) values ($1, 'ml_respuesta_auto', $2::jsonb)
    on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`,
  [org, JSON.stringify(v)]);
}
