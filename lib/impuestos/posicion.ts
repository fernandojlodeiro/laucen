// Posición de impuestos de una razón social (Fer, 23/10): con lo cargado en Laucen (facturas emitidas, facturas de
// compra, despachos, lo que descuenta Mercado Pago) y la última declaración jurada del contador, cuánto da el mes
// —IVA, Ingresos Brutos provincia por provincia y la municipal de Córdoba— y, para un mes ya declarado, en qué no
// coincide la declaración con lo cargado.
//
// De dónde sale cada cosa:
//   · IVA: débito y crédito del libro de IVA (lib/administracion/libro-iva-base.ts, el mismo que se presenta);
//     pagos a cuenta = percepciones de IVA de compras y despachos. Saldo técnico y de libre disponibilidad anteriores:
//     los que dejó la declaración del mes anterior.
//   · IIBB (Convenio Multilateral): base = ventas del mes sin IVA (neto gravado + no gravado + exento, en pesos, las
//     notas de crédito restan). Por jurisdicción: base × coeficiente unificado × alícuota (los de la tabla
//     iibb_jurisdiccion, que se cargan de la última declaración). Menos: percepciones de las facturas de compra (cada
//     una en su provincia: percepcion_iibb_detalle, si no la del proveedor, si no la sede), percepciones aduaneras de
//     los despachos y lo que descuenta Mercado Pago en los cobros (estos dos, repartidos por coeficiente: no traen la
//     provincia) y el saldo a favor que dejó la declaración anterior en esa jurisdicción.
//   · Municipal de Córdoba: base × alícuota (o el mínimo), menos el saldo a favor anterior.

import { consulta, una } from "@/lib/erp/base";
import { armarLibro, resumenIva, rangoMes, clasificarImpuestosDespacho, type CbteIva, type ImpuestoDespacho } from "@/lib/administracion/libro-iva";
import { libroIvaPeriodo } from "@/lib/administracion/libro-iva-base";
import { datosDe, type DatosIva, type DatosIibb, type DatosMunicipal, type Impuesto } from "@/lib/impuestos/ddjj-leer";
import { SEDE_POR_DEFECTO, nombreJurisdiccion, provinciasDePercepcion } from "@/lib/impuestos/jurisdicciones";

export { provinciasDePercepcion };

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** "2026-10" → "2026-09". */
export function mesAnterior(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
}

// ── Cálculos (puros) ─────────────────────────────────────────────────

export type PosicionIva = {
  debito: number; credito: number; saldoTecnicoAnterior: number; impuesto: number; saldoTecnicoFavor: number;
  pagosACuenta: number; saldoLibreAnterior: number; aPagar: number; saldoLibreFavor: number;
};

/** IVA del mes, como el F.2002: débito − crédito − saldo técnico anterior; si da negativo, saldo técnico a favor.
 *  Al impuesto se le restan los pagos a cuenta y el saldo de libre disponibilidad anterior. */
export function calcularIva(p: { debito: number; credito: number; pagosACuenta: number; anterior: Pick<DatosIva, "saldo_tecnico_favor" | "saldo_libre_favor"> | null }): PosicionIva {
  const saldoTecnicoAnterior = r2(p.anterior?.saldo_tecnico_favor ?? 0);
  const st = r2(p.debito - p.credito - saldoTecnicoAnterior);
  const impuesto = Math.max(0, st), saldoTecnicoFavor = Math.max(0, -st);
  const saldoLibreAnterior = r2(p.anterior?.saldo_libre_favor ?? 0);
  const libre = r2(p.pagosACuenta + saldoLibreAnterior);
  return {
    debito: r2(p.debito), credito: r2(p.credito), saldoTecnicoAnterior, impuesto, saldoTecnicoFavor, pagosACuenta: r2(p.pagosACuenta), saldoLibreAnterior,
    aPagar: r2(Math.max(0, impuesto - libre)), saldoLibreFavor: r2(Math.max(0, libre - impuesto)),
  };
}

