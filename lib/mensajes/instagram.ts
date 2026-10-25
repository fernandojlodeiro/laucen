// Instagram en la bandeja de Mensajes (Fer, 25/10), copiado de CadaMes (lib/meta-ig-login.ts, la «forma A»: la cuenta
// de Instagram del negocio se conecta con su propio inicio de sesión de Instagram, sin Facebook).
//
// La app de Meta es de Laucen y aparte de la de WhatsApp: los avisos de Instagram van a UNA dirección por app (no hay
// una por cuenta, como en WhatsApp), así que la de CadaMes no sirve. Su id, su clave secreta y la clave de verificación
// van en ig_app_credencial (las carga el dueño del sistema en Ventas › Mensajes › Configuración) o, si están, en las
// variables META_IG_APP_ID / META_IG_APP_SECRET.
//
// Lo que se hace con Meta:
//   · conectar: el diálogo de Instagram → código → token corto → token largo (60 días) → el id de la cuenta → suscribir
//     la cuenta a los mensajes con su propio token (sin esto Meta no manda nada: la primera prueba de CadaMes lo
//     encontró) → guardar en ig_credencial;
//   · recibir: el aviso firmado con la clave secreta de la app (app/api/instagram/webhook);
//   · mandar: POST graph.instagram.com/<v>/<id de la cuenta>/messages con el token de la cuenta;
//   · renovar el token cuando le quedan menos de 20 días (lo corre la tarea periódica).
// Los errores de Meta van al log, nunca a una pantalla.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { consulta, una } from "@/lib/erp/base";
import { GRAPH_VERSION } from "./meta";

const AUTORIZAR = "https://www.instagram.com/oauth/authorize";
const TOKEN_CORTO = "https://api.instagram.com/oauth/access_token";
const GRAPH_IG = "https://graph.instagram.com";
const GRAPH_IG_V = `${GRAPH_IG}/${GRAPH_VERSION}`;
const SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"];

export type AppInstagram = { appId: string; appSecret: string; verifyToken: string };

/** La app de Meta de Instagram: las variables de Vercel si están; si no, la cargada en la pantalla. */
export async function appInstagram(): Promise<AppInstagram | null> {
  const id = process.env.META_IG_APP_ID?.trim(), secreto = process.env.META_IG_APP_SECRET?.trim();
  const fila = await una<{ app_id: string; app_secret: string; verify_token: string }>("select app_id, app_secret, verify_token from ig_app_credencial where id = 1").catch(() => null);
  if (id && secreto) return { appId: id, appSecret: secreto, verifyToken: fila?.verify_token ?? "" };
  return fila ? { appId: fila.app_id, appSecret: fila.app_secret, verifyToken: fila.verify_token } : null;
}

/** La clave para verificar la dirección de los avisos: se inventa la primera vez (aunque todavía no esté la app). */
export async function claveDeVerificacion(): Promise<string> {
  const f = await una<{ verify_token: string }>("select verify_token from ig_app_credencial where id = 1");
  if (f) return f.verify_token;
  const nueva = randomBytes(18).toString("hex");
  await consulta("insert into ig_app_credencial (id, app_id, app_secret, verify_token) values (1, '', '', $1) on conflict (id) do nothing", [nueva]);
  return (await una<{ verify_token: string }>("select verify_token from ig_app_credencial where id = 1"))!.verify_token;
}

export async function guardarAppInstagram(appId: string, appSecret: string | null): Promise<void> {
  await claveDeVerificacion();
  await consulta(`update ig_app_credencial set app_id = $1, app_secret = coalesce(nullif($2, ''), app_secret), actualizado_ts = now() where id = 1`,
    [appId.trim(), (appSecret ?? "").trim()]);
}

export const hayAppInstagram = (a: AppInstagram | null): a is AppInstagram => !!(a?.appId && a.appSecret);

type Resp = { ok: boolean; status: number; data: Record<string, unknown> };
async function pedir(url: string, init?: RequestInit): Promise<Resp> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}
export function motivoCrudo(r: Resp): string {
  const e = r.data?.error as { message?: string; error_message?: string; code?: number } | undefined;
  const msg = e?.error_message ?? e?.message ?? (r.data?.error_message as string | undefined);
  return msg ? `${e?.code ?? ""} ${msg}`.trim() : `graph_${r.status}`;
}

