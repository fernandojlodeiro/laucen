// La cola de la exportación de Mercado Pago (orden de Fer del 17/10, #681):
// el año entero (y lo que haya antes) de cada cuenta, mes por mes, pedido y
// bajado de a poco. La vuelta (/api/mercadopago/exportacion?accion=vuelta,
// pg_cron 'mp-export' cada 2 minutos) mueve cada período:
//   pendiente → pedido (Mercado Pago lo arma) → listo / vacio / error.
// Una falla reintenta con espera; una cuenta que falla no frena a las demás;
// nada se da por completo si Mercado Pago no lo entregó. Sólo lee de Mercado
// Pago, le pide reportes y le ajusta la configuración de esos reportes.
// Sirve igual para las cuentas de la empresa y las del espacio personal (el
// Destino dice dónde se guarda cada cosa).

import { consulta } from "@/lib/erp/base";
import { mpPedir } from "@/lib/mercadopago/conexion";
import { bajarCrudo, guardarArchivo, todosLosPagos, destinoEmpresa, type Destino, type Item } from "@/lib/mercadopago/exportacion";
import { destinoPersonal } from "@/lib/personal/mercadopago";

const ok = (s: number) => s >= 200 && s < 300;
const corto = (d: unknown, n = 300) => (typeof d === "string" ? d : JSON.stringify(d ?? null)).slice(0, n);
const REPORTES = ["settlement_report", "release_report"] as const;

/** Primer instante del mes en hora argentina (UTC-3), en UTC. */
const inicioMes = (a: number, m: number) => new Date(Date.UTC(a, m - 1, 1, 3, 0, 0));
const z = (d: Date) => d.toISOString().slice(0, 19) + "Z";

/** Los períodos a exportar: cada mes cerrado de `desdeMes` a `hastaMes` (AAAA-MM) y, si `parcial`,
 *  el mes en curso hasta este momento. Cada mes: inicio incluido, fin = último segundo del mes. */
export function periodos(desdeMes: string, hastaMes: string, parcial: boolean, ahora = new Date()) {
  const salida: { desde: string; hasta: string; etiqueta: string }[] = [];
  let [a, m] = desdeMes.split("-").map(Number);
  const [ha, hm] = hastaMes.split("-").map(Number);
  while (a < ha || (a === ha && m <= hm)) {
    const ini = inicioMes(a, m), fin = new Date(inicioMes(m === 12 ? a + 1 : a, m === 12 ? 1 : m + 1).getTime() - 1000);
    salida.push({ desde: z(ini), hasta: z(fin), etiqueta: `${a}-${String(m).padStart(2, "0")}` });
    if (++m > 12) { m = 1; a++; }
  }
  if (parcial) {
    const ar = new Date(ahora.getTime() - 3 * 3600_000);
    const ini = inicioMes(ar.getUTCFullYear(), ar.getUTCMonth() + 1);
    const fin = new Date(Math.floor(ahora.getTime() / 1000) * 1000 - 60_000);
    salida.push({ desde: z(ini), hasta: z(fin), etiqueta: `${ar.getUTCFullYear()}-${String(ar.getUTCMonth() + 1).padStart(2, "0")} (parcial al ${fin.toISOString().slice(0, 16).replace("T", " ")} UTC)` });
  }
  return salida;
}

/** Pone en la cola: ajustar la configuración, bajar los reportes que Mercado Pago ya tiene armados,
 *  y por cada período, Todas las transacciones, Liquidaciones y los pagos de la API. */
export async function encolar(d: Destino, desdeMes: string, hastaMes: string, parcial: boolean): Promise<number> {
  const items: { fuente: string; desde: string | null; hasta: string | null; etiqueta: string }[] = [
    { fuente: "config", desde: null, hasta: null, etiqueta: "configuración de los reportes" },
    { fuente: "existentes", desde: null, hasta: null, etiqueta: "reportes que Mercado Pago ya tenía armados" },
  ];
  for (const p of periodos(desdeMes, hastaMes, parcial)) {
    for (const fuente of [...REPORTES, "payments"]) items.push({ fuente, ...p });
  }
  return d.cola.crear(items);
}

