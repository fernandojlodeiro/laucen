// La API de WhatsApp de Meta (Cloud API), copiada de CadaMes (lib/meta.ts,
// lib/meta-url.ts, lib/whatsapp.ts) y adaptada:
//   · Se usa la app de Meta de CadaMes, que ya está aprobada para el alta
//     embebida con coexistencia: META_APP_ID, META_APP_SECRET, META_ES_CONFIG_ID.
//   · Cada cuenta conectada desde Laucen se suscribe con su propia dirección de
//     entrega (override_callback_uri), así sus mensajes llegan a Laucen y no a
//     la dirección de la app (la de CadaMes).
//   · A diferencia de CadaMes, acá SÍ se verifica la firma de cada aviso
//     (X-Hub-Signature-256): sin eso cualquiera podía inventar mensajes.
// Los errores de Meta van al log, nunca a una pantalla.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GRAPH_VERSION = "v25.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

const appId = () => process.env.META_APP_ID?.trim() ?? "";
const appSecret = () => process.env.META_APP_SECRET?.trim() ?? "";
const configId = () => process.env.META_ES_CONFIG_ID?.trim() ?? "";

/** ¿Está la app de Meta cargada como para ofrecer "Conectar WhatsApp"? */
export const hayAppDeMeta = () => !!(appId() && appSecret() && configId());

type Resp = { ok: boolean; status: number; data: Record<string, unknown> };

async function pedir(url: string, init?: RequestInit): Promise<Resp> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

/** El error de Meta, para el log. */
export function motivoCrudo(r: Resp): string {
  const e = r.data?.error as { message?: string; code?: number } | undefined;
  return e?.message ? `${e.code ?? ""} ${e.message}`.trim() : `graph_${r.status}`;
}

