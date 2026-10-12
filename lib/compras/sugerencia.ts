// Sugerencia de compra (pedido de Fer, 12/10): qué comprar para N días según el ritmo real de venta de la historia
// (lib/compras/sugerencia-calculo.ts). Todos los productos, activos o no, salvo notebooks; ventas de todos los canales
// (vista venta_estadistica, sin canceladas). Por producto:
//   · cantidad para N días según el ritmo típico y según el mejor momento, y lo que habría que comprar descontando el stock de hoy;
//   · costo: el último costo en dólares de la ficha (FOB + 40 %, o el de su compra por courier), al dólar oficial de hoy;
//   · precio: la última venta, pasada a dólares con el oficial de ese día y de ahí a pesos de hoy;
//   · ganancia estimada = precio − lo que se lleva Mercado Libre (comisión de su categoría, cargo fijo, envío) − costo.
// Sólo informa: no compra ni cambia nada.

import { consulta, una } from "@/lib/erp/base";
import { costosMl, ritmo, sinComprasGrandes, type Grillas, type Renglon } from "@/lib/compras/sugerencia-calculo";

export type FiltroSugerencia = { desde: string; hasta: string; dias: number };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function leerFiltroSugerencia(sp: Record<string, string | undefined>, hoy: string): FiltroSugerencia {
  const seisAnios = `${Number(hoy.slice(0, 4)) - 6}${hoy.slice(4)}`;
  const dias = Math.round(Number(sp.dias));
  return {
    desde: FECHA.test(sp.desde ?? "") ? sp.desde! : seisAnios,
    hasta: FECHA.test(sp.hasta ?? "") ? sp.hasta! : hoy,
    dias: Number.isFinite(dias) && dias >= 7 && dias <= 365 ? dias : 60,
  };
}

export type FilaSugerencia = {
  clave: string; producto_id: number | null; sku: string; titulo: string; fotos: string[] | null; archivado: boolean;
  tipico: number; mejor: number; ventanas: number; dias_con_venta: number; grandes: number; mayor_grande: number;
  costo_usd: number | null; costo_ars: number | null;
  ultima_fecha: string; ultima_precio: number; ultima_tc: number | null; precio_usd: number | null; precio_hoy: number | null; clasica: number | null;
  comision_pct: number; costos_ml: number | null; ganancia_unit: number | null; margen_pct: number | null;
  /** La ganancia sobre el costo (lo que rinde cada peso invertido). */
  roi_pct: number | null;
  /** Lo disponible hoy y lo que habría que comprar (lo que se vendería menos lo que ya hay), según el típico y el mejor momento. */
  stock: number; comprar_tipico: number; comprar_mejor: number;
};

const DIA = 86400_000;
const aDia = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DIA);

/** El orden de las grillas de Mercado Libre (cargo fijo y envío gratis vigentes), para un producto de hasta 300 g. */
async function grillas(): Promise<Grillas> {
  const cf = await consulta<{ desde: number; valor: number }>(
    "select precio::float8 desde, coalesce(cargo_fijo, 0)::float8 valor from ml_costos_cargo_fijo_vigente where tipo = 'gold_special' and logistica = '-' order by precio");
  const env = await consulta<{ desde: number; valor: number }>(
    `select precio::float8 desde, coalesce(costo, 0)::float8 valor from ml_costos_envio_gratis_vigente
      where logistica = 'xd_drop_off' and peso_g = (select min(peso_g) from ml_costos_envio_gratis_vigente where logistica = 'xd_drop_off' and peso_g >= 300) order by precio`);
  // Cada punto de la grilla vale desde su precio; abajo del primero, el valor del primero (cargo fijo) o nada (envío).
  return { cargoFijo: cf.length ? [{ desde: 0, valor: cf[0].valor }, ...cf] : [], envio: env };
}

