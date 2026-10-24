// Informe: ventas por canal o por razón social (pedido de Fer, 24/10). Monto y cantidad de pedidos de un período,
// por día, semana o mes. Una venta es un CARRITO, no un ítem: un pedido del sistema, un carrito de Mercado Libre
// (las órdenes del mismo pack) o un pedido de Virtual Seller. Lee la vista venta_estadistica (db/ml_ventas.sql: ML,
// los pedidos de los demás canales y el historial de Virtual Seller), sin canceladas — la misma base que el ranking
// de clientes. El monto es lo vendido (precio × cantidad de cada ítem, en pesos de cada momento), sin el envío.
//
// Por razón social: cada canal factura con su razón social (canal.emisor_id); sin una propia, la principal.

import { consulta } from "@/lib/erp/base";
import { hoyArgentina, rangoDeAtajo } from "@/lib/rango-fechas";

export const AGRUPAR = { canal: "Canal", razon: "Razón social" } as const;
export type Agrupar = keyof typeof AGRUPAR;
export const PASOS = { auto: "Automático", dia: "Por día", semana: "Por semana", mes: "Por mes" } as const;
export type Paso = Exclude<keyof typeof PASOS, "auto">;
export const MEDIDAS = { monto: "Monto", pedidos: "Pedidos" } as const;
export type Medida = keyof typeof MEDIDAS;
export const GRAFICOS = { barras: "Barras", lineas: "Líneas" } as const;
export type Grafico = keyof typeof GRAFICOS;

export type FiltroVentas = { desde: string; hasta: string; por: Agrupar; paso: Paso; pasoElegido: keyof typeof PASOS; medida: Medida; grafico: Grafico };
export type Grupo = { clave: string; nombre: string; monto: number; pedidos: number };
export type Punto = { periodo: string; clave: string; monto: number; pedidos: number };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1;

/** El paso automático según el largo del período: hasta 2 meses por día, hasta un año por semana, más por mes. */
export function pasoAuto(desde: string, hasta: string): Paso {
  const n = dias(desde, hasta);
  return n <= 62 ? "dia" : n <= 370 ? "semana" : "mes";
}

export function leerFiltroVentas(sp: Record<string, string | undefined>): FiltroVentas {
  const mes = rangoDeAtajo("mes");
  const desde = FECHA.test(sp.desde ?? "") ? sp.desde! : mes.desde;
  const hasta = FECHA.test(sp.hasta ?? "") ? sp.hasta! : mes.hasta;
  const [d, h] = desde <= hasta ? [desde, hasta] : [hasta, desde];
  const pasoElegido = sp.paso && Object.hasOwn(PASOS, sp.paso) ? (sp.paso as keyof typeof PASOS) : "auto";
  return {
    desde: d, hasta: h, pasoElegido, paso: pasoElegido === "auto" ? pasoAuto(d, h) : pasoElegido,
    por: sp.por === "razon" ? "razon" : "canal",
    medida: sp.medida === "pedidos" ? "pedidos" : "monto",
    grafico: sp.grafico === "lineas" ? "lineas" : "barras",
  };
}

/** Los períodos del rango (AAAA-MM-DD del primer día de cada uno), también los que no tienen ventas. Función pura. */
export function periodos(desde: string, hasta: string, paso: Paso): string[] {
  const out: string[] = [];
  let d = new Date(`${desde}T12:00:00Z`);
  if (paso === "mes") d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
  // La semana empieza el lunes (como date_trunc('week') de la base).
  if (paso === "semana") d = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  const fin = Date.parse(`${hasta}T12:00:00Z`);
  while (d.getTime() <= fin) {
    out.push(d.toISOString().slice(0, 10));
    d = paso === "mes" ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12)) : new Date(d.getTime() + (paso === "semana" ? 7 : 1) * 86_400_000);
  }
  return out;
}

export async function ventasPorCanal(org: string, f: FiltroVentas): Promise<{ grupos: Grupo[]; puntos: Punto[]; periodos: string[]; hoy: string }> {
  const trunc = { dia: "day", semana: "week", mes: "month" }[f.paso];
  const grupo = f.por === "razon"
    ? "coalesce(ca.emisor_id, emisor_principal(e.organizacion_id))::text"
    : "coalesce(e.canal_id::text, 'vs:' || coalesce(e.canal_nombre, ''))";
  const nombre = f.por === "razon"
    ? "coalesce((select em.razon_social from emisor em where em.id = coalesce(ca.emisor_id, emisor_principal(e.organizacion_id))), 'Sin razón social')"
    : "coalesce(ca.nombre, e.canal_nombre, 'Sin canal')";
  const filas = await consulta<{ periodo: string; clave: string; nombre: string; monto: number; pedidos: number; orden: number }>(`
    with v as (
      select to_char(date_trunc('${trunc}', e.fecha at time zone 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') periodo,
             ${grupo} clave, ${nombre} nombre, coalesce(ca.id, 999999)::int orden, e.total,
             coalesce(e.pedido_vs, 'p' || e.pedido_id, 'm' || coalesce(mv.pack_id, e.order_id)) compra
        from venta_estadistica e
        left join canal ca on ca.id = e.canal_id
        left join ml_venta mv on mv.id = e.ml_venta_id
       where e.organizacion_id = $1 and e.estado not in ('cancelled', 'cancelado', 'invalid')
         and e.fecha >= ($2::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'
         and e.fecha < ($3::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
    select periodo, clave, min(nombre) nombre, min(orden)::int orden, coalesce(sum(total), 0)::float8 monto, count(distinct compra)::int pedidos
      from v group by periodo, clave`, [org, f.desde, f.hasta]);
  const porClave = new Map<string, Grupo & { orden: number }>();
  for (const r of filas) {
    const g = porClave.get(r.clave) ?? { clave: r.clave, nombre: r.nombre, monto: 0, pedidos: 0, orden: r.orden };
    g.monto += r.monto; g.pedidos += r.pedidos; g.orden = Math.min(g.orden, r.orden);
    porClave.set(r.clave, g);
  }
  // Orden fijo (el de los canales, o el de la clave): el color de cada grupo no cambia con el período.
  const grupos = [...porClave.values()].sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave)).map(({ orden: _o, ...g }) => g);
  return { grupos, puntos: filas.map((r) => ({ periodo: r.periodo, clave: r.clave, monto: r.monto, pedidos: r.pedidos })), periodos: periodos(f.desde, f.hasta, f.paso), hoy: hoyArgentina() };
}
