// Google Drive (Fer, 23/10): cada organización conecta su Drive (OAuth de Google con la aplicación de Laucen, permiso
// sobre el Drive) y Laucen deja los archivos de cada mes (los TXT del Libro de IVA Digital) en el árbol de carpetas que
// ya usa con el contador: año › mes › carpeta, según la ruta de ejemplo que se carga por razón social
// (lib/google/ruta.ts). Sólo recorre ese camino. Si un archivo con el mismo nombre ya está, lo reemplaza.
//
// La aplicación de Google (Client ID y Client Secret) es una para todo el sistema: la carga el dueño en /admin/google.
// La llave de cada organización (refresh_token) queda en google_drive y nunca se muestra.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { urlPanel } from "@/lib/tienda/dominios";
import { coincide, nombreNuevo, parsearRuta, rutaDeMes, type Segmento } from "@/lib/google/ruta";

const AUTORIZAR = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const SUBIR = "https://www.googleapis.com/upload/drive/v3";
const CARPETA = "application/vnd.google-apps.folder";
export const RUTA_VUELTA = "/config/google-drive/callback";
export const ALCANCES = "openid email https://www.googleapis.com/auth/drive";

export const urlVuelta = () => `${urlPanel()}${RUTA_VUELTA}`;
export const urlCarpeta = (id: string) => `https://drive.google.com/drive/folders/${id}`;
export type { Segmento };

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

export type ConexionDrive = { conectado: boolean; cuenta_email: string | null; conectado_ts: string | null; ultimo_envio_ts: string | null; ultimo_envio: string | null;
  /** Si la conexión se hizo con el permiso viejo (sólo lo que crea Laucen): hay que volver a conectar. */
  permiso_viejo: boolean };

export async function conexionDrive(org: string): Promise<ConexionDrive> {
  const f = await una<ConexionDrive & { refresh_token: string | null }>(`select refresh_token, refresh_token is not null conectado, cuenta_email,
    conectado_ts::text, ultimo_envio_ts::text, ultimo_envio, coalesce(alcance, '') not like '%auth/drive %' and coalesce(alcance, '') not like '%auth/drive' permiso_viejo
    from google_drive where organizacion_id = $1`, [org]);
  if (!f) return { conectado: false, cuenta_email: null, conectado_ts: null, ultimo_envio_ts: null, ultimo_envio: null, permiso_viejo: false };
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
  const j = await r.json().catch(() => ({})) as { refresh_token?: string; id_token?: string; scope?: string; error?: string; error_description?: string };
  if (!r.ok) throw new Error(`Google: ${j.error ?? r.status} ${j.error_description ?? ""}`);
  if (!j.refresh_token) throw new ErrorErp("Google no devolvió la llave para seguir subiendo. Sacale el acceso a Laucen en tu cuenta de Google y volvé a conectar.");
  if (!/auth\/drive(\s|$)/.test(j.scope ?? "")) throw new ErrorErp("No se tildó el permiso sobre Google Drive en la pantalla de Google: volvé a conectar y tildá la casilla.");
  const email = mailDelToken(j.id_token);
  await consulta(`insert into google_drive (organizacion_id, refresh_token, cuenta_email, alcance, conectado_ts) values ($1, $2, $3, $4, now())
    on conflict (organizacion_id) do update set refresh_token = excluded.refresh_token, cuenta_email = excluded.cuenta_email, alcance = excluded.alcance, conectado_ts = now(), actualizado_ts = now()`,
    [org, j.refresh_token, email, j.scope ?? null]);
  return email ?? "tu cuenta de Google";
}

