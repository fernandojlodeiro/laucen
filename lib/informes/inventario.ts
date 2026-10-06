// Informes de inventario (menú Informes): stock valorizado y stock por
// ubicación. La misma consulta sirve a la pantalla y a la descarga en Excel,
// así los dos muestran siempre lo mismo. Un kit no tiene stock propio (está en
// sus componentes), por eso no entra.

import { consulta } from "@/lib/erp/base";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { camposVariacionYProducto } from "@/app/catalogo/busqueda";

type Busqueda = { q: string; comienza: boolean };

/** Lo escrito, para sqlBusqueda (regla común de búsqueda, lib/busqueda.ts). */
export const patron = ({ q, comienza }: Busqueda) => parametroBusqueda(q, comienza);

export const COSTOS = { fob: "Costo FOB", promedio: "Costo promedio (USD)", ultimo: "Último costo (USD)" } as const;
export type BaseCosto = keyof typeof COSTOS;

/** En qué moneda se muestran los importes: cada costo se convierte con el
 *  tipo de cambio de hoy (lib/moneda.ts, `tcDelDia`). "Ambas" duplica cada
 *  columna de importe (pesos y dólares). */
export const MONEDAS = { ars: "Pesos", usd: "Dólares", ambas: "Ambas" } as const;
export type MonedaInforme = keyof typeof MONEDAS;

export type FiltroValorizado = Busqueda & { depositoId: number | null; conStock: boolean; inactivos: boolean; costo: BaseCosto; moneda: MonedaInforme };

export type FilaValorizado = {
  producto_id: number; sku: string; titulo: string; familia: string | null; moneda: string; costo: number | null; stock: number; valorizado: number | null;
  /** El producto está archivado (sólo aparece con "Mostrar inactivos", o si lo buscado no está en ningún activo). */
  inactivo: boolean;
};

/** La fila con el costo y el valorizado en las dos monedas (null = sin costo,
 *  o sin tipo de cambio para pasarlo a la otra moneda). */
export type FilaValorizadoDoble = FilaValorizado & {
  costo_ars: number | null; costo_usd: number | null; valorizado_ars: number | null; valorizado_usd: number | null;
};

export function leerFiltroValorizado(sp: Record<string, string | undefined>): FiltroValorizado {
  return {
    q: sp.q?.trim() ?? "", comienza: sp.contiene !== "1",
    depositoId: Number(sp.dep) || null, conStock: sp.todos !== "1", inactivos: sp.inactivos === "1",
    costo: sp.costo === "promedio" || sp.costo === "ultimo" ? sp.costo : "fob",
    moneda: sp.moneda === "usd" || sp.moneda === "ambas" ? sp.moneda : "ars",
  };
}

/** Regla de inactivos (Fer): con algo escrito y "Mostrar inactivos" apagada, si ningún activo
 *  coincide pero sí inactivos, se muestran los inactivos igual (cada fila dice `inactivo`). */
export async function stockValorizado(org: string, f: FiltroValorizado): Promise<FilaValorizado[]> {
  const filas = await stockValorizadoCon(org, f);
  if (filas.length || !f.q || f.inactivos) return filas;
  return stockValorizadoCon(org, { ...f, inactivos: true });
}

async function stockValorizadoCon(org: string, f: FiltroValorizado): Promise<FilaValorizado[]> {
  const costo = f.costo === "fob" ? "v.costo_fob" : f.costo === "promedio" ? "v.costo_promedio_usd" : "v.costo_ultimo_usd";
  const moneda = f.costo === "fob" ? "v.costo_moneda" : "'USD'";
  return consulta<FilaValorizado>(`
    with s as (
      select st.variacion_id, sum(st.cantidad)::int stock
        from stock st join ubicacion u on u.id = st.ubicacion_id join deposito d on d.id = u.deposito_id
       where st.organizacion_id = $1 and d.estado = 'activo' and ($2::bigint is null or d.id = $2)
       group by st.variacion_id
    )
    select p.id::int producto_id, v.sku, titulo_variacion(v.id) titulo, fa.nombre familia, ${moneda} moneda, ${costo}::float8 costo,
           coalesce(s.stock, 0) stock, round(${costo} * coalesce(s.stock, 0), 2)::float8 valorizado,
           p.estado = 'archivado' inactivo
      from variacion v join producto p on p.id = v.producto_id
      left join familia fa on fa.id = p.familia_id
      left join s on s.variacion_id = v.id
     where v.organizacion_id = $1 and v.estado <> 'archivada' and not es_kit(v.id)
       and ($3 or p.estado <> 'archivado')
       and (not $4 or coalesce(s.stock, 0) <> 0)
       and ${sqlBusqueda("$5", [...camposVariacionYProducto("v", "p"), "fa.nombre"])}
     order by v.sku`, [org, f.depositoId, f.inactivos, f.conStock, patron(f)]);
}

