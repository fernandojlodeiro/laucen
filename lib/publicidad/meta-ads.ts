// Los anuncios de Meta (Facebook e Instagram) en el embudo de publicidad (Fer, 25/10), copiado de CadaMes
// (lib/meta-fb-business.ts, lib/alta-anuncios.ts, lib/anuncios-gasto.ts).
//
// «Conectar anuncios de Meta»: el inicio de sesión de Facebook para empresas, con la app de Meta de Laucen (la misma de
// Instagram, pero su identificador y clave secreta propios, no los de Instagram) y una configuración con el permiso de
// leer anuncios (ads_read). Los tres datos los carga el dueño del sistema en Ventas › Mensajes › Configuración
// (ig_app_credencial: fb_app_id, fb_app_secret, ads_config_id). Se conectan todas las cuentas publicitarias que la
// persona comparta en el diálogo.
//
// La lectura: el gasto, las veces que se vio y los clics, por anuncio y por día (insights level=ad, que es el nivel del
// id que Meta pega al primer mensaje de quien escribió desde un anuncio) → anuncio_dia. Sólo lee: nada se cambia en Meta.
// Los errores de Meta van al log, nunca a una pantalla.

import { consulta, una } from "@/lib/erp/base";
import { GRAPH, GRAPH_VERSION } from "@/lib/mensajes/meta";

export type AppMeta = { appId: string; appSecret: string; configId: string };

export async function appMetaAnuncios(): Promise<AppMeta | null> {
  const f = await una<{ fb_app_id: string | null; fb_app_secret: string | null; ads_config_id: string | null }>(
    "select fb_app_id, fb_app_secret, ads_config_id from ig_app_credencial where id = 1").catch(() => null);
  if (!f?.fb_app_id || !f.fb_app_secret || !f.ads_config_id) return null;
  return { appId: f.fb_app_id, appSecret: f.fb_app_secret, configId: f.ads_config_id };
}

export async function guardarAppMetaAnuncios(d: { appId: string; appSecret: string | null; configId: string }): Promise<void> {
  const { claveDeVerificacion } = await import("@/lib/mensajes/instagram");
  await claveDeVerificacion();
  await consulta(`update ig_app_credencial set fb_app_id = $1, fb_app_secret = coalesce(nullif($2, ''), fb_app_secret), ads_config_id = $3,
                         actualizado_ts = now() where id = 1`, [d.appId.trim(), (d.appSecret ?? "").trim(), d.configId.trim()]);
}

export async function datosAppMetaAnuncios(): Promise<{ appId: string | null; hayClave: boolean; configId: string | null }> {
  const f = await una<{ fb_app_id: string | null; fb_app_secret: string | null; ads_config_id: string | null }>(
    "select fb_app_id, fb_app_secret, ads_config_id from ig_app_credencial where id = 1").catch(() => null);
  return { appId: f?.fb_app_id || null, hayClave: !!f?.fb_app_secret, configId: f?.ads_config_id || null };
}

type Resp = { ok: boolean; status: number; data: Record<string, unknown> };
async function pedir(url: string): Promise<Resp> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}
function motivoCrudo(r: Resp): string {
  const e = r.data?.error as { message?: string; code?: number; error_subcode?: number } | undefined;
  return e?.message ? `${e.code ?? ""}/${e.error_subcode ?? "-"} ${e.message}`.trim() : `graph_${r.status}`;
}