export type FilaIibb = {
  codigo: number; coeficiente: number; alicuota: number; base: number; determinado: number;
  percepciones: number; aduaneras: number; retenciones: number; saldoAnterior: number;
  /** > 0 a pagar · < 0 a favor. */
  saldo: number;
};

/** Ingresos Brutos por jurisdicción. Las percepciones de una provincia que no está en la lista suman una fila
 *  (con coeficiente 0: sólo saldo a favor). Lo que no trae provincia (aduaneras, Mercado Pago) se reparte por
 *  coeficiente; si no hay coeficientes, va a la sede. */
export function calcularIibb(p: {
  base: number; jurisdicciones: { codigo: number; coeficiente: number; alicuota: number }[];
  percepciones: Map<number, number>; aduaneras: number; retenciones: number; anteriores: Map<number, number>; sede: number;
}) {
  const filas = new Map<number, FilaIibb>();
  const fila = (codigo: number) => {
    let f = filas.get(codigo);
    if (!f) { f = { codigo, coeficiente: 0, alicuota: 0, base: 0, determinado: 0, percepciones: 0, aduaneras: 0, retenciones: 0, saldoAnterior: 0, saldo: 0 }; filas.set(codigo, f); }
    return f;
  };
  for (const j of p.jurisdicciones) {
    const f = fila(j.codigo);
    f.coeficiente = j.coeficiente; f.alicuota = j.alicuota;
    f.base = r2(p.base * j.coeficiente);
    f.determinado = r2(f.base * j.alicuota / 100);
  }
  for (const [c, v] of p.percepciones) fila(c).percepciones = r2(fila(c).percepciones + v);
  const sumaCoef = p.jurisdicciones.reduce((s, j) => s + j.coeficiente, 0);
  const repartir = (total: number, campo: "aduaneras" | "retenciones") => {
    if (!total) return;
    if (sumaCoef > 0) {
      let resto = r2(total);
      const js = p.jurisdicciones.filter((j) => j.coeficiente > 0);
      js.forEach((j, i) => {
        const v = i === js.length - 1 ? resto : r2(total * j.coeficiente / sumaCoef);
        fila(j.codigo)[campo] = r2(fila(j.codigo)[campo] + v);
        resto = r2(resto - v);
      });
    } else fila(p.sede)[campo] = r2(fila(p.sede)[campo] + total);
  };
  repartir(p.aduaneras, "aduaneras");
  repartir(p.retenciones, "retenciones");
  for (const [c, v] of p.anteriores) if (v > 0) fila(c).saldoAnterior = r2(v);
  const lista = [...filas.values()].sort((a, b) => a.codigo - b.codigo);
  for (const f of lista) f.saldo = r2(f.determinado - f.percepciones - f.aduaneras - f.retenciones - f.saldoAnterior);
  const sum = (k: keyof FilaIibb) => r2(lista.reduce((s, f) => s + (f[k] as number), 0));
  return {
    filas: lista,
    totales: {
      base: r2(p.base), determinado: sum("determinado"), percepciones: sum("percepciones"), aduaneras: sum("aduaneras"), retenciones: sum("retenciones"),
      saldoAnterior: sum("saldoAnterior"),
      aPagar: r2(lista.reduce((s, f) => s + Math.max(0, f.saldo), 0)), aFavor: r2(lista.reduce((s, f) => s + Math.max(0, -f.saldo), 0)),
    },
  };
}

export type PosicionMunicipal = { base: number; alicuota: number; calculado: number; minimo: number; determinado: number; saldoAnterior: number; saldo: number };

export function calcularMunicipal(p: { base: number; alicuota: number; minimo: number; saldoAnterior: number }): PosicionMunicipal {
  const calculado = r2(p.base * p.alicuota / 100);
  const determinado = Math.max(calculado, r2(p.minimo));
  return { base: r2(p.base), alicuota: p.alicuota, calculado, minimo: r2(p.minimo), determinado, saldoAnterior: r2(p.saldoAnterior), saldo: r2(determinado - p.saldoAnterior) };
}

