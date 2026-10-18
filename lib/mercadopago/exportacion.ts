// Exportación histórica y mensual de Mercado Pago (orden de Fer del 17/10,
// bitácora #681). Primer paso: el inventario. Para cada cuenta conectada se
// pregunta a Mercado Pago qué fuentes da y desde cuándo, sin generar nada:
//   · quién es la cuenta (/users/me);
//   · Reporte de Todas las transacciones (settlement_report): configuración y
//     reportes ya armados (fechas que cubren);
//   · Reporte de Liquidaciones (release_report): ídem;
//   · Pagos que COBRÓ la cuenta (/v1/payments/search): cuántos y el más viejo;
//   · Pagos que HIZO la cuenta (payer.id): si Mercado Pago los deja ver;
//   · Reportes de Otras operaciones (/v1/reporting/operations/…): qué contesta.
// Todo queda en mp_export_sonda tal cual, para decidir con datos qué fuente
// cubre cada clase de movimiento. Sólo lectura (todo GET).

import { consulta, una } from "@/lib/erp/base";
import { tokenDeConexion, mpPedir } from "@/lib/mercadopago/conexion";

type Resp = { status: number; datos: unknown };
const corto = (d: unknown, n = 600) => (typeof d === "string" ? d : JSON.stringify(d ?? null)).slice(0, n);
const ok = (r: Resp) => r.status >= 200 && r.status < 300;

type Pago = {
  id: number; date_created?: string; date_approved?: string; status?: string; operation_type?: string; currency_id?: string;
  transaction_amount?: number; payment_method_id?: string; payment_type_id?: string; description?: string | null;
  collector_id?: number; payer?: { id?: number | string };
};
const resumenPago = (p: Pago) => ({
  id: p.id, creado: p.date_created, aprobado: p.date_approved, estado: p.status, tipo: p.operation_type, moneda: p.currency_id,
  monto: p.transaction_amount, medio: p.payment_method_id, tipoMedio: p.payment_type_id, descripcion: p.description?.slice(0, 60) ?? null,
  cobrador: p.collector_id, pagador: p.payer?.id ?? null,
});

/** Una búsqueda de pagos: total, el más viejo y el más nuevo (con sus campos principales). */
async function busqueda(token: string, filtros: string) {
  const viejo = await mpPedir<{ results?: Pago[]; paging?: { total?: number } }>(token, "GET", `/v1/payments/search?${filtros}&sort=date_created&criteria=asc&limit=3`);
  if (!ok(viejo)) return { status: viejo.status, respuesta: corto(viejo.datos) };
  const nuevo = await mpPedir<{ results?: Pago[] }>(token, "GET", `/v1/payments/search?${filtros}&sort=date_created&criteria=desc&limit=5`);
  return {
    status: 200, total: viejo.datos.paging?.total ?? null,
    masViejos: (viejo.datos.results ?? []).map(resumenPago),
    masNuevos: ok(nuevo) ? ((nuevo.datos as { results?: Pago[] }).results ?? []).map(resumenPago) : corto(nuevo.datos),
  };
}

/** La lista de reportes armados de una familia (settlement_report / release_report). */
async function reportes(token: string, familia: string) {
  const conf = await mpPedir(token, "GET", `/v1/account/${familia}/config`);
  const lista = await mpPedir<Record<string, unknown>[]>(token, "GET", `/v1/account/${familia}/list`);
  const archivos = Array.isArray(lista.datos) ? lista.datos : [];
  const fechas = (k: string) => archivos.map((a) => String(a[k] ?? "")).filter(Boolean).sort();
  const desde = fechas("begin_date"), hasta = fechas("end_date");
  return {
    config: { status: conf.status, datos: ok(conf) ? conf.datos : corto(conf.datos) },
    lista: {
      status: lista.status, cantidad: archivos.length,
      ...(ok(lista) ? {} : { respuesta: corto(lista.datos) }),
      inicioMasViejo: desde[0] ?? null, finMasNuevo: hasta.at(-1) ?? null,
      campos: archivos[0] ? Object.keys(archivos[0]) : [],
      ejemplos: archivos.slice(0, 3).concat(archivos.length > 3 ? archivos.slice(-3) : []),
    },
  };
}

export type Sonda = Record<string, unknown>;

