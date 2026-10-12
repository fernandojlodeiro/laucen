// Publicidad: la lectura de Mercado Libre (orden 596). Sólo LEE (la API de
// Product Ads que documenta ML es de lectura). Por cuenta:
//   1. el anunciante (GET /advertising/advertisers?product_id=PADS);
//   2. sus campañas (…/advertisers/{id}/product_ads/campaigns/search), con
//      presupuesto, objetivo (ROAS/ACOS), estado y si ML ajusta el presupuesto
//      solo (automatic_budget);
//   3. las métricas de cada campaña por día (…/product_ads/campaigns/{id}
//      con aggregation_type=DAILY);
//   4. las de cada anuncio por día (…/product_ads/ads/search filtrado por
//      campaña, de a un día por vez).
// Cada lectura relee los últimos `releerDias` (ML suma ventas atribuidas con
// demora); la primera, toda la ventana del veredicto. La corre cada hora el
// job 'meli-publicidad' (sólo lee si pasaron `leerCadaHoras`) y el botón
// «Leer ahora».

import { consulta, una } from "@/lib/erp/base";
import { ml, cuentasDe, type CuentaMl } from "@/lib/mercadolibre/api";
import { configPublicidad } from "@/lib/publicidad/config";

const METRICAS = "clicks,prints,cost,direct_amount,indirect_amount,direct_units_quantity,indirect_units_quantity";
const V2 = { "api-version": "2" };

type Metricas = { clicks?: number; prints?: number; cost?: number; direct_amount?: number; indirect_amount?: number; direct_units_quantity?: number; indirect_units_quantity?: number };
type Campana = { id: number; name?: string; status?: string; strategy?: string; roas_target?: number; acos_target?: number; budget?: number;
  daily_budget?: number; automatic_budget?: boolean; date_created?: string; last_updated?: string };
type Anuncio = { item_id: string; campaign_id?: number; status?: string; title?: string; price?: number; permalink?: string; thumbnail?: string; metrics?: Metricas };

export type Anunciante = { cuentaId: number; canalId: number; nickname: string; anuncianteId: number | null; leido: Date | null; error: string | null };

/** Las cuentas de ML de la organización con su anunciante (si ya se leyó). */
export async function anunciantesDe(org: string): Promise<Anunciante[]> {
  const filas = await consulta<{ cuenta_id: string; canal_id: string; nickname: string | null; anunciante_id: string | null; leido_ts: Date | null; error: string | null }>(`
    select c.id cuenta_id, c.canal_id, coalesce(ca.nombre, c.nickname) nickname, a.anunciante_id, a.leido_ts, a.error
      from meli_cuenta c join canal ca on ca.id = c.canal_id
      left join pub_anunciante a on a.organizacion_id = c.organizacion_id and a.canal_id = c.canal_id
     where c.organizacion_id = $1 and c.estado = 'activa' order by ca.nombre`, [org]);
  return filas.map((f) => ({ cuentaId: Number(f.cuenta_id), canalId: Number(f.canal_id), nickname: f.nickname ?? `cuenta ${f.cuenta_id}`,
    anuncianteId: f.anunciante_id ? Number(f.anunciante_id) : null, leido: f.leido_ts, error: f.error }));
}

/** Hoy en Argentina, 'YYYY-MM-DD'. */
export const hoyAr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const restarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) - n * 86400_000).toISOString().slice(0, 10);

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const metricasDe = (m: Metricas | undefined) => [num(m?.clicks), num(m?.prints), num(m?.cost), num(m?.direct_amount), num(m?.indirect_amount),
  num(m?.direct_units_quantity), num(m?.indirect_units_quantity)];
const conMovimiento = (m: Metricas | undefined) => metricasDe(m).some((x) => x !== 0);

function motivo(status: number, datos: unknown): string {
  const d = datos as { message?: string; description?: string; error?: string } | string;
  const t = typeof d === "string" ? d : d?.message ?? d?.description ?? d?.error ?? "";
  return `Mercado Libre contestó ${status || "nada"}${t ? `: ${String(t).slice(0, 200)}` : ""}`;
}

export type InformeCuenta = { cuenta: string; anunciante: number | null; campanas: number; anuncios: number; dias: number; pedidos: number; error?: string };

