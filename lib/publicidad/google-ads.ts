// Google Ads en el embudo de publicidad (Fer, 25/10), copiado de CadaMes (lib/comercial/google-ads.ts) y armado para que
// cada organización conecte su propia cuenta.
//
// «Conectar Google Ads»: el permiso de Google (OAuth, alcance adwords, offline) con la app de Google de Laucen —un cliente
// OAuth de un proyecto de Google Cloud con la API de Google Ads habilitada— que carga el dueño del sistema
// (google_ads_app_credencial). Desde 2026 la API no pide token de desarrollador: lo que deja leer cuentas reales es el
// «nivel de acceso» del proyecto de Google Cloud (Explorador o más; en Prueba, sólo cuentas de prueba). Se guarda el
// refresh token y las cuentas que se ven con él: las que se administran directo y, si es una cuenta administradora
// (MCC), las de abajo. Cada cuenta se puede dejar de leer (`leer`: Fer, 26/10 — la misma persona puede administrar
// cuentas de otro negocio).
//
// La lectura: el gasto, las veces que se vio y los clics, por anuncio y por día (ad_group_ad), más las campañas de
// máximo rendimiento (Performance Max, que no tienen anuncios sueltos: van como un anuncio «c:<campaña>») → anuncio_dia.
// Sólo lee: nada se cambia en Google. Los errores van al log, nunca a una pantalla.
//
// La versión de la API: Google da de baja cada versión al año; cuando falle con un 404 genérico, lo primero es subirla.

import { consulta, una } from "@/lib/erp/base";

const API = "https://googleads.googleapis.com/v25";
const AUTORIZAR = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type AppGoogle = { clientId: string; clientSecret: string };

export async function appGoogleAds(): Promise<AppGoogle | null> {
  const f = await una<{ client_id: string; client_secret: string }>(
    "select client_id, client_secret from google_ads_app_credencial where id = 1").catch(() => null);
  return f?.client_id && f.client_secret ? { clientId: f.client_id, clientSecret: f.client_secret } : null;
}

export async function datosAppGoogleAds(): Promise<{ clientId: string | null; hayClave: boolean }> {
  const f = await una<{ client_id: string; client_secret: string }>(
    "select client_id, client_secret from google_ads_app_credencial where id = 1").catch(() => null);
  return { clientId: f?.client_id || null, hayClave: !!f?.client_secret };
}

export async function guardarAppGoogleAds(d: { clientId: string; clientSecret: string | null }): Promise<void> {
  await consulta(`
    insert into google_ads_app_credencial (id, client_id, client_secret) values (1, $1, coalesce(nullif($2, ''), ''))
    on conflict (id) do update set client_id = excluded.client_id,
      client_secret = coalesce(nullif($2, ''), google_ads_app_credencial.client_secret), actualizado_ts = now()`,
  [d.clientId.trim(), (d.clientSecret ?? "").trim()]);
}

/** Lee la respuesta como texto y después JSON: una página de error HTML no tira un «Unexpected token» sin sentido. */
async function comoJson(r: Response): Promise<Record<string, unknown>> {
  const t = await r.text();
  try { return t ? JSON.parse(t) : {}; } catch { return { error: { message: `no-JSON ${r.status}: ${t.slice(0, 200)}` } }; }
}

export function urlDeConexion(app: AppGoogle, redirectUri: string, estado: string): string {
  return `${AUTORIZAR}?${new URLSearchParams({
    client_id: app.clientId, redirect_uri: redirectUri, response_type: "code", scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: estado,
  })}`;
}

async function tokenDeAcceso(app: AppGoogle, refreshToken: string): Promise<string> {
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  const d = await comoJson(r);
  if (!r.ok || !d.access_token) throw new Error(`google token: ${JSON.stringify(d).slice(0, 300)}`);
  return String(d.access_token);
}

function encabezados(token: string, login?: string | null): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(login ? { "login-customer-id": login } : {}) };
}

