// Informe "Rentabilidad por venta / por producto": por cada venta (o
// producto) del período, lo vendido, lo que cobró el canal, el costo de la
// mercadería y el margen. La misma consulta sirve a la pantalla y al Excel.
//
//   venta   = suma de las líneas (precio unitario × cantidad), en pesos;
//   cargos  = los cargos de la facturación de Mercado Libre unidos a la venta
//             (comisión, envío, cargo fijo, publicidad, bonificaciones; sin
//             los impuestos, que son percepciones / retenciones). Si todavía
//             no se leyó la facturación de esa venta, la comisión que vino con
//             la orden (pedido.comision_ars). Por producto, se reparten entre
//             las líneas según lo que vendió cada una;
//   costo   = cantidad × costo de la variación, en pesos con el tipo de cambio
//             del día de la venta: promedio (USD), último (USD) o FOB (en su
//             moneda); si falta el de dólares, el promedio / último en pesos;
//   margen  = venta − cargos − costo (y % sobre la venta).
// Entran las ventas que no están "nuevo" (sin pagar), canceladas ni devueltas.

import { consulta } from "@/lib/erp/base";
import { sqlCargosMl, sqlCargosMlUsd } from "@/lib/mercadolibre/facturacion";
import type { Moneda } from "@/lib/moneda";

export const BASES_COSTO = { promedio: "Costo promedio", ultimo: "Último costo", fob: "Costo FOB" } as const;
export type BaseCosto = keyof typeof BASES_COSTO;
export const AGRUPAR = { venta: "Por venta", producto: "Por producto" } as const;
export type Agrupar = keyof typeof AGRUPAR;

export type FiltroRentabilidad = { desde: string; hasta: string; canal: number; costo: BaseCosto; agrupar: Agrupar };

const esFecha = (x?: string) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);

export function leerFiltroRentabilidad(sp: Record<string, string | undefined>, hoy: string): FiltroRentabilidad {
  return {
    desde: esFecha(sp.desde) ? sp.desde! : `${hoy.slice(0, 8)}01`,
    hasta: esFecha(sp.hasta) ? sp.hasta! : hoy,
    canal: Number(sp.canal) || 0,
    costo: sp.costo === "ultimo" || sp.costo === "fob" ? sp.costo : "promedio",
    agrupar: sp.agrupar === "producto" ? "producto" : "venta",
  };
}

export type FilaRentabilidad = {
  clave: string; pedido_id: number | null; producto_id: number | null; fecha: string | null; externo: string | null; canal: string | null;
  sku: string | null; titulo: string | null; unidades: number; ventas: number;
  venta: number; cargos: number; cargos_ml: boolean; costo: number | null; sin_costo: number; margen: number | null; margen_pct: number | null;
};

function costoUnitario(base: BaseCosto, moneda: Moneda) {
  const tc = "tc_del_dia(p.organizacion_id, (p.fecha at time zone 'America/Argentina/Buenos_Aires')::date)";
  // En dólares, todo al dólar del día de la venta: el costo en dólares tal cual, el que está en pesos dividido por ese dólar.
  if (moneda === "USD") {
    if (base === "fob") return `(case when v.costo_moneda = 'ARS' then v.costo_fob / nullif(${tc}, 0) else v.costo_fob end)`;
    const col = base === "ultimo" ? "ultimo" : "promedio";
    return `coalesce(v.costo_${col}_usd, v.costo_${col}_ars / nullif(${tc}, 0))`;
  }
  if (base === "fob") return `(case when v.costo_moneda = 'ARS' then v.costo_fob else v.costo_fob * ${tc} end)`;
  const col = base === "ultimo" ? "ultimo" : "promedio";
  return `coalesce(v.costo_${col}_usd * ${tc}, v.costo_${col}_ars)`;
}

