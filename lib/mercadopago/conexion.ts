// Conexión con Mercado Pago (Fer, 6/10), igual que la de Mercado Libre: el
// botón "Conectar Mercado Pago" de un canal manda a Mercado Pago, la persona
// aprueba la aplicación de Laucen con la cuenta que quiere conectar, vuelve
// con un código y Laucen lo canjea por la llave de esa cuenta. La llave se
// renueva sola. Nada de esto se ve ni se copia a mano.
//
// La aplicación de Mercado Pago es UNA para todo Laucen (plataforma_mp; la
// carga Fer en /admin/mercadopago; si no, MP_APP_ID / MP_CLIENT_SECRET).
// Cada cuenta de Mercado Pago conectada es una fila de mp_conexion; canal_mp
// dice en qué canal va (una misma cuenta puede ir en varios canales).

import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { urlPanel } from "@/lib/tienda/dominios";

export const API_MP = "https://api.mercadopago.com";
const AUTORIZAR = "https://auth.mercadopago.com.ar/authorization";
export const RUTA_VUELTA = "/config/canales/mercadopago/callback";

export async function appMp(): Promise<{ clientId: string; secreto: string } | null> {
  const f = await una<{ client_id: string; client_secret: string }>("select client_id, client_secret from plataforma_mp where id = 1").catch(() => null);
  if (f?.client_id && f.client_secret) return { clientId: f.client_id, secreto: f.client_secret };
  const clientId = process.env.MP_APP_ID?.trim(), secreto = process.env.MP_CLIENT_SECRET?.trim();
  return clientId && secreto ? { clientId, secreto } : null;
}

/** La dirección de vuelta: siempre la del panel (es la que se registra en la aplicación de Mercado Pago). */
export const urlVuelta = () => `${urlPanel()}${RUTA_VUELTA}`;