async function buscar(app: AppGoogle, token: string, cliente: string, query: string, login?: string | null): Promise<Record<string, unknown>[]> {
  const filas: Record<string, unknown>[] = [];
  let pagina: string | undefined;
  do {
    const r = await fetch(`${API}/customers/${cliente}/googleAds:search`, {
      method: "POST", headers: encabezados(token, login), body: JSON.stringify({ query, ...(pagina ? { pageToken: pagina } : {}) }),
    });
    const d = await comoJson(r);
    if (!r.ok) throw new Error(`google ads ${cliente}: ${JSON.stringify(d).slice(0, 400)}`);
    filas.push(...((d.results ?? []) as Record<string, unknown>[]));
    pagina = d.nextPageToken as string | undefined;
  } while (pagina);
  return filas;
}

/** leer: si entra al embudo (se destilda la de otro negocio que administra la misma persona). */
export type CuentaGoogle = { id: string; nombre: string; moneda: string; login: string | null; leer: boolean };

/** Las cuentas que se ven con el permiso: las directas que no son administradoras y, de las administradoras, las de abajo. */
async function cuentasDelPermiso(app: AppGoogle, token: string, errores: string[]): Promise<CuentaGoogle[]> {
  const r = await fetch(`${API}/customers:listAccessibleCustomers`, { headers: encabezados(token) });
  const d = await comoJson(r);
  if (!r.ok) throw new Error(`google cuentas: ${JSON.stringify(d).slice(0, 300)}`);
  const ids = ((d.resourceNames ?? []) as string[]).map((n) => n.split("/")[1]).filter(Boolean);
  const out = new Map<string, CuentaGoogle>();
  for (const id of ids) {
    try {
      const [c] = await buscar(app, token, id, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer");
      const cu = c?.customer as { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean } | undefined;
      if (!cu) continue;
      if (!cu.manager) { out.set(id, { id, nombre: cu.descriptiveName || id, moneda: cu.currencyCode || "ARS", login: null, leer: true }); continue; }
      const hijos = await buscar(app, token, id, "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager FROM customer_client WHERE customer_client.level <= 1", id);
      for (const h of hijos) {
        const cc = h.customerClient as { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean } | undefined;
        if (cc?.id && !cc.manager && !out.has(String(cc.id))) out.set(String(cc.id), { id: String(cc.id), nombre: cc.descriptiveName || String(cc.id), moneda: cc.currencyCode || "ARS", login: id, leer: true });
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      console.error("[google-ads] cuenta", id, m);
      errores.push(m);
    }
  }
  return [...out.values()];
}

/** La vuelta del permiso: canjea el código, busca las cuentas, guarda y lee por primera vez. */
/** Guarda lo que contestó Google (para diagnosticar; nunca va a una pantalla). */
async function anotarError(texto: string): Promise<void> {
  await consulta("update google_ads_app_credencial set ultimo_error = $1, ultimo_error_ts = now() where id = 1", [texto.slice(0, 2000)]).catch(() => {});
}

/** El proyecto de Google Cloud en nivel «Prueba» sólo deja leer cuentas de prueba: con una real, Google contesta con
 *  un error de acceso o de token de desarrollador. */
const faltaAcceso = (errores: string[]) => errores.some((e) => /DEVELOPER_TOKEN|developer.token|TEST_ACCOUNT|ACCESS_LEVEL/i.test(e));

export async function conectarGoogleAds(org: string, app: AppGoogle, code: string, redirectUri: string): Promise<"ok" | "canje" | "sin_cuentas" | "sin_refresh" | "acceso"> {
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
  const d = await comoJson(r);
  if (!r.ok || !d.access_token) { console.error("[google-ads] canje", JSON.stringify(d).slice(0, 300)); return "canje"; }
  if (!d.refresh_token) return "sin_refresh";
  let cuentas: CuentaGoogle[];
  const errores: string[] = [];
  try { cuentas = await cuentasDelPermiso(app, String(d.access_token), errores); } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error("[google-ads]", m);
    await anotarError(m);
    return faltaAcceso([m]) ? "acceso" : "canje";
  }
  console.log("[google-ads] %d cuenta(s): %s", cuentas.length, cuentas.map((c) => c.nombre).join(", ") || "ninguna");
  if (!cuentas.length) {
    await anotarError(errores.length ? errores.join("\n") : "listAccessibleCustomers sin cuentas");
    return faltaAcceso(errores) ? "acceso" : "sin_cuentas";
  }
  // Al volver a conectar, cada cuenta que ya estaba sigue como estaba (leída o no).
  const antes = await una<{ cuentas: CuentaGoogle[] }>("select cuentas from google_ads_credencial where organizacion_id = $1", [org]);
  cuentas = cuentas.map((c) => ({ ...c, leer: antes?.cuentas.find((a) => a.id === c.id)?.leer ?? true }));
  await consulta(`
    insert into google_ads_credencial (organizacion_id, refresh_token, cuentas) values ($1, $2, $3::jsonb)
    on conflict (organizacion_id) do update set refresh_token = excluded.refresh_token, cuentas = excluded.cuentas, conectado_ts = now(),
      estado = 'activo', lectura_ts = null, lectura_estado = null`, [org, String(d.refresh_token), JSON.stringify(cuentas)]);
  await leerGoogleAds(org).catch((e) => console.error("[google-ads] primera lectura", e));
  return "ok";
}

export type ConexionGoogle = { cuentas: CuentaGoogle[]; lecturaTs: string | null; lecturaEstado: string | null };
export const conexionGoogle = (org: string) => una<ConexionGoogle>(`
  select cuentas, lectura_ts::text "lecturaTs", lectura_estado "lecturaEstado" from google_ads_credencial where organizacion_id = $1 and estado = 'activo'`, [org]);

/** Leer o no una cuenta. Al dejar de leerla se borra lo que se había leído de ella (se vuelve a leer al tildarla). */
export async function elegirCuentaGoogle(org: string, id: string, leer: boolean): Promise<void> {
  await consulta(`
    update google_ads_credencial set cuentas = (select jsonb_agg(case when c ->> 'id' = $2 then c || jsonb_build_object('leer', $3::boolean) else c end)
                                                  from jsonb_array_elements(cuentas) c)
     where organizacion_id = $1`, [org, id, leer]);
  if (!leer) await consulta("delete from anuncio_dia where organizacion_id = $1 and plataforma = 'google' and cuenta_id = $2", [org, id]);
  else await leerGoogleAds(org).catch((e) => console.error("[google-ads] lectura", e));
}

export async function desconectarGoogleAds(org: string): Promise<void> {
  await consulta("update google_ads_credencial set estado = 'desconectado' where organizacion_id = $1", [org]);
}

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);

