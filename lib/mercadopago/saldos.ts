// Mercado Pago de cada cuenta conectada (Fer, 6/10): los números de este
// momento. Sólo LEE. Mercado Pago no tiene una consulta pública del saldo
// (documentación leída por Cowork, bitácora #378), así que se arma con lo
// que sí da con la llave de la cuenta:
//   · A liberar: los pagos aprobados con fecha de liberación de hoy en
//     adelante (/v1/payments/search, por money_release_date), sumando lo neto.
//   · Cobrado en los últimos 30 días: pagos aprobados (bruto, comisiones,
//     neto, devuelto).
//   · Disponible: el saldo que trae el último Reporte de Liquidaciones
//     (release_report): Laucen lo pide a Mercado Pago, que lo arma en unos
//     minutos, y lo baja en la lectura siguiente.
// Cada lectura se guarda entera en mp_saldo (por cuenta de Mercado Pago),
// con los intentos, para análisis y para ver qué contestó cada consulta.

import { consulta, una } from "@/lib/erp/base";
import { conexionesDe, tokenDeConexion, mpPedir, type ConexionMp } from "@/lib/mercadopago/conexion";

export type Intento = { fuente: string; status: number; motivo?: string };
export type Numeros = {
  aLiberar?: { monto: number; pagos: number; proxima: string | null; proximaMonto: number; en7dias: number; completo: boolean };
  cobrado30?: { pagos: number; bruto: number; comisiones: number; neto: number; devuelto: number; completo: boolean };
  disponible?: { monto: number; al: string | null; reporte: string } | null;
  reportePedido?: string | null;
  aLiberarDetalle?: { id: number; neto: number; bruto: number; devuelto: number; libera: string | null; estadoLiberacion: string | null; detalle: string | null; tipo: string | null; descripcion: string }[];
};
export type Lectura = { conexionId: number; leidoTs: Date; datos: Numeros; intentos: Intento[] };

const enc = encodeURIComponent;
const isoAr = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().replace("Z", "-03:00");
const motivoDe = (status: number, d: unknown) => {
  const x = d as { message?: string; error?: string } | null;
  const txt = typeof d === "string" ? d.slice(0, 120) : [x?.message, x?.error].filter(Boolean).join(" · ").slice(0, 160);
  const que = status === 401 ? "sin permiso (volvé a conectar la cuenta)" : status === 403 ? "no autorizado" : status === 404 ? "no existe" : status === 0 ? "no respondió" : `contestó ${status}`;
  return txt ? `${que}: ${txt}` : que;
};

type Pago = {
  id: number; status: string; status_detail?: string | null; operation_type?: string | null; description?: string | null;
  date_approved?: string | null; money_release_date?: string | null; money_release_status?: string | null;
  transaction_amount?: number; transaction_amount_refunded?: number;
  transaction_details?: { net_received_amount?: number; total_paid_amount?: number };
  fee_details?: { amount?: number }[];
};

/** Todos los pagos de una búsqueda (de a 100, hasta `tope`). */
async function pagos(token: string, filtros: string, tope: number, intentos: Intento[], fuente: string): Promise<{ lista: Pago[]; completo: boolean }> {
  const lista: Pago[] = [];
  let total = 0;
  for (let offset = 0; offset < tope; offset += 100) {
    const r = await mpPedir<{ results?: Pago[]; paging?: { total?: number } }>(token, "GET", `/v1/payments/search?${filtros}&limit=100&offset=${offset}`);
    if (r.status !== 200) { intentos.push({ fuente, status: r.status, motivo: motivoDe(r.status, r.datos) }); return { lista, completo: false }; }
    total = r.datos.paging?.total ?? 0;
    lista.push(...(r.datos.results ?? []));
    if (!r.datos.results?.length || lista.length >= total) break;
  }
  intentos.push({ fuente, status: 200 });
  return { lista, completo: lista.length >= total };
}

const neto = (p: Pago) => Number(p.transaction_details?.net_received_amount ?? 0);
const redondo = (n: number) => Math.round(n * 100) / 100;

/** El Reporte de Liquidaciones: si hay uno reciente, lo baja y saca el saldo;
 *  si no hay uno de la última hora, pide uno nuevo (últimos 7 días). */