/** El inventario de una cuenta conectada. Nunca tira: lo que falla queda anotado. */
export async function sondearCuenta(conexionId: number): Promise<Sonda> {
  const token = await tokenDeConexion(conexionId);
  if (!token) return { conexion: "sin llave vigente (desconectada)" };
  const yo = await mpPedir<Record<string, unknown>>(token, "GET", "/users/me");
  const u = (ok(yo) ? yo.datos : {}) as Record<string, unknown> & { identification?: { type?: string; number?: string } };
  const uid = Number(u.id ?? 0);
  const salida: Sonda = {
    usuario: ok(yo)
      ? { id: u.id, nickname: u.nickname, nombre: [u.first_name, u.last_name].filter(Boolean).join(" ") || null, tipoDoc: u.identification?.type ?? null,
          documento: u.identification?.number ?? null, tipoUsuario: u.user_type ?? null, sitio: u.site_id ?? null, alta: u.registration_date ?? u.date_created ?? null,
          estado: u.status ?? null, empresa: u.company ?? null }
      : { status: yo.status, respuesta: corto(yo.datos) },
  };
  salida.todasLasTransacciones = await reportes(token, "settlement_report");
  salida.liquidaciones = await reportes(token, "release_report");
  salida.pagosCobrados = await busqueda(token, "range=date_created&begin_date=NOW-20YEARS&end_date=NOW");
  salida.pagosCobradosSinRango = await busqueda(token, "");
  if (uid) {
    salida.pagosHechos = await busqueda(token, `payer.id=${uid}`);
    salida.pagosHechosRango = await busqueda(token, `payer.id=${uid}&range=date_created&begin_date=NOW-20YEARS&end_date=NOW`);
  }
  const otras: Record<string, unknown> = {};
  for (const r of ["activities_collection", "activities_after_collection", "activities_withdraw"]) {
    for (const ruta of [`/v1/reporting/operations/${r}/config`, `/v1/reporting/operations/${r}/statements`, `/v1/reporting/operations/${r}`]) {
      const x = await mpPedir(token, "GET", ruta);
      otras[ruta] = { status: x.status, respuesta: corto(x.datos, 400) };
    }
  }
  salida.otrasOperaciones = otras;
  return salida;
}

/** El inventario de todas las cuentas conectadas de una organización (o de todas, si no se dice cuál). */
export async function sondearTodas(org?: string): Promise<{ conexion: number; nombre: string | null }[]> {
  const cuentas = await consulta<{ id: number; organizacion_id: string; nombre: string | null }>(
    `select id::int, organizacion_id, nombre from mp_conexion where ($1::text is null or organizacion_id = $1) order by id`, [org ?? null]);
  const hechas = await Promise.all(cuentas.map(async (c) => {
    let datos: Sonda;
    try { datos = await sondearCuenta(c.id); } catch (e) { datos = { error: String(e).slice(0, 300) }; }
    await una("insert into mp_export_sonda (organizacion_id, conexion_id, datos) values ($1, $2, $3) returning id", [c.organizacion_id, c.id, JSON.stringify(datos)]);
    return { conexion: c.id, nombre: c.nombre };
  }));
  return hechas;
}

// ── Muestra de un mes de una cuenta ──────────────────────────────────────
// Para el período pedido (inicio incluido; Mercado Pago no acepta fin
// excluido, así que el fin es el último segundo del período):
//   1. se baja un reporte viejo de Todas las transacciones (para ver sus
//      columnas y probar que la historia vieja se puede bajar);
//   2. si la cuenta no tiene configurado ese reporte para pedirlo por API, se
//      configura (CSV, hora argentina, las mismas columnas del reporte viejo);
//   3. se piden Todas las transacciones y Liquidaciones del período;
//   4. se bajan todos los pagos del período (cobrados y hechos) por la API.
// Lo que contesta cada paso queda en mp_export_paso; los archivos, en
// mp_export_archivo sin tocar. Los reportes pedidos se bajan después
// (Mercado Pago los arma en unos minutos): bajarReportes().

async function cuentaDe(conexionId: number) {
  return una<{ organizacion_id: string; mp_user_id: string }>("select organizacion_id, mp_user_id from mp_conexion where id = $1", [conexionId]);
}

async function anotar(org: string, conexionId: number, paso: string, status: number | null, datos: unknown) {
  await consulta("insert into mp_export_paso (organizacion_id, conexion_id, paso, status, datos) values ($1, $2, $3, $4, $5)",
    [org, conexionId, paso, status, JSON.stringify(datos ?? null)]);
}

