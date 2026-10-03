// Contabilidad: plan de cuentas, asientos automáticos y los libros.
//
// Los asientos NO se cargan a mano (salvo el manual, para ajustes del
// contador): contabilizarPendientes() recorre cada tipo de documento que
// todavía no tiene su asiento y lo genera, uno por documento (índice único
// organización + origen + referencia). Lo llaman las tareas periódicas y el
// botón "Contabilizar ahora". Todo en pesos.
//
// Qué asienta cada origen:
//   venta / nota_credito_venta  Deudores · Ventas + IVA débito (comprobante autorizado)
//   cmv                         CMV · Mercaderías (al costo promedio, por comprobante de venta)
//   cobro_pedido                Cobros de canales + Comisiones · Deudores (pedido pagado y facturado, cliente sin cuenta corriente)
//   compra                      Mercaderías / gasto + IVA crédito + percepciones · Proveedores (factura de compra registrada)
//   despacho                    Mercaderías + crédito fiscal · Importaciones en curso
//   cobro / pago                Fondos + retenciones · Deudores / Proveedores · Fondos + retenciones a depositar (recibos)
//   movimiento                  Fondos · contrapartida elegida (movimientos sueltos)
//   transferencia               Fondos destino · Fondos origen
//   ajuste_stock                Diferencias de inventario · Mercaderías (o al revés)

import type { PoolClient } from "pg";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";

const r2 = (x: number) => Math.round(x * 100) / 100;

type Tipo = "activo" | "pasivo" | "patrimonio" | "ingreso" | "egreso";

/** El plan por defecto. Los títulos (no imputables) agrupan; `rol` es lo que
 *  buscan los asientos automáticos. Se puede renombrar, recodificar y agregar
 *  cuentas: los asientos siguen el rol, no el código. */
const PLAN: [codigo: string, nombre: string, tipo: Tipo, rol?: string][] = [
  ["1", "ACTIVO", "activo"],
  ["1.1", "Disponibilidades", "activo"],
  ["1.1.01", "Caja", "activo", "caja"],
  ["1.1.02", "Bancos", "activo", "bancos"],
  ["1.1.03", "Mercado Pago", "activo", "mercadopago"],
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
  ["5", "EGRESOS", "egreso"],
  ["5.1.01", "Costo de mercaderías vendidas", "egreso", "cmv"],
  ["5.1.02", "Diferencias de inventario", "egreso", "diferencias_inventario"],
  ["5.2.01", "Comisiones de canales", "egreso", "comisiones"],
  ["5.2.02", "Fletes y envíos", "egreso", "fletes"],
  ["5.2.03", "Gastos bancarios", "egreso", "gastos_bancarios"],
  ["5.2.04", "Impuestos y tasas", "egreso", "impuestos"],
  ["5.2.05", "Gastos varios", "egreso", "gastos_varios"],
];

/** Carga el plan por defecto la primera vez (y agrega los roles que falten). */
export async function asegurarPlan(org: string) {
  const roles = await consulta<{ rol: string }>("select rol from plan_cuenta where organizacion_id = $1 and rol is not null", [org]);
  const hay = new Set(roles.map((r) => r.rol));
  const vacio = !(await una("select 1 from plan_cuenta where organizacion_id = $1 limit 1", [org]));
  const faltan = PLAN.filter(([, , , rol]) => (vacio ? true : rol && !hay.has(rol)));
  if (!faltan.length) return;
  await enTransaccion(async (c) => {
    for (const [codigo, nombre, tipo, rol] of faltan) {
      await c.query(`insert into plan_cuenta (organizacion_id, codigo, nombre, tipo, imputable, rol) values ($1, $2, $3, $4, $5, $6)
                     on conflict (organizacion_id, codigo) do update set rol = coalesce(plan_cuenta.rol, excluded.rol)`,
        [org, codigo, nombre, tipo, !!rol, rol ?? null]);
    }
  });
}

type Linea = { cuentaId: number; debe?: number; haber?: number; detalle?: string };

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