async function leerCuenta(org: string, cuenta: CuentaMl, nombre: string, releer: number, primera: number, hasta: number): Promise<InformeCuenta> {
  const inf: InformeCuenta = { cuenta: nombre, anunciante: null, campanas: 0, anuncios: 0, dias: 0, pedidos: 0 };
  const canal = cuenta.canalId!;
  const a = await ml<{ advertisers?: { advertiser_id: number; advertiser_name?: string }[] }>(cuenta, "GET", "/advertising/advertisers?product_id=PADS", undefined, { "api-version": "1" });
  inf.pedidos++;
  const anunciante = a.status === 200 ? a.datos.advertisers?.[0] ?? null : null;
  // 404 "No permissions found" = la cuenta nunca usó publicidad: no es un error.
  const error = a.status === 200 || a.status === 404 ? null : motivo(a.status, a.datos);
  await consulta(`insert into pub_anunciante (organizacion_id, canal_id, cuenta_id, anunciante_id, nombre, leido_ts, error) values ($1, $2, $3, $4, $5, now(), $6)
                  on conflict (organizacion_id, canal_id) do update set cuenta_id = excluded.cuenta_id, anunciante_id = case when excluded.error is null then excluded.anunciante_id else pub_anunciante.anunciante_id end,
                    nombre = coalesce(excluded.nombre, pub_anunciante.nombre), leido_ts = now(), error = excluded.error`,
    [org, canal, cuenta.id, anunciante?.advertiser_id ?? null, anunciante?.advertiser_name ?? null, error]);
  if (error) return { ...inf, error };
  if (!anunciante) return inf;
  inf.anunciante = anunciante.advertiser_id;

  const campanas: Campana[] = [];
  for (let offset = 0; offset < 1000; offset += 50) {
    const r = await ml<{ results?: Campana[]; paging?: { total?: number } }>(cuenta, "GET",
      `/advertising/MLA/advertisers/${anunciante.advertiser_id}/product_ads/campaigns/search?limit=50&offset=${offset}`, undefined, V2);
    inf.pedidos++;
    if (r.status !== 200) return { ...inf, error: motivo(r.status, r.datos) };
    campanas.push(...(r.datos.results ?? []));
    if (offset + 50 >= num(r.datos.paging?.total)) break;
  }
  inf.campanas = campanas.length;
  const hoy = hoyAr();
  for (const c of campanas) {
    await consulta(`insert into pub_campana (organizacion_id, campana_id, canal_id, anunciante_id, nombre, estado, estrategia, roas_objetivo, acos_objetivo,
                      presupuesto, presupuesto_diario, presupuesto_automatico, creada_ts, actualizada_ts, leido_ts, crudo)
                    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), $15::jsonb)
                    on conflict (organizacion_id, campana_id) do update set canal_id = excluded.canal_id, nombre = excluded.nombre, estado = excluded.estado,
                      estrategia = excluded.estrategia, roas_objetivo = excluded.roas_objetivo, acos_objetivo = excluded.acos_objetivo, presupuesto = excluded.presupuesto,
                      presupuesto_diario = excluded.presupuesto_diario, presupuesto_automatico = excluded.presupuesto_automatico, creada_ts = excluded.creada_ts,
                      actualizada_ts = excluded.actualizada_ts, leido_ts = now(), crudo = excluded.crudo`,
      [org, c.id, canal, anunciante.advertiser_id, c.name ?? null, c.status ?? null, c.strategy ?? null, c.roas_target ?? null, c.acos_target ?? null,
        c.budget ?? null, c.daily_budget ?? null, c.automatic_budget ?? null, c.date_created ?? null, c.last_updated ?? null, JSON.stringify(c)]);

    // Cuántos días leer: los últimos `releer` si ya hay historia; si no, la ventana entera (sin ir antes de que existiera la campaña).
    const ya = await una<{ n: number }>("select count(*)::int n from pub_campana_dia where organizacion_id = $1 and campana_id = $2", [org, c.id]);
    let desde = restarDias(hoy, (ya?.n ? releer : primera) - 1);
    const creada = c.date_created?.slice(0, 10);
    if (creada && creada > desde) desde = creada;
    // Una campaña pausada desde antes de lo que se relee no cambia: no se vuelve a pedir.
    if (ya?.n && c.status !== "active" && c.last_updated && c.last_updated.slice(0, 10) < desde) continue;

    const d = await ml<{ results?: (Metricas & { date: string })[] }>(cuenta, "GET",
      `/advertising/MLA/product_ads/campaigns/${c.id}?date_from=${desde}&date_to=${hoy}&metrics=${METRICAS}&aggregation_type=DAILY`, undefined, V2);
    inf.pedidos++;
    if (d.status !== 200) { inf.error = motivo(d.status, d.datos); continue; }
    for (const m of d.datos.results ?? []) {
      await consulta(`insert into pub_campana_dia (organizacion_id, campana_id, fecha, clics, impresiones, costo, monto_directo, monto_indirecto, unidades_directas, unidades_indirectas, leido_ts)
                      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
                      on conflict (organizacion_id, campana_id, fecha) do update set clics = excluded.clics, impresiones = excluded.impresiones, costo = excluded.costo,
                        monto_directo = excluded.monto_directo, monto_indirecto = excluded.monto_indirecto, unidades_directas = excluded.unidades_directas,
                        unidades_indirectas = excluded.unidades_indirectas, leido_ts = now()`, [org, c.id, m.date, ...metricasDe(m)]);
    }
    // Los días con gasto o ventas: el detalle por anuncio.
    const conGasto = new Set((d.datos.results ?? []).filter(conMovimiento).map((m) => m.date));
    for (let f = desde; f <= hoy; f = restarDias(f, -1)) {
      if (Date.now() > hasta) { inf.error = "faltó tiempo: sigue en la próxima lectura"; return inf; }
      await consulta("delete from pub_anuncio_dia where organizacion_id = $1 and campana_id = $2 and fecha = $3", [org, c.id, f]);
      if (!conGasto.has(f) && f !== hoy) continue;
      for (let offset = 0; offset < 5000; offset += 50) {
        const r = await ml<{ results?: Anuncio[]; paging?: { total?: number } }>(cuenta, "GET",
          `/advertising/MLA/advertisers/${anunciante.advertiser_id}/product_ads/ads/search?limit=50&offset=${offset}&filters[campaign_id]=${c.id}&date_from=${f}&date_to=${f}&metrics=${METRICAS}`, undefined, V2);
        inf.pedidos++;
        if (r.status !== 200) { inf.error = motivo(r.status, r.datos); break; }
        for (const x of r.datos.results ?? []) {
          if (f === hoy) {
            await consulta(`insert into pub_anuncio (organizacion_id, item_id, canal_id, campana_id, estado, titulo, precio, permalink, foto, leido_ts)
                            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
                            on conflict (organizacion_id, item_id) do update set canal_id = excluded.canal_id, campana_id = excluded.campana_id, estado = excluded.estado,
                              titulo = excluded.titulo, precio = excluded.precio, permalink = excluded.permalink, foto = excluded.foto, leido_ts = now()`,
              [org, x.item_id, canal, x.campaign_id ?? c.id, x.status ?? null, x.title ?? null, x.price ?? null, x.permalink ?? null, x.thumbnail ?? null]);
            inf.anuncios++;
          }
          if (!conMovimiento(x.metrics)) continue;
          await consulta(`insert into pub_anuncio_dia (organizacion_id, item_id, fecha, campana_id, canal_id, clics, impresiones, costo, monto_directo, monto_indirecto, unidades_directas, unidades_indirectas, leido_ts)
                          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
                          on conflict (organizacion_id, item_id, fecha) do update set campana_id = excluded.campana_id, canal_id = excluded.canal_id, clics = excluded.clics,
                            impresiones = excluded.impresiones, costo = excluded.costo, monto_directo = excluded.monto_directo, monto_indirecto = excluded.monto_indirecto,
                            unidades_directas = excluded.unidades_directas, unidades_indirectas = excluded.unidades_indirectas, leido_ts = now()`,
            [org, x.item_id, f, c.id, canal, ...metricasDe(x.metrics)]);
        }
        if (offset + 50 >= num(r.datos.paging?.total)) break;
      }
      inf.dias++;
    }
  }
  return inf;
}

