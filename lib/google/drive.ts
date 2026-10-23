// Google Drive (Fer, 23/10): cada organización conecta su Drive (OAuth de Google con la aplicación de Laucen, permiso
// "drive.file": Laucen sólo ve y toca lo que crea él) y Laucen le crea una carpeta para el contador, la comparte con
// su mail y sube ahí los archivos (los TXT del Libro de IVA Digital, en una subcarpeta por mes y razón social). Si un
// archivo con el mismo nombre ya está en esa subcarpeta, lo reemplaza (no duplica).
//
// La aplicación de Google (Client ID y Client Secret) es una para todo el sistema: la carga el dueño en /admin/google.
// La llave de cada organización (refresh_token) queda en google_drive y nunca se muestra.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { urlPanel } from "@/lib/tienda/dominios";

const AUTORIZAR = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const SUBIR = "https://www.googleapis.com/upload/drive/v3";
const CARPETA = "application/vnd.google-apps.folder";
export const RUTA_VUELTA = "/config/google-drive/callback";
export const ALCANCES = "openid email https://www.googleapis.com/auth/drive.file";

export const urlVuelta = () => `${urlPanel()}${RUTA_VUELTA}`;
export const urlCarpeta = (id: string) => `https://drive.google.com/drive/folders/${id}`;

export async function appGoogle(): Promise<{ clientId: string; secreto: string } | null> {
  const f = await una<{ client_id: string; client_secret: string }>("select client_id, client_secret from plataforma_google where id = 1").catch(() => null);
  return f?.client_id && f.client_secret ? { clientId: f.client_id, secreto: f.client_secret } : null;
}

export function urlDeAutorizacion(clientId: string, state: string) {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: urlVuelta(), response_type: "code", scope: ALCANCES, state,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true",
  });
  return `${AUTORIZAR}?${q}`;
}

export type ConexionDrive = { conectado: boolean; cuenta_email: string | null; carpeta_id: string | null; carpeta_nombre: string | null; compartida_con: string | null;
  conectado_ts: string | null; ultimo_envio_ts: string | null; ultimo_envio: string | null };

export async function conexionDrive(org: string): Promise<ConexionDrive> {
  const f = await una<ConexionDrive & { refresh_token: string | null }>(`select refresh_token, refresh_token is not null conectado, cuenta_email, carpeta_id, carpeta_nombre, compartida_con,
    conectado_ts::text, ultimo_envio_ts::text, ultimo_envio from google_drive where organizacion_id = $1`, [org]);
  if (!f) return { conectado: false, cuenta_email: null, carpeta_id: null, carpeta_nombre: null, compartida_con: null, conectado_ts: null, ultimo_envio_ts: null, ultimo_envio: null };
  const { refresh_token: _r, ...resto } = f;
  void _r;
  return resto;
}

/** El mail de la cuenta, del id_token que devuelve Google (viene firmado por Google por el canal directo: no hace
 *  falta verificar la firma para mostrarlo). */
function mailDelToken(idToken: string | undefined): string | null {
  try {
    const p = JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString("utf8"));
    return typeof p.email === "string" ? p.email : null;
  } catch { return null; }
}

/** La vuelta de Google: canjea el código por la llave y la guarda. Devuelve el mail de la cuenta conectada. */
export async function canjearCodigo(org: string, code: string): Promise<string> {
  const app = await appGoogle();
  if (!app) throw new ErrorErp("Falta cargar la aplicación de Google de Laucen.");
  const r = await fetch(TOKEN, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: app.clientId, client_secret: app.secreto, redirect_uri: urlVuelta(), grant_type: "authorization_code" }),
  });
  const j = await r.json().catch(() => ({})) as { refresh_token?: string; id_token?: string; error?: string; error_description?: string };
  if (!r.ok) throw new Error(`Google: ${j.error ?? r.status} ${j.error_description ?? ""}`);
  if (!j.refresh_token) throw new ErrorErp("Google no devolvió la llave para seguir subiendo. Sacale el acceso a Laucen en tu cuenta de Google y volvé a conectar.");
  const email = mailDelToken(j.id_token);
  await consulta(`insert into google_drive (organizacion_id, refresh_token, cuenta_email, conectado_ts) values ($1, $2, $3, now())
    on conflict (organizacion_id) do update set refresh_token = excluded.refresh_token, cuenta_email = excluded.cuenta_email, conectado_ts = now(), actualizado_ts = now()`,
    [org, j.refresh_token, email]);
  return email ?? "tu cuenta de Google";
}

