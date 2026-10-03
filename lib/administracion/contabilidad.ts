// Contabilidad: plan de cuentas, asientos automáticos y los libros.
//
// Los asientos NO se cargan a mano (salvo el manual, para ajustes del
// contador): contabilizarPendientes() recorre cada tipo de documento que
// todavía no tiene su asiento y lo genera, uno por documento (índice único
// organización + origen + referencia). Lo llaman las tareas periódicas y el
// botón "Contabilizar ahora". Todo en pesos.
//
// Qué asienta cada origen:
//   venta / nota_credito_venta  Deudores · Ventas (la del canal, si tiene) + IVA débito (comprobante autorizado)
//   cmv                         CMV · Mercaderías (al costo promedio, por comprobante de venta)
//   cobro_pedido                Mercado Pago de la cuenta de ML o de la tienda (o Cobros de canales) + Comisiones · Deudores (pedido pagado y facturado, cliente sin cuenta corriente);
//                               si va a una cuenta de fondos, deja también su movimiento ahí (lib/administracion/cobros-fondos.ts)
//   compra                      Mercaderías / gasto + IVA crédito + percepciones · Proveedores (factura de compra registrada)
//   despacho                    Mercaderías + crédito fiscal · Importaciones en curso
//   cobro / pago                Fondos + retenciones · Deudores / Proveedores · Fondos + retenciones a depositar (recibos)
//   movimiento                  Fondos · contrapartida elegida (movimientos sueltos)
//   transferencia               Fondos destino · Fondos origen
//   ajuste_stock                Diferencias de inventario · Mercaderías (o al revés)
//   diferencia_cambio           Diferencias de cambio · Proveedores / Deudores (o al revés), por imputación de cuenta corriente
//   diferencia_recepcion        Diferencias en recepciones de stock · Mercaderías (o al revés), por factura vinculada a una recepción
//
// Cuentas que se crean solas (asegurarCuentasDeCanales): una "Ventas — <canal>"
// por canal (canal.cuenta_ventas_id) y, por cada cuenta de Mercado Libre
// colgada de un canal, una cuenta de fondos "Mercado Pago — <apodo>" con su
// cuenta contable propia en Disponibilidades (cuenta_fondos.meli_user_id y
// canal_id); y por el medio de pago Mercado Pago de la tienda con su access
// token, "Mercado Pago — Tienda web" (cuenta_fondos.medio_pago_id). No llevan
// rol: los asientos las encuentran por esos vínculos, y si faltan usan las
// generales (Ventas, Cobros de canales a liquidar).

import type { PoolClient } from "pg";
import { consulta, una, una as unaBase, enTransaccion, ErrorErp, type Consultor } from "@/lib/erp/base";
import { codigoValido, proximoCodigo, proximoCodigoBajo, madreDe, TIPOS_CUENTA, type TipoCuenta } from "@/lib/administracion/plan-codigos";
import { type Linea, nombreContableMercadoPago, lineasVenta, lineasCobroPedido } from "@/lib/administracion/contabilidad-base";
import { SQL_CUENTA_COBRO, SQL_MEDIOS_MP_SIN_CUENTA, asegurarMercadoPagoTienda, movimientoDeCobro, sincronizarCobrosConFondos } from "@/lib/administracion/cobros-fondos";
import { diferenciaDeCambio, lineasDiferenciaCambio, lineaDiferenciaTransferencia, lineasDiferenciaRecepcion, type DiferenciaRecepcion } from "@/lib/administracion/diferencias";

export { nombreContableMercadoPago, lineasVenta, lineasCobroPedido, type Linea };

const r2 = (x: number) => Math.round(x * 100) / 100;

type Tipo = TipoCuenta;

/** El plan por defecto. Los títulos (no imputables) agrupan; `rol` es lo que
 *  buscan los asientos automáticos. Se puede renombrar, recodificar y agregar
 *  cuentas: los asientos siguen el rol, no el código. */
const PLAN: [codigo: string, nombre: string, tipo: Tipo, rol?: string][] = [
  ["1", "ACTIVO", "activo"],
  ["1.1", "Disponibilidades", "activo"],
  ["1.1.01", "Caja", "activo", "caja"],
  ["1.1.02", "Bancos", "activo", "bancos"],
  // Sin "Mercado Pago" genérica (pedido de Fer, 3/10): cada cuenta de Mercado
  // Libre conectada trae su propia cuenta de Mercado Pago (asegurarCuentasDeCanales).
  ["1.1.04", "Cobros de canales a liquidar", "activo", "cobros_canal"],
  ["1.2", "Créditos", "activo"],
  ["1.2.01", "Deudores por ventas", "activo", "deudores"],
  ["1.2.02", "IVA crédito fiscal", "activo", "iva_credito"],
  ["1.2.03", "Percepciones de IVA", "activo", "percepcion_iva"],
  ["1.2.04", "Percepciones de IIBB", "activo", "percepcion_iibb"],
  ["1.2.05", "Retenciones sufridas y anticipos", "activo", "retenciones_sufridas"],
  ["1.3", "Bienes de cambio", "activo"],
  ["1.3.01", "Mercaderías", "activo", "mercaderias"],
  ["1.3.02", "Importaciones en curso", "activo", "importaciones_en_curso"],
  ["2", "PASIVO", "pasivo"],
  ["2.1", "Deudas comerciales", "pasivo"],
  ["2.1.01", "Proveedores", "pasivo", "proveedores"],
  ["2.2", "Deudas fiscales", "pasivo"],
  ["2.2.01", "IVA débito fiscal", "pasivo", "iva_debito"],
  ["2.2.02", "Retenciones a depositar", "pasivo", "retenciones_a_depositar"],
  ["3", "PATRIMONIO NETO", "patrimonio"],
  ["3.1.01", "Capital", "patrimonio", "capital"],
  ["3.1.02", "Resultados acumulados", "patrimonio", "resultados_acumulados"],
  ["4", "INGRESOS", "ingreso"],
  ["4.1.01", "Ventas", "ingreso", "ventas"],
  ["4.1.02", "Otros ingresos", "ingreso", "otros_ingresos"],
  // Diferencias de cambio (pedido de Fer, 3/10): resultado financiero, una de
  // ganancia y una de pérdida (imputaciones entre monedas y transferencias).
  ["4.2.01", "Diferencias de cambio positivas", "ingreso", "diferencia_cambio_positiva"],
  ["5", "EGRESOS", "egreso"],
  ["5.1.01", "Costo de mercaderías vendidas", "egreso", "cmv"],
  ["5.1.02", "Diferencias de inventario", "egreso", "diferencias_inventario"],
  // Lo facturado que no se recibió (o al revés), en facturas con recepción.
  ["5.1.03", "Diferencias en recepciones de stock", "egreso", "diferencias_recepcion"],
  // Bajo 5.1 y no después de 5.2.05, para que la cuenta nueva que se sugiere
  // siga siendo la 5.2.06 (proximoCodigo sigue a la imputable más alta).
  ["5.1.04", "Diferencias de cambio negativas", "egreso", "diferencia_cambio_negativa"],
  ["5.2.01", "Comisiones de canales", "egreso", "comisiones"],
  ["5.2.02", "Fletes y envíos", "egreso", "fletes"],
  ["5.2.03", "Gastos bancarios", "egreso", "gastos_bancarios"],
  ["5.2.04", "Impuestos y tasas", "egreso", "impuestos"],
  ["5.2.05", "Gastos varios", "egreso", "gastos_varios"],
];