type FilaAnuncio = { anuncioId: string; anuncio: string | null; campanaId: string | null; campana: string | null; fecha: string; micros: number; impresiones: number; clics: number };

/** Trae los últimos `dias` de todas las cuentas conectadas y los guarda. No tira: un rechazo queda como 'rechazo'. */
export async function leerGoogleAds(org: string, dias = 30): Promise<{ filas: number; estado: string }> {
  const app = await appGoogleAds();
  const c = await una<{ refresh_token: string; cuentas: CuentaGoogle[] }>("select refresh_token, cuentas from google_ads_credencial where organizacion_id = $1 and estado = 'activo'", [org]);
  if (!app || !c) return { filas: 0, estado: "sin_conexion" };
  const hasta = new Date(), desde = new Date(hasta.getTime() - dias * 86_400_000);
  const entre = `segments.date BETWEEN '${fechaIso(desde)}' AND '${fechaIso(hasta)}'`;
  let filas = 0, estado = "ok";
  let token: string;
  try { token = await tokenDeAcceso(app, c.refresh_token); } catch (e) {
    console.error("[google-ads]", e);
    await consulta("update google_ads_credencial set lectura_ts = now(), lectura_estado = 'rechazo' where organizacion_id = $1", [org]);
    return { filas: 0, estado: "rechazo" };
  }
  for (const cuenta of c.cuentas.filter((x) => x.leer)) {
    try {
      const acum = new Map<string, FilaAnuncio>();
      const sumar = (f: FilaAnuncio) => {
        const k = `${f.anuncioId}|${f.fecha}`;
        const a = acum.get(k);
        if (a) { a.micros += f.micros; a.impresiones += f.impresiones; a.clics += f.clics; } else acum.set(k, f);
      };
      // Los anuncios (búsqueda, display, shopping, video…), uno por uno.
      for (const r of await buscar(app, token, cuenta.id,
        `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group.name, campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks
           FROM ad_group_ad WHERE ${entre} AND metrics.impressions > 0`, cuenta.login)) {
        const ad = (r.adGroupAd as { ad?: { id?: string; name?: string } } | undefined)?.ad;
        const m = r.metrics as { costMicros?: string; impressions?: string; clicks?: string } | undefined;
        const fecha = (r.segments as { date?: string } | undefined)?.date;
        if (!ad?.id || !fecha) continue;
        sumar({ anuncioId: String(ad.id), anuncio: ad.name || (r.adGroup as { name?: string } | undefined)?.name || null,
          campanaId: (r.campaign as { id?: string } | undefined)?.id ?? null, campana: (r.campaign as { name?: string } | undefined)?.name ?? null,
          fecha, micros: Number(m?.costMicros ?? 0), impresiones: Number(m?.impressions ?? 0), clics: Number(m?.clicks ?? 0) });
      }
      // Máximo rendimiento: no tiene anuncios sueltos, va la campaña entera.
      for (const r of await buscar(app, token, cuenta.id,
        `SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks
           FROM campaign WHERE ${entre} AND campaign.advertising_channel_type = 'PERFORMANCE_MAX' AND metrics.impressions > 0`, cuenta.login)) {
        const ca = r.campaign as { id?: string; name?: string } | undefined;
        const m = r.metrics as { costMicros?: string; impressions?: string; clicks?: string } | undefined;
        const fecha = (r.segments as { date?: string } | undefined)?.date;
        if (!ca?.id || !fecha) continue;
        sumar({ anuncioId: `c:${ca.id}`, anuncio: ca.name ? `${ca.name} (máximo rendimiento)` : null, campanaId: String(ca.id), campana: ca.name ?? null,
          fecha, micros: Number(m?.costMicros ?? 0), impresiones: Number(m?.impressions ?? 0), clics: Number(m?.clicks ?? 0) });
      }
      for (const f of acum.values()) {
        await consulta(`
          insert into anuncio_dia (organizacion_id, plataforma, cuenta_id, anuncio_id, anuncio, campana_id, campana, fecha, gasto, moneda, impresiones, clics)
          values ($1, 'google', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          on conflict (organizacion_id, plataforma, anuncio_id, fecha) do update set cuenta_id = excluded.cuenta_id, anuncio = excluded.anuncio,
            campana_id = excluded.campana_id, campana = excluded.campana, gasto = excluded.gasto, moneda = excluded.moneda,
            impresiones = excluded.impresiones, clics = excluded.clics, actualizado_ts = now()`,
        [org, cuenta.id, f.anuncioId, f.anuncio, f.campanaId, f.campana, f.fecha, Math.round(f.micros / 10_000) / 100, cuenta.moneda, f.impresiones, f.clics]);
        filas++;
      }
    } catch (e) {
      console.error("[google-ads] lectura", cuenta.id, e instanceof Error ? e.message : e);
      estado = "rechazo";
    }
  }
  await consulta("update google_ads_credencial set lectura_ts = now(), lectura_estado = $2 where organizacion_id = $1", [org, estado]);
  return { filas, estado };
}

export async function googleAdsPendientes(): Promise<string[]> {
  const f = await consulta<{ organizacion_id: string }>(
    "select organizacion_id from google_ads_credencial where estado = 'activo' and (lectura_ts is null or lectura_ts < now() - interval '3 hours')").catch(() => []);
  return f.map((x) => x.organizacion_id);
}