export async function desconectarDrive(org: string) {
  const f = await una<{ refresh_token: string | null }>("select refresh_token from google_drive where organizacion_id = $1", [org]);
  if (f?.refresh_token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(f.refresh_token)}`, { method: "POST" }).catch(() => null);
  await consulta("update google_drive set refresh_token = null, cuenta_email = null, actualizado_ts = now() where organizacion_id = $1", [org]);
}

async function tokenDeAcceso(org: string): Promise<string> {
  const app = await appGoogle();
  const f = await una<{ refresh_token: string | null }>("select refresh_token from google_drive where organizacion_id = $1", [org]);
  if (!app || !f?.refresh_token) throw new ErrorErp("Google Drive no está conectado: conectalo en Configuración › Google Drive.");
  const r = await fetch(TOKEN, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: app.clientId, client_secret: app.secreto, refresh_token: f.refresh_token, grant_type: "refresh_token" }),
  });
  const j = await r.json().catch(() => ({})) as { access_token?: string; error?: string };
  if (!r.ok || !j.access_token) {
    if (j.error === "invalid_grant") throw new ErrorErp("Google sacó el permiso de Laucen sobre el Drive: volvé a conectarlo en Configuración › Google Drive.");
    throw new ErrorErp("Google no respondió. Probá de nuevo en un momento.");
  }
  return j.access_token;
}

async function api<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const j = await r.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } };
  if (!r.ok) {
    if (r.status === 404) throw new ErrorErp("La carpeta del contador ya no está en el Drive (¿la borraron?): creala de nuevo en Configuración › Google Drive.");
    throw new Error(`Google Drive ${r.status}: ${j.error?.message ?? ""}`);
  }
  return j;
}

const comillas = (t: string) => t.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function buscar(token: string, nombre: string, padre: string, carpeta: boolean) {
  const q = `name = '${comillas(nombre)}' and '${comillas(padre)}' in parents and trashed = false and mimeType ${carpeta ? "=" : "!="} '${CARPETA}'`;
  const r = await api<{ files: { id: string }[] }>(token, `${API}/files?${new URLSearchParams({ q, fields: "files(id)", spaces: "drive" })}`);
  return r.files[0]?.id ?? null;
}

async function crearCarpetaEn(token: string, nombre: string, padre: string | null) {
  const r = await api<{ id: string }>(token, `${API}/files?fields=id`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: nombre, mimeType: CARPETA, ...(padre ? { parents: [padre] } : {}) }),
  });
  return r.id;
}

/** Crea la carpeta del contador (en la raíz del Drive) y, si se da un mail, la comparte con él como editor (le llega
 *  un aviso de Google). Si ya había una carpeta creada, sólo la renombra y comparte. */
export async function prepararCarpeta(org: string, nombre: string, compartirCon: string | null) {
  const token = await tokenDeAcceso(org);
  const f = await una<{ carpeta_id: string | null }>("select carpeta_id from google_drive where organizacion_id = $1", [org]);
  let id = f?.carpeta_id ?? null;
  if (id) {
    const ok = await api<{ id: string; trashed: boolean }>(token, `${API}/files/${id}?fields=id,trashed`).catch(() => null);
    if (!ok || ok.trashed) id = null;
  }
  if (id) await api(token, `${API}/files/${id}?fields=id`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: nombre }) });
  else id = await crearCarpetaEn(token, nombre, null);
  if (compartirCon) {
    await api(token, `${API}/files/${id}/permissions?${new URLSearchParams({ sendNotificationEmail: "true", emailMessage: "Te comparto la carpeta donde Laucen deja los archivos del mes." })}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "user", role: "writer", emailAddress: compartirCon }),
    });
  }
  await consulta("update google_drive set carpeta_id = $2, carpeta_nombre = $3, compartida_con = $4, actualizado_ts = now() where organizacion_id = $1", [org, id, nombre, compartirCon]);
  return id;
}

/** Sube archivos a una subcarpeta (por ejemplo "2026-09 · Virtual Argentina S.A") de la carpeta del contador. Si un
 *  archivo con el mismo nombre ya está, lo reemplaza. Devuelve cuántos subió. */
export async function subirAlDrive(org: string, subcarpeta: string, archivos: { nombre: string; contenido: Buffer; tipo: string }[]) {
  const token = await tokenDeAcceso(org);
  const f = await una<{ carpeta_id: string | null }>("select carpeta_id from google_drive where organizacion_id = $1", [org]);
  if (!f?.carpeta_id) throw new ErrorErp("Todavía no está la carpeta del contador: creala en Configuración › Google Drive.");
  const padre = (await buscar(token, subcarpeta, f.carpeta_id, true)) ?? (await crearCarpetaEn(token, subcarpeta, f.carpeta_id));
  for (const a of archivos) {
    const ya = await buscar(token, a.nombre, padre, false);
    if (ya) {
      await api(token, `${SUBIR}/files/${ya}?uploadType=media&fields=id`, { method: "PATCH", headers: { "content-type": a.tipo }, body: new Uint8Array(a.contenido) });
      continue;
    }
    const limite = `laucen${crypto.randomUUID().replace(/-/g, "")}`;
    const cuerpo = Buffer.concat([
      Buffer.from(`--${limite}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: a.nombre, parents: [padre] })}\r\n--${limite}\r\ncontent-type: ${a.tipo}\r\n\r\n`),
      a.contenido, Buffer.from(`\r\n--${limite}--`),
    ]);
    await api(token, `${SUBIR}/files?uploadType=multipart&fields=id`, { method: "POST", headers: { "content-type": `multipart/related; boundary=${limite}` }, body: new Uint8Array(cuerpo) });
  }
  const texto = `${archivos.length} archivo${archivos.length === 1 ? "" : "s"} a «${subcarpeta}»`;
  await consulta("update google_drive set ultimo_envio_ts = now(), ultimo_envio = $2 where organizacion_id = $1", [org, texto]);
  return archivos.length;
}
