// Tesorería: cuentas de fondos (caja, bancos, Mercado Pago), recibos de cobro
// a clientes, órdenes de pago a proveedores, movimientos sueltos (gastos,
// ingresos, liquidaciones) con su cuenta contable, transferencias entre
// cuentas y conciliación contra el extracto.
//
// Todo importe de una cuenta va en la moneda de la cuenta; importe_ars e
// importe_usd lo congelan con el tipo de cambio del día del movimiento.

import type { PoolClient } from "pg";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { movimientoCc, imputarAutomatico, type Tercero } from "@/lib/administracion/cc";

const r2 = (x: number) => Math.round(x * 100) / 100;

type Cuenta = { id: number; nombre: string; moneda: "ARS" | "USD" };

async function tc(c: PoolClient, org: string, fecha: string): Promise<number> {
  const v = Number((await c.query<{ v: string | null }>("select tc_del_dia($1, $2::date) v", [org, fecha])).rows[0]?.v ?? 0);
  if (!v) throw new ErrorErp(`No hay tipo de cambio para el ${fecha.split("-").reverse().join("/")}.`);
  return v;
}

/** Pesos y dólares de un importe en la moneda dada, al TC del día. */
async function doble(c: PoolClient, org: string, fecha: string, moneda: "ARS" | "USD", importe: number) {
  const t = await tc(c, org, fecha);
  return moneda === "USD" ? { ars: r2(importe * t), usd: r2(importe) } : { ars: r2(importe), usd: r2(importe / t) };
}

async function cuenta(c: PoolClient, org: string, id: number): Promise<Cuenta> {
  const r = (await c.query<Cuenta>("select id::int, nombre, moneda from cuenta_fondos where id = $1 and organizacion_id = $2 and activa", [id, org])).rows[0];
  if (!r) throw new ErrorErp("Esa cuenta de fondos no existe o está desactivada.");
  return r;
}