export async function sugerenciaCompra(org: string, f: FiltroSugerencia): Promise<{ filas: FilaSugerencia[]; tcHoy: number | null }> {
  const tcHoy = (await una<{ tc: number | null }>("select tc_del_dia($1, current_date)::float8 tc", [org]))?.tc ?? null;
  const renglones = await consulta<{ clave: string; dia: string; cantidad: number; precio: number | null; titulo: string | null }>(`
    select coalesce('v' || e.variacion_id, 's' || upper(regexp_replace(coalesce(e.sku, ''), '^DE-', '', 'i'))) clave,
           to_char(e.fecha at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') dia, e.cantidad,
           coalesce(e.precio_unit, e.total / nullif(e.cantidad, 0))::float8 precio, e.titulo
      from venta_estadistica e
      left join variacion va on va.id = e.variacion_id left join producto pr on pr.id = va.producto_id left join familia fa on fa.id = pr.familia_id
     where e.organizacion_id = $1 and e.estado not in ('cancelled', 'cancelado', 'invalid') and e.cantidad > 0
       and e.fecha >= ($2::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'
       and e.fecha < ($3::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
       and coalesce(e.sku, '') <> ''
       and not es_notebook(coalesce(pr.titulo, e.titulo)) and not coalesce(fa.nombre ~* '^notebook', false)`, [org, f.desde, f.hasta]);
  const porClave = new Map<string, Renglon[]>();
  // La última venta de cada producto (para el precio): la de fecha más nueva del período.
  const ultima = new Map<string, { dia: string; precio: number; titulo: string | null }>();
  for (const r of renglones) {
    const l = porClave.get(r.clave) ?? [];
    l.push({ dia: aDia(r.dia), cantidad: r.cantidad });
    porClave.set(r.clave, l);
    const u = ultima.get(r.clave);
    if (r.precio != null && r.precio > 1 && (!u || r.dia >= u.dia)) ultima.set(r.clave, { dia: r.dia, precio: r.precio, titulo: r.titulo });
  }
  const fin = aDia(f.hasta);
  const ritmos = new Map<string, ReturnType<typeof ritmo> & { grandes: number; mayor: number }>();
  for (const [clave, rs] of porClave) {
    const g = sinComprasGrandes(rs);
    const rt = ritmo(g.quedan, f.dias, fin);
    if (rt.mejor > 0) ritmos.set(clave, { ...rt, grandes: g.grandes, mayor: g.mayor });
  }
  if (!ritmos.size) return { filas: [], tcHoy };
  const claves = [...ritmos.keys()].filter((k) => ultima.has(k));
  const variaciones = claves.filter((k) => k.startsWith("v")).map((k) => Number(k.slice(1)));
  const fechas = [...new Set(claves.map((k) => ultima.get(k)!.dia))];
  const [info, tcs] = await Promise.all([
    consulta<{ id: number; producto_id: number; sku: string; titulo: string; fotos: string[] | null; archivado: boolean; costo_usd: number | null; comision_pct: number | null; clasica: number | null; stock: number }>(`
      with lista as (select id from lista_precios where organizacion_id = $1
                      order by lower(nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') desc, orden, id limit 1)
      select va.id::int, va.producto_id::int, va.sku, titulo_variacion(va.id) titulo,
             (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = va.producto_id) fotos,
             pr.estado = 'archivado' or va.estado = 'archivada' archivado, va.costo_ultimo_usd::float8 costo_usd,
             (select max(c.clasica_pct)::float8 from publicacion pu join canal ca on ca.id = pu.canal_id and ca.tipo = 'mercadolibre'
                join ml_costos_comisiones_vigente c on c.categoria_id = pu.categoria_externa where pu.variacion_id = va.id) comision_pct,
             (select pd.lista_ars from lista, precio_de($1, va.id, lista.id) pd)::float8 clasica,
             (select coalesce(sum(st.cantidad - st.reservado), 0) from stock st where st.variacion_id = va.id)::int stock
        from variacion va join producto pr on pr.id = va.producto_id
       where va.organizacion_id = $1 and va.id = any($2::bigint[])`, [org, variaciones]),
    consulta<{ dia: string; tc: number | null }>("select d::text dia, tc_del_dia($1, d)::float8 tc from unnest($2::date[]) d", [org, fechas]),
  ]);
  const porVariacion = new Map(info.map((x) => [`v${x.id}`, x]));
  const tcDe = new Map(tcs.map((x) => [x.dia, x.tc]));
  const datos = claves.map((clave) => {
    const u = ultima.get(clave)!;
    const v = porVariacion.get(clave);
    return {
      clave, producto_id: v?.producto_id ?? null, sku: v?.sku ?? clave.slice(1), titulo: v?.titulo ?? u.titulo ?? clave.slice(1), fotos: v?.fotos ?? null,
      archivado: v ? v.archivado : true, costo_usd: v?.costo_usd ?? null, comision_pct: v?.comision_pct ?? null, clasica: v?.clasica ?? null, stock: v?.stock ?? 0,
      ultima_fecha: u.dia, ultima_precio: u.precio, ultima_tc: tcDe.get(u.dia) ?? null,
    };
  });
  const g = await grillas();
  // Sin categoría conocida, la comisión más común de las categorías donde se publica.
  const conocidas = datos.map((d) => d.comision_pct).filter((x): x is number => x != null).sort((a, b) => a - b);
  const comisionComun = conocidas.length ? conocidas[Math.floor(conocidas.length / 2)] : 16.34;
  const filas = datos.map((d): FilaSugerencia => {
    const r = ritmos.get(d.clave)!;
    const precioUsd = d.ultima_tc ? d.ultima_precio / d.ultima_tc : null;
    const precioHoy = precioUsd != null && tcHoy ? Math.round(precioUsd * tcHoy) : null;
    const costoArs = d.costo_usd != null && tcHoy ? d.costo_usd * tcHoy : null;
    const comision = d.comision_pct ?? comisionComun;
    const ml = precioHoy != null ? costosMl(precioHoy, comision, g) : null;
    const ganancia = precioHoy != null && costoArs != null && ml != null ? precioHoy - ml - costoArs : null;
    return {
      clave: d.clave, producto_id: d.producto_id, sku: d.sku, titulo: d.titulo, fotos: d.fotos, archivado: d.archivado,
      tipico: r.tipico, mejor: r.mejor, ventanas: r.ventanas, dias_con_venta: r.diasConVenta, grandes: r.grandes, mayor_grande: r.mayor,
      costo_usd: d.costo_usd, costo_ars: costoArs, ultima_fecha: d.ultima_fecha, ultima_precio: d.ultima_precio, ultima_tc: d.ultima_tc,
      precio_usd: precioUsd, precio_hoy: precioHoy, clasica: d.clasica, comision_pct: comision, costos_ml: ml, ganancia_unit: ganancia,
      margen_pct: ganancia != null && precioHoy ? Math.round((ganancia / precioHoy) * 1000) / 10 : null,
      roi_pct: ganancia != null && costoArs ? Math.round((ganancia / costoArs) * 1000) / 10 : null,
      stock: d.stock, comprar_tipico: Math.max(0, r.tipico - Math.max(0, d.stock)), comprar_mejor: Math.max(0, r.mejor - Math.max(0, d.stock)),
    };
  });
  filas.sort((a, b) => b.tipico - a.tipico || b.mejor - a.mejor);
  return { filas, tcHoy };
}