/** Carga el plan por defecto la primera vez (y agrega los roles que falten).
 *  Si el código de una cuenta automática nueva ya lo tiene otra cuenta (una
 *  creada a mano, o una "Ventas — canal"), va al próximo libre bajo la misma
 *  madre; sólo adopta la que está si tiene ese mismo nombre y ningún rol. */
export async function asegurarPlan(org: string) {
  const cuentas = await consulta<{ codigo: string; nombre: string; rol: string | null }>("select codigo, nombre, rol from plan_cuenta where organizacion_id = $1", [org]);
  const hay = new Set(cuentas.map((r) => r.rol).filter(Boolean));
  const vacio = !cuentas.length;
  const faltan = PLAN.filter(([, , , rol]) => (vacio ? true : rol && !hay.has(rol))).map(([codigo, nombre, tipo, rol]) => {
    const ya = cuentas.find((x) => x.codigo === codigo);
    if (ya && !(ya.rol == null && ya.nombre === nombre)) {
      const i = codigo.lastIndexOf(".");
      codigo = proximoCodigoBajo(cuentas, i > 0 ? codigo.slice(0, i) : codigo);
    }
    cuentas.push({ codigo, nombre, rol: rol ?? null });
    return [codigo, nombre, tipo, rol] as const;
  });
  if (!faltan.length) return;
  await enTransaccion(async (c) => {
    for (const [codigo, nombre, tipo, rol] of faltan) {
      await c.query(`insert into plan_cuenta (organizacion_id, codigo, nombre, tipo, imputable, rol) values ($1, $2, $3, $4, $5, $6)
                     on conflict (organizacion_id, codigo) do update set rol = coalesce(plan_cuenta.rol, excluded.rol)`,
        [org, codigo, nombre, tipo, !!rol, rol ?? null]);
    }
  });
}

// ── Cuentas propias de canales y de Mercado Pago ───────────

/** Dónde va una cuenta propia: bajo la misma madre que la cuenta automática de
 *  ese rol (así sigue andando aunque se recodifique el plan: "ventas" → 4.1,
 *  "caja" → 1.1). Devuelve el próximo código libre bajo esa madre. */
async function codigoJuntoA(c: PoolClient, org: string, rol: string): Promise<string> {
  const cuentas = (await c.query<{ codigo: string; rol: string | null }>("select codigo, rol from plan_cuenta where organizacion_id = $1", [org])).rows;
  const r = cuentas.find((x) => x.rol === rol);
  if (!r) throw new ErrorErp("Falta una cuenta automática del plan: abrí Contabilidad para que se complete.");
  const i = r.codigo.lastIndexOf(".");
  return proximoCodigoBajo(cuentas, i > 0 ? r.codigo.slice(0, i) : r.codigo);
}

/** Una cuenta imputable con ese nombre y tipo: la que ya existe (si nadie más
 *  la usa como propia) o una nueva con el próximo código libre. */
async function cuentaPropia(c: PoolClient, org: string, d: { nombre: string; tipo: Tipo; junto: string }): Promise<number> {
  const ya = (await c.query<{ id: string }>(`
    select p.id from plan_cuenta p where p.organizacion_id = $1 and p.nombre = $2 and p.tipo = $3 and p.imputable and p.rol is null
       and not exists (select 1 from canal ca where ca.cuenta_ventas_id = p.id)
       and not exists (select 1 from cuenta_fondos f where f.cuenta_contable_id = p.id)
     order by p.id limit 1`, [org, d.nombre, d.tipo])).rows[0];
  if (ya) return Number(ya.id);
  return crearCuenta(org, { codigo: await codigoJuntoA(c, org, d.junto), nombre: d.nombre, tipo: d.tipo, imputable: true }, c);
}

/** Crea lo que falte (idempotente; lo llaman el alta de un canal, la
 *  conexión de una cuenta de ML, Caja y bancos y cada vuelta de los asientos):
 *  - por cada canal sin cuenta de ventas, "Ventas — <canal>" bajo Ventas;
 *  - por cada cuenta de ML colgada de un canal, su cuenta de fondos "Mercado
 *    Pago — <apodo>" (tipo Mercado Pago) vinculada al canal, con su cuenta
 *    contable propia en Disponibilidades;
 *  - por el medio de pago Mercado Pago de la tienda con su access token, su
 *    cuenta de fondos "Mercado Pago — Tienda web" (asegurarMercadoPagoTienda);
 *  - por cada cuenta de fondos de Mercado Pago sin cuenta contable, la suya.
 *  Renombrar el canal o la cuenta no renombra la cuenta contable. */
