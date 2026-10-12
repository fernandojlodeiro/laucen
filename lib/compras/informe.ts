// Informe de importaciones (pedido de Fer, 12/10): una o varias compras por courier juntas. Por producto, lo que se
// vendió desde que entró al stock (todos los canales, vista venta_estadistica; los kits cuentan sus componentes), lo que
// dejó, cuánto tardó en venderse y lo que queda; arriba, el resumen, los más y menos rentables, los más rápidos y lentos,
// y qué convendría hacer en la próxima compra (reglas en recomendar(), sin base, con sus umbrales en UMBRALES).
//
//   ganancia = ventas − comisión y cargo fijo de ML − costo de lo vendido (al dólar de hoy: costo de reposición).
//   No incluye el envío gratis que paga el vendedor ni la publicidad.

import { consulta, una } from "@/lib/erp/base";

export type ProductoImportado = {
  linea_id: number; compra_id: number; compra: string; ingreso_ts: Date; producto_id: number | null; sku: string; descripcion: string; fotos: string[] | null;
  cargado: number; vendido: number; ventas: number; comision: number; costo_unit: number | null; disponible: number; precio: number | null;
  /** Lo que costó en dólares cada unidad en ESTA compra (FOB + flete por kilo, más el % del courier) y cuántas se compraron. */
  costo_usd: number; comprado: number;
  primera_venta: Date | null; agotado_ts: Date | null; dias: number;
};

export type Analisis = ProductoImportado & {
  pct_vendido: number; costo_vendido: number | null; ganancia: number | null; margen_pct: number | null; roi_pct: number | null;
  por_dia: number; dias_para_agotar: number | null; diferencia: number; stock_costo: number | null;
};

/** Los umbrales de las recomendaciones (se pueden ajustar acá). */
export const UMBRALES = {
  /** Se agotó (o vendió casi todo) en menos de estos días: se vendió rápido. */
  rapidoDias: 60,
  /** Vendió al menos este % de lo cargado para contar como «casi agotado». */
  casiTodoPct: 90,
  /** Con este margen sobre la venta o más, es buen negocio. */
  margenBuenoPct: 25,
  /** Con menos de este margen, hay que revisar el precio o el costo. */
  margenBajoPct: 10,
  /** Después de estos días con stock… */
  lentoDias: 60,
  /** …vendió menos de este %: se vende lento. */
  lentoPct: 35,
  /** Para cuántos días de venta conviene comprar. */
  coberturaDias: 120,
} as const;

export async function comprasParaInforme(org: string) {
  return consulta<{ id: number; nombre: string; ingreso_ts: Date | null }>(
    "select id::int, nombre, ingreso_ts from compra_courier where organizacion_id = $1 order by ingreso_ts desc nulls last, id desc", [org]);
}

