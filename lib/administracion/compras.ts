// Compras: facturas de proveedores y despachos de importación. Registrar una
// factura de mercadería ingresa el stock (si no entró ya por una recepción),
// actualiza el costo y deja la deuda en la cuenta corriente del proveedor.
// Vinculada a una recepción, guarda además la diferencia entre lo facturado y
// lo recibido (factura_compra.diferencia_recepcion) para su asiento.
// Registrar un despacho prorratea flete, seguro y gastos sobre las líneas por
// su FOB, ingresa el stock y actualiza el costo.

import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { moverStock, ubicacionGeneral } from "@/lib/stock";
import { registrarCosto, excluirPorRecepcion } from "@/lib/administracion/costos";
import { movimientoCc, imputarAutomatico } from "@/lib/administracion/cc";
import { diferenciasRecepcion, cubiertoPorFactura, type DiferenciaRecepcion } from "@/lib/administracion/diferencias";
import { sincronizarStockMl } from "@/lib/mercadolibre/stock";

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Recalcula neto, IVA por alícuota y total de una factura en borrador desde sus líneas. */
export async function recalcularFactura(org: string, facturaId: number) {
  const f = await una<{ estado: string; percepcion_iva: string; percepcion_iibb: string; otros_impuestos: string; no_gravado: string }>(
    "select estado, percepcion_iva, percepcion_iibb, otros_impuestos, no_gravado from factura_compra where id = $1 and organizacion_id = $2", [facturaId, org]);
  if (!f) throw new ErrorErp("La factura no existe.");
  if (f.estado !== "borrador") throw new ErrorErp("La factura ya está registrada: no se cambia.");
  const lineas = await consulta<{ neto: string; iva: string; iva_pct: string }>("select neto, iva, iva_pct from factura_compra_linea where factura_id = $1", [facturaId]);
  const porAlicuota = new Map<number, { base: number; importe: number }>();
  for (const l of lineas) {
    const a = porAlicuota.get(Number(l.iva_pct)) ?? { base: 0, importe: 0 };
    a.base += Number(l.neto); a.importe += Number(l.iva);
    porAlicuota.set(Number(l.iva_pct), a);
  }
  const neto = r2(lineas.reduce((s, l) => s + Number(l.neto), 0));
  const iva = r2(lineas.reduce((s, l) => s + Number(l.iva), 0));
  const total = r2(neto + iva + Number(f.percepcion_iva) + Number(f.percepcion_iibb) + Number(f.otros_impuestos) + Number(f.no_gravado));
  await consulta("update factura_compra set neto = $3, iva = $4, iva_detalle = $5::jsonb, total = $6 where id = $1 and organizacion_id = $2",
    [facturaId, org, neto, iva, JSON.stringify([...porAlicuota.entries()].map(([pct, a]) => ({ pct, base: r2(a.base), importe: r2(a.importe) }))), total]);
  return { neto, iva, total };
}

/** Agrega una línea (neto e IVA calculados) y recalcula. */
export async function agregarLineaFactura(org: string, facturaId: number, d: { variacionId?: number | null; descripcion: string; cantidad: number; costoUnit: number; ivaPct: number }) {
  if (!(d.cantidad > 0) || !(d.costoUnit >= 0)) throw new ErrorErp("Cantidad y costo tienen que ser números positivos.");
  const neto = r2(d.cantidad * d.costoUnit);
  const iva = r2(neto * d.ivaPct / 100);
  await consulta(`insert into factura_compra_linea (organizacion_id, factura_id, variacion_id, descripcion, cantidad, costo_unit, iva_pct, neto, iva, orden)
                  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, (select coalesce(max(orden), 0) + 1 from factura_compra_linea where factura_id = $2))`,
    [org, facturaId, d.variacionId ?? null, d.descripcion, d.cantidad, d.costoUnit, d.ivaPct, neto, iva]);
  return recalcularFactura(org, facturaId);
}