export type InformeLectura = { cuentas: InformeCuenta[]; segundos: number };

/** Lee la publicidad de todas las cuentas de la organización. `hasta`: hora tope (ms). */
export async function leerPublicidad(org: string, hasta = Date.now() + 240_000): Promise<InformeLectura> {
  const t0 = Date.now();
  const cfg = await configPublicidad(org);
  const lectura = await una<{ id: string }>("insert into pub_lectura (organizacion_id) values ($1) returning id", [org]);
  const nombres = new Map((await consulta<{ id: string; nombre: string }>("select id, nombre from canal where organizacion_id = $1", [org])).map((c) => [Number(c.id), c.nombre]));
  const cuentas = (await cuentasDe(org)).filter((c) => c.estado === "activa" && c.canalId);
  const informe: InformeCuenta[] = [];
  for (const c of cuentas) {
    const nombre = nombres.get(c.canalId!) ?? c.nickname ?? String(c.meliUserId);
    try {
      informe.push(await leerCuenta(org, c, nombre, cfg.releerDias, Math.min(90, Math.max(cfg.ventanaDias, cfg.releerDias)), hasta));
    } catch (e) {
      informe.push({ cuenta: nombre, anunciante: null, campanas: 0, anuncios: 0, dias: 0, pedidos: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const errores = informe.filter((i) => i.error).map((i) => `${i.cuenta}: ${i.error}`).join(" · ") || null;
  await consulta("update pub_lectura set fin_ts = now(), informe = $2::jsonb, error = $3 where id = $1", [lectura!.id, JSON.stringify(informe), errores]);
  return { cuentas: informe, segundos: Math.round((Date.now() - t0) / 1000) };
}

/** ¿Toca leer? (pasaron `leerCadaHoras` desde la última lectura terminada). */
export async function tocaLeer(org: string): Promise<boolean> {
  const cfg = await configPublicidad(org);
  const u = await una<{ fin_ts: Date | null }>("select max(fin_ts) fin_ts from pub_lectura where organizacion_id = $1", [org]);
  return !u?.fin_ts || Date.now() - new Date(u.fin_ts).getTime() >= cfg.leerCadaHoras * 3600_000 - 5 * 60_000;
}