/** Genera los asientos que falten. Corta al pasar `hasta` (ms) para no pasarse del tiempo de la función. */
export async function contabilizarPendientes(org: string, hasta = Date.now() + 60_000) {
  await asegurarPlan(org);
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
  const cbtes = await consulta<{ id: number; tipo_cbte: number; fecha: string; total: string; neto: string; iva: string; cotizacion: string; moneda: string;
    punto_venta: number; numero: string; nombre: string | null }>(`
    select cb.id::int, cb.tipo_cbte, to_char(cb.fecha, 'YYYY-MM-DD') fecha, cb.importe_total total, cb.importe_neto neto, cb.importe_iva iva, cb.cotizacion, cb.moneda,
           cb.punto_venta, cb.numero, cb.receptor_nombre nombre
      from comprobante cb where cb.organizacion_id = $1 and cb.estado = 'autorizado'
       and not exists (select 1 from asiento a where a.organizacion_id = $1 and a.origen in ('venta', 'nota_credito_venta') and a.referencia_id = cb.id and a.estado = 'vigente')
     order by cb.fecha, cb.id limit 500`, [org]);
  await correr("venta", cbtes, async (c, rol, cb) => {
    const nc = [3, 8, 13].includes(cb.tipo_cbte);
    const k = cb.moneda === "PES" ? 1 : Number(cb.cotizacion) || 1;
    const total = r2(Number(cb.total) * k), iva = r2(Number(cb.iva) * k), neto = r2(total - iva);
    const s = nc ? -1 : 1;
    const nro = `${String(cb.punto_venta).padStart(5, "0")}-${String(cb.numero).padStart(8, "0")}`;
    await grabarAsiento(c, org, { fecha: cb.fecha, concepto: `${nc ? "Nota de crédito" : "Factura"} ${nro}${cb.nombre ? " · " + cb.nombre : ""}`,
      origen: nc ? "nota_credito_venta" : "venta", referenciaId: cb.id,
      lineas: [{ cuentaId: rol.deudores, debe: s * total }, { cuentaId: rol.ventas, haber: s * neto }, { cuentaId: rol.iva_debito, haber: s * iva }] });
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
  // comisión del canal.
  const cobros = await consulta<{ id: number; fecha: string; total: string; comision: string | null; canal: string; id_externo: string | null }>(`
    select p.id::int, to_char(max(cb.fecha), 'YYYY-MM-DD') fecha,
           sum(case when cb.tipo_cbte in (3, 8, 13) then -cb.importe_total else cb.importe_total end * case when cb.moneda = 'PES' then 1 else cb.cotizacion end) total,
           max(p.comision_ars) comision, max(ca.nombre) canal, max(p.id_externo) id_externo
      from pedido p join comprobante cb on cb.pedido_id = p.id and cb.estado = 'autorizado' join canal ca on ca.id = p.canal_id
      left join cliente cl on cl.id = p.cliente_id
     where p.organizacion_id = $1 and p.estado_pago = 'pagado' and not coalesce(cl.cuenta_corriente, false) and ${sinAsiento("cobro_pedido", "p")}
     group by p.id order by p.id limit 500`, [org]);
  await correr("cobro_pedido", cobros, async (c, rol, p) => {
    const total = r2(Number(p.total)), com = r2(Math.min(Number(p.comision ?? 0), total));
    if (total <= 0) return;
    await grabarAsiento(c, org, { fecha: p.fecha, concepto: `Cobro del pedido ${p.id_externo ?? p.id} · ${p.canal}`, origen: "cobro_pedido", referenciaId: p.id,
      lineas: [{ cuentaId: rol.cobros_canal, debe: total - com }, { cuentaId: rol.comisiones, debe: com }, { cuentaId: rol.deudores, haber: total }] });
  });

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
    const lineas: Linea[] = movs.map((m) => ({ cuentaId: Number(m.cuenta_contable_id) || rol[fondosRol[m.tipo]], debe: Number(m.importe_ars), detalle: m.nombre }));
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
    const fondos = Number(m.cuenta_fondo) || rol[fondosRol[m.tipo]];
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
    const lineas: Linea[] = patas.map((p) => ({ cuentaId: Number(p.cuenta_contable_id) || rol[fondosRol[p.tipo]], debe: Number(p.importe_ars), detalle: p.nombre }));
    // Si las monedas difieren, la diferencia de cotización va a otros ingresos / gastos varios.
    const dif = r2(lineas.reduce((s, l) => s + (l.debe ?? 0), 0));
    if (dif) lineas.push({ cuentaId: dif > 0 ? rol.otros_ingresos : rol.gastos_varios, debe: -dif, detalle: "Diferencia de cotización" });
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

  return { hechos, errores };
}

// ── Libros ─────────────────────────────────────────────────

export function planDeCuentas(org: string) {
  return consulta<{ id: number; codigo: string; nombre: string; tipo: Tipo; imputable: boolean; activa: boolean; rol: string | null; usada: boolean }>(`
    select p.id::int, p.codigo, p.nombre, p.tipo, p.imputable, p.activa, p.rol,
           exists (select 1 from asiento_linea l where l.cuenta_id = p.id) usada
      from plan_cuenta p where p.organizacion_id = $1
     order by string_to_array(p.codigo, '.')::int[] nulls last, p.codigo`, [org]).catch(() =>
    consulta<{ id: number; codigo: string; nombre: string; tipo: Tipo; imputable: boolean; activa: boolean; rol: string | null; usada: boolean }>(`
      select p.id::int, p.codigo, p.nombre, p.tipo, p.imputable, p.activa, p.rol, exists (select 1 from asiento_linea l where l.cuenta_id = p.id) usada
        from plan_cuenta p where p.organizacion_id = $1 order by p.codigo`, [org]));
}

export function cuentasImputables(org: string) {
  return consulta<{ id: number; codigo: string; nombre: string; tipo: Tipo }>(
    "select id::int, codigo, nombre, tipo from plan_cuenta where organizacion_id = $1 and imputable and activa order by codigo", [org]);
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