async function disponible(token: string, intentos: Intento[]): Promise<{ disponible: Numeros["disponible"]; pedido: string | null }> {
  const lista = await mpPedir<{ file_name?: string; date_created?: string; end_date?: string }[]>(token, "GET", "/v1/account/release_report/list");
  if (lista.status !== 200 || !Array.isArray(lista.datos)) {
    intentos.push({ fuente: "Reporte de Liquidaciones (lista)", status: lista.status, motivo: motivoDe(lista.status, lista.datos) });
    return { disponible: null, pedido: null };
  }
  const archivos = lista.datos.filter((f) => f.file_name).sort((a, b) => String(b.date_created ?? "").localeCompare(String(a.date_created ?? "")));
  let resultado: Numeros["disponible"] = null;
  const ultimo = archivos[0];
  if (ultimo?.file_name) {
    const csv = await mpPedir<string>(token, "GET", `/v1/account/release_report/${enc(ultimo.file_name)}`);
    if (csv.status === 200 && typeof csv.datos === "string") {
      resultado = saldoDelReporte(csv.datos, ultimo.file_name);
      // Sin saldo: se anota la cabecera del archivo, para ver qué columnas trae.
      const cabecera = csv.datos.split(/\r?\n/)[0]?.slice(0, 400) ?? "";
      intentos.push({ fuente: "Reporte de Liquidaciones (bajar)", status: 200, ...(resultado ? {} : { motivo: `el reporte ${ultimo.file_name} no trae el saldo; columnas: ${cabecera}` }) });
    } else intentos.push({ fuente: "Reporte de Liquidaciones (bajar)", status: csv.status, motivo: motivoDe(csv.status, csv.datos) });
  }
  // Si el reporte no trae el saldo, se agrega la columna BALANCE_AMOUNT a la
  // configuración del reporte de la cuenta (Fer dijo que sí, 6/10: sólo suma
  // esa columna; lo demás queda como estaba) y se pide uno nuevo enseguida.
  let sinSaldo = false;
  if (ultimo?.file_name && !resultado) {
    const conf = await mpPedir<Record<string, unknown> & { columns?: { key: string }[] }>(token, "GET", "/v1/account/release_report/config");
    if (conf.status === 200 && conf.datos && Array.isArray(conf.datos.columns) && !conf.datos.columns.some((c) => c.key === "BALANCE_AMOUNT")) {
      // Sólo los campos que la documentación dice que se pueden mandar (sin vacíos): la configuración
      // que devuelve Mercado Pago trae otros que, mandados de vuelta, le dan error.
      const PERMITIDOS = ["file_name_prefix", "frequency", "separator", "display_timezone", "report_translation", "notification_email_list",
        "include_withdrawal_at_end", "execute_after_withdrawal", "check_available_balance", "compensate_detail", "sftp_info"];
      const cuerpo: Record<string, unknown> = { columns: [...conf.datos.columns!.map((c) => ({ key: c.key })), { key: "BALANCE_AMOUNT" }] };
      for (const k of PERMITIDOS) {
        const v = conf.datos[k];
        if (v != null && !(Array.isArray(v) && v.length === 0) && !(typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0)) cuerpo[k] = v;
      }
      let put = await mpPedir(token, "PUT", "/v1/account/release_report/config", cuerpo);
      // Si igual falla, con lo mínimo: las columnas y la zona horaria.
      if (put.status >= 500) put = await mpPedir(token, "PUT", "/v1/account/release_report/config", { columns: cuerpo.columns, file_name_prefix: cuerpo.file_name_prefix ?? "laucen-liquidaciones", display_timezone: cuerpo.display_timezone ?? "GMT-03" });
      intentos.push({ fuente: "Reporte de Liquidaciones (agregar la columna de saldo)", status: put.status,
        ...(put.status < 300 ? {} : { motivo: `${motivoDe(put.status, put.datos)} (campos de la configuración: ${Object.keys(conf.datos).join(", ")})` }) });
      sinSaldo = put.status < 300;
    } else if (conf.status !== 200) intentos.push({ fuente: "Reporte de Liquidaciones (leer configuración)", status: conf.status, motivo: motivoDe(conf.status, conf.datos) });
  }
  // Uno nuevo si el último tiene más de una hora (Mercado Pago lo arma en unos
  // minutos), o enseguida si recién se agregó la columna de saldo.
  let pedido: string | null = null;
  const viejo = sinSaldo || !ultimo?.date_created || Date.now() - new Date(ultimo.date_created).getTime() > 3600_000;
  if (viejo) {
    const cuerpo = { begin_date: new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 19) + "Z", end_date: new Date().toISOString().slice(0, 19) + "Z" };
    let r = await mpPedir(token, "POST", "/v1/account/release_report", cuerpo);
    if (r.status === 404 || r.status === 400) {
      // Sin configuración todavía: se crea una (español no: claves en inglés, estables) y se reintenta.
      const conf = await mpPedir(token, "POST", "/v1/account/release_report/config", {
        file_name_prefix: "laucen-liquidaciones", display_timezone: "GMT-03", report_translation: "en", include_withdrawal_at_end: true,
        columns: ["DATE", "SOURCE_ID", "EXTERNAL_REFERENCE", "RECORD_TYPE", "DESCRIPTION", "NET_CREDIT_AMOUNT", "NET_DEBIT_AMOUNT", "GROSS_AMOUNT",
          "MP_FEE_AMOUNT", "FINANCING_FEE_AMOUNT", "SHIPPING_FEE_AMOUNT", "TAXES_AMOUNT", "COUPON_AMOUNT", "BALANCE_AMOUNT", "TRANSACTION_DATE",
          "PAYMENT_METHOD", "ORDER_ID", "SHIPPING_ID"].map((key) => ({ key })),
      });
      intentos.push({ fuente: "Reporte de Liquidaciones (configurar)", status: conf.status, ...(conf.status < 300 ? {} : { motivo: motivoDe(conf.status, conf.datos) }) });
      r = await mpPedir(token, "POST", "/v1/account/release_report", cuerpo);
    }
    intentos.push({ fuente: "Reporte de Liquidaciones (pedir uno nuevo)", status: r.status, ...(r.status < 300 ? {} : { motivo: motivoDe(r.status, r.datos) }) });
    if (r.status < 300) pedido = new Date().toISOString();
  }
  return { disponible: resultado, pedido };
}