/** Las ventas del mes sin IVA, en pesos (las notas de crédito restan). */
export function baseVentas(ventas: CbteIva[]) {
  return r2(ventas.reduce((s, c) => {
    const cot = c.moneda === "PES" ? 1 : c.cotizacion || 1;
    const neto = c.alicuotas.reduce((x, a) => x + a.base, 0) + c.noGravado + c.exento + c.sinDiscriminar;
    return s + (c.nc ? -1 : 1) * neto * cot;
  }, 0));
}

// ── De la base ───────────────────────────────────────────────────────

export type FilaDdjj = { id: number; emisor_id: number; impuesto: Impuesto; periodo: string; rectificativa: number; fecha_presentacion: string | null;
  archivo: string | null; archivo_nombre: string | null; datos: unknown; notas: string | null; creado_ts: string };

const COLS_DDJJ = `id::int, emisor_id::int, impuesto, periodo, rectificativa, to_char(fecha_presentacion, 'YYYY-MM-DD') fecha_presentacion, archivo, archivo_nombre, datos, notas, creado_ts::text`;

/** La declaración que vale de un período (la última rectificativa). */
/** Las declaraciones de una razón social, de la más nueva a la más vieja (todas las rectificativas). */
export function ddjjDe(org: string, emisorId: number) {
  return consulta<FilaDdjj>(`select ${COLS_DDJJ} from ddjj where organizacion_id = $1 and emisor_id = $2 order by periodo desc, impuesto, rectificativa desc, id desc`, [org, emisorId]);
}

export async function ddjjPorId(org: string, id: number) {
  return una<FilaDdjj>(`select ${COLS_DDJJ} from ddjj where organizacion_id = $1 and id = $2`, [org, id]);
}

export function ddjjDelPeriodo(org: string, emisorId: number, impuesto: Impuesto, periodo: string) {
  return una<FilaDdjj>(`select ${COLS_DDJJ} from ddjj where organizacion_id = $1 and emisor_id = $2 and impuesto = $3 and periodo = $4
    order by rectificativa desc, id desc limit 1`, [org, emisorId, impuesto, periodo]);
}

/** La última declaración anterior a un período. */
export function ddjjAntesDe(org: string, emisorId: number, impuesto: Impuesto, periodo: string) {
  return una<FilaDdjj>(`select ${COLS_DDJJ} from ddjj where organizacion_id = $1 and emisor_id = $2 and impuesto = $3 and periodo < $4
    order by periodo desc, rectificativa desc, id desc limit 1`, [org, emisorId, impuesto, periodo]);
}

export async function datosRazonSocial(org: string, emisorId: number) {
  const e = await una<{ id: number; nombre: string; iibb_sede: number; municipal_inscripta: boolean; municipal_alicuota: string | null; municipal_minimo: string | null; es_principal: boolean }>(
    "select id::int, coalesce(nombre, razon_social) nombre, iibb_sede, municipal_inscripta, municipal_alicuota, municipal_minimo, es_principal from emisor where organizacion_id = $1 and id = $2", [org, emisorId]);
  const jurisdicciones = await consulta<{ codigo: number; coeficiente: number; alicuota: number }>(
    "select codigo, coeficiente::float, alicuota::float from iibb_jurisdiccion where organizacion_id = $1 and emisor_id = $2 order by codigo", [org, emisorId]);
  return e ? { ...e, sede: e.iibb_sede ?? SEDE_POR_DEFECTO, jurisdicciones } : null;
}