// Columnas que se le suman al reporte de Todas las transacciones (si Mercado Pago acepta cada una).
const EXTRAS = ["DESCRIPTION", "MONEY_RELEASE_DATE", "TAXES_AMOUNT", "MKP_FEE_AMOUNT", "FINANCING_FEE_AMOUNT", "SHIPPING_FEE_AMOUNT", "INSTALLMENTS",
  "TAX_DETAIL", "TAXES_DISAGGREGATED", "ORDER_ID", "PACK_ID", "SHIPPING_ID", "OPERATION_TAGS", "BUSINESS_UNIT", "SUB_UNIT", "PURCHASE_ID",
  "PAY_BANK_TRANSFER_ID", "POI_WALLET_NAME", "POI_BANK_NAME", "SELLER_AMOUNT", "IS_RELEASED", "ISSUER_NAME"];
const BASICAS = ["EXTERNAL_REFERENCE", "SOURCE_ID", "USER_ID", "PAYMENT_METHOD_TYPE", "PAYMENT_METHOD", "SITE", "TRANSACTION_TYPE", "TRANSACTION_AMOUNT",
  "TRANSACTION_CURRENCY", "TRANSACTION_DATE", "FEE_AMOUNT", "SETTLEMENT_NET_AMOUNT", "SETTLEMENT_CURRENCY", "SETTLEMENT_DATE", "REAL_AMOUNT", "COUPON_AMOUNT", "METADATA"];

/** Todas las transacciones con los retiros incluidos, hora argentina y las columnas que acepte. */
async function ajustarConfig(d: Destino, token: string): Promise<string> {
  let conf = await mpPedir<{ columns?: { key: string }[]; file_name_prefix?: string }>(token, "GET", "/v1/account/settlement_report/config");
  if (conf.status === 404) {
    const r = await mpPedir(token, "POST", "/v1/account/settlement_report/config",
      { columns: BASICAS.map((key) => ({ key })), file_name_prefix: "laucen-todas", display_timezone: "GMT-03", include_withdraw: true });
    await d.anotar("crear configuración de Todas las transacciones", r.status, corto(r.datos, 800));
    conf = await mpPedir(token, "GET", "/v1/account/settlement_report/config");
  }
  if (!ok(conf.status)) throw new Error(`No se pudo leer la configuración de Todas las transacciones (${conf.status}).`);
  let columnas = (conf.datos.columns ?? []).map((c) => c.key);
  const prefijo = conf.datos.file_name_prefix || "laucen-todas";
  const poner = (cols: string[]) => mpPedir(token, "PUT", "/v1/account/settlement_report/config",
    { columns: cols.map((key) => ({ key })), file_name_prefix: prefijo, display_timezone: "GMT-03", include_withdraw: true });
  const faltan = EXTRAS.filter((x) => !columnas.includes(x));
  let r = await poner([...columnas, ...faltan]);
  const rechazadas: string[] = [];
  if (ok(r.status)) columnas = [...columnas, ...faltan];
  else {
    // Mercado Pago contesta 400 sin decir qué columna no le gusta: se prueban de a una.
    r = await poner(columnas);
    if (!ok(r.status)) {
      await d.anotar("ajustar configuración de Todas las transacciones", r.status, corto(r.datos, 800));
      throw new Error(`Mercado Pago no aceptó incluir los retiros en Todas las transacciones (${r.status}).`);
    }
    for (const x of faltan) {
      const p = await poner([...columnas, x]);
      if (ok(p.status)) columnas.push(x); else rechazadas.push(x);
    }
  }
  await d.anotar("ajustar configuración de Todas las transacciones", 200, { columnas, rechazadas, include_withdraw: true, display_timezone: "GMT-03" });
  return `Retiros incluidos, hora argentina, ${columnas.length} columnas${rechazadas.length ? ` (no aceptó: ${rechazadas.join(", ")})` : ""}.`;
}

type Archivo = { file_name?: string; begin_date?: string; end_date?: string; status?: string };
const lista = async (token: string, familia: string) => {
  const l = await mpPedir<Archivo[]>(token, "GET", `/v1/account/${familia}/list`);
  return { status: l.status, archivos: Array.isArray(l.datos) ? l.datos.filter((f) => f.file_name) : [] };
};
const delPeriodo = (archivos: Archivo[], it: Item) =>
  archivos.filter((f) => f.begin_date?.slice(0, 19) === z(it.desde!).slice(0, 19) && f.end_date?.slice(0, 19) === z(it.hasta!).slice(0, 19)).map((f) => f.file_name!);