// ── Firma de los avisos (webhook) ────────────────────────────────────
/** ¿El aviso viene de Meta? Compara X-Hub-Signature-256 con el HMAC del cuerpo crudo. */
export function firmaValida(cuerpo: string, firma: string | null): boolean {
  const secreto = appSecret();
  if (!secreto || !firma?.startsWith("sha256=")) return false;
  const esperada = createHmac("sha256", secreto).update(cuerpo, "utf8").digest("hex");
  const a = Buffer.from(firma.slice(7), "hex"), b = Buffer.from(esperada, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── El "state" del alta: firmado para que nadie conecte un número a otra organización ─
export function firmarEstado(datos: Record<string, string>, segundos = 3600): string {
  const cuerpo = Buffer.from(JSON.stringify({ ...datos, vence: Date.now() + segundos * 1000 })).toString("base64url");
  const firma = createHmac("sha256", appSecret()).update(cuerpo).digest("base64url");
  return `${cuerpo}.${firma}`;
}

export function verificarEstado(estado: string): Record<string, string> | null {
  const [cuerpo, firma] = estado.split(".");
  if (!cuerpo || !firma || !appSecret()) return null;
  const esperada = createHmac("sha256", appSecret()).update(cuerpo).digest("base64url");
  const a = Buffer.from(firma), b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as Record<string, string> & { vence: number };
    return Number(d.vence) > Date.now() ? d : null;
  } catch { return null; }
}

export const claveNueva = () => randomBytes(24).toString("hex");

// ── Alta embebida (Embedded Signup) con coexistencia ─────────────────
export function urlDeAlta({ redirectUri, estado, coexistencia, movil }: {
  redirectUri: string; estado: string; coexistencia: boolean; movil: boolean;
}): string {
  const qs = new URLSearchParams({
    client_id: appId(), config_id: configId(), response_type: "code", override_default_response_type: "true",
    redirect_uri: redirectUri, state: estado,
  });
  if (movil) qs.set("display", "touch");
  if (coexistencia) qs.set("extras", JSON.stringify({ featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" }));
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${qs}`;
}

export const esMovil = (ua: string | null | undefined) => !!ua && /Mobi|Tablet|iPad/i.test(ua);

/** Cambia el `code` del alta por el token. El redirect_uri tiene que ser idéntico al del pedido. */
export async function canjearCodigo(code: string, redirectUri: string): Promise<{ token: string; expiraEl: string }> {
  const qs = new URLSearchParams({ client_id: appId(), client_secret: appSecret(), code, redirect_uri: redirectUri });
  const r = await pedir(`${GRAPH}/oauth/access_token?${qs}`);
  const token = String(r.data?.access_token ?? "");
  if (!r.ok || !token) throw new Error(`canje: ${motivoCrudo(r)}`);
  const seg = Number(r.data?.expires_in ?? 0);
  return { token, expiraEl: seg > 0 ? new Date(Date.now() + seg * 1000).toISOString() : "" };
}

/** Sobre qué cuentas de WhatsApp (WABA) nos dieron permiso, y cuándo vence el token. */
export async function datosDelToken(token: string): Promise<{ expiraEl: string; wabas: string[] } | null> {
  const qs = new URLSearchParams({ input_token: token, access_token: `${appId()}|${appSecret()}` });
  const r = await pedir(`${GRAPH}/debug_token?${qs}`);
  if (!r.ok) { console.warn("[wa-debug-token]", motivoCrudo(r)); return null; }
  const d = (r.data?.data ?? {}) as { expires_at?: number; granular_scopes?: { scope?: string; target_ids?: string[] }[] };
  const wabas = new Set<string>();
  for (const s of d.granular_scopes ?? []) {
    if (s.scope !== "whatsapp_business_management" && s.scope !== "whatsapp_business_messaging") continue;
    for (const id of s.target_ids ?? []) if (id) wabas.add(String(id));
  }
  const vence = Number(d.expires_at ?? 0);
  return { expiraEl: vence > 0 ? new Date(vence * 1000).toISOString() : "", wabas: [...wabas] };
}

export async function numerosDeLaWaba(wabaId: string, token: string): Promise<{ id: string; numero: string; nombre: string }[]> {
  const r = await pedir(`${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`numeros: ${motivoCrudo(r)}`);
  return ((r.data?.data ?? []) as { id?: string; display_phone_number?: string; verified_name?: string }[])
    .map((f) => ({ id: String(f.id ?? ""), numero: f.display_phone_number ?? "", nombre: f.verified_name ?? "" }))
    .filter((n) => n.id);
}

/** Suscribe la app a los avisos de la cuenta, con la dirección de entrega de
 *  Laucen. Meta verifica la dirección en el momento (GET con verify_token). */
export async function suscribirApp(wabaId: string, token: string, direccion: string, verifyToken: string): Promise<void> {
  const r = await pedir(`${GRAPH}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ override_callback_uri: direccion, verify_token: verifyToken }),
  });
  if (!r.ok) throw new Error(`suscribir: ${motivoCrudo(r)}`);
}

/** Registra el número en la Cloud API (sólo sin coexistencia: con
 *  coexistencia el número ya está registrado en la app del teléfono). */
export async function registrarNumero(phoneNumberId: string, token: string): Promise<boolean> {
  const pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  const r = await pedir(`${GRAPH}/${phoneNumberId}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  if (!r.ok) console.warn("[wa-registrar]", phoneNumberId, motivoCrudo(r));
  return r.ok;
}

// ── Mandar ───────────────────────────────────────────────────────────
export type CuentaWa = { token: string; phoneNumberId: string };

/** Texto libre: sólo dentro de las 24 h desde el último mensaje del cliente.
 *  `para` es el wa_id que mandó Meta (así se le contesta tal cual). */
export async function enviarTexto(cuenta: CuentaWa, para: string, texto: string): Promise<{ ok: true; wamid: string | null } | { ok: false; motivo: string; codigo: number | null }> {
  const r = await pedir(`${GRAPH}/${cuenta.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cuenta.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "text", text: { preview_url: true, body: texto.slice(0, 4096) } }),
  });
  if (!r.ok) {
    const codigo = Number((r.data?.error as { code?: number } | undefined)?.code ?? 0) || null;
    console.error("[wa-enviar]", cuenta.phoneNumberId, motivoCrudo(r));
    return { ok: false, motivo: motivoEnvio(codigo), codigo };
  }
  const wamid = ((r.data?.messages ?? []) as { id?: string }[])[0]?.id ?? null;
  return { ok: true, wamid };
}

/** El motivo de un envío o una entrega fallida, en criollo. */
export function motivoEnvio(codigo: number | null | undefined): string {
  switch (codigo) {
    case 131047: return "Pasaron más de 24 horas desde el último mensaje del cliente: escribile desde el teléfono.";
    case 131042: return "La cuenta de WhatsApp no tiene un medio de pago cargado en Meta.";
    case 131026: return "Ese número no puede recibir el mensaje (no tiene WhatsApp o tiene una versión vieja).";
    case 131056: return "Se le mandaron demasiados mensajes seguidos a este cliente: esperá un momento.";
    case 190: return "Se venció el permiso de WhatsApp: hay que volver a conectar el número.";
    case 130429: case 131048: return "WhatsApp está frenando los envíos: probá de nuevo en un rato.";
    default: return "WhatsApp no aceptó el mensaje.";
  }
}