const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");
export async function nuevoPkce() {
  const verifier = b64(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

export function urlDeAutorizacion(clientId: string, state: string, challenge: string) {
  const q = new URLSearchParams({
    client_id: clientId, response_type: "code", platform_id: "mp", state, redirect_uri: urlVuelta(),
  });
  void challenge; // PKCE apagado: Mercado Pago lo rechaza si la aplicación no lo tiene prendido.
  return `${AUTORIZAR}?${q}`;
}

type Token = { access_token: string; refresh_token?: string; expires_in: number; user_id: number };

async function pedirToken(campos: Record<string, string>): Promise<Token> {
  const r = await fetch(`${API_MP}/oauth/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(campos), cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${cuerpo.error ?? ""} ${cuerpo.message ?? ""}`.trim());
  return cuerpo as Token;
}

/** Canjea el código que vuelve de Mercado Pago, guarda la cuenta y la pone en el canal. */
export async function canjearCodigoMp(org: string, canalId: number, code: string, verifier: string): Promise<string> {
  const app = await appMp();
  if (!app) throw new ErrorErp("Falta configurar la aplicación de Mercado Pago de Laucen.");
  const t = await pedirToken({
    grant_type: "authorization_code", client_id: app.clientId, client_secret: app.secreto,
    code, redirect_uri: urlVuelta(),
  });
  void verifier;
  const yo = await fetch(`${API_MP}/users/me`, { headers: { authorization: `Bearer ${t.access_token}` }, cache: "no-store" })
    .then((r) => r.json()).catch(() => null) as { id?: number; nickname?: string; email?: string; first_name?: string; last_name?: string } | null;
  const nombre = yo?.nickname ?? ([yo?.first_name, yo?.last_name].filter(Boolean).join(" ") || null);
  const userId = Number(t.user_id ?? yo?.id);
  const expira = new Date(Date.now() + (Number(t.expires_in) - 300) * 1000);
  const fila = await una<{ id: string }>(`
    insert into mp_conexion (organizacion_id, mp_user_id, nombre, email, access_token, refresh_token, expira_el, estado)
    values ($1, $2, $3, $4, $5, $6, $7, 'activa')
    on conflict (organizacion_id, mp_user_id) do update set
      nombre = coalesce(excluded.nombre, mp_conexion.nombre), email = coalesce(excluded.email, mp_conexion.email),
      access_token = excluded.access_token, refresh_token = coalesce(excluded.refresh_token, mp_conexion.refresh_token),
      expira_el = excluded.expira_el, estado = 'activa', ultimo_error = null, actualizado_ts = now()
    returning id`, [org, userId, nombre, yo?.email ?? null, t.access_token, t.refresh_token ?? null, expira]);
  await ponerEnCanal(org, canalId, Number(fila!.id));
  return nombre ?? yo?.email ?? `cuenta ${userId}`;
}

export async function ponerEnCanal(org: string, canalId: number, conexionId: number) {
  await consulta(`insert into canal_mp (canal_id, organizacion_id, conexion_id) values ($1, $2, $3)
                  on conflict (canal_id) do update set conexion_id = excluded.conexion_id`, [canalId, org, conexionId]);
}

/** Saca la cuenta del canal. Si ya no queda en ningún canal, se borra la conexión (y su llave). */
export async function sacarDelCanal(org: string, canalId: number) {
  const f = await una<{ conexion_id: string }>("delete from canal_mp where canal_id = $1 and organizacion_id = $2 returning conexion_id", [canalId, org]);
  if (f) await consulta("delete from mp_conexion c where c.id = $1 and not exists (select 1 from canal_mp x where x.conexion_id = c.id)", [f.conexion_id]);
}

export type ConexionMp = { id: number; mpUserId: number; nombre: string | null; email: string | null; estado: string; ultimoError: string | null; canales: { id: number; nombre: string }[] };

/** Las cuentas de Mercado Pago conectadas de la organización, con sus canales. */
export async function conexionesDe(org: string): Promise<ConexionMp[]> {
  const f = await consulta<{ id: number; mp_user_id: string; nombre: string | null; email: string | null; estado: string; ultimo_error: string | null; canales: { id: number; nombre: string }[] | null }>(`
    select c.id::int, c.mp_user_id, c.nombre, c.email, c.estado, c.ultimo_error,
           (select json_agg(json_build_object('id', ca.id, 'nombre', ca.nombre) order by ca.nombre) from canal_mp x join canal ca on ca.id = x.canal_id where x.conexion_id = c.id) canales
      from mp_conexion c where c.organizacion_id = $1 order by c.id`, [org]);
  return f.map((x) => ({ id: x.id, mpUserId: Number(x.mp_user_id), nombre: x.nombre, email: x.email, estado: x.estado, ultimoError: x.ultimo_error, canales: x.canales ?? [] }));
}

/** La llave vigente de una conexión; si venció, la renueva con la fila
 *  bloqueada. null si Mercado Pago no la renueva (queda "desconectada"). */
export async function tokenDeConexion(conexionId: number): Promise<string | null> {
  const f = await una<{ access_token: string; expira_el: Date; estado: string }>("select access_token, expira_el, estado from mp_conexion where id = $1", [conexionId]);
  if (!f || f.estado !== "activa") return null;
  if (new Date(f.expira_el).getTime() > Date.now()) return f.access_token;
  const app = await appMp();
  if (!app) return null;
  return enTransaccion(async (c) => {
    const r = await c.query<{ access_token: string; refresh_token: string | null; expira_el: Date }>(
      "select access_token, refresh_token, expira_el from mp_conexion where id = $1 for update", [conexionId]);
    const x = r.rows[0];
    if (!x) return null;
    if (new Date(x.expira_el).getTime() > Date.now()) return x.access_token;
    if (!x.refresh_token) {
      await c.query("update mp_conexion set estado = 'desconectada', ultimo_error = 'La llave venció: volvé a conectarla' where id = $1", [conexionId]);
      return null;
    }
    try {
      const t = await pedirToken({ grant_type: "refresh_token", client_id: app.clientId, client_secret: app.secreto, refresh_token: x.refresh_token });
      await c.query(`update mp_conexion set access_token = $2, refresh_token = coalesce($3, refresh_token), expira_el = $4, ultimo_error = null, actualizado_ts = now() where id = $1`,
        [conexionId, t.access_token, t.refresh_token ?? null, new Date(Date.now() + (Number(t.expires_in) - 300) * 1000)]);
      return t.access_token;
    } catch (e) {
      await c.query("update mp_conexion set estado = 'desconectada', ultimo_error = $2 where id = $1", [conexionId, `No se pudo renovar la llave: ${String(e).slice(0, 200)}`]);
      return null;
    }
  });
}

/** Un GET a la API de Mercado Pago con la llave de la conexión. Nunca tira. */
export async function mpGet<T = unknown>(conexionId: number, ruta: string): Promise<{ status: number; datos: T }> {
  const token = await tokenDeConexion(conexionId);
  if (!token) return { status: 401, datos: { message: "la cuenta de Mercado Pago está desconectada" } as T };
  return mpPedir<T>(token, "GET", ruta);
}

export async function mpPedir<T = unknown>(token: string, metodo: "GET" | "POST" | "PUT", ruta: string, cuerpo?: unknown): Promise<{ status: number; datos: T }> {
  try {
    const r = await fetch(`${API_MP}${ruta}`, {
      method: metodo, cache: "no-store", signal: AbortSignal.timeout(25_000),
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(cuerpo !== undefined ? { "content-type": "application/json" } : {}) },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
    const texto = await r.text();
    let datos: unknown = texto;
    try { datos = JSON.parse(texto); } catch { /* texto (un CSV, por ejemplo) */ }
    return { status: r.status, datos: datos as T };
  } catch (e) {
    return { status: 0, datos: { message: String(e) } as T };
  }
}