export function urlDeConexion(app: AppMeta, redirectUri: string, estado: string): string {
  const qs = new URLSearchParams({
    client_id: app.appId, config_id: app.configId, response_type: "code", override_default_response_type: "true",
    redirect_uri: redirectUri, state: estado,
    // Que vuelva a preguntar aunque la cuenta ya se haya compartido antes (en CadaMes volvía sin permisos si no).
    auth_type: "rerequest",
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${qs}`;
}

export type CuentaAnuncios = { id: string; nombre: string; moneda: string };

/** Las cuentas publicitarias que compartió en el diálogo: primero por /me/adaccounts; si viene vacío, por lo que dice el
 *  propio permiso (debug_token: los ids de ads_read), como en CadaMes. */
async function cuentasDelToken(app: AppMeta, token: string): Promise<CuentaAnuncios[]> {
  const leer = (d: Record<string, unknown>): CuentaAnuncios => ({
    id: String(d.id ?? ""), nombre: String(d.name ?? d.id ?? ""), moneda: String(d.account_currency ?? "ARS"),
  });
  const me = await pedir(`${GRAPH}/me/adaccounts?${new URLSearchParams({ fields: "id,name,account_currency", limit: "100", access_token: token })}`);
  const lista = me.ok ? ((me.data?.data ?? []) as Record<string, unknown>[]).map(leer).filter((c) => c.id) : [];
  if (lista.length) return lista;
  if (!me.ok) console.error("[meta-ads] /me/adaccounts", motivoCrudo(me));
  const dbg = await pedir(`${GRAPH}/debug_token?${new URLSearchParams({ input_token: token, access_token: `${app.appId}|${app.appSecret}` })}`);
  const granular = ((dbg.data?.data as { granular_scopes?: { scope?: string; target_ids?: (string | number)[] }[] } | undefined)?.granular_scopes ?? []);
  const ids = granular.find((g) => g.scope === "ads_read")?.target_ids?.map(String) ?? [];
  const out: CuentaAnuncios[] = [];
  for (const id of ids) {
    const r = await pedir(`${GRAPH}/${id.startsWith("act_") ? id : `act_${id}`}?${new URLSearchParams({ fields: "id,name,account_currency", access_token: token })}`);
    if (r.ok) out.push(leer(r.data)); else console.error("[meta-ads] cuenta", id, motivoCrudo(r));
  }
  return out;
}

/** La vuelta del diálogo: canjea el código, busca las cuentas y deja todo guardado. Devuelve el motivo para la pantalla. */
export async function conectarAnunciosMeta(org: string, app: AppMeta, code: string, redirectUri: string): Promise<"ok" | "canje" | "sin_cuentas"> {
  const r = await pedir(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, redirect_uri: redirectUri, code })}`);
  const token = String(r.data?.access_token ?? "");
  if (!r.ok || !token) { console.error("[meta-ads] canje", motivoCrudo(r)); return "canje"; }
  const cuentas = await cuentasDelToken(app, token);
  console.log("[meta-ads] %d cuenta(s) publicitaria(s): %s", cuentas.length, cuentas.map((c) => c.nombre).join(", ") || "ninguna");
  if (!cuentas.length) return "sin_cuentas";
  await consulta(`
    insert into meta_ads_credencial (organizacion_id, token, cuentas) values ($1, $2, $3::jsonb)
    on conflict (organizacion_id) do update set token = excluded.token, cuentas = excluded.cuentas, conectado_ts = now(), estado = 'activo',
      lectura_ts = null, lectura_estado = null`, [org, token, JSON.stringify(cuentas)]);
  await leerAnunciosMeta(org).catch((e) => console.error("[meta-ads] primera lectura", e));
  return "ok";
}

export type ConexionMeta = { cuentas: CuentaAnuncios[]; conectadoTs: string; lecturaTs: string | null; lecturaEstado: string | null };
export const conexionMeta = (org: string) => una<ConexionMeta>(`
  select cuentas, conectado_ts::text "conectadoTs", lectura_ts::text "lecturaTs", lectura_estado "lecturaEstado"
    from meta_ads_credencial where organizacion_id = $1 and estado = 'activo'`, [org]);

export async function desconectarAnunciosMeta(org: string): Promise<void> {
  await consulta("update meta_ads_credencial set estado = 'desconectado' where organizacion_id = $1", [org]);
}

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);

/** Trae el gasto de los últimos `dias` de todas las cuentas conectadas y lo guarda. No tira: un rechazo de Meta queda
 *  como lectura_estado = 'rechazo' (la pantalla avisa que hay que volver a conectar). */
export async function leerAnunciosMeta(org: string, dias = 30): Promise<{ filas: number; estado: string }> {
  const c = await una<{ token: string; cuentas: CuentaAnuncios[] }>("select token, cuentas from meta_ads_credencial where organizacion_id = $1 and estado = 'activo'", [org]);
  if (!c) return { filas: 0, estado: "sin_conexion" };
  const hasta = new Date(), desde = new Date(hasta.getTime() - dias * 86_400_000);
  let filas = 0, estado = "ok";
  for (const cuenta of c.cuentas) {
    let url: string | undefined = `${GRAPH}/${cuenta.id}/insights?${new URLSearchParams({
      level: "ad", fields: "ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks,account_currency",
      time_range: JSON.stringify({ since: fechaIso(desde), until: fechaIso(hasta) }), time_increment: "1", limit: "500", access_token: c.token,
    })}`;
    while (url) {
      const r: Resp = await pedir(url);
      if (!r.ok) { console.error("[meta-ads] insights", cuenta.id, motivoCrudo(r)); estado = "rechazo"; break; }
      for (const f of (r.data.data ?? []) as Record<string, unknown>[]) {
        if (!f.ad_id || f.spend === undefined || !f.date_start) continue;
        await consulta(`
          insert into anuncio_dia (organizacion_id, plataforma, cuenta_id, anuncio_id, anuncio, campana_id, campana, fecha, gasto, moneda, impresiones, clics)
          values ($1, 'meta', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          on conflict (organizacion_id, plataforma, anuncio_id, fecha) do update set cuenta_id = excluded.cuenta_id, anuncio = excluded.anuncio,
            campana_id = excluded.campana_id, campana = excluded.campana, gasto = excluded.gasto, moneda = excluded.moneda,
            impresiones = excluded.impresiones, clics = excluded.clics, actualizado_ts = now()`,
        [org, cuenta.id, String(f.ad_id), f.ad_name ?? null, f.campaign_id ?? null, f.campaign_name ?? null, String(f.date_start),
          Number(f.spend) || 0, String(f.account_currency ?? cuenta.moneda ?? "ARS"),
          f.impressions != null ? Number(f.impressions) : null, f.clicks != null ? Number(f.clicks) : null]);
        filas++;
      }
      url = (r.data.paging as { next?: string } | undefined)?.next;
    }
  }
  await consulta("update meta_ads_credencial set lectura_ts = now(), lectura_estado = $2 where organizacion_id = $1", [org, estado]);
  return { filas, estado };
}

/** Las organizaciones a las que hay que volver a leer (cada 3 horas). */
export async function anunciosMetaPendientes(): Promise<string[]> {
  const f = await consulta<{ organizacion_id: string }>(
    "select organizacion_id from meta_ads_credencial where estado = 'activo' and (lectura_ts is null or lectura_ts < now() - interval '3 hours')").catch(() => []);
  return f.map((x) => x.organizacion_id);
}