/** ¿El archivo no trae movimientos? (sólo la cabecera, o en Liquidaciones sólo saldo inicial y total). */
function vacio(familia: string, bytes: Buffer) {
  const filas = bytes.toString("utf8").split(/\r?\n/).filter((l) => l.trim());
  return familia === "settlement_report" ? filas.length <= 1 : filas.length <= 3;
}

/** Mueve un período un paso. */
async function avanzar(d: Destino, token: string, it: Item, bajados: Set<string>) {
  const reintentar = async (motivo: string, seg: number) => {
    const intentos = it.intentos + 1;
    await d.cola.guardar(it.id, intentos >= 4 ? { estado: "error", intentos, mensaje: motivo } : { estado: "pendiente", intentos, proximoEnSeg: seg * intentos, mensaje: motivo });
  };

  if (it.fuente === "config") {
    try { await d.cola.guardar(it.id, { estado: "listo", mensaje: await ajustarConfig(d, token) }); } catch (e) { await reintentar(String(e instanceof Error ? e.message : e), 300); }
    return;
  }

  if (it.fuente === "existentes") {
    // Lo que Mercado Pago ya tiene armado (de cualquier fecha): se baja tal cual, de a 15 por vuelta.
    let bajadosAhora = 0, quedan = 0;
    for (const familia of REPORTES) {
      const l = await lista(token, familia);
      if (!ok(l.status)) { await reintentar(`No se pudo leer la lista de ${familia} (${l.status}).`, 300); return; }
      for (const f of l.archivos) {
        if (bajados.has(f.file_name!)) continue;
        if (bajadosAhora >= 15) { quedan++; continue; }
        const b = await bajarCrudo(token, `/v1/account/${familia}/${encodeURIComponent(f.file_name!)}`);
        if (b.bytes) { await guardarArchivo(d, familia, f.file_name!, f.begin_date ?? null, f.end_date ?? null, b.bytes); bajados.add(f.file_name!); bajadosAhora++; }
        else await d.anotar(`bajar ${familia} ya armado`, b.status, { archivo: f.file_name, motivo: b.motivo });
      }
    }
    await d.cola.guardar(it.id, quedan ? { proximoEnSeg: 0, mensaje: `Bajados ${bajadosAhora}; quedan ${quedan}.` } : { estado: "listo", mensaje: `Todo bajado (${bajados.size} archivos de la cuenta).` });
    return;
  }

  if (it.fuente === "payments") {
    // Los pagos de la API del período: todos en los que participa la cuenta y, aparte, los que hizo.
    const ar = (x: Date) => new Date(x.getTime() - 3 * 3600_000).toISOString().slice(0, 19) + ".000-03:00";
    const rango = `range=date_created&begin_date=${encodeURIComponent(ar(it.desde!))}&end_date=${encodeURIComponent(ar(it.hasta!).replace(".000", ".999"))}`;
    let total = 0;
    for (const [fuente, filtros] of [["payments_cobrados", rango], ["payments_hechos", `payer.id=${d.mpUserId}&${rango}`]] as const) {
      const t = await todosLosPagos(token, filtros);
      if (!t.completo) { await reintentar(`La API de pagos no entregó todo (${t.lista.length} de ${t.total}): ${(t as { error?: string }).error ?? ""}`, 300); return; }
      await guardarArchivo(d, fuente, `${fuente}-${it.etiqueta.slice(0, 7)}${it.etiqueta.includes("parcial") ? `-al-${z(it.hasta!)}` : ""}.json`, z(it.desde!), z(it.hasta!), Buffer.from(JSON.stringify(t.lista)));
      total += t.lista.length;
    }
    await d.cola.guardar(it.id, { estado: total ? "listo" : "vacio", mensaje: total ? `${total} pagos.` : "La API no tiene pagos en el período (la API sólo llega a un año atrás)." });
    return;
  }

  // Todas las transacciones / Liquidaciones.
  const familia = it.fuente;
  const l = await lista(token, familia);
  if (!ok(l.status)) { await reintentar(`No se pudo leer la lista (${l.status}).`, 300); return; }
  const delMes = delPeriodo(l.archivos, it);
  if (it.estado === "pendiente") {
    const r = await mpPedir(token, "POST", `/v1/account/${familia}`, { begin_date: z(it.desde!), end_date: z(it.hasta!) });
    await d.anotar(`pedir ${familia}`, r.status, { periodo: it.etiqueta, respuesta: corto(r.datos, 600) });
    if (r.status === 202 || r.status === 200 || r.status === 201) await d.cola.guardar(it.id, { estado: "pedido", pedido: true, antes: delMes, proximoEnSeg: 90, mensaje: null });
    else if (r.status === 203) await reintentar("Mercado Pago no pudo armarlo; se vuelve a pedir.", 600);
    else if (r.status === 429) await d.cola.guardar(it.id, { proximoEnSeg: 300, mensaje: "Mercado Pago pidió esperar." });
    else await reintentar(`Mercado Pago no lo aceptó (${r.status}): ${corto(r.datos, 200)}`, 600);
    return;
  }
  // Pedido: ¿apareció un archivo nuevo del período?
  const nuevos = delMes.filter((n) => !(it.antes ?? []).includes(n));
  if (!nuevos.length) {
    const minutos = it.pedido_ts ? (Date.now() - new Date(it.pedido_ts).getTime()) / 60_000 : 99;
    if (minutos > 45) await reintentar("Pasaron 45 minutos y Mercado Pago no lo armó; se vuelve a pedir.", 60);
    else await d.cola.guardar(it.id, { proximoEnSeg: 120 });
    return;
  }
  let sinMovimientos = true;
  for (const n of nuevos) {
    const b = await bajarCrudo(token, `/v1/account/${familia}/${encodeURIComponent(n)}`);
    if (!b.bytes) { await reintentar(`No se pudo bajar ${n} (${b.status}).`, 300); return; }
    await guardarArchivo(d, familia, n, z(it.desde!), z(it.hasta!), b.bytes);
    if (!vacio(familia, b.bytes)) sinMovimientos = false;
  }
  await d.cola.guardar(it.id, { estado: sinMovimientos ? "vacio" : "listo", archivos: nuevos, mensaje: sinMovimientos ? "Mercado Pago lo entregó sin movimientos." : null });
}