const redondear = (n: number, dec: number) => Math.round(n * 10 ** dec) / 10 ** dec;

/** Pasa cada costo a pesos y a dólares con el tipo de cambio `tc` (pesos por
 *  dólar). Sin tipo de cambio, sólo queda la moneda en que está cargado. */
export function aDobleMoneda(filas: FilaValorizado[], tc: number | null): FilaValorizadoDoble[] {
  return filas.map((r) => {
    const enUsd = r.moneda === "USD";
    const conv = (n: number | null, a: "ARS" | "USD") => {
      if (n == null) return null;
      if ((a === "USD") === enUsd) return n;
      if (!tc) return null;
      return a === "ARS" ? n * tc : n / tc;
    };
    const costo_ars = conv(r.costo, "ARS"), costo_usd = conv(r.costo, "USD");
    return {
      ...r,
      costo_ars: costo_ars == null ? null : redondear(costo_ars, 4),
      costo_usd: costo_usd == null ? null : redondear(costo_usd, 4),
      valorizado_ars: costo_ars == null ? null : redondear(costo_ars * r.stock, 2),
      valorizado_usd: costo_usd == null ? null : redondear(costo_usd * r.stock, 2),
    };
  });
}

/** El total del informe, ya convertido: stock, valorizado en pesos y en
 *  dólares, y cuántos productos no suman (sin costo o sin tipo de cambio). */
export function totalesValorizado(filas: FilaValorizadoDoble[]) {
  const t = { stock: 0, ars: 0, usd: 0, sinCostoArs: 0, sinCostoUsd: 0 };
  for (const r of filas) {
    t.stock += r.stock;
    if (r.valorizado_ars == null) t.sinCostoArs += 1; else t.ars += r.valorizado_ars;
    if (r.valorizado_usd == null) t.sinCostoUsd += 1; else t.usd += r.valorizado_usd;
  }
  return { ...t, ars: redondear(t.ars, 2), usd: redondear(t.usd, 2) };
}

export type FiltroUbicacion = Busqueda & { depositoId: number | null; ubicacionId: number | null };

export type FilaUbicacion = {
  producto_id: number; ubicacion_id: number; deposito: string; ubicacion: string; descripcion: string | null; sku: string; titulo: string; cantidad: number; reservado: number;
};

export function leerFiltroUbicacion(sp: Record<string, string | undefined>): FiltroUbicacion {
  return { q: sp.q?.trim() ?? "", comienza: sp.contiene !== "1", depositoId: Number(sp.dep) || null, ubicacionId: Number(sp.u) || null };
}

export async function stockPorUbicacion(org: string, f: FiltroUbicacion): Promise<FilaUbicacion[]> {
  return consulta<FilaUbicacion>(`
    select p.id::int producto_id, u.id::int ubicacion_id, d.nombre deposito, case when u.es_default then 'General' else u.codigo end ubicacion, u.descripcion,
           v.sku, titulo_variacion(v.id) titulo, st.cantidad, st.reservado
      from stock st
      join ubicacion u on u.id = st.ubicacion_id join deposito d on d.id = u.deposito_id
      join variacion v on v.id = st.variacion_id join producto p on p.id = v.producto_id
     where st.organizacion_id = $1 and d.estado = 'activo' and (st.cantidad <> 0 or st.reservado <> 0)
       and ($2::bigint is null or d.id = $2) and ($3::bigint is null or u.id = $3)
       and ${sqlBusqueda("$4", [...camposVariacionYProducto("v", "p"), "d.nombre", "u.codigo", "u.descripcion"])}
     order by d.nombre, u.es_default desc, u.orden_recorrido, u.codigo, v.sku`, [org, f.depositoId, f.ubicacionId, patron(f)]);
}

/** Depósitos activos y sus ubicaciones, para los filtros. */
export async function depositosYUbicaciones(org: string) {
  const [depositos, ubicaciones] = await Promise.all([
    consulta<{ id: number; nombre: string }>("select id::int, nombre from deposito where organizacion_id = $1 and estado = 'activo' order by nombre", [org]),
    consulta<{ id: number; deposito_id: number; deposito: string; codigo: string; descripcion: string | null }>(`
      select u.id::int, d.id::int deposito_id, d.nombre deposito, case when u.es_default then 'General' else u.codigo end codigo, u.descripcion
        from ubicacion u join deposito d on d.id = u.deposito_id
       where u.organizacion_id = $1 and d.estado = 'activo' and u.estado = 'activa' and (u.es_default or d.usa_ubicaciones)
       order by d.nombre, u.es_default desc, u.orden_recorrido, u.codigo`, [org]),
  ]);
  return { depositos, ubicaciones };
}