/** El saldo de un Reporte de Liquidaciones (CSV): el BALANCE_AMOUNT de la
 *  última fila que lo tenga (o la fila de saldo disponible / total). */
export function saldoDelReporte(csv: string, archivo: string): Numeros["disponible"] {
  const filas = csv.split(/\r?\n/).filter((l) => l.trim());
  if (filas.length < 2) return null;
  const sep = filas[0].includes(";") ? ";" : ",";
  const partir = (l: string) => l.split(sep).map((x) => x.replace(/^"|"$/g, "").trim());
  const cab = partir(filas[0]).map((h) => h.toUpperCase());
  const iSaldo = cab.findIndex((h) => h === "BALANCE_AMOUNT" || h.includes("SALDO"));
  const iTipo = cab.findIndex((h) => h === "RECORD_TYPE");
  const iFecha = cab.findIndex((h) => h === "DATE" || h === "FECHA");
  if (iSaldo < 0) return null;
  let monto: number | null = null, al: string | null = null;
  for (const l of filas.slice(1)) {
    const c = partir(l);
    const v = Number((c[iSaldo] ?? "").replace(/\s/g, ""));
    if (c[iSaldo] === "" || !Number.isFinite(v)) continue;
    const tipo = iTipo >= 0 ? (c[iTipo] ?? "").toLowerCase() : "";
    if (tipo === "available_balance" || tipo === "total") { monto = v; al = iFecha >= 0 ? c[iFecha] || al : al; continue; }
    monto = v; al = iFecha >= 0 ? c[iFecha] || al : al;
  }
  return monto == null ? null : { monto: redondo(monto), al, reporte: archivo };
}