export async function rentabilidad(org: string, f: FiltroRentabilidad, moneda: Moneda = "ARS"): Promise<FilaRentabilidad[]> {
  const usd = moneda === "USD";
  const cargos = usd ? sqlCargosMlUsd("p") : sqlCargosMl("p");
  const precio = usd ? "l.precio_unit_usd" : "l.precio_unit_ars";
  const comision = usd ? "(p.comision_ars / nullif(p.tc_dia, 0))" : "p.comision_ars";
  const base = `
    with l as (
      select p.id pedido_id, p.fecha, p.id_externo, ca.nombre canal, l.variacion_id, v.producto_id, coalesce(v.sku, l.sku) sku, l.titulo, l.cantidad,
             ${precio} * l.cantidad venta_l,
             sum(${precio} * l.cantidad) over (partition by p.id) venta_p,
             ${cargos} cargos_ml, ${comision} comision_ars,
             l.cantidad * ${costoUnitario(f.costo, moneda)} costo_l
        from pedido p join canal ca on ca.id = p.canal_id
        join pedido_linea l on l.pedido_id = p.id
        left join variacion v on v.id = l.variacion_id
       where p.organizacion_id = $1 and p.estado not in ('presupuesto', 'nuevo', 'cancelado', 'devuelto')
         and p.fecha >= ($2::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'
         and p.fecha < ($3::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
         and ($4 = 0 or p.canal_id = $4)
    ), x as (
      select l.*, coalesce(cargos_ml, comision_ars, 0) * case when venta_p > 0 then venta_l / venta_p else 0 end cargos_l from l
    )`;
  const filas = f.agrupar === "venta"
    ? await consulta<FilaRentabilidad>(`${base}
      select pedido_id::text clave, pedido_id::int, null::int producto_id, to_char(max(fecha) at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI') fecha,
             max(id_externo) externo, max(canal) canal, null sku,
             string_agg(titulo, ' · ' order by titulo) titulo, sum(cantidad)::int unidades, 1 ventas,
             round(sum(venta_l), 2)::float venta, round(sum(cargos_l), 2)::float cargos, bool_or(cargos_ml is not null) cargos_ml,
             round(sum(costo_l), 2)::float costo, count(*) filter (where costo_l is null)::int sin_costo
        from x group by pedido_id order by max(fecha) desc, pedido_id desc`, [org, f.desde, f.hasta, f.canal])
    : await consulta<FilaRentabilidad>(`${base}
      select coalesce(variacion_id::text, 'sin:' || coalesce(sku, titulo)) clave, null::int pedido_id, max(producto_id)::int producto_id, null fecha, null externo, null canal,
             max(sku) sku, max(titulo) titulo, sum(cantidad)::int unidades, count(distinct pedido_id)::int ventas,
             round(sum(venta_l), 2)::float venta, round(sum(cargos_l), 2)::float cargos, bool_or(cargos_ml is not null) cargos_ml,
             round(sum(costo_l), 2)::float costo, count(*) filter (where costo_l is null)::int sin_costo
        from x group by coalesce(variacion_id::text, 'sin:' || coalesce(sku, titulo)) order by sum(venta_l) desc`, [org, f.desde, f.hasta, f.canal]);
  return filas.map((r) => {
    const costo = r.sin_costo > 0 && r.costo == null ? null : r.costo;
    const margen = costo == null || r.sin_costo > 0 ? null : Math.round((r.venta - r.cargos - costo) * 100) / 100;
    return { ...r, costo, margen, margen_pct: margen != null && r.venta ? Math.round((margen / r.venta) * 1000) / 10 : null };
  });
}

export function totalesRentabilidad(filas: FilaRentabilidad[]) {
  const t = filas.reduce((a, r) => ({ venta: a.venta + r.venta, cargos: a.cargos + r.cargos, costo: a.costo + (r.costo ?? 0), sinCosto: a.sinCosto + (r.sin_costo > 0 ? 1 : 0),
    unidades: a.unidades + r.unidades }), { venta: 0, cargos: 0, costo: 0, sinCosto: 0, unidades: 0 });
  const margen = t.venta - t.cargos - t.costo;
  return { ...t, margen, margenPct: t.venta ? Math.round((margen / t.venta) * 1000) / 10 : null };
}