/** Baja un archivo tal cual (bytes), sin pasarlo a texto. */
async function bajarCrudo(token: string, ruta: string): Promise<{ status: number; bytes: Buffer | null; motivo?: string }> {
  try {
    const r = await fetch(`https://api.mercadopago.com${ruta}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(120_000) });
    const b = Buffer.from(await r.arrayBuffer());
    return r.ok ? { status: r.status, bytes: b } : { status: r.status, bytes: null, motivo: b.toString("utf8").slice(0, 300) };
  } catch (e) {
    return { status: 0, bytes: null, motivo: String(e).slice(0, 300) };
  }
}

async function guardarArchivo(org: string, conexionId: number, fuente: string, nombre: string, desde: string | null, hasta: string | null, bytes: Buffer) {
  const { createHash } = await import("node:crypto");
  const sha = createHash("sha256").update(bytes).digest("hex");
  await consulta(`insert into mp_export_archivo (organizacion_id, conexion_id, fuente, nombre, desde, hasta, sha256, bytes, contenido)
                  values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (conexion_id, fuente, nombre, sha256) do nothing`,
    [org, conexionId, fuente, nombre, desde, hasta, sha, bytes.length, bytes]);
  return sha;
}

/** Todos los pagos de una búsqueda (de a 100). */
async function todosLosPagos(token: string, filtros: string) {
  const lista: unknown[] = [];
  let total = 0;
  for (let offset = 0; offset < 20_000; offset += 100) {
    const r = await mpPedir<{ results?: unknown[]; paging?: { total?: number } }>(token, "GET", `/v1/payments/search?${filtros}&sort=date_created&criteria=asc&limit=100&offset=${offset}`);
    if (!ok(r)) return { lista, total, completo: false, error: `${r.status} ${corto(r.datos, 200)}` };
    total = r.datos.paging?.total ?? 0;
    lista.push(...(r.datos.results ?? []));
    if (!r.datos.results?.length || lista.length >= total) break;
  }
  return { lista, total, completo: lista.length >= total };
}

/** Período en hora argentina: "2026-09" → del 1/9 00:00 al 30/9 23:59:59 (-03:00), en UTC para los reportes. */
export function periodoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const desde = new Date(Date.UTC(a, m - 1, 1, 3, 0, 0));
  const hasta = new Date(Date.UTC(a, m, 1, 3, 0, 0) - 1000);
  const z = (d: Date) => d.toISOString().slice(0, 19) + "Z";
  const ar = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 19) + ".000-03:00";
  return { desde: z(desde), hasta: z(hasta), desdeAr: ar(desde), hastaAr: ar(hasta).replace(".000", ".999") };
}

export async function muestraMes(conexionId: number, mes: string) {
  const c = await cuentaDe(conexionId);
  const token = await tokenDeConexion(conexionId);
  if (!c || !token) return { error: "cuenta desconectada" };
  const org = c.organizacion_id, p = periodoMes(mes);

  // 1. Un reporte viejo de Todas las transacciones (el CSV más viejo de la lista).
  const lista = await mpPedir<{ file_name?: string; begin_date?: string; end_date?: string; format?: string }[]>(token, "GET", "/v1/account/settlement_report/list");
  const viejos = Array.isArray(lista.datos) ? lista.datos.filter((f) => f.file_name && (f.format ?? "CSV") === "CSV").sort((a, b) => String(a.begin_date).localeCompare(String(b.begin_date))) : [];
  let columnas: string[] = [];
  if (viejos[0]?.file_name) {
    const f = viejos[0];
    const b = await bajarCrudo(token, `/v1/account/settlement_report/${encodeURIComponent(f.file_name!)}`);
    if (b.bytes) {
      await guardarArchivo(org, conexionId, "settlement_report", f.file_name!, f.begin_date ?? null, f.end_date ?? null, b.bytes);
      const cab = b.bytes.toString("utf8").split(/\r?\n/)[0] ?? "";
      const sep = cab.includes(";") ? ";" : ",";
      columnas = cab.split(sep).map((x) => x.replace(/^﻿/, "").replace(/"/g, "").trim()).filter((x) => /^[A-Z0-9_]+$/.test(x));
      await anotar(org, conexionId, "bajar reporte viejo de Todas las transacciones", b.status, { archivo: f.file_name, desde: f.begin_date, hasta: f.end_date, bytes: b.bytes.length, cabecera: cab.slice(0, 1500) });
    } else await anotar(org, conexionId, "bajar reporte viejo de Todas las transacciones", b.status, { archivo: f.file_name, motivo: b.motivo });
  }

  // 2. La configuración para pedirlo por API (sólo si no hay ninguna).
  const conf = await mpPedir(token, "GET", "/v1/account/settlement_report/config");
  if (conf.status === 404) {
    const BASE = ["EXTERNAL_REFERENCE", "SOURCE_ID", "USER_ID", "PAYMENT_METHOD_TYPE", "PAYMENT_METHOD", "SITE", "TRANSACTION_TYPE", "TRANSACTION_AMOUNT",
      "TRANSACTION_CURRENCY", "TRANSACTION_DATE", "FEE_AMOUNT", "SETTLEMENT_NET_AMOUNT", "SETTLEMENT_CURRENCY", "SETTLEMENT_DATE", "REAL_AMOUNT", "COUPON_AMOUNT",
      "METADATA", "MKP_FEE_AMOUNT", "FINANCING_FEE_AMOUNT", "SHIPPING_FEE_AMOUNT", "TAXES_AMOUNT", "INSTALLMENTS", "TAX_DETAIL", "ORDER_ID", "SHIPPING_ID",
      "PACK_ID", "TAXES_DISAGGREGATED", "DESCRIPTION", "MONEY_RELEASE_DATE", "BUSINESS_UNIT", "SUB_UNIT", "PAYER_NAME", "PAYER_ID_TYPE", "PAYER_ID_NUMBER", "OPERATION_TAGS", "BALANCE_AMOUNT"];
    const cols = [...new Set([...(columnas.length ? columnas : []), ...BASE])];
    const cuerpo = (lista: string[]) => ({ file_name_prefix: "laucen-todas", display_timezone: "GMT-03", report_translation: "en", separator: ",",
      frequency: { hour: 0, type: "monthly", value: 1 }, columns: lista.map((key) => ({ key })) });
    let r = await mpPedir(token, "POST", "/v1/account/settlement_report/config", cuerpo(cols));
    await anotar(org, conexionId, "configurar Todas las transacciones", r.status, { columnas: cols, respuesta: corto(r.datos, 1500) });
    if (!ok(r) && columnas.length) {
      r = await mpPedir(token, "POST", "/v1/account/settlement_report/config", cuerpo(columnas));
      await anotar(org, conexionId, "configurar Todas las transacciones (sólo las columnas del reporte viejo)", r.status, { columnas, respuesta: corto(r.datos, 1500) });
    }
  } else await anotar(org, conexionId, "leer configuración de Todas las transacciones", conf.status, conf.datos);

  // 3. Pedir los dos reportes del período.
  for (const familia of ["settlement_report", "release_report"]) {
    const r = await mpPedir(token, "POST", `/v1/account/${familia}`, { begin_date: p.desde, end_date: p.hasta });
    await anotar(org, conexionId, `pedir ${familia}`, r.status, { mes, desde: p.desde, hasta: p.hasta, respuesta: corto(r.datos, 1500) });
  }

  // 4. Los pagos del período por la API (lo que cobró y lo que pagó la cuenta), tal cual vienen.
  const rango = `range=date_created&begin_date=${encodeURIComponent(p.desdeAr)}&end_date=${encodeURIComponent(p.hastaAr)}`;
  for (const [fuente, filtros] of [["payments_cobrados", rango], ["payments_hechos", `payer.id=${c.mp_user_id}&${rango}`]] as const) {
    const t = await todosLosPagos(token, filtros);
    const bytes = Buffer.from(JSON.stringify(t.lista));
    await guardarArchivo(org, conexionId, fuente, `${fuente}-${mes}.json`, p.desde, p.hasta, bytes);
    await anotar(org, conexionId, `bajar ${fuente}`, t.completo ? 200 : null, { mes, total: t.total, bajados: t.lista.length, completo: t.completo, error: (t as { error?: string }).error ?? null });
  }
  return { ok: true, mes };
}

/** Baja los reportes ya armados del período (Todas las transacciones y Liquidaciones). */
export async function bajarReportes(conexionId: number, mes: string) {
  const c = await cuentaDe(conexionId);
  const token = await tokenDeConexion(conexionId);
  if (!c || !token) return { error: "cuenta desconectada" };
  const p = periodoMes(mes);
  const salida: Record<string, unknown> = {};
  for (const familia of ["settlement_report", "release_report"]) {
    const l = await mpPedir<{ file_name?: string; begin_date?: string; end_date?: string; status?: string }[]>(token, "GET", `/v1/account/${familia}/list`);
    const delMes = Array.isArray(l.datos) ? l.datos.filter((f) => f.file_name && f.begin_date?.slice(0, 19) === p.desde.slice(0, 19) && f.end_date?.slice(0, 19) === p.hasta.slice(0, 19)) : [];
    salida[familia] = delMes.map((f) => ({ archivo: f.file_name, estado: f.status }));
    for (const f of delMes) {
      const b = await bajarCrudo(token, `/v1/account/${familia}/${encodeURIComponent(f.file_name!)}`);
      if (b.bytes) await guardarArchivo(c.organizacion_id, conexionId, familia, f.file_name!, f.begin_date ?? null, f.end_date ?? null, b.bytes);
      await anotar(c.organizacion_id, conexionId, `bajar ${familia}`, b.status, { mes, archivo: f.file_name, bytes: b.bytes?.length ?? null, motivo: b.motivo ?? null });
    }
  }
  return salida;
}