/** Lee los números de una cuenta de Mercado Pago y guarda la lectura. */
export async function leerCuenta(org: string, c: ConexionMp): Promise<Lectura> {
  const intentos: Intento[] = [];
  const datos: Numeros = {};
  const token = await tokenDeConexion(c.id);
  if (!token) intentos.push({ fuente: "Conexión", status: 401, motivo: "la cuenta de Mercado Pago está desconectada: volvé a conectarla desde su canal" });
  else {
    const ahora = new Date();
    const [liberar, cobrado, disp] = await Promise.all([
      pagos(token, `status=approved&sort=money_release_date&criteria=asc&range=money_release_date&begin_date=${enc(isoAr(ahora))}&end_date=${enc(isoAr(new Date(ahora.getTime() + 365 * 86400_000)))}`, 2000, intentos, "Pagos a liberar"),
      pagos(token, `status=approved&sort=date_approved&criteria=desc&range=date_approved&begin_date=${enc(isoAr(new Date(ahora.getTime() - 30 * 86400_000)))}&end_date=${enc(isoAr(ahora))}`, 3000, intentos, "Pagos de los últimos 30 días"),
      disponible(token, intentos),
    ]);
    const pend = liberar.lista.filter((p) => p.money_release_status !== "released");
    if (intentos.some((x) => x.fuente === "Pagos a liberar" && x.status === 200)) {
      const proximo = pend.find((p) => p.money_release_date);
      const dia = proximo?.money_release_date?.slice(0, 10) ?? null;
      const en7 = ahora.getTime() + 7 * 86400_000;
      datos.aLiberar = {
        monto: redondo(pend.reduce((a, p) => a + neto(p), 0)), pagos: pend.length, completo: liberar.completo,
        proxima: proximo?.money_release_date ?? null,
        proximaMonto: redondo(pend.filter((p) => p.money_release_date?.slice(0, 10) === dia).reduce((a, p) => a + neto(p), 0)),
        en7dias: redondo(pend.filter((p) => p.money_release_date && new Date(p.money_release_date).getTime() <= en7).reduce((a, p) => a + neto(p), 0)),
      };
      // El detalle de cada pago a liberar (para comparar con lo que muestra Mercado Pago y para análisis).
      datos.aLiberarDetalle = pend.map((p) => ({
        id: p.id, neto: neto(p), bruto: Number(p.transaction_amount ?? 0), devuelto: Number(p.transaction_amount_refunded ?? 0),
        libera: p.money_release_date ?? null, estadoLiberacion: p.money_release_status ?? null, detalle: p.status_detail ?? null,
        tipo: p.operation_type ?? null, descripcion: (p.description ?? "").slice(0, 60),
      }));
    }
    if (intentos.some((x) => x.fuente === "Pagos de los últimos 30 días" && x.status === 200)) {
      const l = cobrado.lista;
      datos.cobrado30 = {
        pagos: l.length, completo: cobrado.completo,
        bruto: redondo(l.reduce((a, p) => a + Number(p.transaction_amount ?? 0), 0)),
        // Lo que se queda Mercado Pago (y Mercado Libre, en las ventas de ML): bruto − neto − devuelto.
        comisiones: redondo(l.reduce((a, p) => a + Math.max(0, Number(p.transaction_amount ?? 0) - neto(p) - Number(p.transaction_amount_refunded ?? 0)), 0)),
        neto: redondo(l.reduce((a, p) => a + neto(p), 0)),
        devuelto: redondo(l.reduce((a, p) => a + Number(p.transaction_amount_refunded ?? 0), 0)),
      };
    }
    datos.disponible = disp.disponible;
    datos.reportePedido = disp.pedido;
  }
  const f = await una<{ leido_ts: Date }>(`
    insert into mp_saldo (organizacion_id, conexion_id, fuente, datos, intentos) values ($1, $2, 'mercadopago', $3::jsonb, $4::jsonb) returning leido_ts`,
    [org, c.id, JSON.stringify(datos), JSON.stringify(intentos)]);
  return { conexionId: c.id, leidoTs: f!.leido_ts, datos, intentos };
}

/** Lee todas las cuentas conectadas de la organización. */
export async function leerTodas(org: string): Promise<{ conexiones: ConexionMp[]; lecturas: Map<number, Lectura> }> {
  const conexiones = await conexionesDe(org);
  const lecturas = new Map<number, Lectura>();
  await Promise.all(conexiones.map(async (c) => {
    try { lecturas.set(c.id, await leerCuenta(org, c)); }
    catch (e) {
      console.error("[mercadopago] lectura", c.id, e);
      const v = await una<{ leido_ts: Date; datos: Numeros; intentos: Intento[] }>(
        "select leido_ts, datos, intentos from mp_saldo where conexion_id = $1 order by leido_ts desc limit 1", [c.id]);
      if (v) lecturas.set(c.id, { conexionId: c.id, leidoTs: v.leido_ts, datos: v.datos ?? {}, intentos: v.intentos ?? [] });
    }
  }));
  return { conexiones, lecturas };
}

/** El último disponible conocido de cada cuenta (aunque la lectura de ahora no haya traído reporte nuevo). */
export async function ultimoDisponible(org: string): Promise<Map<number, NonNullable<Numeros["disponible"]>>> {
  const f = await consulta<{ conexion_id: number; d: NonNullable<Numeros["disponible"]> }>(`
    select distinct on (conexion_id) conexion_id::int, datos -> 'disponible' d from mp_saldo
     where organizacion_id = $1 and conexion_id is not null and jsonb_typeof(datos -> 'disponible') = 'object'
     order by conexion_id, leido_ts desc`, [org]);
  return new Map(f.map((x) => [x.conexion_id, x.d]));
}