/** Registra la factura: stock, costo y cuenta corriente. */
export async function registrarFactura(org: string, facturaId: number, usuarioId: string) {
  const f = await una<{ estado: string; proveedor_id: number; moneda: "ARS" | "USD"; cotizacion: string; total: string; fecha: string; vencimiento: string | null;
    deposito_id: number | null; recepcion_id: number | null; letra: string; punto_venta: number | null; numero: string | null; es_nota_credito: boolean; es_nota_debito: boolean; emisor_id: number | null }>(`
    select emisor_id::int, estado, proveedor_id::int, moneda, cotizacion, total, to_char(fecha, 'YYYY-MM-DD') fecha, to_char(vencimiento, 'YYYY-MM-DD') vencimiento,
           deposito_id::int, recepcion_id::int, letra, punto_venta, numero, es_nota_credito, es_nota_debito
      from factura_compra where id = $1 and organizacion_id = $2`, [facturaId, org]);
  if (!f) throw new ErrorErp("La factura no existe.");
  if (f.estado !== "borrador") throw new ErrorErp("La factura ya estaba registrada.");
  if (!(Number(f.total) > 0)) throw new ErrorErp("La factura tiene total cero: cargale líneas o importes.");
  const cot = f.moneda === "USD" ? Number(f.cotizacion) : 1;
  if (f.moneda === "USD" && !(cot > 0)) throw new ErrorErp("Falta la cotización del dólar de la factura.");
  const tcUsd = f.moneda === "USD" ? cot : Number((await una<{ v: string | null }>("select tc_del_dia($1, $2::date) v", [org, f.fecha]))?.v ?? 0);
  if (!tcUsd) throw new ErrorErp(`No hay tipo de cambio para el ${f.fecha.split("-").reverse().join("/")}.`);
  const lineas = await consulta<{ variacion_id: number | null; cantidad: string; costo_unit: string }>(
    "select variacion_id::int, cantidad, costo_unit from factura_compra_linea where factura_id = $1 order by orden, id", [facturaId]);
  const conStock = lineas.filter((l) => l.variacion_id);
  if (conStock.length && !f.recepcion_id && !f.deposito_id && !f.es_nota_credito) throw new ErrorErp("Elegí a qué depósito entra la mercadería (o vinculá la recepción por la que ya entró).");
  const totalArs = r2(Number(f.total) * cot);
  const totalUsd = f.moneda === "USD" ? Number(f.total) : r2(totalArs / tcUsd);
  const signo = f.es_nota_credito ? -1 : 1;
  // Sin recepción, entra a la ubicación general del depósito: si no tiene, se avisa (antes no movía el stock y seguía callada).
  const ubic = conStock.length && !f.es_nota_credito && f.deposito_id && !f.recepcion_id ? await ubicacionGeneral(org, f.deposito_id) : null;
  if (conStock.length && !f.es_nota_credito && f.deposito_id && !f.recepcion_id && !ubic)
    throw new ErrorErp("El depósito elegido no tiene ubicación general, así que la mercadería no tiene dónde entrar: elegí otro depósito.");
  // Con recepción, lo recibido ya está en el stock: no se vuelve a ingresar y
  // se descuenta del "stock que había" para el promedio (si no, contaría dos veces).
  let excluir: number[] = conStock.map(() => 0);
  let difRecepcion: DiferenciaRecepcion[] | null = null;
  if (conStock.length && !f.es_nota_credito && f.recepcion_id) {
    const aMapa = (filas: { variacion_id: number; n: string }[]) => new Map(filas.map((x) => [x.variacion_id, Number(x.n)]));
    const recibido = aMapa(await consulta<{ variacion_id: number; n: string }>(
      "select variacion_id::int, sum(cantidad) n from recepcion_linea where recepcion_id = $1 and organizacion_id = $2 group by variacion_id", [f.recepcion_id, org]));
    // Lo que otras facturas ya registradas costearon de esa misma recepción.
    const yaFacturado = aMapa(await consulta<{ variacion_id: number; n: string }>(`
      select l.variacion_id::int, sum(l.cantidad) n from factura_compra_linea l join factura_compra fc on fc.id = l.factura_id
       where fc.organizacion_id = $1 and fc.recepcion_id = $2 and fc.id <> $3 and fc.estado = 'registrada' and not fc.es_nota_credito and l.variacion_id is not null
       group by l.variacion_id`, [org, f.recepcion_id, facturaId]));
    excluir = excluirPorRecepcion(conStock.map((l) => ({ variacionId: l.variacion_id!, cantidad: Number(l.cantidad) })), recibido, yaFacturado);
    // Diferencia entre lo facturado y lo recibido (la asienta la contabilidad
    // como "Diferencias en recepciones de stock"). Lo que ya cubrió cada
    // factura anterior de la misma recepción: lo facturado, salvo los
    // productos en que tuvo diferencia (ésos los cerró con lo que quedaba).
    const otras = await consulta<{ id: number; diferencia_recepcion: DiferenciaRecepcion[] | null; lineas: { variacion_id: number; cantidad: string }[] }>(`
      select fc.id::int, fc.diferencia_recepcion,
             coalesce((select json_agg(json_build_object('variacion_id', l.variacion_id, 'cantidad', l.cantidad)) from factura_compra_linea l
                        where l.factura_id = fc.id and l.variacion_id is not null), '[]') lineas
        from factura_compra fc
       where fc.organizacion_id = $1 and fc.recepcion_id = $2 and fc.id <> $3 and fc.estado = 'registrada' and not fc.es_nota_credito`,
      [org, f.recepcion_id, facturaId]);
    const cubiertoAntes = new Map<number, number>();
    for (const o of otras) {
      const cub = cubiertoPorFactura(o.lineas.map((l) => ({ variacionId: Number(l.variacion_id), cantidad: Number(l.cantidad) })), o.diferencia_recepcion ?? []);
      for (const [v, n] of cub) cubiertoAntes.set(v, (cubiertoAntes.get(v) ?? 0) + n);
    }
    difRecepcion = diferenciasRecepcion(conStock.map((l) => ({ variacionId: l.variacion_id!, cantidad: Number(l.cantidad), costoUnitArs: r2(Number(l.costo_unit) * cot) })),
      recibido, cubiertoAntes);
  }
  await enTransaccion(async (c) => {
    if (!f.es_nota_credito) {
      for (const [i, l] of conStock.entries()) {
        const cant = Number(l.cantidad);
        const costoArs = r2(Number(l.costo_unit) * cot);
        const costoUsd = f.moneda === "USD" ? Number(l.costo_unit) : Math.round((costoArs / tcUsd) * 10000) / 10000;
        await registrarCosto(c, org, l.variacion_id!, cant, costoArs, costoUsd, excluir[i]);
        if (ubic) {
          if (!Number.isInteger(cant)) throw new ErrorErp("Las cantidades de mercadería tienen que ser enteras.");
          await moverStock(org, { variacionId: l.variacion_id!, tipo: "ingreso", cantidad: cant, destinoId: ubic, referencia: { tipo: "factura_compra", id: facturaId }, usuarioId }, c);
        }
      }
    }
    await movimientoCc(c, org, {
      tercero: "proveedor", terceroId: f.proveedor_id, fecha: f.fecha, vencimiento: f.vencimiento ?? f.fecha, tipo: f.es_nota_credito ? "nota_credito" : f.es_nota_debito ? "nota_debito" : "factura",
      moneda: f.moneda, importe: signo * Number(f.total), importeArs: signo * totalArs, importeUsd: signo * totalUsd,
      descripcion: `${f.es_nota_credito ? "Nota de crédito" : f.es_nota_debito ? "Nota de débito" : "Factura"} ${f.letra} ${f.punto_venta != null ? String(f.punto_venta).padStart(5, "0") + "-" : ""}${f.numero ?? "s/n"}`,
      referenciaTipo: "factura_compra", referenciaId: facturaId, emisorId: f.emisor_id,
    });
    await c.query(`update factura_compra set estado = 'registrada', registrada_ts = now(), usuario_id = $3, total_ars = $4, total_usd = $5,
                          diferencia_recepcion = $6::jsonb where id = $1 and organizacion_id = $2`,
      [facturaId, org, usuarioId, totalArs, totalUsd, difRecepcion ? JSON.stringify(difRecepcion) : null]);
    await imputarAutomatico(c, org, "proveedor", f.proveedor_id);
  });
  if (conStock.length) await sincronizarStockMl(org, conStock.map((l) => l.variacion_id!)).catch(() => {});
}

