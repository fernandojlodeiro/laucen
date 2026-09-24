// Mercado Libre: la autorización (OAuth) con la aplicación de ML de Fer, y
// las llamadas a la API firmadas con esa llave. Las credenciales de la
// aplicación van en MELI_APP_ID y MELI_CLIENT_SECRET (Vercel).

import { eq } from "drizzle-orm";
import { db } from "@/db";
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

async function guardar(organizacionId: string, t: Token, nickname?: string | null) {
  const fila = {
    meliUserId: t.user_id, accessToken: t.access_token, refreshToken: t.refresh_token,
    expiraEl: new Date(Date.now() + (t.expires_in - 120) * 1000), actualizadoEl: new Date(),
    ...(nickname !== undefined ? { meliNickname: nickname } : {}),
  };
  await db.insert(meliCuentas).values({ organizacionId, ...fila })
    .onConflictDoUpdate({ target: meliCuentas.organizacionId, set: fila });
}

/** Canjea el código que vuelve de ML por la llave, y la guarda para la organización. */
export async function canjearCodigo(organizacionId: string, code: string, verifier: string, origen: string) {
  const c = credenciales();
  if (!c) throw new Error("Faltan MELI_APP_ID / MELI_CLIENT_SECRET");
  const t = await pedirToken({
    grant_type: "authorization_code", client_id: c.appId, client_secret: c.secreto,
    code, redirect_uri: redirectUri(origen), code_verifier: verifier,
  });
  const yo = await fetch(`${API}/users/me`, { headers: { authorization: `Bearer ${t.access_token}` } })
    .then((r) => r.json()).catch(() => null);
  await guardar(organizacionId, t, yo?.nickname ?? null);
}

export async function cuentaDe(organizacionId: string) {
  const [c] = await db.select().from(meliCuentas).where(eq(meliCuentas.organizacionId, organizacionId));
  return c ?? null;
}

/** La llave vigente de la organización; si venció, la renueva con el refresh token. */
export async function tokenVigente(organizacionId: string): Promise<string | null> {
  const cuenta = await cuentaDe(organizacionId);
  if (!cuenta) return null;
  if (cuenta.expiraEl.getTime() > Date.now()) return cuenta.accessToken;
  const c = credenciales();
  if (!c) return null;
  const t = await pedirToken({
    grant_type: "refresh_token", client_id: c.appId, client_secret: c.secreto,
    refresh_token: cuenta.refreshToken,
  });
  await guardar(organizacionId, t);
  return t.access_token;
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