export function totalesSugerencia(filas: FilaSugerencia[]) {
  const s = (f: (x: FilaSugerencia) => number | null) => filas.reduce((t, x) => t + (f(x) ?? 0), 0);
  return {
    productos: filas.length, conCosto: filas.filter((x) => x.costo_usd != null).length,
    inversionTipicaUsd: s((x) => (x.costo_usd != null ? x.costo_usd * x.comprar_tipico : null)), inversionMejorUsd: s((x) => (x.costo_usd != null ? x.costo_usd * x.comprar_mejor : null)),
    gananciaTipica: s((x) => (x.ganancia_unit != null ? x.ganancia_unit * x.comprar_tipico : null)), gananciaMejor: s((x) => (x.ganancia_unit != null ? x.ganancia_unit * x.comprar_mejor : null)),
    unidadesTipicas: s((x) => x.comprar_tipico), unidadesMejor: s((x) => x.comprar_mejor),
  };
}

/** Las columnas por las que se puede ordenar (lista blanca para ?orden=). */
export const ORDEN_SUGERENCIA: Record<string, (x: FilaSugerencia) => number | string | null> = {
  sku: (x) => x.sku, tipico: (x) => x.tipico, mejor: (x) => x.mejor, stock: (x) => x.stock, comprar: (x) => x.comprar_tipico,
  costo: (x) => x.costo_usd, inversion: (x) => (x.costo_usd == null ? null : x.costo_usd * x.comprar_tipico), ultima: (x) => x.ultima_fecha,
  precio: (x) => x.precio_hoy, ganancia_unit: (x) => x.ganancia_unit, margen: (x) => x.margen_pct, roi: (x) => x.roi_pct, dias_venta: (x) => x.dias_con_venta,
  ganancia: (x) => (x.ganancia_unit == null ? null : x.ganancia_unit * x.comprar_tipico),
  ganancia_mejor: (x) => (x.ganancia_unit == null ? null : x.ganancia_unit * x.comprar_mejor),
};

/** Opciones del filtro «Días con venta» (más de N). */
export const MIN_DIAS_VENTA = [5, 10, 20, 30, 50, 100, 200];

/** Lo que se MUESTRA (Fer, 12/10): buscador, «más de N días con venta» y «última venta entre». No cambia los cálculos: el
 *  ritmo se calcula con todo el período elegido; esto sólo esconde renglones. */
export function filtrarMuestra(filas: FilaSugerencia[], sp: Record<string, string | undefined>, coincide: (x: FilaSugerencia) => boolean): FilaSugerencia[] {
  const minDias = Number(sp.min_dias) || 0;
  const desde = FECHA.test(sp.vdesde ?? "") ? sp.vdesde! : "";
  const hasta = FECHA.test(sp.vhasta ?? "") ? sp.vhasta! : "";
  return filas.filter((x) => x.dias_con_venta > minDias && (!desde || x.ultima_fecha >= desde) && (!hasta || x.ultima_fecha <= hasta) && coincide(x));
}