async function movimiento(c: PoolClient, org: string, d: { cuentaId: number; fecha: string; importe: number; concepto: string;
  referenciaTipo: string; referenciaId?: number | null; cuentaContableId?: number | null; usuarioId?: string | null }) {
  const cta = await cuenta(c, org, d.cuentaId);
  const x = await doble(c, org, d.fecha, cta.moneda, d.importe);
  const r = await c.query<{ id: string }>(`
    insert into movimiento_fondos (organizacion_id, cuenta_id, fecha, importe, importe_ars, importe_usd, concepto, referencia_tipo, referencia_id, cuenta_contable_id, usuario_id)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [org, d.cuentaId, d.fecha, r2(d.importe), x.ars, x.usd, d.concepto, d.referenciaTipo, d.referenciaId ?? null, d.cuentaContableId ?? null, d.usuarioId ?? null]);
  return Number(r.rows[0].id);
}

/** Cuentas con su saldo (en su moneda) y lo que falta conciliar. */
export function cuentasConSaldo(org: string) {
  return consulta<{ id: number; nombre: string; tipo: string; moneda: string; banco: string | null; cbu: string | null; alias: string | null;
    activa: boolean; cuenta_contable_id: number | null; saldo_inicial: number; saldo_inicial_fecha: string | null; saldo: number; sin_conciliar: number;
    canal_id: number | null; canal: string | null }>(`
    select f.id::int, f.nombre, f.tipo, f.moneda, f.banco, f.cbu, f.alias, f.activa, f.cuenta_contable_id::int, f.saldo_inicial::float,
           to_char(f.saldo_inicial_fecha, 'YYYY-MM-DD') saldo_inicial_fecha,
           (f.saldo_inicial + coalesce((select sum(m.importe) from movimiento_fondos m where m.cuenta_id = f.id), 0))::float saldo,
           (select count(*) from movimiento_fondos m where m.cuenta_id = f.id and m.conciliado_ts is null)::int sin_conciliar,
           f.canal_id::int, (select ca.nombre from canal ca where ca.id = f.canal_id) canal
      from cuenta_fondos f where f.organizacion_id = $1 order by f.activa desc, f.tipo, f.nombre`, [org]);
}

/** Movimientos de una cuenta con saldo acumulado (el saldo inicial incluido). */
export function movimientosDeCuenta(org: string, cuentaId: number, desde?: string | null, hasta?: string | null) {
  return consulta<{ id: number; fecha: string; importe: number; concepto: string; referencia_tipo: string | null; referencia_id: number | null;
    conciliado: boolean; saldo: number }>(`
    select * from (
      select m.id::int, to_char(m.fecha, 'YYYY-MM-DD') fecha, m.importe::float, m.concepto, m.referencia_tipo, m.referencia_id::int,
             m.conciliado_ts is not null conciliado,
             (f.saldo_inicial + sum(m.importe) over (order by m.fecha, m.id))::float saldo
        from movimiento_fondos m join cuenta_fondos f on f.id = m.cuenta_id
       where m.organizacion_id = $1 and m.cuenta_id = $2) x
     where ($3::date is null or x.fecha::date >= $3::date) and ($4::date is null or x.fecha::date <= $4::date)
     order by x.fecha desc, x.id desc limit 500`, [org, cuentaId, desde || null, hasta || null]);
}

export type Medio = { cuentaId: number; importe: number };
export type Retencion = { concepto: string; importe: number };

/** Recibo de cobro (cliente) u orden de pago (proveedor). Los medios dicen de
 *  qué cuenta entra/sale cada parte; las retenciones completan el total
 *  (sufridas en un cobro, practicadas en un pago). Deja el crédito en la
 *  cuenta corriente y lo imputa contra lo más viejo. */
export async function emitirRecibo(org: string, d: { tipo: "cobro" | "pago"; terceroId: number; fecha: string; medios: Medio[];
  retenciones?: Retencion[]; notas?: string | null; usuarioId: string }) {
  const medios = d.medios.filter((m) => m.importe > 0);
  const ret = (d.retenciones ?? []).filter((r) => r.importe > 0 && r.concepto.trim());
  if (!medios.length) throw new ErrorErp("Cargá al menos un medio con importe.");
  const tercero: Tercero = d.tipo === "cobro" ? "cliente" : "proveedor";
  return enTransaccion(async (c) => {
    const tabla = tercero === "cliente" ? "cliente" : "proveedor";
    const t = (await c.query<{ nombre: string }>(`select nombre from ${tabla} where id = $1 and organizacion_id = $2`, [d.terceroId, org])).rows[0];
    if (!t) throw new ErrorErp(`Ese ${tercero} no existe.`);
    // Todo se lleva a pesos: un medio en dólares entra por su equivalente.
    let totalArs = 0, totalUsd = 0;
    const cuentas: Cuenta[] = [];
    for (const m of medios) {
      const cta = await cuenta(c, org, m.cuentaId);
      cuentas.push(cta);
      const x = await doble(c, org, d.fecha, cta.moneda, m.importe);
      totalArs += x.ars; totalUsd += x.usd;
    }
    const t0 = await tc(c, org, d.fecha);
    for (const r of ret) { totalArs += r.importe; totalUsd += r.importe / t0; }
    totalArs = r2(totalArs); totalUsd = r2(totalUsd);
    await c.query("select pg_advisory_xact_lock(hashtext('recibo:' || $1 || ':' || $2))", [org, d.tipo]);
    const numero = Number((await c.query<{ n: string }>("select coalesce(max(numero), 0) + 1 n from recibo where organizacion_id = $1 and tipo = $2", [org, d.tipo])).rows[0].n);
    const id = Number((await c.query<{ id: string }>(`
      insert into recibo (organizacion_id, tipo, numero, tercero_tipo, tercero_id, fecha, moneda, total, total_ars, total_usd, medios, retenciones, notas, usuario_id)
      values ($1, $2, $3, $4, $5, $6, 'ARS', $7, $7, $8, $9::jsonb, $10::jsonb, $11, $12) returning id`,
      [org, d.tipo, numero, tercero, d.terceroId, d.fecha, totalArs, totalUsd,
        JSON.stringify(medios.map((m) => ({ cuenta_id: m.cuentaId, importe: r2(m.importe) }))),
        JSON.stringify(ret.map((r) => ({ concepto: r.concepto.trim(), importe: r2(r.importe) }))), d.notas || null, d.usuarioId])).rows[0].id);
    const nombre = d.tipo === "cobro" ? `Recibo ${numero}` : `Orden de pago ${numero}`;
    for (const m of medios) {
      await movimiento(c, org, { cuentaId: m.cuentaId, fecha: d.fecha, importe: d.tipo === "cobro" ? m.importe : -m.importe,
        concepto: `${nombre} · ${t.nombre}`, referenciaTipo: "recibo", referenciaId: id, usuarioId: d.usuarioId });
    }
    await movimientoCc(c, org, { tercero, terceroId: d.terceroId, fecha: d.fecha, tipo: d.tipo, importe: -totalArs, importeArs: -totalArs,
      importeUsd: -totalUsd, descripcion: nombre, referenciaTipo: "recibo", referenciaId: id });
    await imputarAutomatico(c, org, tercero, d.terceroId);
    return { id, numero, totalArs };
  });
}

/** Anula un recibo: saca sus movimientos de fondos (si no están conciliados)
 *  y su crédito de la cuenta corriente, devolviendo lo imputado. */
export async function anularRecibo(org: string, reciboId: number) {
  await enTransaccion(async (c) => {
    const r = (await c.query<{ estado: string }>("select estado from recibo where id = $1 and organizacion_id = $2 for update", [reciboId, org])).rows[0];
    if (!r) throw new ErrorErp("El recibo no existe.");
    if (r.estado === "anulado") throw new ErrorErp("Ya estaba anulado.");
    const conc = (await c.query("select 1 from movimiento_fondos where organizacion_id = $1 and referencia_tipo = 'recibo' and referencia_id = $2 and conciliado_ts is not null", [org, reciboId])).rowCount;
    if (conc) throw new ErrorErp("Tiene movimientos ya conciliados con el extracto: desconciliálos primero.");
    await c.query("delete from movimiento_fondos where organizacion_id = $1 and referencia_tipo = 'recibo' and referencia_id = $2", [org, reciboId]);
    await deshacerCc(c, org, "recibo", reciboId);
    await c.query("update recibo set estado = 'anulado' where id = $1", [reciboId]);
    await c.query("update asiento set estado = 'anulado' where organizacion_id = $1 and origen in ('cobro', 'pago') and referencia_id = $2 and estado = 'vigente'", [org, reciboId]);
  });
}

/** Borra el renglón de cuenta corriente de un documento devolviendo lo imputado. */
export async function deshacerCc(c: PoolClient, org: string, referenciaTipo: string, referenciaId: number) {
  const movs = (await c.query<{ id: string }>("select id from cc_movimiento where organizacion_id = $1 and referencia_tipo = $2 and referencia_id = $3", [org, referenciaTipo, referenciaId])).rows;
  for (const m of movs) {
    // Cada lado vuelve en su moneda: `importe` es lo que había bajado el débito
    // e `importe_credito` lo del crédito (las viejas, sin él, eran iguales).
    const imp = (await c.query<{ debito_id: string; credito_id: string; importe: string; importe_credito: string }>(
      "select debito_id, credito_id, importe, coalesce(importe_credito, importe) importe_credito from cc_imputacion where debito_id = $1 or credito_id = $1", [m.id])).rows;
    for (const i of imp) {
      if (i.debito_id !== m.id) await c.query("update cc_movimiento set pendiente = pendiente + $2 where id = $1", [i.debito_id, i.importe]);
      if (i.credito_id !== m.id) await c.query("update cc_movimiento set pendiente = pendiente - $2 where id = $1", [i.credito_id, i.importe_credito]);
    }
    await c.query("delete from cc_movimiento where id = $1", [m.id]);
  }
}

/** Un movimiento suelto: un gasto (importe negativo), un ingreso, una
 *  liquidación de Mercado Pago, comisiones del banco. La contrapartida
 *  contable la elige quien lo carga. */
export async function movimientoManual(org: string, d: { cuentaId: number; fecha: string; importe: number; concepto: string;
  cuentaContableId: number | null; usuarioId: string }) {
  if (!d.importe) throw new ErrorErp("El importe no puede ser cero.");
  if (!d.concepto.trim()) throw new ErrorErp("Poné un concepto.");
  return enTransaccion((c) => movimiento(c, org, { ...d, concepto: d.concepto.trim(), referenciaTipo: "manual" }));
}

/** Transferencia entre dos cuentas propias. Si las monedas difieren, `importeDestino` es lo que entra. */
export async function transferir(org: string, d: { origenId: number; destinoId: number; fecha: string; importe: number; importeDestino?: number | null; usuarioId: string }) {
  if (d.origenId === d.destinoId) throw new ErrorErp("La cuenta de origen y la de destino son la misma.");
  if (!(d.importe > 0)) throw new ErrorErp("El importe tiene que ser mayor que cero.");
  return enTransaccion(async (c) => {
    const o = await cuenta(c, org, d.origenId), de = await cuenta(c, org, d.destinoId);
    let entra = d.importeDestino ?? null;
    if (o.moneda === de.moneda) entra = d.importe;
    else if (!(entra && entra > 0)) {
      const t = await tc(c, org, d.fecha);
      entra = o.moneda === "USD" ? r2(d.importe * t) : r2(d.importe / t);
    }
    const sale = await movimiento(c, org, { cuentaId: d.origenId, fecha: d.fecha, importe: -d.importe, concepto: `Transferencia a ${de.nombre}`,
      referenciaTipo: "transferencia", usuarioId: d.usuarioId });
    await c.query("update movimiento_fondos set referencia_id = $1 where id = $1", [sale]);
    await movimiento(c, org, { cuentaId: d.destinoId, fecha: d.fecha, importe: entra, concepto: `Transferencia desde ${o.nombre}`,
      referenciaTipo: "transferencia", referenciaId: sale, usuarioId: d.usuarioId });
    return sale;
  });
}

/** Borra un movimiento suelto o una transferencia (las dos patas), si no está conciliado. */
export async function borrarMovimiento(org: string, movimientoId: number) {
  await enTransaccion(async (c) => {
    const m = (await c.query<{ referencia_tipo: string; referencia_id: string | null; conciliado_ts: string | null }>(
      "select referencia_tipo, referencia_id, conciliado_ts from movimiento_fondos where id = $1 and organizacion_id = $2", [movimientoId, org])).rows[0];
    if (!m) throw new ErrorErp("El movimiento no existe.");
    if (m.referencia_tipo === "recibo") throw new ErrorErp("Es parte de un recibo: anulá el recibo.");
    const ids = m.referencia_tipo === "transferencia"
      ? (await c.query<{ id: string; conciliado_ts: string | null }>("select id, conciliado_ts from movimiento_fondos where organizacion_id = $1 and referencia_tipo = 'transferencia' and referencia_id = $2", [org, m.referencia_id])).rows
      : [{ id: String(movimientoId), conciliado_ts: m.conciliado_ts }];
    if (ids.some((x) => x.conciliado_ts)) throw new ErrorErp("Está conciliado con el extracto: desconcilialo primero.");
    await c.query("update extracto_linea set movimiento_id = null where movimiento_id = any($1::bigint[])", [ids.map((x) => x.id)]);
    await c.query("delete from movimiento_fondos where id = any($1::bigint[])", [ids.map((x) => x.id)]);
    const origen = m.referencia_tipo === "transferencia" ? "transferencia" : "movimiento";
    await c.query("update asiento set estado = 'anulado' where organizacion_id = $1 and origen = $2 and referencia_id = $3 and estado = 'vigente'",
      [org, origen, m.referencia_tipo === "transferencia" ? Number(m.referencia_id) : movimientoId]);
  });
}

// ── Conciliación ───────────────────────────────────────────

/** Lee un extracto en CSV (fecha; descripción; importe — o débito y crédito
 *  separados). Acepta coma o punto y coma, fechas dd/mm/aaaa o aaaa-mm-dd e
 *  importes "1.234,56" o "1234.56". Devuelve las líneas nuevas cargadas. */
export async function importarExtracto(org: string, cuentaId: number, texto: string) {
  const filas = leerCsv(texto);
  if (filas.length < 2) throw new ErrorErp("El archivo no tiene filas.");
  const cab = filas[0].map((x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim());
  const col = (...nombres: string[]) => cab.findIndex((h) => nombres.some((n) => h.includes(n)));
  const iF = col("fecha"), iD = col("descrip", "concepto", "detalle", "movimiento"), iI = col("importe", "monto", "valor neto", "net"),
    iDeb = col("debito", "debe", "egreso"), iCre = col("credito", "haber", "ingreso"), iR = col("referencia", "comprobante", "id de operacion", "operacion");
  if (iF < 0 || (iI < 0 && iDeb < 0 && iCre < 0)) throw new ErrorErp("No encuentro las columnas de fecha e importe (o débito y crédito).");
  const lineas: { fecha: string; descripcion: string; importe: number; referencia: string | null }[] = [];
  for (const f of filas.slice(1)) {
    const fecha = leerFecha(f[iF] ?? "");
    if (!fecha) continue;
    const importe = iI >= 0 ? leerImporte(f[iI]) : (leerImporte(f[iCre]) ?? 0) - Math.abs(leerImporte(f[iDeb]) ?? 0);
    if (importe == null || importe === 0) continue;
    lineas.push({ fecha, descripcion: iD >= 0 ? (f[iD] ?? "").trim() : "", importe: r2(importe), referencia: iR >= 0 ? (f[iR] ?? "").trim() || null : null });
  }
  if (!lineas.length) throw new ErrorErp("No pude leer ninguna línea con fecha e importe.");
  return enTransaccion(async (c) => {
    await cuenta(c, org, cuentaId);
    let n = 0;
    for (const l of lineas) {
      // No duplica si el mismo extracto se sube dos veces.
      const ya = await c.query(`select 1 from extracto_linea where cuenta_id = $1 and fecha = $2 and importe = $3 and coalesce(descripcion, '') = $4
                                 and coalesce(referencia, '') = coalesce($5, '')`, [cuentaId, l.fecha, l.importe, l.descripcion, l.referencia]);
      if (ya.rowCount) continue;
      await c.query("insert into extracto_linea (organizacion_id, cuenta_id, fecha, descripcion, importe, referencia) values ($1, $2, $3, $4, $5, $6)",
        [org, cuentaId, l.fecha, l.descripcion, l.importe, l.referencia]);
      n++;
    }
    return { leidas: lineas.length, nuevas: n };
  });
}

/** Une automáticamente líneas del extracto con movimientos del mismo importe
 *  y fecha cercana (±5 días), uno a uno, el más cercano primero. */
export async function conciliarAutomatico(org: string, cuentaId: number) {
  return enTransaccion(async (c) => {
    const ext = (await c.query<{ id: string; fecha: string; importe: string }>(
      "select id, fecha::text, importe from extracto_linea where organizacion_id = $1 and cuenta_id = $2 and movimiento_id is null order by fecha, id", [org, cuentaId])).rows;
    let n = 0;
    for (const e of ext) {
      const m = (await c.query<{ id: string }>(`
        select id from movimiento_fondos where organizacion_id = $1 and cuenta_id = $2 and conciliado_ts is null and importe = $3
           and abs(fecha - $4::date) <= 5 order by abs(fecha - $4::date), id limit 1`, [org, cuentaId, e.importe, e.fecha])).rows[0];
      if (!m) continue;
      await c.query("update extracto_linea set movimiento_id = $2 where id = $1", [e.id, m.id]);
      await c.query("update movimiento_fondos set conciliado_ts = now(), extracto_linea_id = $2 where id = $1", [m.id, e.id]);
      n++;
    }
    return n;
  });
}

/** Une a mano una línea del extracto con un movimiento. */
export async function conciliar(org: string, extractoId: number, movimientoId: number) {
  await enTransaccion(async (c) => {
    const e = (await c.query<{ cuenta_id: string; movimiento_id: string | null }>("select cuenta_id, movimiento_id from extracto_linea where id = $1 and organizacion_id = $2", [extractoId, org])).rows[0];
    const m = (await c.query<{ cuenta_id: string; conciliado_ts: string | null }>("select cuenta_id, conciliado_ts from movimiento_fondos where id = $1 and organizacion_id = $2", [movimientoId, org])).rows[0];
    if (!e || !m || e.cuenta_id !== m.cuenta_id) throw new ErrorErp("La línea y el movimiento no son de la misma cuenta.");
    if (e.movimiento_id || m.conciliado_ts) throw new ErrorErp("Alguno de los dos ya estaba conciliado.");
    await c.query("update extracto_linea set movimiento_id = $2 where id = $1", [extractoId, movimientoId]);
    await c.query("update movimiento_fondos set conciliado_ts = now(), extracto_linea_id = $2 where id = $1", [movimientoId, extractoId]);
  });
}

/** Deshace una conciliación (por la línea del extracto). */
export async function desconciliar(org: string, extractoId: number) {
  await enTransaccion(async (c) => {
    const e = (await c.query<{ movimiento_id: string | null }>("select movimiento_id from extracto_linea where id = $1 and organizacion_id = $2", [extractoId, org])).rows[0];
    if (!e?.movimiento_id) return;
    await c.query("update movimiento_fondos set conciliado_ts = null, extracto_linea_id = null where id = $1", [e.movimiento_id]);
    await c.query("update extracto_linea set movimiento_id = null where id = $1", [extractoId]);
  });
}

/** Una línea del extracto sin movimiento (comisión del banco, impuesto al
 *  cheque…): crea el movimiento con esa cuenta contable y la concilia. */
export async function crearDesdeExtracto(org: string, extractoId: number, cuentaContableId: number | null, usuarioId: string) {
  await enTransaccion(async (c) => {
    const e = (await c.query<{ cuenta_id: string; fecha: string; importe: string; descripcion: string | null; movimiento_id: string | null }>(
      "select cuenta_id, fecha::text, importe, descripcion, movimiento_id from extracto_linea where id = $1 and organizacion_id = $2", [extractoId, org])).rows[0];
    if (!e) throw new ErrorErp("La línea no existe.");
    if (e.movimiento_id) throw new ErrorErp("Ya estaba conciliada.");
    const m = await movimiento(c, org, { cuentaId: Number(e.cuenta_id), fecha: e.fecha, importe: Number(e.importe), concepto: e.descripcion || "Movimiento del extracto",
      referenciaTipo: "manual", cuentaContableId, usuarioId });
    await c.query("update extracto_linea set movimiento_id = $2 where id = $1", [extractoId, m]);
    await c.query("update movimiento_fondos set conciliado_ts = now(), extracto_linea_id = $2 where id = $1", [m, extractoId]);
  });
}

export function extracto(org: string, cuentaId: number, soloPendientes: boolean) {
  return consulta<{ id: number; fecha: string; descripcion: string | null; importe: number; referencia: string | null; movimiento_id: number | null; movimiento: string | null }>(`
    select e.id::int, to_char(e.fecha, 'YYYY-MM-DD') fecha, e.descripcion, e.importe::float, e.referencia, e.movimiento_id::int, m.concepto movimiento
      from extracto_linea e left join movimiento_fondos m on m.id = e.movimiento_id
     where e.organizacion_id = $1 and e.cuenta_id = $2 and (not $3 or e.movimiento_id is null)
     order by e.fecha desc, e.id desc limit 500`, [org, cuentaId, soloPendientes]);
}

// ── Lectura de CSV ─────────────────────────────────────────

function leerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const primera = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : primera.includes("\t") ? "\t" : ",";
  const filas: string[][] = [];
  let fila: string[] = [], campo = "", comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((x) => x.trim())) filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim())) filas.push(fila);
  return filas;
}

function leerFecha(s: string): string | null {
  const x = s.trim();
  let m = x.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = x.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) { const a = m[3].length === 2 ? "20" + m[3] : m[3]; return `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}

export function leerImporte(s: string | undefined): number | null {
  if (s == null) return null;
  let x = s.trim().replace(/[$\s]|ARS|USD/g, "");
  if (!x) return null;
  const neg = /^\(.*\)$/.test(x) || x.endsWith("-");
  x = x.replace(/[()]/g, "").replace(/-$/, "");
  if (x.includes(",") && x.includes(".")) x = x.lastIndexOf(",") > x.lastIndexOf(".") ? x.replace(/\./g, "").replace(",", ".") : x.replace(/,/g, "");
  else if (x.includes(",")) x = x.replace(",", ".");
  else if ((x.match(/\./g)?.length ?? 0) > 1 || /^\-?\d{1,3}\.\d{3}$/.test(x)) x = x.replace(/\./g, "");
  const n = Number(x);
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null;
}

export async function cuentaDeFondos(org: string, id: number) {
  return una<{ id: number; nombre: string; tipo: string; moneda: string }>("select id::int, nombre, tipo, moneda from cuenta_fondos where id = $1 and organizacion_id = $2", [id, org]);
}
