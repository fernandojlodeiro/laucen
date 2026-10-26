// La API de conversiones de Meta (Fer, 26/10): la compra y el clic en WhatsApp le llegan a Meta desde Laucen, aunque el
// navegador del visitante corte el píxel. Va por dominio: el píxel de Configuración › Tienda web › Publicidad › Meta
// (prendido) y su token (meta_capi_credencial). Cada evento lleva el mismo id que el del píxel, así Meta lo cuenta una
// sola vez si le llegan los dos. Los datos del comprador van cifrados (SHA-256), como pide Meta.
// Nunca tira ni muestra nada: un rechazo de Meta va al log.

import { createHash } from "node:crypto";
import { una } from "@/lib/erp/base";
import { GRAPH } from "@/lib/mensajes/meta";
import { destinoDeHost } from "@/lib/tienda/dominios-tienda";
import { publicidadDe } from "@/lib/tienda/publicidad";

const sha = (x: string) => createHash("sha256").update(x).digest("hex");

/** El mail y el teléfono como los pide Meta antes de cifrarlos: minúsculas sin espacios; sólo dígitos, con 54. */
export function datosParaMeta(email: string | null | undefined, telefono: string | null | undefined): { em?: string[]; ph?: string[] } {
  const em = (email ?? "").trim().toLowerCase();
  let ph = (telefono ?? "").replace(/\D/g, "");
  if (ph && !ph.startsWith("54")) ph = `54${ph.replace(/^0/, "")}`;
  return { ...(em.includes("@") ? { em: [sha(em)] } : {}), ...(ph.length >= 10 ? { ph: [sha(ph)] } : {}) };
}

/** El fbc que pide Meta: la galleta _fbc del píxel o, si no está, armado con el fbclid del link del anuncio. */
export function fbcDe(galletaFbc: string | null | undefined, fbclid: string | null | undefined, ts: string | null | undefined): string | null {
  if (galletaFbc) return galletaFbc;
  return fbclid ? `fb.1.${ts ? new Date(ts).getTime() : Date.now()}.${fbclid}` : null;
}

export type EventoMeta = {
  nombre: "Purchase" | "Contact"; id: string; url: string;
  valor?: number; moneda?: string; productos?: string[]; pedido?: string;
  email?: string | null; telefono?: string | null; ip?: string | null; navegador?: string | null; fbp?: string | null; fbc?: string | null;
};

/** El píxel y el token de ese dominio, o null si no está todo (entonces no se manda nada). */
async function credencialDe(host: string): Promise<{ pixel: string; token: string } | null> {
  const d = await destinoDeHost(host.split(":")[0].toLowerCase()).catch(() => null);
  if (!d) return null;
  const p = publicidadDe(d.publicidad);
  if (!p.meta.activo || !p.meta.pixel_id) return null;
  const k = await una<{ token: string }>(
    "select k.token from meta_capi_credencial k join tienda_dominio t on t.id = k.dominio_id where t.dominio = $1", [host.split(":")[0].toLowerCase()]).catch(() => null);
  return k ? { pixel: p.meta.pixel_id, token: k.token } : null;
}

export async function enviarAMeta(host: string | null | undefined, e: EventoMeta): Promise<boolean> {
  if (!host) return false;
  try {
    const c = await credencialDe(host);
    if (!c) return false;
    const evento = {
      event_name: e.nombre, event_time: Math.floor(Date.now() / 1000), event_id: e.id, action_source: "website", event_source_url: e.url,
      user_data: {
        ...datosParaMeta(e.email, e.telefono),
        ...(e.ip ? { client_ip_address: e.ip } : {}), ...(e.navegador ? { client_user_agent: e.navegador } : {}),
        ...(e.fbp ? { fbp: e.fbp } : {}), ...(e.fbc ? { fbc: e.fbc } : {}),
      },
      custom_data: {
        ...(e.valor != null ? { value: e.valor, currency: e.moneda ?? "ARS" } : {}),
        ...(e.productos?.length ? { content_ids: e.productos, content_type: "product" } : {}),
        ...(e.pedido ? { order_id: e.pedido } : {}),
      },
    };
    const r = await fetch(`${GRAPH}/${c.pixel}/events`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: [evento], access_token: c.token }), cache: "no-store",
    });
    if (!r.ok) { console.error("[meta-capi]", e.nombre, r.status, (await r.text().catch(() => "")).slice(0, 300)); return false; }
    return true;
  } catch (err) { console.error("[meta-capi]", e.nombre, err); return false; }
}
