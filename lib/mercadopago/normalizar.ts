// De los archivos originales de Mercado Pago a una tabla común de movimientos
// (orden de Fer del 17/10, #681): una fila por movimiento de dinero de la
// cuenta, con su origen (archivo y fila), sin duplicados, y los controles por
// cuenta y mes. Los originales no se tocan: esto se arma cada vez que se baja
// la exportación, así siempre refleja lo último que entregó Mercado Pago.
//
// Fuente principal: el reporte «Todas las transacciones» (settlement_report),
// que trae cada operación que movió el saldo. «Liquidaciones» (release_report)
// da el saldo inicial y final de cada mes (control) y los retiros a banco. La
// API de pagos completa la descripción, el tipo y el estado de cada pago.
//
// Sirve igual para la empresa y para el espacio personal: quien llama pasa las
// cuentas y sus archivos (nunca se mezclan).

import ExcelJS from "exceljs";
import { armarZip } from "@/lib/zip";

export const VERSION_ESQUEMA = "1.0";
const ZONA = "America/Argentina/Cordoba";

export type CuentaExport = { id: number; mpUserId: number; alias: string; titular: string | null; documento: string | null; ambito: "empresa" | "personal" };
export type ArchivoExport = { id: number; fuente: string; nombre: string; desde: Date | null; hasta: Date | null; bajado: Date; contenido: Buffer };
export type ItemExport = { fuente: string; etiqueta: string; desde: Date | null; hasta: Date | null; estado: string; mensaje: string | null; archivos: string[] | null; actualizado: Date };
/** Una fila de «Todas las transacciones» ya leída (tal cual se guarda en la tabla de movimientos). */
export type MovBase = {
  clave: string; archivo: string; fila: number; extraido: Date; movimiento_id: string | null; referencia_externa: string | null; tipo_original: string;
  fecha_operacion: Date | null; fecha_operacion_original: string | null; fecha_saldo: Date | null; fecha_liberacion: Date | null; moneda: string | null;
  importe_bruto: number | null; comision: number | null; impuestos: number | null; cupon: number | null; importe_neto: number | null;
  medio_pago: string | null; tipo_medio: string | null; descripcion: string | null;
};
/** Un pago de la API, con lo que hace falta. */
export type PagoBase = {
  pago_id: string; tipo: string | null; estado: string | null; descripcion: string | null; cobrador_id: string | null; pagador_id: string | null;
  importe: number | null; pagado: number | null; tipo_medio: string | null; medio: string | null; creado: Date | null; actualizado: Date | null;
};
/** De una cuenta: sus archivos (al menos los de Liquidaciones de la cola) y, si ya están pasados a tablas, sus movimientos y pagos. */
export type DatosExport = { cuenta: CuentaExport; archivos: ArchivoExport[]; cola: ItemExport[]; movs?: MovBase[]; pagos?: PagoBase[] };

// ── Lectura de los archivos de Mercado Pago ─────────────────────────────

/** Parte un CSV de Mercado Pago. Ojo: los campos con JSON (METADATA, TAXES_DISAGGREGATED) vienen
 *  entre comillas pero con comillas sin escapar adentro; se leen hasta el `]"` o `}"` que cierra. */