/** ¿El aviso viene de Meta? X-Hub-Signature-256 con la clave secreta de la app de Instagram. */
export function firmaInstagramValida(cuerpo: string, firma: string | null, appSecret: string): boolean {
  if (!appSecret || !firma?.startsWith("sha256=")) return false;
  const esperada = createHmac("sha256", appSecret).update(cuerpo, "utf8").digest("hex");
  const a = Buffer.from(firma.slice(7), "hex"), b = Buffer.from(esperada, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function urlDeConexion(app: AppInstagram, redirectUri: string, estado: string): string {
  const qs = new URLSearchParams({ client_id: app.appId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(","), state: estado });
  return `${AUTORIZAR}?${qs}`;
}

/** Conecta la cuenta que acaba de dar permiso: devuelve el motivo para la pantalla («ok» o qué falló). */
export async function conectarCuenta(org: string, app: AppInstagram, code: string, redirectUri: string): Promise<"ok" | "canje" | "cuenta" | "suscribir" | "otra_org"> {
  // El código por el token corto (vale una hora y un solo uso).
  const c = await pedir(TOKEN_CORTO, { method: "POST", body: new URLSearchParams({
    client_id: app.appId, client_secret: app.appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code }) });
  const corto = String(c.data?.access_token ?? "");
  if (!c.ok || !corto) { console.error("[ig-alta] canje", motivoCrudo(c)); return "canje"; }
  // El corto por el largo (60 días).
  const l = await pedir(`${GRAPH_IG}/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: app.appSecret, access_token: corto })}`);
  const token = String(l.data?.access_token ?? "");
  if (!l.ok || !token) { console.error("[ig-alta] token largo", motivoCrudo(l)); return "canje"; }
  const expira = Number(l.data?.expires_in ?? 0) > 0 ? new Date(Date.now() + Number(l.data?.expires_in) * 1000).toISOString() : null;
  // El id de la cuenta que llega en los avisos (user_id, no el id de /me).
  const me = await pedir(`${GRAPH_IG_V}/me?${new URLSearchParams({ fields: "user_id,username", access_token: token })}`);
  const igUserId = String(me.data?.user_id ?? "");
  if (!me.ok || !igUserId) { console.error("[ig-alta] cuenta", motivoCrudo(me)); return "cuenta"; }
  const otra = await una("select 1 from ig_credencial where ig_user_id = $1 and organizacion_id <> $2 and estado = 'activo'", [igUserId, org]);
  if (otra) return "otra_org";
  // Que Meta le mande los mensajes de esta cuenta.
  const s = await pedir(`${GRAPH_IG_V}/me/subscribed_apps?${new URLSearchParams({ subscribed_fields: "messages", access_token: token })}`, { method: "POST" });
  if (!s.ok) { console.error("[ig-alta] suscribir", motivoCrudo(s)); return "suscribir"; }
  await consulta("update ig_credencial set estado = 'desconectado' where organizacion_id = $1 and ig_user_id <> $2", [org, igUserId]);
  await consulta(`
    insert into ig_credencial (organizacion_id, ig_user_id, usuario, token, expira_el) values ($1, $2, $3, $4, $5)
    on conflict (ig_user_id) do update set organizacion_id = excluded.organizacion_id, usuario = excluded.usuario, token = excluded.token,
      expira_el = excluded.expira_el, estado = 'activo', conectado_ts = now()`,
  [org, igUserId, String(me.data?.username ?? ""), token, expira]);
  return "ok";
}

export type CuentaInstagram = { organizacionId: string; igUserId: string; usuario: string; token: string; expiraEl: string | null };
const SQL_CUENTA = `select organizacion_id "organizacionId", ig_user_id "igUserId", usuario, token, expira_el::text "expiraEl" from ig_credencial`;
export const cuentaDeId = (igUserId: string) => una<CuentaInstagram>(`${SQL_CUENTA} where ig_user_id = $1 and estado = 'activo'`, [igUserId]);
export const cuentaDeOrg = (org: string) => una<CuentaInstagram>(`${SQL_CUENTA} where organizacion_id = $1 and estado = 'activo' order by conectado_ts desc limit 1`, [org]);

export async function desconectar(org: string): Promise<void> {
  await consulta("update ig_credencial set estado = 'desconectado' where organizacion_id = $1", [org]);
}

/** El @usuario y el nombre de quien escribe (para la lista). */
export async function perfil(cuenta: CuentaInstagram, igsid: string): Promise<string> {
  const r = await pedir(`${GRAPH_IG_V}/${igsid}?${new URLSearchParams({ fields: "username,name", access_token: cuenta.token })}`).catch(() => null);
  if (!r?.ok) return "";
  const u = r.data?.username ? `@${r.data.username}` : "";
  return [r.data?.name as string | undefined, u].filter(Boolean).join(" ");
}

/** Manda un mensaje de texto. Devuelve el id del mensaje (para no duplicarlo cuando vuelve como eco). */
export async function enviarInstagram(cuenta: CuentaInstagram, igsid: string, texto: string): Promise<{ ok: true; mid: string | null } | { ok: false; motivo: string }> {
  const r = await pedir(`${GRAPH_IG_V}/${cuenta.igUserId}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${cuenta.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: igsid }, message: { text: texto.slice(0, 1000) } }),
  });
  if (r.ok) return { ok: true, mid: (r.data?.message_id as string | undefined) ?? null };
  console.error("[ig-envio]", motivoCrudo(r));
  return { ok: false, motivo: r.status === 400 ? "Instagram no dejó mandarlo (puede que hayan pasado más de 24 horas desde su último mensaje)." : "Instagram no contestó: probá de nuevo en un rato." };
}

/** Renueva los tokens a los que les quedan menos de 20 días (el de Instagram dura 60). Nunca tira. */
export async function renovarTokensInstagram(): Promise<number> {
  const viejas = await consulta<{ id: string; token: string }>(
    "select id::text, token from ig_credencial where estado = 'activo' and (expira_el is null or expira_el < now() + interval '20 days') and conectado_ts < now() - interval '1 day'").catch(() => []);
  let n = 0;
  for (const c of viejas) {
    const r = await pedir(`${GRAPH_IG}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: c.token })}`).catch(() => null);
    const nuevo = String(r?.data?.access_token ?? "");
    if (!r?.ok || !nuevo) { if (r) console.error("[ig-renovar]", motivoCrudo(r)); continue; }
    const seg = Number(r.data?.expires_in ?? 0);
    await consulta("update ig_credencial set token = $2, expira_el = $3 where id = $1", [c.id, nuevo, seg > 0 ? new Date(Date.now() + seg * 1000).toISOString() : null]);
    n++;
  }
  return n;
}

// ── Lo que trae el aviso ──────────────────────────────────────────────
export type AvisoInstagram = {
  object?: string;
  entry?: { id?: string; messaging?: {
    sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number;
    message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean; attachments?: { type?: string }[]; referral?: unknown };
    /** El anuncio, cuando escribió desde un anuncio (va suelto o adentro del mensaje). */
    referral?: unknown;
  }[] }[];
};

export type MensajeInstagram = { cuenta: string; persona: string; eco: boolean; mid: string | null; texto: string; referral?: unknown };

/** Cada mensaje del aviso, en limpio: de quién (la persona), a qué cuenta, si es un eco (lo mandó la cuenta), el texto y
 *  el anuncio si vino de uno. Un aviso sólo de anuncio (abrió la charla desde un anuncio, sin mensaje) va con texto vacío. Puro. */
export function mensajesDelAviso(a: AvisoInstagram): MensajeInstagram[] {
  const out: MensajeInstagram[] = [];
  for (const e of a.entry ?? []) {
    for (const m of e.messaging ?? []) {
      if (!m.message && m.referral && m.sender?.id && (m.recipient?.id ?? e.id)) {
        out.push({ cuenta: (m.recipient?.id ?? e.id)!, persona: m.sender.id, eco: false, mid: null, texto: "", referral: m.referral });
        continue;
      }
      if (!m.message || m.message.is_deleted) continue;
      const eco = !!m.message.is_echo;
      const persona = eco ? m.recipient?.id : m.sender?.id;
      const cuenta = eco ? m.sender?.id ?? e.id : m.recipient?.id ?? e.id;
      if (!persona || !cuenta) continue;
      const adj = m.message.attachments?.[0]?.type;
      const texto = m.message.text?.trim()
        || (adj === "image" ? "📷 (mandó una foto)" : adj === "video" ? "🎬 (mandó un video)" : adj === "audio" ? "🎤 (mandó un audio)" : adj ? "(mandó un adjunto)" : "");
      if (!texto) continue;
      const referral = m.referral ?? m.message.referral;
      out.push({ cuenta, persona, eco, mid: m.message.mid ?? null, texto, ...(referral && !eco ? { referral } : {}) });
    }
  }
  return out;
}
