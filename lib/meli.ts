// Mercado Libre: la autorización (OAuth) con la aplicación de ML de Fer, y
// las llamadas a la API firmadas con esa llave. Las credenciales de la
// aplicación van en MELI_APP_ID y MELI_CLIENT_SECRET (Vercel).

import { eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { meliCuentas } from "@/db/meli";

export const API = "https://api.mercadolibre.com";
const AUTORIZAR = "https://auth.mercadolibre.com.ar/authorization";

export function credenciales() {
  const appId = process.env.MELI_APP_ID?.trim();
  const secreto = process.env.MELI_CLIENT_SECRET?.trim();
  return appId && secreto ? { appId, secreto } : null;
}

export function redirectUri(origen: string) {
  return `${origen}/admin/meli/callback`;
}

function base64url(bytes: ArrayBuffer | Uint8Array) {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");
}

/** PKCE: si la aplicación de ML lo tiene prendido es obligatorio; si no, ML lo ignora. */
export async function nuevoPkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

export function urlDeAutorizacion(appId: string, origen: string, state: string, challenge: string) {
  const q = new URLSearchParams({
    response_type: "code", client_id: appId, redirect_uri: redirectUri(origen),
    state, code_challenge: challenge, code_challenge_method: "S256",
  });
  return `${AUTORIZAR}?${q}`;
}

type Token = { access_token: string; refresh_token: string; expires_in: number; user_id: number };

async function pedirToken(campos: Record<string, string>): Promise<Token> {
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(campos),
    cache: "no-store",
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${cuerpo.error ?? ""} ${cuerpo.message ?? ""}`.trim());
  return cuerpo as Token;
}

// Las llaves viven en meli_cuenta (db/mercadolibre.sql): una por cuenta de
// ML, colgada de su canal. meli_cuentas (una por organización) queda como
// espejo de la cuenta "principal", la que usan Radar, Costos ML y Ventas ML.
// ML rota el refresh token en cada renovación (el viejo deja de servir): por
// eso se renueva en UN solo lugar, con la fila bloqueada.

/** Guarda la llave de una cuenta (y la deja como principal si la
 *  organización no tenía ninguna, o si ya era la principal). */
export async function guardarLlave(organizacionId: string, t: Token, nickname?: string | null, canalId?: number | null) {
  await asegurarEsquemaErp();
  const expira = new Date(Date.now() + (t.expires_in - 120) * 1000);
  await pool.query(`
    insert into meli_cuenta (organizacion_id, meli_user_id, nickname, access_token, refresh_token, expira_el, canal_id, estado)
    values ($1, $2, $3, $4, $5, $6, $7, 'activa')
    on conflict (organizacion_id, meli_user_id) do update set
      access_token = excluded.access_token, refresh_token = excluded.refresh_token, expira_el = excluded.expira_el,
      nickname = coalesce(excluded.nickname, meli_cuenta.nickname), canal_id = coalesce(excluded.canal_id, meli_cuenta.canal_id),
      estado = 'activa', ultimo_error = null, actualizado_ts = now()`,
    [organizacionId, t.user_id, nickname ?? null, t.access_token, t.refresh_token, expira, canalId ?? null]);
  const principal = await cuentaDe(organizacionId);
  if (!principal || principal.meliUserId === t.user_id) {
    const fila = {
      meliUserId: t.user_id, accessToken: t.access_token, refreshToken: t.refresh_token, expiraEl: expira, actualizadoEl: new Date(),
      ...(nickname !== undefined && nickname !== null ? { meliNickname: nickname } : {}),
    };
    await db.insert(meliCuentas).values({ organizacionId, ...fila })
      .onConflictDoUpdate({ target: meliCuentas.organizacionId, set: fila });
  }
}

/** Canjea el código que vuelve de ML por la llave y la guarda. Si viene un
 *  canal, la cuenta queda colgada de ese canal. */
export async function canjearCodigo(organizacionId: string, code: string, verifier: string, origen: string, canalId?: number | null) {
  const c = credenciales();
  if (!c) throw new Error("Faltan MELI_APP_ID / MELI_CLIENT_SECRET");
  const t = await pedirToken({
    grant_type: "authorization_code", client_id: c.appId, client_secret: c.secreto,
    code, redirect_uri: redirectUri(origen), code_verifier: verifier,
  });
  const yo = await fetch(`${API}/users/me`, { headers: { authorization: `Bearer ${t.access_token}` } })
    .then((r) => r.json()).catch(() => null);
  if (canalId) {
    // Una cuenta de ML va en un solo canal: si estaba en otro, se mueve.
    await asegurarEsquemaErp();
    await pool.query("update meli_cuenta set canal_id = null where organizacion_id = $1 and canal_id = $2 and meli_user_id <> $3", [organizacionId, canalId, t.user_id]);
  }
  await guardarLlave(organizacionId, t, yo?.nickname ?? null, canalId);
}

export async function cuentaDe(organizacionId: string) {
  const [c] = await db.select().from(meliCuentas).where(eq(meliCuentas.organizacionId, organizacionId));
  return c ?? null;
}

/** La llave vigente de una cuenta (meli_cuenta.id); si venció, la renueva
 *  con la fila bloqueada (dos pedidos a la vez no gastan el refresh token
 *  dos veces). null si la cuenta no existe o ML no la renueva (desconectada). */
export async function tokenDeCuenta(cuentaId: number): Promise<string | null> {
  await asegurarEsquemaErp();
  const r = await pool.query<{ access_token: string; expira_el: Date }>(
    "select access_token, expira_el from meli_cuenta where id = $1 and estado = 'activa'", [cuentaId]);
  if (!r.rows[0]) return null;
  if (r.rows[0].expira_el.getTime() > Date.now()) return r.rows[0].access_token;
  const c = credenciales();
  if (!c) return null;
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const f = (await cliente.query<{ organizacion_id: string; access_token: string; refresh_token: string; expira_el: Date }>(
      "select organizacion_id, access_token, refresh_token, expira_el from meli_cuenta where id = $1 for update", [cuentaId])).rows[0];
    if (f.expira_el.getTime() > Date.now()) { await cliente.query("commit"); return f.access_token; } // la renovó otro mientras esperaba
    let t: Token;
    try {
      t = await pedirToken({ grant_type: "refresh_token", client_id: c.appId, client_secret: c.secreto, refresh_token: f.refresh_token });
    } catch (e) {
      const msg = String(e);
      // invalid_grant = la autorización se revocó o venció: hay que reconectar.
      await cliente.query("update meli_cuenta set ultimo_error = $2, estado = case when $2 like '%invalid_grant%' then 'desconectada' else estado end where id = $1",
        [cuentaId, msg.slice(0, 300)]);
      await cliente.query("commit");
      return null;
    }
    await cliente.query("commit");
    await guardarLlave(f.organizacion_id, t);
    return t.access_token;
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

/** La llave vigente de la cuenta principal de la organización (Radar, Costos
 *  ML, Ventas ML). */
export async function tokenVigente(organizacionId: string): Promise<string | null> {
  const principal = await cuentaDe(organizacionId);
  if (!principal) return null;
  await asegurarEsquemaErp();
  const r = await pool.query<{ id: string }>("select id from meli_cuenta where organizacion_id = $1 and meli_user_id = $2", [organizacionId, principal.meliUserId]);
  return r.rows[0] ? tokenDeCuenta(Number(r.rows[0].id)) : null;
}

export type Respuesta = { ruta: string; status: number; datos: unknown };

/** GET a la API de ML, con o sin llave. Nunca tira: devuelve status y cuerpo. */
export async function llamar(ruta: string, token: string | null): Promise<Respuesta> {
  try {
    const r = await fetch(`${API}${ruta}`, {
      headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
    });
    const texto = await r.text();
    let datos: unknown = texto;
    try { datos = JSON.parse(texto); } catch { /* queda como texto */ }
    return { ruta, status: r.status, datos };
  } catch (e) {
    return { ruta, status: 0, datos: String(e) };
  }
}