export function leerCsvMp(texto: string): { cab: string[]; filas: string[][] } {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return { cab: [], filas: [] };
  const sep = (lineas[0].match(/;/g)?.length ?? 0) > (lineas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const partir = (l: string) => {
    const out: string[] = [];
    let i = 0;
    while (i <= l.length) {
      if (l[i] === '"' && (l[i + 1] === "[" || l[i + 1] === "{")) {
        // JSON entre comillas: hasta el cierre `]"`/`}"` seguido de separador o fin.
        let j = i + 1, fin = -1;
        while (j < l.length) {
          if ((l[j] === "]" || l[j] === "}") && l[j + 1] === '"' && (j + 2 === l.length || l[j + 2] === sep)) { fin = j; break; }
          j++;
        }
        if (fin < 0) fin = l.length - 2;
        out.push(l.slice(i + 1, fin + 1));
        i = fin + 3;
      } else if (l[i] === '"') {
        let v = "", j = i + 1;
        while (j < l.length) {
          if (l[j] === '"' && l[j + 1] === '"') { v += '"'; j += 2; continue; }
          if (l[j] === '"') break;
          v += l[j++];
        }
        out.push(v);
        i = j + 2;
      } else {
        const j = l.indexOf(sep, i);
        out.push((j < 0 ? l.slice(i) : l.slice(i, j)).trim());
        i = j < 0 ? l.length + 1 : j + 1;
      }
    }
    return out;
  };
  return { cab: partir(lineas[0]).map((h) => h.toUpperCase()), filas: lineas.slice(1).map(partir) };
}

export async function leerArchivo(a: ArchivoExport): Promise<{ cab: string[]; filas: string[][] } | null> {
  if (a.nombre.endsWith(".xlsx")) {
    try {
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(a.contenido as unknown as ArrayBuffer);
      const h = libro.worksheets[0];
      const filas: string[][] = [];
      h.eachRow((r) => filas.push((r.values as unknown[]).slice(1).map((v) => (v instanceof Date ? v.toISOString() : v == null ? "" : typeof v === "object" ? String((v as { text?: string }).text ?? "") : String(v)))));
      return filas.length ? { cab: filas[0].map((x) => x.toUpperCase()), filas: filas.slice(1) } : null;
    } catch { return null; }
  }
  return leerCsvMp(a.contenido.toString("utf8"));
}

/** Los importes que vienen de la base llegan como texto (numeric): a número. */
const n = (x: number | string | null | undefined) => (x == null ? null : Number(x));
const num = (s: string | undefined) => (s == null || s.trim() === "" ? null : Number(s.replace(/,(?=\d{1,2}$)/, ".")));
const instante = (s: string | undefined) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
// Argentina no cambia la hora (UTC−3 todo el año): la cuenta es directa, sin el reloj del sistema (mucho más rápido).
const AR = 3 * 3600_000;
const local = (d: Date | null) => (d ? new Date(new Date(d).getTime() - AR).toISOString().slice(0, 19) + "-03:00" : null);
const mesDe = (d: Date | null) => (d ? new Date(new Date(d).getTime() - AR).toISOString().slice(0, 7) : null);

/** Las filas de un archivo de «Todas las transacciones», con su clave sin duplicados: el contenido de
 *  la fila (cuenta, id, tipo, fecha de saldo, neto, referencia) y #n si el mismo archivo la trae n veces. */
export function filasDeSettlement(mpUserId: number, a: { nombre: string; bajado: Date }, t: { cab: string[]; filas: string[][] }): MovBase[] {
  const veces = new Map<string, number>();
  const salida: MovBase[] = [];
  t.filas.forEach((f, i) => {
    const v: Record<string, string> = {};
    t.cab.forEach((h, k) => { v[h] = f[k] ?? ""; });
    if (!v.TRANSACTION_TYPE) return;
    const fSaldo = instante(v.SETTLEMENT_DATE), fOp = instante(v.TRANSACTION_DATE);
    // El neto es SETTLEMENT_NET_AMOUNT; si la cuenta no tiene esa columna configurada, REAL_AMOUNT (el mismo importe real).
    const neto = num(v.SETTLEMENT_NET_AMOUNT) ?? num(v.REAL_AMOUNT);
    const base = [mpUserId, "settlement", v.SOURCE_ID, v.TRANSACTION_TYPE, (fSaldo ?? fOp)?.toISOString() ?? v.TRANSACTION_DATE, neto ?? "", v.EXTERNAL_REFERENCE ?? ""].join("|");
    const nro = (veces.get(base) ?? 0) + 1;
    veces.set(base, nro);
    salida.push({
      clave: `${base}#${nro}`, archivo: a.nombre, fila: i + 2, extraido: a.bajado, movimiento_id: v.SOURCE_ID || null, referencia_externa: v.EXTERNAL_REFERENCE || null,
      tipo_original: v.TRANSACTION_TYPE, fecha_operacion: fOp, fecha_operacion_original: v.TRANSACTION_DATE || null, fecha_saldo: fSaldo, fecha_liberacion: instante(v.MONEY_RELEASE_DATE),
      moneda: v.SETTLEMENT_CURRENCY || v.TRANSACTION_CURRENCY || null, importe_bruto: num(v.TRANSACTION_AMOUNT), comision: num(v.FEE_AMOUNT),
      impuestos: v.TAXES_AMOUNT !== undefined ? num(v.TAXES_AMOUNT) : null, cupon: num(v.COUPON_AMOUNT), importe_neto: neto,
      medio_pago: v.PAYMENT_METHOD || null, tipo_medio: v.PAYMENT_METHOD_TYPE || null, descripcion: v.DESCRIPTION || null,
    });
  });
  return salida;
}

/** Los pagos de un archivo de la API (JSON tal cual lo dio Mercado Pago). */
export function pagosDeArchivo(contenido: Buffer): PagoBase[] {
  type J = { id: number | string; operation_type?: string; status?: string; description?: string | null; collector_id?: number | null; collector?: { id?: number | null } | null;
    payer_id?: string | number | null; payer?: { id?: string | number | null } | null; transaction_amount?: number; transaction_details?: { total_paid_amount?: number };
    payment_type_id?: string; payment_method_id?: string; date_created?: string; date_last_updated?: string };
  return (JSON.parse(contenido.toString("utf8")) as J[]).map((j) => ({
    pago_id: String(j.id), tipo: j.operation_type ?? null, estado: j.status ?? null, descripcion: j.description ?? null,
    cobrador_id: j.collector?.id != null ? String(j.collector.id) : j.collector_id != null ? String(j.collector_id) : null,
    pagador_id: j.payer_id != null ? String(j.payer_id) : j.payer?.id != null ? String(j.payer.id) : null,
    importe: j.transaction_amount ?? null, pagado: j.transaction_details?.total_paid_amount ?? null, tipo_medio: j.payment_type_id ?? null, medio: j.payment_method_id ?? null,
    creado: instante(j.date_created), actualizado: instante(j.date_last_updated),
  }));
}

// ── La fila normalizada ─────────────────────────────────────────────────

export type Movimiento = {
  version_esquema: string; cuenta_mp_id: number; cuenta_alias: string; titular: string | null; ambito_cuenta: string;
  fuente: string; archivo: string; fila: number; extraido: string;
  movimiento_id: string | null; referencia_externa: string | null; tipo_original: string; tipo: string; direccion: "entrada" | "salida" | "sin efecto";
  fecha_operacion: string | null; fecha_operacion_original: string | null; fecha_saldo: string | null; fecha_liberacion: string | null; mes: string | null; tramo: string;
  moneda: string | null; importe_bruto: number | null; comision: number | null; impuestos: number | null; cupon: number | null; importe_neto: number | null;
  medio_pago: string | null; tipo_medio: string | null; descripcion: string | null;
  api_tipo: string | null; api_estado: string | null; api_descripcion: string | null; api_pagado: number | null; api_contraparte: string | null;
  clave_dedup: string;
  categoria_propuesta: string; ambito_gasto: string; sociedad_atribuida: string | null; recurrencia: string; grupo_conciliacion: string | null; regla_aplicada: string | null; estado_revision: string;
};

/** Los tipos de «Todas las transacciones» que son retiros a banco (Mercado Pago usa PAYOUTS, en plural, en Argentina). */
export const RETIROS = new Set(["WITHDRAWAL", "PAYOUT", "PAYOUTS"]);

const TIPOS: Record<string, string> = {
  PAYOUTS: "retiro a cuenta bancaria",
  SETTLEMENT: "operación aprobada", REFUND: "devolución", CHARGEBACK: "contracargo", DISPUTE: "reclamo", WITHDRAWAL: "retiro a cuenta bancaria",
  WITHDRAWAL_CANCEL: "retiro cancelado", PAYOUT: "retiro en efectivo", SETTLEMENT_SHIPPING: "costo de envío", DISPUTE_SHIPPING: "envío de reclamo",
};

/** El tramo de análisis: el año comparable (12 meses cerrados hasta el mes anterior), el mes en curso (parcial) o lo anterior. */
export function tramoDe(mes: string | null, ahora = new Date()) {
  if (!mes) return "sin fecha";
  const hoy = mesDe(ahora)!;
  const [a, m] = hoy.split("-").map(Number);
  const inicio = `${a - 1}-${String(m).padStart(2, "0")}`;
  if (mes === hoy) return "mes en curso (parcial)";
  if (mes >= inicio && mes < hoy) return "año comparable";
  return mes < inicio ? "anterior" : "posterior";
}

/** Clasificación propuesta, sólo con reglas seguras; lo demás queda «sin clasificar» para revisar. */
function clasificar(m: Movimiento): Pick<Movimiento, "categoria_propuesta" | "regla_aplicada" | "recurrencia"> {
  if (RETIROS.has(m.tipo_original)) return { categoria_propuesta: "Movimiento propio: retiro a banco", regla_aplicada: "tipo retiro", recurrencia: "sin clasificar" };
  if (m.tipo_original === "WITHDRAWAL_CANCEL") return { categoria_propuesta: "Movimiento propio: retiro cancelado", regla_aplicada: "tipo retiro cancelado", recurrencia: "sin clasificar" };
  if (m.tipo_original === "REFUND") return { categoria_propuesta: "Devolución", regla_aplicada: "tipo devolución", recurrencia: "eventual" };
  if (m.tipo_original === "CHARGEBACK" || m.tipo_original.startsWith("DISPUTE")) return { categoria_propuesta: "Reclamo / contracargo", regla_aplicada: "tipo reclamo", recurrencia: "eventual" };
  if (m.tipo_original === "SETTLEMENT_SHIPPING") return { categoria_propuesta: "Costo de envío", regla_aplicada: "tipo envío", recurrencia: "sin clasificar" };
  if (m.api_tipo === "money_transfer") return { categoria_propuesta: m.direccion === "entrada" ? "Transferencia recibida (revisar si es propia)" : "Transferencia enviada (revisar si es propia)", regla_aplicada: "API: transferencia", recurrencia: "sin clasificar" };
  if (m.api_tipo === "recurring_payment") return { categoria_propuesta: "Suscripción", regla_aplicada: "API: pago recurrente", recurrencia: "recurrente" };
  if (!m.movimiento_id && !m.medio_pago && m.direccion === "entrada" && (m.importe_neto ?? 0) < 5000) return { categoria_propuesta: "Posible rendimiento (revisar)", regla_aplicada: "entrada chica sin medio de pago", recurrencia: "recurrente" };
  return { categoria_propuesta: "sin clasificar", regla_aplicada: null, recurrencia: "sin clasificar" };
}

export type Control = {
  cuenta_alias: string; cuenta_mp_id: number; mes: string; moneda: string; filas: number; entradas: number; salidas: number; neto: number;
  saldo_inicial: number | null; saldo_final: number | null; retiros_liquidaciones: number | null; diferencia: number | null; nota: string;
};
export type Cobertura = { cuenta_alias: string; cuenta_mp_id: number; periodo: string; fuente: string; estado: string; archivos: string; filas: number | null; motivo: string | null; actualizado: string };
export type Problema = { cuenta_alias: string; archivo: string; motivo: string };

/** Arma movimientos, controles y cobertura de las cuentas dadas. */
export async function normalizar(datos: DatosExport[], ahora = new Date()) {
  const movimientos: Movimiento[] = [];
  const controles: Control[] = [];
  const cobertura: Cobertura[] = [];
  const problemas: Problema[] = [];

  for (const d of datos) {
    const { cuenta, archivos, cola } = d;
    // Pagos de la API (el más nuevo de cada id), para completar la información de cada movimiento.
    const pagos = new Map<string, PagoBase>();
    if (d.pagos) for (const p of d.pagos) pagos.set(p.pago_id, p);
    else for (const a of archivos.filter((x) => x.fuente.startsWith("payments")).sort((x, y) => +x.bajado - +y.bajado)) {
      try { for (const p of pagosDeArchivo(a.contenido)) pagos.set(p.pago_id, p); } catch { problemas.push({ cuenta_alias: cuenta.alias, archivo: a.nombre, motivo: "no se pudo leer" }); }
    }

    // Todas las transacciones, sin duplicados: ya pasadas a movimientos (d.movs) o, si no, leídas de
    // los archivos (el más reciente primero; la misma clave en otro archivo no se repite).
    let movs = d.movs;
    if (!movs) {
      const vistas = new Set<string>();
      movs = [];
      for (const a of archivos.filter((x) => x.fuente === "settlement_report").sort((x, y) => +y.bajado - +x.bajado)) {
        const t = await leerArchivo(a);
        if (!t || !t.cab.includes("SOURCE_ID") || !t.cab.includes("TRANSACTION_TYPE")) { problemas.push({ cuenta_alias: cuenta.alias, archivo: a.nombre, motivo: "formato no reconocido (sin SOURCE_ID / TRANSACTION_TYPE)" }); continue; }
        for (const m of filasDeSettlement(cuenta.mpUserId, a, t)) if (!vistas.has(m.clave)) { vistas.add(m.clave); movs.push(m); }
      }
    }
    for (const b of movs) {
      const neto = b.importe_neto;
      const p = b.movimiento_id ? pagos.get(b.movimiento_id) : undefined;
      const direccion = neto == null || neto === 0 ? "sin efecto" : neto > 0 ? "entrada" : "salida";
      const contra = p ? (p.cobrador_id === String(cuenta.mpUserId) ? p.pagador_id : p.cobrador_id) : null;
      const mes = mesDe(b.fecha_saldo ?? b.fecha_operacion);
      const m: Movimiento = {
        version_esquema: VERSION_ESQUEMA, cuenta_mp_id: cuenta.mpUserId, cuenta_alias: cuenta.alias, titular: cuenta.titular, ambito_cuenta: cuenta.ambito,
        fuente: "Todas las transacciones", archivo: b.archivo, fila: b.fila, extraido: new Date(b.extraido).toISOString(),
        movimiento_id: b.movimiento_id, referencia_externa: b.referencia_externa, tipo_original: b.tipo_original, tipo: TIPOS[b.tipo_original] ?? b.tipo_original.toLowerCase(), direccion,
        fecha_operacion: local(b.fecha_operacion), fecha_operacion_original: b.fecha_operacion_original, fecha_saldo: local(b.fecha_saldo), fecha_liberacion: local(b.fecha_liberacion), mes, tramo: tramoDe(mes, ahora),
        moneda: b.moneda, importe_bruto: n(b.importe_bruto), comision: n(b.comision), impuestos: n(b.impuestos), cupon: n(b.cupon), importe_neto: n(neto),
        medio_pago: b.medio_pago, tipo_medio: b.tipo_medio, descripcion: b.descripcion,
        api_tipo: p?.tipo ?? null, api_estado: p?.estado ?? null, api_descripcion: p?.descripcion ?? null, api_pagado: n(p?.pagado ?? null), api_contraparte: contra ? `cuenta ${contra}` : null,
        clave_dedup: b.clave,
        categoria_propuesta: "", ambito_gasto: "sin clasificar", sociedad_atribuida: null, recurrencia: "", grupo_conciliacion: null, regla_aplicada: null, estado_revision: "pendiente",
      };
      Object.assign(m, clasificar(m));
      movimientos.push(m);
    }

    // Liquidaciones de cada mes de la cola: saldo inicial y final, y retiros a banco.
    const liquidaciones = new Map<string, { inicial: number | null; final: number | null; retiros: number }>();
    for (const it of cola.filter((x) => x.fuente === "release_report" && x.estado === "listo" && x.archivos?.length)) {
      const a = archivos.find((x) => x.fuente === "release_report" && x.nombre === it.archivos!.at(-1));
      const t = a ? await leerArchivo(a) : null;
      if (!t) continue;
      const i = (h: string) => t.cab.indexOf(h);
      const sinMov = t.filas.filter((f) => !f[i("SOURCE_ID")] && !f[i("DESCRIPTION")] && (i("RECORD_TYPE") < 0 || ["initial_available_balance", "total", ""].includes(f[i("RECORD_TYPE")])));
      const retiros = t.filas.filter((f) => f[i("DESCRIPTION")] === "payout").reduce((s, f) => s + (num(f[i("NET_DEBIT_AMOUNT")]) ?? 0), 0);
      liquidaciones.set(it.etiqueta.slice(0, 7), { inicial: sinMov.length ? num(sinMov[0][i("NET_CREDIT_AMOUNT")]) : null, final: sinMov.length > 1 ? num(sinMov.at(-1)![i("NET_CREDIT_AMOUNT")]) : null, retiros });
    }

    // Controles por mes y moneda (los meses de la cola).
    const meses = [...new Set(cola.filter((x) => x.desde).map((x) => x.etiqueta.slice(0, 7)))];
    // Para el control de saldo, cada movimiento cuenta en el mes en que la plata quedó disponible (fecha de
    // liberación; si no la hay, la de saldo): así se compara con Liquidaciones, que es el saldo disponible.
    // Un cobro de una venta afecta el saldo cuando se aprueba pero recién está disponible al liberarse.
    const porMes = new Map<string, Movimiento[]>();
    for (const m of movimientos) {
      if (m.cuenta_mp_id !== cuenta.mpUserId) continue;
      const k = (m.fecha_liberacion ?? m.fecha_saldo ?? m.fecha_operacion)?.slice(0, 7) ?? null;
      if (!k) continue;
      const l = porMes.get(k); if (l) l.push(m); else porMes.set(k, [m]);
    }
    const porArchivo = new Map<string, number>();
    for (const m of movimientos) if (m.cuenta_mp_id === cuenta.mpUserId) porArchivo.set(m.archivo, (porArchivo.get(m.archivo) ?? 0) + 1);
    for (const mes of meses) {
      const delMes = porMes.get(mes) ?? [];
      const monedas = [...new Set(delMes.map((m) => m.moneda ?? "ARS"))];
      for (const moneda of monedas.length ? monedas : ["ARS"]) {
        const f = delMes.filter((m) => (m.moneda ?? "ARS") === moneda);
        const entradas = f.reduce((s, m) => s + Math.max(0, m.importe_neto ?? 0), 0), salidas = f.reduce((s, m) => s + Math.min(0, m.importe_neto ?? 0), 0);
        const l = moneda === "ARS" ? liquidaciones.get(mes) : undefined;
        const conRetiros = f.some((m) => RETIROS.has(m.tipo_original));
        const diferencia = l?.inicial != null && l.final != null ? redondo(l.inicial + entradas + salidas - (conRetiros ? 0 : l.retiros) - l.final) : null;
        controles.push({
          cuenta_alias: cuenta.alias, cuenta_mp_id: cuenta.mpUserId, mes, moneda, filas: f.length, entradas: redondo(entradas), salidas: redondo(salidas), neto: redondo(entradas + salidas),
          saldo_inicial: l?.inicial ?? null, saldo_final: l?.final ?? null, retiros_liquidaciones: l ? redondo(l.retiros) : null, diferencia,
          nota: !l ? "sin Liquidaciones del mes: no se puede controlar el saldo" : diferencia == null ? "Liquidaciones sin saldo inicial o final" : Math.abs(diferencia) < 0.01 ? "cierra" :
            "no cierra: diferencia a explicar (dinero retenido por reclamos o reservas, o un movimiento sin fecha de liberación)" + (conRetiros ? "" : "; retiros tomados de Liquidaciones"),
        });
      }
    }

    // Cobertura: cada período y fuente de la cola, con su estado y cuántas filas aportó.
    for (const it of cola) {
      const filas = it.fuente === "settlement_report" && it.archivos?.length ? it.archivos.reduce((t, a) => t + (porArchivo.get(a) ?? 0), 0) : null;
      cobertura.push({
        cuenta_alias: cuenta.alias, cuenta_mp_id: cuenta.mpUserId, periodo: it.etiqueta, fuente: NOMBRES[it.fuente] ?? it.fuente,
        estado: ESTADOS[it.estado] ?? it.estado, archivos: (it.archivos ?? []).join(" "), filas, motivo: it.mensaje, actualizado: it.actualizado.toISOString(),
      });
    }
  }
  movimientos.sort((a, b) => a.cuenta_alias.localeCompare(b.cuenta_alias) || String(a.fecha_saldo ?? a.fecha_operacion).localeCompare(String(b.fecha_saldo ?? b.fecha_operacion)));
  return { movimientos, controles, cobertura, problemas };
}

const redondo = (n: number) => Math.round(n * 100) / 100;
const NOMBRES: Record<string, string> = { settlement_report: "Todas las transacciones", release_report: "Liquidaciones", payments: "Pagos (API)", config: "Configuración", existentes: "Reportes ya armados" };
const ESTADOS: Record<string, string> = { listo: "bajado", vacio: "sin movimientos", error: "falló", pedido: "armándose", pendiente: "en cola" };

// ── El diccionario de campos ───────────────────────────────────────────

export const DICCIONARIO: { campo: string; tipo: string; obligatorio: string; descripcion: string; ejemplo: string }[] = [
  { campo: "version_esquema", tipo: "texto", obligatorio: "sí", descripcion: "Versión de este formato.", ejemplo: VERSION_ESQUEMA },
  { campo: "cuenta_mp_id", tipo: "entero", obligatorio: "sí", descripcion: "Número de la cuenta en Mercado Pago (identificador estable).", ejemplo: "123456789" },
  { campo: "cuenta_alias", tipo: "texto", obligatorio: "sí", descripcion: "Nombre reconocible de la cuenta.", ejemplo: "CUENTA PRINCIPAL" },
  { campo: "titular", tipo: "texto", obligatorio: "no", descripcion: "Titular o sociedad según Mercado Pago.", ejemplo: "EMPRESA SA" },
  { campo: "ambito_cuenta", tipo: "empresa | personal", obligatorio: "sí", descripcion: "Si la cuenta está conectada como de la empresa o personal. No decide la categoría del gasto.", ejemplo: "empresa" },
  { campo: "fuente", tipo: "texto", obligatorio: "sí", descripcion: "Reporte de Mercado Pago del que sale la fila.", ejemplo: "Todas las transacciones" },
  { campo: "archivo / fila", tipo: "texto / entero", obligatorio: "sí", descripcion: "Archivo original y número de fila (la 1 es la cabecera).", ejemplo: "laucen-todas-manual-2026-10-18-011537.csv / 2" },
  { campo: "extraido", tipo: "fecha y hora UTC", obligatorio: "sí", descripcion: "Cuándo se bajó el archivo original.", ejemplo: "2026-10-18T05:18:51Z" },
  { campo: "movimiento_id", tipo: "texto", obligatorio: "no", descripcion: "Identificador de la operación en Mercado Pago (SOURCE_ID). Vacío en algunos rendimientos.", ejemplo: "176725980154" },
  { campo: "referencia_externa", tipo: "texto", obligatorio: "no", descripcion: "Referencia del vendedor o de la orden (EXTERNAL_REFERENCE).", ejemplo: "2000018730227366" },
  { campo: "tipo_original / tipo", tipo: "texto", obligatorio: "sí", descripcion: "Tipo tal cual lo da Mercado Pago (SETTLEMENT, REFUND, CHARGEBACK, DISPUTE, WITHDRAWAL, WITHDRAWAL_CANCEL, PAYOUT, SETTLEMENT_SHIPPING…) y su nombre en castellano.", ejemplo: "SETTLEMENT / operación aprobada" },
  { campo: "direccion", tipo: "entrada | salida | sin efecto", obligatorio: "sí", descripcion: "Según el signo del importe neto.", ejemplo: "salida" },
  { campo: "fecha_operacion", tipo: "fecha y hora (-03:00)", obligatorio: "no", descripcion: "Cuándo se hizo la operación (TRANSACTION_DATE), en hora argentina.", ejemplo: "2026-09-01T14:50:12-03:00" },
  { campo: "fecha_operacion_original", tipo: "texto", obligatorio: "no", descripcion: "La misma fecha tal cual vino, con su zona horaria original.", ejemplo: "2026-09-01T13:50:12.000-04:00" },
  { campo: "fecha_saldo", tipo: "fecha y hora (-03:00)", obligatorio: "no", descripcion: "Cuándo afectó el saldo (SETTLEMENT_DATE).", ejemplo: "2026-09-01T14:50:13-03:00" },
  { campo: "fecha_liberacion", tipo: "fecha y hora (-03:00)", obligatorio: "no", descripcion: "Cuándo se libera el dinero (MONEY_RELEASE_DATE), si el reporte la trae.", ejemplo: "" },
  { campo: "mes", tipo: "AAAA-MM", obligatorio: "no", descripcion: "Mes en que afectó el saldo, en hora de Córdoba (si falta, el de la operación).", ejemplo: "2026-09" },
  { campo: "tramo", tipo: "año comparable | mes en curso (parcial) | anterior", obligatorio: "sí", descripcion: "Año comparable = los 12 meses cerrados hasta el mes pasado.", ejemplo: "año comparable" },
  { campo: "moneda", tipo: "texto", obligatorio: "no", descripcion: "Moneda original. Nunca se convierte.", ejemplo: "ARS" },
  { campo: "importe_bruto", tipo: "decimal (punto, 2 decimales)", obligatorio: "no", descripcion: "Importe de la operación (TRANSACTION_AMOUNT). Positivo en cobros, negativo en pagos.", ejemplo: "-130949.00" },
  { campo: "comision / impuestos / cupon", tipo: "decimal", obligatorio: "no", descripcion: "Cargos y descuentos que Mercado Pago informa aparte (FEE_AMOUNT, TAXES_AMOUNT, COUPON_AMOUNT). Vacío = no lo informa.", ejemplo: "0.00" },
  { campo: "importe_neto", tipo: "decimal con signo", obligatorio: "sí", descripcion: "Efecto en el saldo (SETTLEMENT_NET_AMOUNT): + entra, − sale. Ya descuenta comisiones e impuestos: no sumarlos otra vez.", ejemplo: "-130949.00" },
  { campo: "medio_pago / tipo_medio", tipo: "texto", obligatorio: "no", descripcion: "Medio de pago tal cual lo da Mercado Pago.", ejemplo: "available_money / account_money" },
  { campo: "descripcion", tipo: "texto", obligatorio: "no", descripcion: "Descripción del reporte (si la cuenta tiene esa columna configurada).", ejemplo: "" },
  { campo: "api_tipo / api_estado / api_descripcion / api_pagado / api_contraparte", tipo: "texto / decimal", obligatorio: "no", descripcion: "Lo que dice la API de pagos del mismo movimiento (sólo el último año). api_pagado = lo que realmente se pagó (con cupones ya descontados).", ejemplo: "regular_payment / approved / Tablet… / 130949 / cobrador 123" },
  { campo: "clave_dedup", tipo: "texto", obligatorio: "sí", descripcion: "Clave sin duplicados: cuenta | fuente | movimiento_id | tipo | fecha de saldo (UTC) | neto | referencia, más #n si la misma fila aparece n veces en el reporte.", ejemplo: "" },
  { campo: "categoria_propuesta", tipo: "texto", obligatorio: "sí", descripcion: "Propuesta por reglas seguras (retiros, devoluciones, reclamos, envíos, transferencias, suscripciones). Lo demás: «sin clasificar». Nunca es definitiva.", ejemplo: "Transferencia enviada (revisar si es propia)" },
  { campo: "ambito_gasto / sociedad_atribuida / recurrencia / grupo_conciliacion / regla_aplicada / estado_revision", tipo: "texto", obligatorio: "sí", descripcion: "Clasificación revisable, aparte de los datos originales. ambito_gasto: personal | empresa | mixto | sin clasificar; recurrencia: recurrente | eventual | extraordinario | sin clasificar.", ejemplo: "sin clasificar / / sin clasificar / / / pendiente" },
];

// ── Los archivos de la exportación ──────────────────────────────────────

const COLUMNAS: (keyof Movimiento)[] = ["version_esquema", "cuenta_mp_id", "cuenta_alias", "titular", "ambito_cuenta", "fuente", "archivo", "fila", "extraido",
  "movimiento_id", "referencia_externa", "tipo_original", "tipo", "direccion", "fecha_operacion", "fecha_operacion_original", "fecha_saldo", "fecha_liberacion", "mes", "tramo",
  "moneda", "importe_bruto", "comision", "impuestos", "cupon", "importe_neto", "medio_pago", "tipo_medio", "descripcion",
  "api_tipo", "api_estado", "api_descripcion", "api_pagado", "api_contraparte", "clave_dedup",
  "categoria_propuesta", "ambito_gasto", "sociedad_atribuida", "recurrencia", "grupo_conciliacion", "regla_aplicada", "estado_revision"];

const celdaCsv = (v: unknown) => {
  if (v == null) return "";
  const s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function csv<T extends Record<string, unknown>>(filas: T[], columnas: (keyof T)[]) {
  return "﻿" + [columnas.join(","), ...filas.map((f) => columnas.map((c) => celdaCsv(f[c])).join(","))].join("\n") + "\n";
}

/** El paquete completo: CSV por cuenta y consolidado, Excel con todas las hojas, diccionario y manifiesto. */
export async function paqueteExportacion(datos: DatosExport[], ambito: string) {
  const ahora = new Date();
  const ejecucion = `${ambito}-${ahora.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const { movimientos, controles, cobertura, problemas } = await normalizar(datos, ahora);
  const movCsv = movimientos.map((m) => ({ ...m, fila: m.fila })) as unknown as Record<string, unknown>[];
  const archivos: { nombre: string; contenido: Uint8Array }[] = [];
  const utf8 = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));
  archivos.push({ nombre: "movimientos_consolidado.csv", contenido: utf8(csv(movCsv, COLUMNAS as string[])) });
  for (const d of datos) {
    const propios = movCsv.filter((m) => m.cuenta_mp_id === d.cuenta.mpUserId);
    archivos.push({ nombre: `movimientos_${d.cuenta.alias.replace(/[^A-Za-z0-9_.-]+/g, "_")}_${d.cuenta.mpUserId}.csv`, contenido: utf8(csv(propios, COLUMNAS as string[])) });
  }
  archivos.push({ nombre: "controles.csv", contenido: utf8(csv(controles as unknown as Record<string, unknown>[], Object.keys(controles[0] ?? { cuenta_alias: 0 }))) });
  archivos.push({ nombre: "cobertura.csv", contenido: utf8(csv(cobertura as unknown as Record<string, unknown>[], Object.keys(cobertura[0] ?? { cuenta_alias: 0 }))) });
  archivos.push({ nombre: "diccionario.csv", contenido: utf8(csv(DICCIONARIO, ["campo", "tipo", "obligatorio", "descripcion", "ejemplo"])) });

  const manifiesto = {
    version_esquema: VERSION_ESQUEMA, ejecucion, generado: ahora.toISOString(), zona_horaria_cortes: ZONA,
    criterio_periodos: "Meses calendario en hora argentina: inicio incluido (00:00:00) y fin el último segundo del mes (Mercado Pago no acepta fin excluido).",
    cuentas: datos.map((d) => ({
      cuenta_mp_id: d.cuenta.mpUserId, alias: d.cuenta.alias, titular: d.cuenta.titular, documento: d.cuenta.documento, ambito: d.cuenta.ambito,
      archivos_originales: d.archivos.length, filas: movimientos.filter((m) => m.cuenta_mp_id === d.cuenta.mpUserId).length,
      periodos: d.cola.filter((x) => x.desde).length,
      periodos_completos: d.cola.filter((x) => x.desde && (x.estado === "listo" || x.estado === "vacio")).length,
      pendientes: d.cola.filter((x) => x.estado === "pendiente" || x.estado === "pedido").map((x) => `${x.etiqueta} ${NOMBRES[x.fuente] ?? x.fuente}`),
      errores: d.cola.filter((x) => x.estado === "error").map((x) => `${x.etiqueta} ${NOMBRES[x.fuente] ?? x.fuente}: ${x.mensaje ?? ""}`),
      sin_movimientos: d.cola.filter((x) => x.estado === "vacio").map((x) => `${x.etiqueta} ${NOMBRES[x.fuente] ?? x.fuente}`),
      fecha_mas_antigua_en_datos: movimientos.filter((m) => m.cuenta_mp_id === d.cuenta.mpUserId).map((m) => m.fecha_saldo ?? m.fecha_operacion).filter(Boolean).sort()[0] ?? null,
    })),
    fuentes: {
      "Todas las transacciones": "Fuente principal de movimientos (operaciones aprobadas que afectan el saldo; las pendientes o rechazadas no aparecen). Hasta 60 días por pedido; se pide mes por mes.",
      "Liquidaciones": "Control de saldo inicial y final de cada mes y retiros a banco.",
      "Pagos (API)": "Detalle de cada pago (tipo, estado, descripción, contraparte). Sólo el último año.",
    },
    archivos_con_problemas: problemas,
    archivos: archivos.map((a) => a.nombre).concat(["exportacion.xlsx", "manifiesto.json"]),
    nota: "Un mes «sin movimientos» es porque Mercado Pago entregó el reporte vacío; un mes «falló» o «en cola» no está completo. Los importes no se convierten de moneda.",
  };

  // El Excel: las mismas tablas, para revisar.
  const libro = new ExcelJS.Workbook();
  const hoja = <T extends Record<string, unknown>>(nombre: string, filas: T[], columnas: string[]) => {
    const h = libro.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
    h.columns = columnas.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(10, c.length + 2)) }));
    h.getRow(1).font = { bold: true };
    for (const f of filas) h.addRow(columnas.map((c) => f[c] ?? null));
    h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  };
  hoja("Movimientos", movCsv, COLUMNAS as string[]);
  hoja("Cuentas", manifiesto.cuentas.map((c) => ({ ...c, pendientes: c.pendientes.length, errores: c.errores.join(" | "), sin_movimientos: c.sin_movimientos.length })) as Record<string, unknown>[],
    ["cuenta_mp_id", "alias", "titular", "documento", "ambito", "archivos_originales", "filas", "periodos", "periodos_completos", "pendientes", "errores", "sin_movimientos", "fecha_mas_antigua_en_datos"]);
  hoja("Cobertura", cobertura as unknown as Record<string, unknown>[], ["cuenta_alias", "cuenta_mp_id", "periodo", "fuente", "estado", "filas", "archivos", "motivo", "actualizado"]);
  hoja("Controles", controles as unknown as Record<string, unknown>[], ["cuenta_alias", "cuenta_mp_id", "mes", "moneda", "filas", "entradas", "salidas", "neto", "saldo_inicial", "saldo_final", "retiros_liquidaciones", "diferencia", "nota"]);
  hoja("Diccionario", DICCIONARIO, ["campo", "tipo", "obligatorio", "descripcion", "ejemplo"]);
  hoja("Manifiesto", Object.entries(manifiesto).filter(([, v]) => typeof v !== "object").map(([clave, valor]) => ({ clave, valor })), ["clave", "valor"]);
  archivos.push({ nombre: "exportacion.xlsx", contenido: new Uint8Array(await libro.xlsx.writeBuffer() as ArrayBuffer) });
  archivos.push({ nombre: "manifiesto.json", contenido: utf8(JSON.stringify(manifiesto, null, 2)) });

  return { zip: armarZip(archivos, ahora), nombre: `mercadopago-${ejecucion}.zip`, resumen: { movimientos: movimientos.length, controles, problemas } };
}