/** Percepciones de IIBB de las facturas de compra del mes, por provincia. */
async function percepcionesCompras(org: string, emisorId: number, desde: string, hasta: string, sede: number) {
  const fs = await consulta<{ percepcion_iibb: string; detalle: { jur: number; importe: number }[] | null; jur_proveedor: number | null; nc: boolean; cot: string; moneda: string }>(`
    select f.percepcion_iibb, f.percepcion_iibb_detalle detalle, p.iibb_jurisdiccion jur_proveedor, f.es_nota_credito nc, f.cotizacion cot, f.moneda
      from factura_compra f join proveedor p on p.id = f.proveedor_id
     where f.organizacion_id = $1 and f.estado = 'registrada' and f.letra <> 'E' and f.percepcion_iibb <> 0
       and f.fecha between $2::date and $3::date and f.emisor_id = $4`, [org, desde, hasta, emisorId]);
  const m = new Map<number, number>();
  for (const f of fs) {
    const k = (f.nc ? -1 : 1) * (f.moneda === "USD" ? Number(f.cot) || 1 : 1);
    for (const x of provinciasDePercepcion(Number(f.percepcion_iibb), f.detalle, f.jur_proveedor, sede)) m.set(x.jur, r2((m.get(x.jur) ?? 0) + x.importe * k));
  }
  return m;
}

/** Percepciones de IIBB de los despachos del mes (aduaneras). */
async function percepcionesAduaneras(org: string, emisorId: number, desde: string, hasta: string) {
  const ds = await consulta<{ impuestos: ImpuestoDespacho[] | null }>(`select impuestos from despacho_importacion
     where organizacion_id = $1 and estado = 'registrado' and fecha between $2::date and $3::date and emisor_id = $4`, [org, desde, hasta, emisorId]);
  return r2(ds.reduce((s, d) => s + clasificarImpuestosDespacho(d.impuestos ?? []).percepcionIibb, 0));
}

/** Lo que Mercado Pago descontó como impuestos en los cobros del mes (retenciones), de las cuentas de los canales de
 *  la razón social (un canal sin razón social es de la principal). Las devoluciones restan. */
async function retencionesMercadoPago(org: string, emisorId: number, esPrincipal: boolean, desde: string, hasta: string) {
  const r = await una<{ t: number }>(`
    select coalesce(sum(-m.impuestos), 0)::float t from mp_export_mov m
     where m.organizacion_id = $1 and m.impuestos is not null and m.impuestos <> 0
       and (m.fecha_operacion at time zone 'America/Argentina/Buenos_Aires')::date between $2::date and $3::date
       and m.conexion_id in (
         select cm.conexion_id from canal_mp cm join canal c on c.id = cm.canal_id
          where cm.organizacion_id = $1 and (c.emisor_id = $4 or (c.emisor_id is null and $5)))`, [org, desde, hasta, emisorId, esPrincipal]);
  return r2(Math.max(0, r?.t ?? 0));
}

/** Lo cargado en Laucen de un mes (sin declaraciones): ventas, crédito, percepciones y retenciones. */
export async function cargadoDelMes(org: string, emisorId: number, mes: string) {
  const rs = await datosRazonSocial(org, emisorId);
  if (!rs) throw new Error("La razón social no existe.");
  const { desde, hasta } = rangoMes(mes);
  const [{ ventas, compras }, percepciones, aduaneras, retenciones] = await Promise.all([
    libroIvaPeriodo(org, desde, hasta, emisorId),
    percepcionesCompras(org, emisorId, desde, hasta, rs.sede),
    percepcionesAduaneras(org, emisorId, desde, hasta),
    retencionesMercadoPago(org, emisorId, rs.es_principal, desde, hasta),
  ]);
  const lv = armarLibro(ventas), lc = armarLibro(compras);
  const res = resumenIva(lv.totales, lc.totales);
  return { rs, desde, hasta, ventas: ventas.length, compras: compras.length, base: baseVentas(ventas), debito: res.debito, credito: res.credito,
    percepcionesIva: r2(res.percepciones), percepcionesIibb: percepciones, aduaneras, retenciones };
}