export async function desconectarDrive(org: string) {
  const f = await una<{ refresh_token: string | null }>("select refresh_token from google_drive where organizacion_id = $1", [org]);
  if (f?.refresh_token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(f.refresh_token)}`, { method: "POST" }).catch(() => null);
  await consulta("update google_drive set refresh_token = null, cuenta_email = null, actualizado_ts = now() where organizacion_id = $1", [org]);
}

export async function tokenDeAcceso(org: string): Promise<string> {
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

/** El camino de los archivos de una razón social: se pega la ruta de un mes cualquiera (lib/google/ruta.ts) y se
 *  controla que la parte fija (antes del año) exista en el Drive. */
export async function grabarRuta(org: string, emisorId: number, texto: string) {
  const p = parsearRuta(texto);
  if ("error" in p) throw new ErrorErp(p.error);
  const token = await tokenDeAcceso(org);
  let padre = "root";
  for (const seg of p.segmentos) {
    if (seg.tipo !== "fijo") break;
    const hijo = (await carpetasDe(token, padre)).find((c) => coincide(c.name, seg, 0, 0));
    if (!hijo) throw new ErrorErp(`No encuentro la carpeta «${seg.nombre}» en el Drive de la cuenta conectada${padre === "root" ? " (en Mi unidad)" : ""}. Revisá cómo está escrita.`);
    padre = hijo.id;
  }
  await consulta(`update google_drive set rutas = coalesce(rutas, '{}'::jsonb) || jsonb_build_object($2::text, jsonb_build_object('texto', $3::text, 'segmentos', $4::jsonb)),
    actualizado_ts = now() where organizacion_id = $1`, [org, String(emisorId), texto.trim(), JSON.stringify(p.segmentos)]);
}

export async function rutasDe(org: string): Promise<Record<string, { texto: string; segmentos: Segmento[] }>> {
  return (await una<{ rutas: Record<string, { texto: string; segmentos: Segmento[] }> | null }>("select rutas from google_drive where organizacion_id = $1", [org]))?.rutas ?? {};
}

async function carpetasDe(token: string, padre: string) {
  const q = `'${comillas(padre)}' in parents and mimeType = '${CARPETA}' and trashed = false`;
  const r = await api<{ files: { id: string; name: string }[] }>(token, `${API}/files?${new URLSearchParams({ q, fields: "files(id,name)", spaces: "drive", pageSize: "1000" })}`);
  return r.files;
}

/** Sube archivos a la carpeta del mes de una razón social (año › mes › …, según su ruta). La parte fija de antes del
 *  año tiene que existir; el año, el mes y lo que sigue se crean si faltan (con el formato del modelo). Si un archivo
 *  con el mismo nombre ya está, lo reemplaza. Devuelve la ruta donde quedaron. */
export async function subirAlDrive(org: string, emisorId: number, mesAAAAMM: string, archivos: { nombre: string; contenido: Buffer; tipo: string }[]) {
  const ruta = (await rutasDe(org))[String(emisorId)];
  if (!ruta) throw new ErrorErp("Falta la ruta de los archivos de esta razón social en el Drive: cargala en Configuración › Google Drive.");
  const token = await tokenDeAcceso(org);
  const [año, mes] = mesAAAAMM.split("-").map(Number);
  let padre = "root", variable = false;
  for (const seg of ruta.segmentos) {
    if (seg.tipo !== "fijo") variable = true;
    const hijo = (await carpetasDe(token, padre)).find((c) => coincide(c.name, seg, año, mes));
    if (hijo) { padre = hijo.id; continue; }
    if (!variable) throw new ErrorErp(`No encuentro la carpeta «${nombreNuevo(seg, año, mes)}» en el Drive: revisá la ruta en Configuración › Google Drive.`);
    padre = await crearCarpetaEn(token, nombreNuevo(seg, año, mes), padre);
  }
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
  const donde = rutaDeMes(ruta.segmentos, año, mes);
  await consulta("update google_drive set ultimo_envio_ts = now(), ultimo_envio = $2 where organizacion_id = $1",
    [org, `${archivos.length} archivo${archivos.length === 1 ? "" : "s"} a ${donde}`]);
  return { cantidad: archivos.length, donde, carpeta: padre };
}

// ── Leer lo que hay en las carpetas (las declaraciones del contador) ─────────

/** La carpeta del mes de una razón social (el camino de su ruta hasta la carpeta del mes, sin crear nada); null si
 *  todavía no existe. */
export async function carpetaDelMes(token: string, segmentos: Segmento[], año: number, mes: number): Promise<string | null> {
  let padre = "root";
  for (const seg of segmentos) {
    const hijo = (await carpetasDe(token, padre)).find((c) => coincide(c.name, seg, año, mes));
    if (!hijo) return null;
    padre = hijo.id;
    if (seg.tipo === "mes") return padre;
  }
  return null;
}

export { carpetasDe };

/** Los PDF e imágenes de una carpeta. */
export async function archivosDe(token: string, carpeta: string) {
  const q = `'${comillas(carpeta)}' in parents and trashed = false and (mimeType = 'application/pdf' or mimeType contains 'image/')`;
  const r = await api<{ files: { id: string; name: string; mimeType: string; modifiedTime: string; size?: string }[] }>(token,
    `${API}/files?${new URLSearchParams({ q, fields: "files(id,name,mimeType,modifiedTime,size)", spaces: "drive", pageSize: "200" })}`);
  return r.files;
}

/** El contenido de un archivo del Drive. */
export async function bajarDelDrive(token: string, id: string): Promise<ArrayBuffer> {
  const r = await fetch(`${API}/files/${encodeURIComponent(id)}?alt=media`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new ErrorErp("No se pudo bajar el archivo del Drive.");
  return r.arrayBuffer();
}
