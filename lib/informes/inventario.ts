// Informes de inventario (menú Informes): stock valorizado y stock por
// ubicación. La misma consulta sirve a la pantalla y a la descarga en Excel,
// así los dos muestran siempre lo mismo. Un kit no tiene stock propio (está en
// sus componentes), por eso no entra.

import { consulta } from "@/lib/erp/base";

type Busqueda = { q: string; comienza: boolean };

/** Patrón ILIKE: al principio del texto ("Comienza por") o en cualquier parte. */
export const patron = ({ q, comienza }: Busqueda) => (q ? `${comienza ? "" : "%"}${q.replace(/[\\%_]/g, "\\$&")}%` : null);

export const COSTOS = { fob: "Costo FOB", promedio: "Costo promedio (USD)", ultimo: "Último costo (USD)" } as const;
export type BaseCosto = keyof typeof COSTOS;

export type FiltroValorizado = Busqueda & { depositoId: number | null; conStock: boolean; inactivos: boolean; costo: BaseCosto };

export type FilaValorizado = {
  sku: string; titulo: string; familia: string | null; moneda: string; costo: number | null; stock: number; valorizado: number | null;
};

export function leerFiltroValorizado(sp: Record<string, string | undefined>): FiltroValorizado {
  return {
    q: sp.q?.trim() ?? "", comienza: sp.contiene !== "1",
    depositoId: Number(sp.dep) || null, conStock: sp.todos !== "1", inactivos: sp.inactivos === "1",
    costo: sp.costo === "promedio" || sp.costo === "ultimo" ? sp.costo : "fob",
  };
}

export async function stockValorizado(org: string, f: FiltroValorizado): Promise<FilaValorizado[]> {
  const costo = f.costo === "fob" ? "v.costo_fob" : f.costo === "promedio" ? "v.costo_promedio_usd" : "v.costo_ultimo_usd";
  const moneda = f.costo === "fob" ? "v.costo_moneda" : "'USD'";
  return consulta<FilaValorizado>(`
    with s as (
      select st.variacion_id, sum(st.cantidad)::int stock
        from stock st join ubicacion u on u.id = st.ubicacion_id join deposito d on d.id = u.deposito_id
       where st.organizacion_id = $1 and d.estado = 'activo' and ($2::bigint is null or d.id = $2)
       group by st.variacion_id
    )
    select v.sku, titulo_variacion(v.id) titulo, fa.nombre familia, ${moneda} moneda, ${costo}::float8 costo,
           coalesce(s.stock, 0) stock, round(${costo} * coalesce(s.stock, 0), 2)::float8 valorizado
      from variacion v join producto p on p.id = v.producto_id
      left join familia fa on fa.id = p.familia_id
      left join s on s.variacion_id = v.id
     where v.organizacion_id = $1 and v.estado <> 'archivada' and not es_kit(v.id)
       and ($3 or p.estado <> 'archivado')
       and (not $4 or coalesce(s.stock, 0) <> 0)
       and ($5::text is null or v.sku ilike $5 or p.titulo ilike $5 or v.titulo ilike $5)
     order by v.sku`, [org, f.depositoId, f.inactivos, f.conStock, patron(f)]);
}

/** Totales por moneda (un producto puede tener el costo en pesos y otro en dólares). */
export function totalesValorizado(filas: FilaValorizado[]) {
  const t = new Map<string, { stock: number; valorizado: number; sinCosto: number }>();
  for (const r of filas) {
    const x = t.get(r.moneda) ?? { stock: 0, valorizado: 0, sinCosto: 0 };
    x.stock += r.stock;
    if (r.costo == null) x.sinCosto += 1; else x.valorizado += r.valorizado ?? 0;
    t.set(r.moneda, x);
  }
  return [...t.entries()].map(([moneda, x]) => ({ moneda, ...x }));
}

export type FiltroUbicacion = Busqueda & { depositoId: number | null; ubicacionId: number | null };

export type FilaUbicacion = {
  ubicacion_id: number; deposito: string; ubicacion: string; descripcion: string | null; sku: string; titulo: string; cantidad: number; reservado: number;
};

export function leerFiltroUbicacion(sp: Record<string, string | undefined>): FiltroUbicacion {
  return { q: sp.q?.trim() ?? "", comienza: sp.contiene !== "1", depositoId: Number(sp.dep) || null, ubicacionId: Number(sp.u) || null };
}

export async function stockPorUbicacion(org: string, f: FiltroUbicacion): Promise<FilaUbicacion[]> {
  return consulta<FilaUbicacion>(`
    select u.id::int ubicacion_id, d.nombre deposito, case when u.es_default then 'General' else u.codigo end ubicacion, u.descripcion,
           v.sku, titulo_variacion(v.id) titulo, st.cantidad, st.reservado
      from stock st
      join ubicacion u on u.id = st.ubicacion_id join deposito d on d.id = u.deposito_id
      join variacion v on v.id = st.variacion_id join producto p on p.id = v.producto_id
     where st.organizacion_id = $1 and d.estado = 'activo' and (st.cantidad <> 0 or st.reservado <> 0)
       and ($2::bigint is null or d.id = $2) and ($3::bigint is null or u.id = $3)
       and ($4::text is null or v.sku ilike $4 or p.titulo ilike $4 or v.titulo ilike $4)
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