export async function asegurarCuentasDeCanales(org: string) {
  const falta = await una<{ n: number }>(`
    select ((select count(*) from canal where organizacion_id = $1 and cuenta_ventas_id is null)
          + (select count(*) from meli_cuenta m where m.organizacion_id = $1 and m.canal_id is not null
               and not exists (select 1 from cuenta_fondos f where f.organizacion_id = $1 and f.meli_user_id = m.meli_user_id
                                 and f.canal_id = m.canal_id and f.cuenta_contable_id is not null))
          + (select count(*) from (${SQL_MEDIOS_MP_SIN_CUENTA}) mt)
          + (select count(*) from cuenta_fondos where organizacion_id = $1 and tipo = 'mercadopago' and cuenta_contable_id is null))::int n`, [org]);
  if (!falta?.n) return;
  await asegurarPlan(org);
  await enTransaccion(async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtext('cuentas_canales:' || $1))", [org]);
    // Ventas de cada canal.
    const canales = (await c.query<{ id: string; nombre: string }>(
      "select id, nombre from canal where organizacion_id = $1 and cuenta_ventas_id is null order by id", [org])).rows;
    for (const ca of canales) {
      const cta = await cuentaPropia(c, org, { nombre: `Ventas — ${ca.nombre}`, tipo: "ingreso", junto: "ventas" });
      await c.query("update canal set cuenta_ventas_id = $2 where id = $1", [ca.id, cta]);
    }
    // Mercado Pago de cada cuenta de ML con canal.
    const meli = (await c.query<{ meli_user_id: string; nickname: string | null; canal_id: string; canal: string }>(`
      select m.meli_user_id, m.nickname, m.canal_id, ca.nombre canal from meli_cuenta m join canal ca on ca.id = m.canal_id
       where m.organizacion_id = $1 order by m.id`, [org])).rows;
    for (const m of meli) {
      let f = (await c.query<{ id: string }>("select id from cuenta_fondos where organizacion_id = $1 and meli_user_id = $2", [org, m.meli_user_id])).rows[0];
      if (!f) {
        let nombre = `Mercado Pago — ${m.nickname || m.canal}`;
        const igual = (await c.query<{ id: string; tipo: string; meli_user_id: string | null }>(
          "select id, tipo, meli_user_id from cuenta_fondos where organizacion_id = $1 and nombre = $2", [org, nombre])).rows[0];
        if (igual && igual.tipo === "mercadopago" && !igual.meli_user_id) {
          // La había creado alguien a mano con ese nombre: se adopta.
          await c.query("update cuenta_fondos set meli_user_id = $2 where id = $1", [igual.id, m.meli_user_id]);
          f = { id: igual.id };
        } else {
          if (igual) nombre = `${nombre} (${m.meli_user_id})`;
          f = (await c.query<{ id: string }>(`insert into cuenta_fondos (organizacion_id, nombre, tipo, moneda, meli_user_id, canal_id)
                                               values ($1, $2, 'mercadopago', 'ARS', $3, $4) returning id`, [org, nombre, m.meli_user_id, m.canal_id])).rows[0];
        }
      }
      await c.query("update cuenta_fondos set canal_id = $2 where id = $1 and canal_id is distinct from $2", [f.id, m.canal_id]);
    }
    // Mercado Pago de la tienda web (el medio de pago conectado del checkout).
    await asegurarMercadoPagoTienda(c, org);
    // Toda cuenta de fondos de Mercado Pago, con su cuenta contable propia.
    const sinCuenta = (await c.query<{ id: string; nombre: string }>(
      "select id, nombre from cuenta_fondos where organizacion_id = $1 and tipo = 'mercadopago' and cuenta_contable_id is null order by id", [org])).rows;
    for (const f of sinCuenta) {
      const cta = await cuentaPropia(c, org, { nombre: nombreContableMercadoPago(f.nombre), tipo: "activo", junto: "caja" });
      await c.query("update cuenta_fondos set cuenta_contable_id = $2 where id = $1", [f.id, cta]);
    }
  });
}

/** Igual que asegurarCuentasDeCanales, pero sin cortar lo que se estaba
 *  haciendo si falla (queda para la próxima vuelta). */
export async function asegurarCuentasDeCanalesSinFallar(org: string) {
  try { await asegurarCuentasDeCanales(org); } catch (e) { console.error("[contabilidad] cuentas de canales:", e); }
}

async function cuentasPorRol(c: PoolClient, org: string): Promise<Record<string, number>> {
  const r = (await c.query<{ rol: string; id: string }>("select rol, id from plan_cuenta where organizacion_id = $1 and rol is not null", [org])).rows;
  return Object.fromEntries(r.map((x) => [x.rol, Number(x.id)]));
}

/** Graba un asiento balanceado. Junta las líneas de la misma cuenta y lado,
 *  descarta las de cero y, si por redondeo no cierra por centavos, ajusta la
 *  línea más grande. Devuelve 0 si ya existía (o si quedó vacío). */