/** Calcula (sin guardar) el costo unitario puesto en depósito de cada línea de un despacho. */
export async function calcularDespacho(org: string, despachoId: number) {
  const d = await una<{ cotizacion: string; flete_usd: string; seguro_usd: string; gastos: { importe_ars: number }[] }>(
    "select cotizacion, flete_usd, seguro_usd, gastos from despacho_importacion where id = $1 and organizacion_id = $2", [despachoId, org]);
  if (!d) throw new ErrorErp("El despacho no existe.");
  const cot = Number(d.cotizacion);
  const lineas = await consulta<{ id: number; cantidad: number; fob_unit_usd: string }>("select id::int, cantidad, fob_unit_usd from despacho_linea where despacho_id = $1 order by orden, id", [despachoId]);
  const fobTotal = lineas.reduce((s, l) => s + l.cantidad * Number(l.fob_unit_usd), 0);
  const extraArs = (Number(d.flete_usd) + Number(d.seguro_usd)) * cot + (d.gastos ?? []).reduce((s, g) => s + Number(g.importe_ars || 0), 0);
  return {
    cotizacion: cot, fobTotal: r2(fobTotal), extraArs: r2(extraArs), costoTotalArs: r2(fobTotal * cot + extraArs),
    lineas: lineas.map((l) => {
      const fob = l.cantidad * Number(l.fob_unit_usd);
      const parte = fobTotal > 0 ? fob / fobTotal : 0;
      const unitArs = l.cantidad ? r2((fob * cot + parte * extraArs) / l.cantidad) : 0;
      return { id: l.id, cantidad: l.cantidad, costoUnitArs: unitArs, costoUnitUsd: cot ? Math.round((unitArs / cot) * 10000) / 10000 : 0 };
    }),
  };
}

