// El clic en WhatsApp a Google Analytics desde el servidor (Measurement Protocol; Cowork, 27/10, bitácora #924): desde el
// navegador, el evento «whatsapp_click» no le llegaba a GA4 —el visitante se va a WhatsApp en el mismo toque y la
// etiqueta no alcanza a mandarlo—, mientras que Laucen sí ve cada clic al pasar por /whatsapp. Va por dominio: el ID de
// Google Analytics de Configuración › Tienda web › Publicidad (Google prendido) y su clave secreta (ga4_mp_credencial).
// Con la clave cargada, el navegador ya no lo manda (lo contaría dos veces). Lleva el client_id de la galleta _ga, así
// GA4 lo pega a la visita que venía siguiendo. Nunca tira ni muestra nada: un rechazo de Google va al log.

import { randomInt } from "node:crypto";
import { una } from "@/lib/erp/base";
import { destinoDeHost } from "@/lib/tienda/dominios-tienda";
import { publicidadDe } from "@/lib/tienda/publicidad";

export const SECRETO_GA4 = /^[\w-]{10,60}$/;

/** El ID de GA4 y la clave de ese dominio, o null si no está todo (entonces lo manda el navegador). */
export async function credencialGa4(host: string | null | undefined): Promise<{ medicion: string; secreto: string } | null> {
  const dominio = host?.split(":")[0].toLowerCase();
  if (!dominio) return null;
  const d = await destinoDeHost(dominio).catch(() => null);
  if (!d) return null;
  const p = publicidadDe(d.publicidad);
  if (!p.google.activo || !p.google.ga4_id) return null;
  const k = await una<{ secreto: string }>(
    "select k.secreto from ga4_mp_credencial k join tienda_dominio t on t.id = k.dominio_id where t.dominio = $1", [dominio]).catch(() => null);
  return k ? { medicion: p.google.ga4_id, secreto: k.secreto } : null;
}

/** El client_id de la galleta _ga («GA1.1.123456789.1700000000» → «123456789.1700000000»). */
export function clientIdDe(galleta: string | null | undefined): string | null {
  const m = /^GA\d\.\d\.(\d+\.\d+)$/.exec(galleta ?? "");
  return m ? m[1] : null;
}

/** El id de la sesión de la galleta _ga_<ID> (formato viejo «GS1.1.1700000000.3…» o nuevo «GS2.1.s1700000000$o3…»). */
export function sesionDe(galleta: string | null | undefined): string | null {
  const m = /^GS1\.\d\.(\d+)\./.exec(galleta ?? "") ?? /^GS2\.\d\.s(\d+)/.exec(galleta ?? "");
  return m ? m[1] : null;
}

/** galleta: lee una galleta del visitante (la _ga y la de la sesión, _ga_<ID sin «G-»>). */
export type EventoGa4 = { nombre: string; galleta: (nombre: string) => string | null | undefined; params: Record<string, string | number> };

/** Un id de visitante como el de la etiqueta, para quien no tiene la galleta (un bloqueador la corta). */
const clientIdNuevo = () => `${randomInt(1e9, 2 ** 31 - 1)}.${Math.floor(Date.now() / 1000)}`;

export async function enviarAGa4(host: string | null | undefined, e: EventoGa4): Promise<boolean> {
  try {
    const c = await credencialGa4(host);
    if (!c) return false;
    const sesion = sesionDe(e.galleta(`_ga_${c.medicion.slice(2)}`));
    const res = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(c.medicion)}&api_secret=${encodeURIComponent(c.secreto)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        client_id: clientIdDe(e.galleta("_ga")) ?? clientIdNuevo(),
        // engagement_time_msec y session_id: sin ellos, GA4 no lo muestra en Tiempo real ni lo pega a la sesión.
        events: [{ name: e.nombre, params: { ...e.params, engagement_time_msec: 1, ...(sesion ? { session_id: sesion } : {}) } }],
      }),
    });
    if (!res.ok) console.error("[ga4-mp] Google rechazó", e.nombre, res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (err) {
    console.error("[ga4-mp] no se pudo mandar", e.nombre, err instanceof Error ? err.message : err);
    return false;
  }
}