/** La posición de un mes: lo cargado + lo que dejó la declaración del mes anterior. */
export async function posicionMes(org: string, emisorId: number, mes: string) {
  const c = await cargadoDelMes(org, emisorId, mes);
  const ant = mesAnterior(mes);
  const avisos: string[] = [];
  const [ivaAnt, iibbAnt, munAnt] = await Promise.all((["iva", "iibb", "municipal"] as const).map((i) => ddjjAntesDe(org, emisorId, i, mes)));
  const nota = (i: Impuesto, d: FilaDdjj | null, texto: string) => {
    if (i === "municipal" && !c.rs.municipal_inscripta) return;
    if (!d) avisos.push(`No hay ninguna declaración de ${texto} cargada: el saldo a favor anterior se toma en cero.`);
    else if (d.periodo !== ant) avisos.push(`La última declaración de ${texto} cargada es la de ${d.periodo.split("-").reverse().join("/")}, no la de ${ant.split("-").reverse().join("/")}: el saldo anterior sale de ésa.`);
  };
  nota("iva", ivaAnt, "IVA"); nota("iibb", iibbAnt, "Ingresos Brutos"); nota("municipal", munAnt, "la municipal");

  const iva = calcularIva({ debito: c.debito, credito: c.credito, pagosACuenta: c.percepcionesIva, anterior: ivaAnt ? (datosDe("iva", ivaAnt.datos) as DatosIva) : null });

  const dIibbAnt = iibbAnt ? (datosDe("iibb", iibbAnt.datos) as DatosIibb) : null;
  const jurs = c.rs.jurisdicciones.length ? c.rs.jurisdicciones
    : (dIibbAnt?.jurisdicciones ?? []).map((j) => ({ codigo: j.codigo, coeficiente: j.coeficiente, alicuota: j.alicuota }));
  if (!jurs.length) avisos.push("Faltan las provincias de Ingresos Brutos (coeficiente y alícuota): se cargan solas al subir una declaración de IIBB, o a mano en la pestaña «Provincias».");
  const anteriores = new Map((dIibbAnt?.jurisdicciones ?? []).map((j) => [j.codigo, j.saldo < 0 ? -j.saldo : 0]));
  const iibb = calcularIibb({ base: c.base, jurisdicciones: jurs, percepciones: c.percepcionesIibb, aduaneras: c.aduaneras, retenciones: c.retenciones, anteriores, sede: c.rs.sede });

  let municipal: PosicionMunicipal | null = null;
  if (c.rs.municipal_inscripta) {
    const dm = munAnt ? (datosDe("municipal", munAnt.datos) as DatosMunicipal) : null;
    const alicuota = c.rs.municipal_alicuota != null ? Number(c.rs.municipal_alicuota) : dm?.alicuota ?? 0;
    const minimo = c.rs.municipal_minimo != null ? Number(c.rs.municipal_minimo) : dm?.minimo ?? 0;
    if (!alicuota) avisos.push("Falta la alícuota de la municipal de Córdoba: se carga sola al subir una declaración municipal, o a mano en la pestaña «Provincias».");
    municipal = calcularMunicipal({ base: c.base, alicuota, minimo, saldoAnterior: dm && dm.saldo < 0 ? -dm.saldo : 0 });
  }
  return { cargado: c, iva, iibb, municipal, avisos, anteriores: { iva: ivaAnt, iibb: iibbAnt, municipal: munAnt } };
}

// ── Control de una declaración contra lo cargado ─────────────────────

export type Diferencia = { concepto: string; ddjj: number; laucen: number; dif: number };
const TOLERANCIA = 1;

const comparar = (difs: Diferencia[], concepto: string, ddjj: number, laucen: number) => {
  const dif = r2(ddjj - laucen);
  if (Math.abs(dif) > TOLERANCIA) difs.push({ concepto, ddjj: r2(ddjj), laucen: r2(laucen), dif });
};