/** Una cuenta: hasta `tope` pasos o hasta que se acabe el tiempo. */
async function vueltaCuenta(d: Destino, hasta: number, tope = 8) {
  const items = await d.cola.tomar(tope);
  if (!items.length) return 0;
  const token = await d.token();
  if (!token) {
    for (const it of items) await d.cola.guardar(it.id, { proximoEnSeg: 3600, mensaje: "La cuenta está desconectada: hay que volver a conectarla." });
    return 0;
  }
  const bajados = await d.bajados();
  let n = 0;
  for (const it of items) {
    if (Date.now() > hasta) break;
    try { await avanzar(d, token, it, bajados); } catch (e) {
      await d.cola.guardar(it.id, { intentos: it.intentos + 1, proximoEnSeg: 600, mensaje: `Falló: ${String(e instanceof Error ? e.message : e).slice(0, 200)}` });
    }
    n++;
  }
  return n;
}

/** La vuelta de todas las cuentas (empresa y personales) con algo en la cola; en paralelo por cuenta. */
export async function vuelta(segundos = 240) {
  const hasta = Date.now() + segundos * 1000;
  const empresa = await consulta<{ id: number }>("select distinct conexion_id::int id from mp_export_item where estado in ('pendiente', 'pedido') and proximo_ts <= now()");
  const personales = await consulta<{ id: number; mp_user_id: string }>(`
    select distinct c.id::int, c.mp_user_id from personal.mp_item i join personal.mp_conexion c on c.id = i.conexion_id
     where i.estado in ('pendiente', 'pedido') and i.proximo_ts <= now()`);
  const destinos: Destino[] = [];
  for (const e of empresa) { const d = await destinoEmpresa(e.id); if (d) destinos.push(d); }
  for (const p of personales) destinos.push(destinoPersonal(p.id, Number(p.mp_user_id)));
  const pasos = await Promise.all(destinos.map(async (d) => {
    let total = 0;
    while (Date.now() < hasta) {
      const n = await vueltaCuenta(d, hasta).catch(() => 0);
      if (!n) break;
      total += n;
    }
    return total;
  }));
  return { cuentas: destinos.length, pasos: pasos.reduce((a, b) => a + b, 0) };
}