export async function grabarAsiento(c: PoolClient, org: string, a: { fecha: string; concepto: string; origen: string; referenciaId: number | null;
  lineas: Linea[]; usuarioId?: string | null }): Promise<number> {
  const junt = new Map<string, Linea>();
  for (const l of a.lineas) {
    const d = r2(l.debe ?? 0), h = r2(l.haber ?? 0);
    const neto = r2(d - h);
    if (Math.abs(neto) < 0.005) continue;
    const lado = neto > 0 ? "d" : "h";
    const k = `${l.cuentaId}:${lado}:${l.detalle ?? ""}`;
    const x = junt.get(k) ?? { cuentaId: l.cuentaId, debe: 0, haber: 0, detalle: l.detalle };
    if (lado === "d") x.debe = r2((x.debe ?? 0) + neto); else x.haber = r2((x.haber ?? 0) - neto);
    junt.set(k, x);
  }
  const ls = [...junt.values()];
  if (!ls.length) return 0;
  const dif = r2(ls.reduce((s, l) => s + (l.debe ?? 0) - (l.haber ?? 0), 0));
  if (Math.abs(dif) > 0.05) throw new ErrorErp(`El asiento "${a.concepto}" no balancea (diferencia ${dif}).`);
  if (dif) {
    const mayor = ls.reduce((m, l) => (Math.max(l.debe ?? 0, l.haber ?? 0) > Math.max(m.debe ?? 0, m.haber ?? 0) ? l : m));
    if ((mayor.debe ?? 0) > 0) mayor.debe = r2(mayor.debe! - dif); else mayor.haber = r2(mayor.haber! + dif);
  }
  await c.query("select pg_advisory_xact_lock(hashtext('asiento:' || $1))", [org]);
  if (a.referenciaId != null) {
    const ya = await c.query("select 1 from asiento where organizacion_id = $1 and origen = $2 and referencia_id = $3 and estado = 'vigente'", [org, a.origen, a.referenciaId]);
    if (ya.rowCount) return 0;
  }
  const numero = Number((await c.query<{ n: string }>("select coalesce(max(numero), 0) + 1 n from asiento where organizacion_id = $1", [org])).rows[0].n);
  const id = Number((await c.query<{ id: string }>(`insert into asiento (organizacion_id, numero, fecha, concepto, origen, referencia_id, usuario_id)
                                                     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [org, numero, a.fecha, a.concepto.slice(0, 300), a.origen, a.referenciaId, a.usuarioId ?? null])).rows[0].id);
  let orden = 0;
  for (const l of ls.sort((x, y) => (y.debe ?? 0) - (x.debe ?? 0))) {
    await c.query("insert into asiento_linea (organizacion_id, asiento_id, cuenta_id, debe, haber, detalle, orden) values ($1, $2, $3, $4, $5, $6, $7)",
      [org, id, l.cuentaId, l.debe ?? 0, l.haber ?? 0, l.detalle ?? null, orden++]);
  }
  return id;
}

/** Asiento manual (ajustes del contador, apertura). */
export async function asientoManual(org: string, d: { fecha: string; concepto: string; lineas: Linea[]; usuarioId: string; apertura?: boolean }) {
  const ls = d.lineas.filter((l) => (l.debe ?? 0) > 0 || (l.haber ?? 0) > 0);
  if (ls.length < 2) throw new ErrorErp("Un asiento lleva al menos dos líneas.");
  const dif = r2(ls.reduce((s, l) => s + (l.debe ?? 0) - (l.haber ?? 0), 0));
  if (dif) throw new ErrorErp(`El asiento no balancea: el debe y el haber difieren en ${Math.abs(dif).toLocaleString("es-AR", { minimumFractionDigits: 2 })}.`);
  if (!d.concepto.trim()) throw new ErrorErp("Poné un concepto.");
  return enTransaccion(async (c) => {
    const ok = (await c.query("select id from plan_cuenta where organizacion_id = $1 and imputable and id = any($2::bigint[])", [org, ls.map((l) => l.cuentaId)])).rowCount;
    if (ok !== new Set(ls.map((l) => l.cuentaId)).size) throw new ErrorErp("Alguna cuenta no existe o es un título (no imputable).");
    return grabarAsiento(c, org, { fecha: d.fecha, concepto: d.concepto.trim(), origen: d.apertura ? "apertura" : "manual", referenciaId: null, lineas: ls, usuarioId: d.usuarioId });
  });
}

export async function anularAsientoManual(org: string, asientoId: number) {
  const a = await una<{ origen: string }>("select origen from asiento where id = $1 and organizacion_id = $2 and estado = 'vigente'", [asientoId, org]);
  if (!a) throw new ErrorErp("El asiento no existe o ya está anulado.");
  if (!["manual", "apertura"].includes(a.origen)) throw new ErrorErp("Es un asiento automático: se anula anulando el documento que lo generó.");
  await consulta("update asiento set estado = 'anulado' where id = $1", [asientoId]);
}

// ── Generación automática ──────────────────────────────────

const fondosRol: Record<string, string> = { caja: "caja", banco: "bancos", mercadopago: "mercadopago", otro: "caja" };

/** La cuenta contable de una cuenta de fondos: la suya o la de su tipo. Una
 *  de Mercado Pago sin cuenta propia (no debería quedar ninguna: se la crea
 *  asegurarCuentasDeCanales) cae en la "Mercado Pago" vieja si la hay, o en
 *  Cobros de canales a liquidar. */
const cuentaFondos = (rol: Record<string, number>, tipo: string, propia: string | number | null) =>
  Number(propia) || rol[fondosRol[tipo]] || rol.cobros_canal;

/** Genera los asientos que falten. Corta al pasar `hasta` (ms) para no pasarse del tiempo de la función. */
export async function contabilizarPendientes(org: string, hasta = Date.now() + 60_000) {
  await asegurarPlan(org);
  await asegurarCuentasDeCanalesSinFallar(org);
  const hechos: Record<string, number> = {};
  const errores: string[] = [];
  const correr = async <T extends { id: number }>(origen: string, pendientes: T[], fn: (c: PoolClient, rol: Record<string, number>, x: T) => Promise<void>) => {
    for (const x of pendientes) {
      if (Date.now() > hasta) return;
      try {
        await enTransaccion(async (c) => { await fn(c, await cuentasPorRol(c, org), x); });
        hechos[origen] = (hechos[origen] ?? 0) + 1;
      } catch (e) {
        errores.push(`${origen} ${x.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };
  const sinAsiento = (origen: string, alias: string) =>
    `not exists (select 1 from asiento a where a.organizacion_id = $1 and a.origen = '${origen}' and a.referencia_id = ${alias}.id and a.estado = 'vigente')`;

  // Ventas y notas de crédito (comprobantes de ARCA autorizados).
  // La cuenta de ventas del canal del pedido, si tiene una propia y activa.
  const cbtes = await consulta<{ id: number; tipo_cbte: number; fecha: string; total: string; neto: string; iva: string; cotizacion: string; moneda: string;
    punto_venta: number; numero: string; nombre: string | null; ventas_canal: number | null }>(`
    select cb.id::int, cb.tipo_cbte, to_char(cb.fecha, 'YYYY-MM-DD') fecha, cb.importe_total total, cb.importe_neto neto, cb.importe_iva iva, cb.cotizacion, cb.moneda,
           cb.punto_venta, cb.numero, cb.receptor_nombre nombre,
           (select pc.id::int from pedido p join canal ca on ca.id = p.canal_id join plan_cuenta pc on pc.id = ca.cuenta_ventas_id and pc.activa and pc.imputable
             where p.id = cb.pedido_id) ventas_canal
      from comprobante cb where cb.organizacion_id = $1 and cb.estado = 'autorizado'
       and not exists (select 1 from asiento a where a.organizacion_id = $1 and a.origen in ('venta', 'nota_credito_venta') and a.referencia_id = cb.id and a.estado = 'vigente')
     order by cb.fecha, cb.id limit 500`, [org]);
  await correr("venta", cbtes, async (c, rol, cb) => {
    const nc = [3, 8, 13].includes(cb.tipo_cbte);
    const k = cb.moneda === "PES" ? 1 : Number(cb.cotizacion) || 1;
    const total = r2(Number(cb.total) * k), iva = r2(Number(cb.iva) * k);
    const nro = `${String(cb.punto_venta).padStart(5, "0")}-${String(cb.numero).padStart(8, "0")}`;
    await grabarAsiento(c, org, { fecha: cb.fecha, concepto: `${nc ? "Nota de crédito" : "Factura"} ${nro}${cb.nombre ? " · " + cb.nombre : ""}`,
      origen: nc ? "nota_credito_venta" : "venta", referenciaId: cb.id,
      lineas: lineasVenta({ total, iva, nc }, rol, cb.ventas_canal) });
  });

  // Costo de lo vendido, por factura (las notas de crédito no lo revierten: si
  // la mercadería vuelve, vuelve por un ajuste de stock).
  const cmv = await consulta<{ id: number; fecha: string; costo: string | null; nro: string }>(`
    select cb.id::int, to_char(cb.fecha, 'YYYY-MM-DD') fecha,
           (select sum(l.cantidad * coalesce(v.costo_promedio_ars, v.costo_ultimo_ars, 0)) from comprobante_linea l join variacion v on v.id = l.variacion_id
             where l.comprobante_id = cb.id) costo,
           lpad(cb.punto_venta::text, 5, '0') || '-' || lpad(cb.numero::text, 8, '0') nro
      from comprobante cb where cb.organizacion_id = $1 and cb.estado = 'autorizado' and cb.tipo_cbte in (1, 6, 11) and ${sinAsiento("cmv", "cb")}
       and exists (select 1 from comprobante_linea l join variacion v on v.id = l.variacion_id
                    where l.comprobante_id = cb.id and coalesce(v.costo_promedio_ars, v.costo_ultimo_ars) is not null)
     order by cb.fecha, cb.id limit 500`, [org]);
  await correr("cmv", cmv, async (c, rol, x) => {
    const costo = r2(Number(x.costo ?? 0));
    await grabarAsiento(c, org, { fecha: x.fecha, concepto: `Costo de la factura ${x.nro}`, origen: "cmv", referenciaId: x.id,
      lineas: [{ cuentaId: rol.cmv, debe: costo }, { cuentaId: rol.mercaderias, haber: costo }] });
  });

  // Cobro de los pedidos pagados por el canal (Mercado Libre, tienda): lo que
  // se facturó a un cliente sin cuenta corriente se da por cobrado, menos la
  // comisión del canal. En un canal de Mercado Libre, lo cobrado va a la
  // cuenta de Mercado Pago de su cuenta de ML (la de la cuenta conectada hoy
  // primero); pagado con el Mercado Pago de la tienda, a la de la tienda; si
  // no, a Cobros de canales a liquidar (SQL_CUENTA_COBRO).
  const cobros = await consulta<{ id: number; fecha: string; total: string; comision: string | null; canal: string; id_externo: string | null; cuenta_mp: number | null }>(`
    select p.id::int, to_char(max(cb.fecha), 'YYYY-MM-DD') fecha,
           sum(case when cb.tipo_cbte in (3, 8, 13) then -cb.importe_total else cb.importe_total end * case when cb.moneda = 'PES' then 1 else cb.cotizacion end) total,
           max(p.comision_ars) comision, max(ca.nombre) canal, max(p.id_externo) id_externo,
           ${SQL_CUENTA_COBRO} cuenta_mp
      from pedido p join comprobante cb on cb.pedido_id = p.id and cb.estado = 'autorizado' join canal ca on ca.id = p.canal_id
      left join cliente cl on cl.id = p.cliente_id
     where p.organizacion_id = $1 and p.estado_pago = 'pagado' and not coalesce(cl.cuenta_corriente, false) and ${sinAsiento("cobro_pedido", "p")}
     group by p.id order by p.id limit 500`, [org]);
  await correr("cobro_pedido", cobros, async (c, rol, p) => {
    const lineas = lineasCobroPedido({ total: Number(p.total), comision: Number(p.comision ?? 0) }, rol, p.cuenta_mp);
    if (!lineas.length) return;
    const asiento = await grabarAsiento(c, org, { fecha: p.fecha, concepto: `Cobro del pedido ${p.id_externo ?? p.id} · ${p.canal}`, origen: "cobro_pedido", referenciaId: p.id, lineas });
    // Y su movimiento en la cuenta de fondos de Mercado Pago (lib/administracion/cobros-fondos.ts).
    if (asiento) await movimientoDeCobro(c, org, asiento);
  });
  // Cobros deshechos, movimientos que faltan (los de antes) y huérfanos.
  errores.push(...(await sincronizarCobrosConFondos(org, hasta).catch((e) => ({ errores: [`cobro_pedido 0: ${e instanceof Error ? e.message : String(e)}`] }))).errores);

  // Facturas de compra.
  const fcs = await consulta<{ id: number; fecha: string; letra: string; es_nota_credito: boolean; es_nota_debito: boolean; cotizacion: string; moneda: string; iva: string; percepcion_iva: string;
    percepcion_iibb: string; otros_impuestos: string; no_gravado: string; total_ars: string; cuenta_gasto_id: number | null; punto_venta: number | null; numero: string | null;
    proveedor: string; neto_merc: string; neto_otro: string }>(`
    select f.id::int, to_char(f.fecha, 'YYYY-MM-DD') fecha, f.letra, f.es_nota_credito, f.es_nota_debito, f.cotizacion, f.moneda, f.iva, f.percepcion_iva, f.percepcion_iibb,
           f.otros_impuestos, f.no_gravado, f.total_ars, f.cuenta_gasto_id::int, f.punto_venta, f.numero, pr.nombre proveedor,
           coalesce((select sum(neto) from factura_compra_linea l where l.factura_id = f.id and l.variacion_id is not null), 0) neto_merc,
           coalesce((select sum(neto) from factura_compra_linea l where l.factura_id = f.id and l.variacion_id is null), 0) neto_otro
      from factura_compra f join proveedor pr on pr.id = f.proveedor_id
     where f.organizacion_id = $1 and f.estado = 'registrada' and ${sinAsiento("compra", "f")} order by f.fecha, f.id limit 500`, [org]);
  await correr("compra", fcs, async (c, rol, f) => {
    const k = f.moneda === "USD" ? Number(f.cotizacion) : 1, s = f.es_nota_credito ? -1 : 1;
    const destinoOtro = f.cuenta_gasto_id ?? (f.letra === "E" ? rol.importaciones_en_curso : rol.gastos_varios);
    const total = r2(Number(f.total_ars));
    await grabarAsiento(c, org, { fecha: f.fecha, origen: "compra", referenciaId: f.id,
      concepto: `${f.es_nota_credito ? "Nota de crédito" : f.es_nota_debito ? "Nota de débito" : "Factura"} ${f.letra} ${f.punto_venta != null ? String(f.punto_venta).padStart(5, "0") + "-" : ""}${f.numero ?? "s/n"} · ${f.proveedor}`,
      lineas: [
        { cuentaId: rol.mercaderias, debe: s * Number(f.neto_merc) * k },
        { cuentaId: destinoOtro, debe: s * (Number(f.neto_otro) + Number(f.no_gravado)) * k },
        { cuentaId: rol.iva_credito, debe: s * Number(f.iva) * k },
        { cuentaId: rol.percepcion_iva, debe: s * Number(f.percepcion_iva) * k },
        { cuentaId: rol.percepcion_iibb, debe: s * Number(f.percepcion_iibb) * k },
        { cuentaId: rol.impuestos, debe: s * Number(f.otros_impuestos) * k },
        { cuentaId: rol.proveedores, haber: s * total },
      ] });
  });

  // Despachos de importación: la mercadería entra a su costo puesto en
  // depósito y los impuestos que son crédito fiscal, contra "Importaciones en
  // curso" (que se cancela con la factura del exterior y las del despachante).
  const desp = await consulta<{ id: number; fecha: string; numero: string | null; costo: string; impuestos: { concepto: string; importe_ars: number }[] }>(`
    select d.id::int, to_char(d.fecha, 'YYYY-MM-DD') fecha, d.numero, d.impuestos,
           coalesce((select sum(l.cantidad * l.costo_unit_ars) from despacho_linea l where l.despacho_id = d.id), 0) costo
      from despacho_importacion d where d.organizacion_id = $1 and d.estado = 'registrado' and ${sinAsiento("despacho", "d")} order by d.fecha, d.id limit 200`, [org]);
  await correr("despacho", desp, async (c, rol, d) => {
    const lineas: Linea[] = [{ cuentaId: rol.mercaderias, debe: Number(d.costo) }];
    let tot = Number(d.costo);
    for (const i of d.impuestos ?? []) {
      const imp = Number(i.importe_ars || 0);
      const n = (i.concepto ?? "").toLowerCase();
      const cta = /adicional|percep.*iva/.test(n) ? rol.percepcion_iva : /iva/.test(n) ? rol.iva_credito : /ganancia/.test(n) ? rol.retenciones_sufridas
        : /iibb|brutos/.test(n) ? rol.percepcion_iibb : rol.impuestos;
      lineas.push({ cuentaId: cta, debe: imp, detalle: i.concepto });
      tot += imp;
    }
    lineas.push({ cuentaId: rol.importaciones_en_curso, haber: tot });
    await grabarAsiento(c, org, { fecha: d.fecha, concepto: `Despacho ${d.numero ?? d.id}`, origen: "despacho", referenciaId: d.id, lineas });
  });

  // Recibos de cobro y órdenes de pago.
  const recs = await consulta<{ id: number; tipo: "cobro" | "pago"; numero: number; fecha: string; total_ars: string; retenciones: { concepto: string; importe: number }[]; tercero: string }>(`
    select r.id::int, r.tipo, r.numero::int, to_char(r.fecha, 'YYYY-MM-DD') fecha, r.total_ars, r.retenciones,
           coalesce(cl.nombre, pr.nombre, '') tercero
      from recibo r left join cliente cl on r.tercero_tipo = 'cliente' and cl.id = r.tercero_id left join proveedor pr on r.tercero_tipo = 'proveedor' and pr.id = r.tercero_id
     where r.organizacion_id = $1 and r.estado = 'emitido'
       and not exists (select 1 from asiento a where a.organizacion_id = $1 and a.origen = r.tipo and a.referencia_id = r.id and a.estado = 'vigente')
     order by r.fecha, r.id limit 500`, [org]);
  await correr("recibo", recs, async (c, rol, r) => {
    const movs = (await c.query<{ importe_ars: string; tipo: string; cuenta_contable_id: string | null; nombre: string }>(`
      select m.importe_ars, f.tipo, f.cuenta_contable_id, f.nombre from movimiento_fondos m join cuenta_fondos f on f.id = m.cuenta_id
       where m.organizacion_id = $1 and m.referencia_tipo = 'recibo' and m.referencia_id = $2`, [org, r.id])).rows;
    const lineas: Linea[] = movs.map((m) => ({ cuentaId: cuentaFondos(rol, m.tipo, m.cuenta_contable_id), debe: Number(m.importe_ars), detalle: m.nombre }));
    const ret = (r.retenciones ?? []).reduce((s, x) => s + Number(x.importe || 0), 0);
    if (r.tipo === "cobro") {
      lineas.push({ cuentaId: rol.retenciones_sufridas, debe: ret }, { cuentaId: rol.deudores, haber: Number(r.total_ars) });
    } else {
      lineas.push({ cuentaId: rol.retenciones_a_depositar, haber: ret }, { cuentaId: rol.proveedores, debe: Number(r.total_ars) });
    }
    await grabarAsiento(c, org, { fecha: r.fecha, concepto: `${r.tipo === "cobro" ? "Recibo" : "Orden de pago"} ${r.numero} · ${r.tercero}`, origen: r.tipo, referenciaId: r.id, lineas });
  });

  // Movimientos sueltos y transferencias.
  const movs = await consulta<{ id: number; fecha: string; importe_ars: string; concepto: string; tipo: string; cuenta_fondo: string | null; contra: number | null; referencia_tipo: string }>(`
    select m.id::int, to_char(m.fecha, 'YYYY-MM-DD') fecha, m.importe_ars, m.concepto, f.tipo, f.cuenta_contable_id::text cuenta_fondo,
           m.cuenta_contable_id::int contra, m.referencia_tipo
      from movimiento_fondos m join cuenta_fondos f on f.id = m.cuenta_id
     where m.organizacion_id = $1 and m.referencia_tipo = 'manual' and ${sinAsiento("movimiento", "m")} order by m.fecha, m.id limit 500`, [org]);
  await correr("movimiento", movs, async (c, rol, m) => {
    const imp = Number(m.importe_ars);
    const fondos = cuentaFondos(rol, m.tipo, m.cuenta_fondo);
    const contra = m.contra ?? (imp < 0 ? rol.gastos_varios : rol.otros_ingresos);
    await grabarAsiento(c, org, { fecha: m.fecha, concepto: m.concepto, origen: "movimiento", referenciaId: m.id,
      lineas: [{ cuentaId: fondos, debe: imp }, { cuentaId: contra, haber: imp }] });
  });
  const transf = await consulta<{ id: number; fecha: string; concepto: string }>(`
    select m.id::int, to_char(m.fecha, 'YYYY-MM-DD') fecha, m.concepto from movimiento_fondos m
     where m.organizacion_id = $1 and m.referencia_tipo = 'transferencia' and m.referencia_id = m.id and ${sinAsiento("transferencia", "m")} order by m.fecha, m.id limit 500`, [org]);
  await correr("transferencia", transf, async (c, rol, t) => {
    const patas = (await c.query<{ importe_ars: string; tipo: string; cuenta_contable_id: string | null; nombre: string }>(`
      select m.importe_ars, f.tipo, f.cuenta_contable_id, f.nombre from movimiento_fondos m join cuenta_fondos f on f.id = m.cuenta_id
       where m.organizacion_id = $1 and m.referencia_tipo = 'transferencia' and m.referencia_id = $2`, [org, t.id])).rows;
    const lineas: Linea[] = patas.map((p) => ({ cuentaId: cuentaFondos(rol, p.tipo, p.cuenta_contable_id), debe: Number(p.importe_ars), detalle: p.nombre }));
    // Si las monedas difieren, la diferencia va a diferencias de cambio (positiva o negativa).
    const dif = lineaDiferenciaTransferencia(lineas, rol);
    if (dif) lineas.push(dif);
    await grabarAsiento(c, org, { fecha: t.fecha, concepto: t.concepto, origen: "transferencia", referenciaId: t.id, lineas });
  });

  // Ajustes de stock (inventario): al costo promedio.
  const ajustes = await consulta<{ id: number; fecha: string; cantidad: number; suma: boolean; costo: string | null; sku: string | null }>(`
    select ms.id::int, to_char(ms.fecha, 'YYYY-MM-DD') fecha, ms.cantidad, ms.ubicacion_destino_id is not null suma,
           coalesce(v.costo_promedio_ars, v.costo_ultimo_ars) costo, v.sku
      from movimiento_stock ms join variacion v on v.id = ms.variacion_id
     where ms.organizacion_id = $1 and ms.tipo = 'ajuste' and coalesce(v.costo_promedio_ars, v.costo_ultimo_ars) is not null and ${sinAsiento("ajuste_stock", "ms")}
     order by ms.id limit 500`, [org]);
  await correr("ajuste_stock", ajustes, async (c, rol, a) => {
    const imp = r2(a.cantidad * Number(a.costo)) * (a.suma ? 1 : -1);
    await grabarAsiento(c, org, { fecha: a.fecha, concepto: `Ajuste de stock ${a.sku ?? ""} (${a.suma ? "+" : "−"}${a.cantidad})`.trim(), origen: "ajuste_stock", referenciaId: a.id,
      lineas: [{ cuentaId: rol.mercaderias, debe: imp }, { cuentaId: rol.diferencias_inventario, haber: imp }] });
  });

  // Diferencia de cambio de cada imputación de cuenta corriente en que alguno
  // de los dos renglones es en dólares: lo cancelado de cada lado, en pesos a
  // la cotización con que se registró ese renglón (ver lib/administracion/
  // diferencias.ts). Fecha: la del más nuevo de los dos (el día en que se
  // pudo imputar). Al anular el recibo, deshacerCc() anula este asiento.
  const imps = await consulta<{ id: number; fecha: string; tercero_tipo: "cliente" | "proveedor"; tercero: string; deb_cancelado: string; deb_importe: string; deb_ars: string;
    cre_cancelado: string; cre_importe: string; cre_ars: string; deb_desc: string; cre_desc: string }>(`
    select i.id::int, to_char(greatest(d.fecha, c.fecha), 'YYYY-MM-DD') fecha, d.tercero_tipo, coalesce(cl.nombre, pr.nombre, '') tercero,
           i.importe deb_cancelado, d.importe deb_importe, d.importe_ars deb_ars,
           coalesce(i.importe_credito, i.importe) cre_cancelado, c.importe cre_importe, c.importe_ars cre_ars, d.descripcion deb_desc, c.descripcion cre_desc
      from cc_imputacion i join cc_movimiento d on d.id = i.debito_id join cc_movimiento c on c.id = i.credito_id
      left join cliente cl on d.tercero_tipo = 'cliente' and cl.id = d.tercero_id left join proveedor pr on d.tercero_tipo = 'proveedor' and pr.id = d.tercero_id
     where i.organizacion_id = $1 and (d.moneda <> 'ARS' or c.moneda <> 'ARS') and ${sinAsiento("diferencia_cambio", "i")}
       and abs(abs(coalesce(i.importe_credito, i.importe) * c.importe_ars / nullif(c.importe, 0)) - abs(i.importe * d.importe_ars / nullif(d.importe, 0))) >= 0.006
     order by i.id limit 500`, [org]);
  await correr("diferencia_cambio", imps, async (c, rol, i) => {
    const dif = diferenciaDeCambio({ cancelado: Number(i.deb_cancelado), importe: Number(i.deb_importe), importeArs: Number(i.deb_ars) },
      { cancelado: Number(i.cre_cancelado), importe: Number(i.cre_importe), importeArs: Number(i.cre_ars) });
    const lineas = lineasDiferenciaCambio(i.tercero_tipo, dif, rol);
    if (!lineas.length) return;
    await grabarAsiento(c, org, { fecha: i.fecha, concepto: `Diferencia de cambio · ${i.deb_desc} con ${i.cre_desc}${i.tercero ? " · " + i.tercero : ""}`,
      origen: "diferencia_cambio", referenciaId: i.id, lineas });
  });

  // Diferencia entre lo facturado y lo recibido en las facturas de compra
  // vinculadas a una recepción (la calcula y guarda registrarFactura()).
  const difRec = await consulta<{ id: number; fecha: string; diferencia_recepcion: DiferenciaRecepcion[]; nro: string; proveedor: string; skus: Record<string, string> | null }>(`
    select f.id::int, to_char(f.fecha, 'YYYY-MM-DD') fecha, f.diferencia_recepcion, pr.nombre proveedor,
           f.letra || ' ' || coalesce(lpad(f.punto_venta::text, 5, '0') || '-', '') || coalesce(f.numero::text, 's/n') nro,
           (select json_object_agg(v.id, v.sku) from variacion v where v.id in (select (x->>'variacion_id')::bigint from jsonb_array_elements(f.diferencia_recepcion) x)) skus
      from factura_compra f join proveedor pr on pr.id = f.proveedor_id
     where f.organizacion_id = $1 and f.estado = 'registrada' and not f.es_nota_credito and jsonb_typeof(f.diferencia_recepcion) = 'array'
       and exists (select 1 from jsonb_array_elements(f.diferencia_recepcion) x where abs((x->>'importe')::numeric) >= 0.01)
       and ${sinAsiento("diferencia_recepcion", "f")}
     order by f.fecha, f.id limit 500`, [org]);
  await correr("diferencia_recepcion", difRec, async (c, rol, f) => {
    const lineas = lineasDiferenciaRecepcion(f.diferencia_recepcion.map((d) => ({ ...d, detalle: f.skus?.[String(d.variacion_id)] ?? undefined })), rol);
    if (!lineas.length) return;
    await grabarAsiento(c, org, { fecha: f.fecha, concepto: `Diferencia con la recepción · Factura ${f.nro} · ${f.proveedor}`,
      origen: "diferencia_recepcion", referenciaId: f.id, lineas });
  });

  return { hechos, errores };
}

// ── Libros ─────────────────────────────────────────────────

/** El plan, con lo que hace falta para la pantalla: si se usó y de qué canal
 *  o cuenta de fondos es propia (las que se crearon solas). */
export function planDeCuentas(org: string) {
  type Fila = { id: number; codigo: string; nombre: string; tipo: Tipo; imputable: boolean; activa: boolean; rol: string | null; usada: boolean; vinculo: string | null };
  const sql = (orden: string) => `
    select p.id::int, p.codigo, p.nombre, p.tipo, p.imputable, p.activa, p.rol,
           exists (select 1 from asiento_linea l where l.cuenta_id = p.id) usada,
           coalesce((select 'ventas del canal ' || string_agg(ca.nombre, ', ') from canal ca where ca.organizacion_id = $1 and ca.cuenta_ventas_id = p.id),
                    (select 'de ' || string_agg(f.nombre, ', ') from cuenta_fondos f where f.organizacion_id = $1 and f.cuenta_contable_id = p.id
                       and (f.meli_user_id is not null or f.medio_pago_id is not null))) vinculo
      from plan_cuenta p where p.organizacion_id = $1
     order by ${orden}`;
  return consulta<Fila>(sql("string_to_array(p.codigo, '.')::int[] nulls last, p.codigo"), [org]).catch(() => consulta<Fila>(sql("p.codigo"), [org]));
}

export function cuentasImputables(org: string) {
  return consulta<{ id: number; codigo: string; nombre: string; tipo: Tipo }>(
    "select id::int, codigo, nombre, tipo from plan_cuenta where organizacion_id = $1 and imputable and activa order by codigo", [org]);
}

// ── Alta de cuentas ────────────────────────────────────────

/** El código que se sugiere para una cuenta nueva del tipo (ver proximoCodigo)
 *  y la cuenta madre de la que va a colgar. */
export async function proximoCodigoCuenta(org: string, tipo: Tipo = "egreso") {
  await asegurarPlan(org);
  const cuentas = await consulta<{ codigo: string; nombre: string; tipo: string; imputable: boolean }>(
    "select codigo, nombre, tipo, imputable from plan_cuenta where organizacion_id = $1", [org]);
  const codigo = proximoCodigo(cuentas, tipo);
  return { codigo, madre: madreDe(codigo, cuentas) };
}

/** Da de alta una cuenta del plan, con las mismas reglas desde donde se cree
 *  (Contabilidad, o la vista previa de ARCA): código con números y puntos que
 *  no exista, nombre y tipo. Cuelga de su madre por el código. Devuelve el id. */
export async function crearCuenta(org: string, d: { codigo: string | null; nombre: string | null; tipo: string | null; imputable: boolean }, c?: Consultor) {
  // Con `c`, adentro de esa transacción (las cuentas que se crean solas).
  const una = async <T extends Record<string, unknown>>(sql: string, v: unknown[]) =>
    (c ? ((await c.query(sql, v)).rows[0] as T | undefined) ?? null : await unaBase<T>(sql, v));
  const codigo = d.codigo?.trim();
  if (!codigo) throw new ErrorErp("La cuenta necesita un código.");
  if (!codigoValido(codigo)) throw new ErrorErp("El código va con números separados por puntos (ej. 5.2.06).");
  const nombre = d.nombre?.trim();
  if (!nombre) throw new ErrorErp("La cuenta necesita un nombre.");
  if (!TIPOS_CUENTA.includes(d.tipo as Tipo)) throw new ErrorErp("Elegí el tipo de cuenta.");
  const ya = await una<{ nombre: string }>("select nombre from plan_cuenta where organizacion_id = $1 and codigo = $2", [org, codigo]);
  if (ya) throw new ErrorErp(`Ya hay una cuenta con el código ${codigo} (${ya.nombre}).`);
  const r = await una<{ id: number }>("insert into plan_cuenta (organizacion_id, codigo, nombre, tipo, imputable) values ($1, $2, $3, $4, $5) returning id::int",
    [org, codigo, nombre, d.tipo, d.imputable]);
  return r!.id;
}

/** Libro diario: asientos del período con sus líneas. */
export async function libroDiario(org: string, desde: string, hasta: string) {
  const asientos = await consulta<{ id: number; numero: number; fecha: string; concepto: string; origen: string; estado: string }>(`
    select id::int, numero::int, to_char(fecha, 'YYYY-MM-DD') fecha, concepto, origen, estado from asiento
     where organizacion_id = $1 and fecha between $2 and $3 order by fecha, numero limit 2000`, [org, desde, hasta]);
  const lineas = asientos.length ? await consulta<{ asiento_id: number; codigo: string; nombre: string; debe: number; haber: number; detalle: string | null }>(`
    select l.asiento_id::int, p.codigo, p.nombre, l.debe::float, l.haber::float, l.detalle
      from asiento_linea l join plan_cuenta p on p.id = l.cuenta_id where l.asiento_id = any($1::bigint[]) order by l.asiento_id, l.orden`, [asientos.map((a) => a.id)]) : [];
  const por = new Map<number, typeof lineas>();
  for (const l of lineas) (por.get(l.asiento_id) ?? por.set(l.asiento_id, []).get(l.asiento_id)!).push(l);
  return asientos.map((a) => ({ ...a, lineas: por.get(a.id) ?? [] }));
}

/** Mayor de una cuenta: saldo anterior y movimientos del período con saldo acumulado. */
export async function libroMayor(org: string, cuentaId: number, desde: string, hasta: string) {
  const ant = await una<{ s: number }>(`
    select coalesce(sum(l.debe - l.haber), 0)::float s from asiento_linea l join asiento a on a.id = l.asiento_id
     where l.cuenta_id = $1 and a.organizacion_id = $2 and a.estado = 'vigente' and a.fecha < $3`, [cuentaId, org, desde]);
  const movs = await consulta<{ asiento_id: number; numero: number; fecha: string; concepto: string; debe: number; haber: number; detalle: string | null }>(`
    select a.id::int asiento_id, a.numero::int, to_char(a.fecha, 'YYYY-MM-DD') fecha, a.concepto, l.debe::float, l.haber::float, l.detalle
      from asiento_linea l join asiento a on a.id = l.asiento_id
     where l.cuenta_id = $1 and a.organizacion_id = $2 and a.estado = 'vigente' and a.fecha between $3 and $4 order by a.fecha, a.numero limit 3000`,
    [cuentaId, org, desde, hasta]);
  let s = ant?.s ?? 0;
  return { anterior: s, movimientos: movs.map((m) => ({ ...m, saldo: (s = r2(s + m.debe - m.haber)) })) };
}

/** Sumas y saldos al `hasta` (desde el `desde`, para el período; el saldo es acumulado). */
export function sumasYSaldos(org: string, desde: string, hasta: string) {
  return consulta<{ id: number; codigo: string; nombre: string; tipo: Tipo; debe: number; haber: number; saldo: number }>(`
    select p.id::int, p.codigo, p.nombre, p.tipo,
           coalesce(sum(l.debe) filter (where a.fecha >= $2), 0)::float debe,
           coalesce(sum(l.haber) filter (where a.fecha >= $2), 0)::float haber,
           coalesce(sum(l.debe - l.haber), 0)::float saldo
      from plan_cuenta p join asiento_linea l on l.cuenta_id = p.id join asiento a on a.id = l.asiento_id and a.estado = 'vigente' and a.fecha <= $3
     where p.organizacion_id = $1 group by p.id order by p.codigo`, [org, desde, hasta]);
}

/** Estado de resultados del período: ingresos y egresos por cuenta. */
export async function estadoDeResultados(org: string, desde: string, hasta: string) {
  const filas = await consulta<{ codigo: string; nombre: string; tipo: Tipo; importe: number }>(`
    select p.codigo, p.nombre, p.tipo, sum(case when p.tipo = 'ingreso' then l.haber - l.debe else l.debe - l.haber end)::float importe
      from plan_cuenta p join asiento_linea l on l.cuenta_id = p.id join asiento a on a.id = l.asiento_id and a.estado = 'vigente' and a.fecha between $2 and $3
     where p.organizacion_id = $1 and p.tipo in ('ingreso', 'egreso') group by p.id having sum(l.debe - l.haber) <> 0 order by p.codigo`, [org, desde, hasta]);
  const ingresos = filas.filter((f) => f.tipo === "ingreso"), egresos = filas.filter((f) => f.tipo === "egreso");
  const ti = r2(ingresos.reduce((s, f) => s + f.importe, 0)), te = r2(egresos.reduce((s, f) => s + f.importe, 0));
  return { ingresos, egresos, totalIngresos: ti, totalEgresos: te, resultado: r2(ti - te) };
}