/** Qué no coincide entre una declaración y lo cargado en Laucen ese mes (y con la declaración del mes anterior). */
export type Cargado = Awaited<ReturnType<typeof cargadoDelMes>>;

/** `cargado`: lo del mes ya calculado (para controlar varias declaraciones del mismo mes sin repetir las consultas). */
export async function controlDdjj(org: string, d: FilaDdjj, cargado?: Cargado): Promise<{ diferencias: Diferencia[]; cargado: Cargado }> {
  const c = cargado ?? await cargadoDelMes(org, d.emisor_id, d.periodo);
  const prev = await ddjjDelPeriodo(org, d.emisor_id, d.impuesto, mesAnterior(d.periodo));
  const difs: Diferencia[] = [];
  if (d.impuesto === "iva") {
    const x = datosDe("iva", d.datos) as DatosIva;
    comparar(difs, "Débito fiscal", x.debito, c.debito);
    comparar(difs, "Crédito fiscal", x.credito, c.credito);
    comparar(difs, "Retenciones y percepciones (pagos a cuenta)", x.pagos_a_cuenta, c.percepcionesIva);
    if (prev) {
      const p = datosDe("iva", prev.datos) as DatosIva;
      comparar(difs, "Saldo técnico anterior (contra la declaración del mes anterior)", x.saldo_tecnico_anterior, p.saldo_tecnico_favor);
      comparar(difs, "Saldo de libre disponibilidad anterior (contra la declaración del mes anterior)", x.saldo_libre_anterior, p.saldo_libre_favor);
    }
  } else if (d.impuesto === "iibb") {
    const x = datosDe("iibb", d.datos) as DatosIibb;
    comparar(difs, "Base imponible total (ventas sin IVA)", x.base_total, c.base);
    const jurs = x.jurisdicciones.map((j) => ({ codigo: j.codigo, coeficiente: j.coeficiente, alicuota: j.alicuota }));
    const calc = calcularIibb({ base: c.base, jurisdicciones: jurs, percepciones: c.percepcionesIibb, aduaneras: c.aduaneras, retenciones: c.retenciones, anteriores: new Map(), sede: c.rs.sede });
    const p = prev ? (datosDe("iibb", prev.datos) as DatosIibb) : null;
    const codigos = [...new Set([...x.jurisdicciones.map((j) => j.codigo), ...calc.filas.filter((f) => f.percepciones).map((f) => f.codigo)])].sort();
    for (const cod of codigos) {
      const j = x.jurisdicciones.find((y) => y.codigo === cod);
      const l = calc.filas.find((y) => y.codigo === cod);
      const n = nombreJurisdiccion(cod);
      comparar(difs, `${n}: percepciones`, j?.percepciones ?? 0, l?.percepciones ?? 0);
      comparar(difs, `${n}: percepciones aduaneras (Laucen las reparte por coeficiente)`, j?.percepciones_aduaneras ?? 0, l?.aduaneras ?? 0);
      comparar(difs, `${n}: retenciones y recaudaciones (Laucen reparte lo de Mercado Pago por coeficiente)`, (j?.retenciones ?? 0) + (j?.recaudaciones_bancarias ?? 0), l?.retenciones ?? 0);
      if (p) {
        const pj = p.jurisdicciones.find((y) => y.codigo === cod);
        comparar(difs, `${n}: saldo a favor anterior (contra la declaración del mes anterior)`, j?.saldo_anterior ?? 0, pj && pj.saldo < 0 ? -pj.saldo : 0);
      }
    }
  } else {
    const x = datosDe("municipal", d.datos) as DatosMunicipal;
    comparar(difs, "Base imponible (ventas sin IVA)", x.base, c.base);
    if (prev) {
      const p = datosDe("municipal", prev.datos) as DatosMunicipal;
      comparar(difs, "Saldo a favor anterior (contra la declaración del mes anterior)", x.saldo_anterior, p.saldo < 0 ? -p.saldo : 0);
    }
  }
  return { diferencias: difs, cargado: c };
}