export async function productosImportados(org: string, compras: number[]): Promise<ProductoImportado[]> {
  if (!compras.length) return [];
  return consulta<ProductoImportado>(`
    with tc as (select tc_del_dia($1, current_date)::float8 tc),
    lista as (select id from lista_precios where organizacion_id = $1
               order by lower(nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') desc, orden, id limit 1),
    l as (
      select l.id, c.id compra_id, c.nombre compra, c.ingreso_ts, l.variacion_id, va.producto_id, coalesce(va.sku, l.sku) sku, l.descripcion, l.orden,
             coalesce(l.cargado, l.cantidad) cargado, va.costo_ultimo_usd * tc.tc costo_unit, l.cantidad comprado,
             (l.fob_unit_usd + coalesce(l.peso_g, 0) / 1000 * c.flete_usd_kg) * (1 + c.courier_pct / 100) costo_usd
        from compra_courier c join compra_courier_linea l on l.compra_id = c.id left join variacion va on va.id = l.variacion_id cross join tc
       where c.organizacion_id = $1 and c.id = any($2::bigint[]) and c.ingreso_ts is not null),
    v as (
      select l.id, e.fecha, case when e.variacion_id = l.variacion_id then e.cantidad else e.cantidad * k.cantidad end uds, e.total, coalesce(e.comision, 0) comision
        from l join venta_estadistica e on e.organizacion_id = $1 and e.fecha >= l.ingreso_ts and e.estado not in ('cancelled', 'cancelado', 'invalid')
        left join kit_componente k on k.variacion_kit_id = e.variacion_id and k.variacion_componente_id = l.variacion_id
       where e.variacion_id = l.variacion_id or k.variacion_componente_id is not null),
    a as (select v.*, sum(uds) over (partition by id order by fecha rows unbounded preceding) acum from v),
    g as (
      select a.id, sum(uds)::int vendido, sum(total)::float8 ventas, sum(comision)::float8 comision, min(fecha) primera_venta,
             min(fecha) filter (where acum >= l.cargado) agotado_ts
        from a join l on l.id = a.id group by a.id)
    select l.id::int linea_id, l.compra_id::int, l.compra, l.ingreso_ts, l.producto_id::int, l.sku, l.descripcion,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = l.producto_id) fotos,
           l.cargado, l.comprado, l.costo_usd::float8, coalesce(g.vendido, 0) vendido, coalesce(g.ventas, 0) ventas, coalesce(g.comision, 0) comision, l.costo_unit::float8,
           (select coalesce(sum(s.cantidad - s.reservado), 0) from stock s where s.variacion_id = l.variacion_id)::int disponible,
           (select pd.lista_ars from lista, precio_de($1, l.variacion_id, lista.id) pd)::float8 precio,
           g.primera_venta, g.agotado_ts,
           greatest(1, ceil(extract(epoch from (coalesce(g.agotado_ts, now()) - l.ingreso_ts)) / 86400))::int dias
      from l left join g on g.id = l.id
     order by l.compra, l.orden, l.id`, [org, compras]);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Las cuentas de cada producto (pura). */
export function analizar(p: ProductoImportado): Analisis {
  const costoVendido = p.costo_unit == null ? null : p.vendido * p.costo_unit;
  const ganancia = costoVendido == null ? null : p.ventas - p.comision - costoVendido;
  const porDia = p.vendido / Math.max(1, p.dias);
  const saldo = p.cargado - p.vendido;
  return {
    ...p,
    pct_vendido: p.cargado ? r1((p.vendido / p.cargado) * 100) : 0,
    costo_vendido: costoVendido, ganancia,
    margen_pct: ganancia != null && p.ventas ? r1((ganancia / p.ventas) * 100) : null,
    roi_pct: ganancia != null && costoVendido ? r1((ganancia / costoVendido) * 100) : null,
    por_dia: Math.round(porDia * 100) / 100,
    dias_para_agotar: p.disponible <= 0 ? 0 : porDia > 0 ? Math.ceil(p.disponible / porDia) : null,
    diferencia: p.disponible - saldo,
    stock_costo: p.costo_unit == null ? null : Math.max(0, p.disponible) * p.costo_unit,
  };
}

export type Recomendacion = { tipo: "comprar_mas" | "reponer" | "comprar_menos" | "revisar_precio" | "revisar_stock"; texto: string };

export const TIPOS_RECOMENDACION: Record<Recomendacion["tipo"], { titulo: string; tono: "verde" | "azul" | "amarillo" | "rojo" | "naranja" }> = {
  comprar_mas: { titulo: "Comprar más cantidad", tono: "verde" },
  reponer: { titulo: "Reponer", tono: "azul" },
  comprar_menos: { titulo: "Comprar menos o no repetir", tono: "amarillo" },
  revisar_precio: { titulo: "Revisar precio o costo", tono: "rojo" },
  revisar_stock: { titulo: "Revisar el stock", tono: "naranja" },
};

/** Qué convendría hacer con cada producto en la próxima compra (pura). */
export function recomendar(a: Analisis, u = UMBRALES): Recomendacion[] {
  const r: Recomendacion[] = [];
  const sugerida = Math.ceil((a.por_dia * u.coberturaDias) / 10) * 10;
  const rapido = a.pct_vendido >= u.casiTodoPct && a.dias <= u.rapidoDias;
  if (a.margen_pct != null && a.margen_pct < u.margenBajoPct) {
    r.push({ tipo: "revisar_precio", texto: `Deja ${a.margen_pct.toLocaleString("es-AR")} % sobre la venta: subir el precio, conseguir mejor costo o no repetir.` });
  }
  if (rapido && (a.margen_pct ?? 0) >= u.margenBuenoPct) {
    r.push({ tipo: "comprar_mas", texto: `Vendió el ${a.pct_vendido.toLocaleString("es-AR")} % en ${a.dias} días con ${a.margen_pct?.toLocaleString("es-AR")} % de margen: para ${u.coberturaDias} días de venta, unas ${sugerida.toLocaleString("es-AR")} unidades (se compraron ${a.cargado.toLocaleString("es-AR")}).` });
  } else if (a.pct_vendido >= 60 && (a.margen_pct ?? 0) >= u.margenBajoPct) {
    r.push({ tipo: "reponer", texto: `Vendió el ${a.pct_vendido.toLocaleString("es-AR")} % en ${a.dias} días (${a.por_dia.toLocaleString("es-AR")} por día): reponer unas ${sugerida.toLocaleString("es-AR")} para ${u.coberturaDias} días.` });
  } else if (a.dias >= u.lentoDias && a.pct_vendido < u.lentoPct) {
    r.push({ tipo: "comprar_menos", texto: `En ${a.dias} días vendió el ${a.pct_vendido.toLocaleString("es-AR")} %: con lo que queda hay para ${a.dias_para_agotar == null ? "mucho tiempo (no se vende)" : `${a.dias_para_agotar.toLocaleString("es-AR")} días`}. No repetir hasta que baje el stock, o comprar mucho menos.` });
  }
  if (a.diferencia < 0 && Math.abs(a.diferencia) >= Math.max(3, a.cargado * 0.03)) {
    r.push({ tipo: "revisar_stock", texto: `Faltan ${Math.abs(a.diferencia).toLocaleString("es-AR")} unidades contra lo vendido: revisar combos sin kit armado, roturas o ajustes.` });
  }
  return r;
}

export type Resumen = {
  compra: string; cargado: number; vendido: number; ventas: number; comision: number; costo_vendido: number; ganancia: number;
  /** La compra en dólares (lo que se pagó) y lo que queda en stock valorizado a ese mismo costo en dólares. */
  compra_usd: number; stock_usd: number;
  disponible: number; diferencia: number; stock_costo: number; stock_pvp: number; faltante_pvp: number;
};

export function resumir(nombre: string, xs: Analisis[]): Resumen {
  const s = (f: (a: Analisis) => number | null) => xs.reduce((t, a) => t + (f(a) ?? 0), 0);
  return {
    compra: nombre, compra_usd: s((a) => a.comprado * a.costo_usd), stock_usd: s((a) => Math.max(0, a.disponible) * a.costo_usd), cargado: s((a) => a.cargado), vendido: s((a) => a.vendido), ventas: s((a) => a.ventas), comision: s((a) => a.comision),
    costo_vendido: s((a) => a.costo_vendido), ganancia: s((a) => a.ganancia), disponible: s((a) => a.disponible), diferencia: s((a) => a.diferencia),
    stock_costo: s((a) => a.stock_costo), stock_pvp: s((a) => (a.precio ?? 0) * Math.max(0, a.disponible)),
    faltante_pvp: s((a) => (a.diferencia < 0 ? a.diferencia * (a.precio ?? 0) : 0)),
  };
}

export async function dolarHoy(org: string): Promise<number | null> {
  return (await una<{ tc: number | null }>("select tc_del_dia($1, current_date)::float8 tc", [org]))?.tc ?? null;
}