/** Registra el despacho: costo prorrateado, stock y costo de cada variación. */
export async function registrarDespacho(org: string, despachoId: number, usuarioId: string) {
  const d = await una<{ estado: string; deposito_id: number | null; cotizacion: string }>("select estado, deposito_id::int, cotizacion from despacho_importacion where id = $1 and organizacion_id = $2", [despachoId, org]);
  if (!d) throw new ErrorErp("El despacho no existe.");
  if (d.estado !== "borrador") throw new ErrorErp("El despacho ya estaba registrado.");
  if (!(Number(d.cotizacion) > 0)) throw new ErrorErp("Falta la cotización del dólar del despacho.");
  if (!d.deposito_id) throw new ErrorErp("Elegí a qué depósito entra la mercadería.");
  const calc = await calcularDespacho(org, despachoId);
  if (!calc.lineas.length || calc.fobTotal <= 0) throw new ErrorErp("El despacho no tiene líneas con FOB.");
  const ubic = await ubicacionGeneral(org, d.deposito_id);
  if (!ubic) throw new ErrorErp("El depósito elegido no tiene ubicación general, así que la mercadería no tiene dónde entrar: elegí otro depósito.");
  const vars: number[] = [];
  await enTransaccion(async (c) => {
    for (const l of calc.lineas) {
      const v = (await c.query<{ variacion_id: string | null }>("select variacion_id from despacho_linea where id = $1", [l.id])).rows[0].variacion_id;
      await c.query("update despacho_linea set costo_unit_ars = $2, costo_unit_usd = $3 where id = $1", [l.id, l.costoUnitArs, l.costoUnitUsd]);
      if (v) {
        await registrarCosto(c, org, Number(v), l.cantidad, l.costoUnitArs, l.costoUnitUsd);
        await moverStock(org, { variacionId: Number(v), tipo: "ingreso", cantidad: l.cantidad, destinoId: ubic, referencia: { tipo: "despacho", id: despachoId }, usuarioId }, c);
        vars.push(Number(v));
      }
    }
    await c.query("update despacho_importacion set estado = 'registrado', registrado_ts = now(), usuario_id = $3 where id = $1 and organizacion_id = $2", [despachoId, org, usuarioId]);
  });
  if (vars.length) await sincronizarStockMl(org, vars).catch(() => {});
  return calc;
}
