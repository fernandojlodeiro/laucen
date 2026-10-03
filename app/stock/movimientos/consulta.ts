// Movimientos de stock con filtros: la misma consulta sirve a la pantalla
// (de a 50, los más nuevos primero) y a la descarga en Excel (todos).

import { consulta } from "@/lib/erp/base";
import { TIPOS_MOVIMIENTO, type TipoMovimiento } from "@/lib/stock";

export const POR_PAGINA = 50;
/** Tope de filas del Excel (para no colgar el servidor con años de historia). */
export const TOPE_EXCEL = 50000;

export type FiltroMovimientos = {
  q: string; comienza: boolean; variacionId: number | null; desde: string | null; hasta: string | null;
  tipo: TipoMovimiento | null; usuario: string | null; depositoId: number | null; p: number;
};

export type FilaMovimiento = {
  id: number; fecha: string; tipo: TipoMovimiento; producto_id: number; sku: string; titulo: string; kit_sku: string | null;
  origen: string | null; destino: string | null; cantidad: number;
  referencia_tipo: string | null; referencia_id: string | null; nota: string | null; usuario: string | null;
};

const esFecha = (x: string | undefined) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);

export function leerFiltroMovimientos(sp: Record<string, string | undefined>): FiltroMovimientos {
  return {
    q: sp.q?.trim() ?? "", comienza: sp.contiene !== "1", variacionId: Number(sp.v) || null,
    desde: esFecha(sp.desde), hasta: esFecha(sp.hasta),
    tipo: sp.tipo && Object.hasOwn(TIPOS_MOVIMIENTO, sp.tipo) ? (sp.tipo as TipoMovimiento) : null,
    usuario: sp.usuario?.trim() || null, depositoId: Number(sp.dep) || null,
    p: Math.max(1, Math.floor(Number(sp.p)) || 1),
  };
}

/** Los parámetros de la dirección que representan el filtro (sin la página). */
export function parametrosMovimientos(f: FiltroMovimientos) {
  return {
    q: f.q || null, contiene: f.comienza ? null : "1", v: f.variacionId, desde: f.desde, hasta: f.hasta,
    tipo: f.tipo, usuario: f.usuario, dep: f.depositoId,
  };
}

/** Los movimientos que pasan el filtro. `limite`/`desplazamiento` para paginar.
 *  Las fechas se toman en hora argentina, "hasta" inclusive. */
export async function movimientos(org: string, f: FiltroMovimientos, limite: number, desplazamiento = 0): Promise<FilaMovimiento[]> {
  const patron = f.q ? `${f.comienza ? "" : "%"}${f.q.replace(/[\\%_]/g, "\\$&")}%` : null;
  return consulta<FilaMovimiento>(`
    select m.id::int, to_char(m.fecha at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YY HH24:MI') fecha, m.tipo,
           p.id::int producto_id, v.sku, titulo_variacion(v.id) titulo, k.sku kit_sku,
           (select d.nombre || ' · ' || case when u.es_default then 'General' else u.codigo end from ubicacion u join deposito d on d.id = u.deposito_id where u.id = m.ubicacion_origen_id) origen,
           (select d.nombre || ' · ' || case when u.es_default then 'General' else u.codigo end from ubicacion u join deposito d on d.id = u.deposito_id where u.id = m.ubicacion_destino_id) destino,
           m.cantidad, m.referencia_tipo, m.referencia_id, m.nota,
           case when m.usuario_id = 'sistema' then 'Sistema' else coalesce(us.nombre, us.email) end usuario
      from movimiento_stock m
      join variacion v on v.id = m.variacion_id
      join producto p on p.id = v.producto_id
      left join variacion k on k.id = m.kit_variacion_id
      left join usuarios us on us.id = m.usuario_id
     where m.organizacion_id = $1
       and ($2::bigint is null or m.variacion_id = $2 or m.kit_variacion_id = $2)
       and ($3::text is null or v.sku ilike $3 or p.titulo ilike $3 or v.titulo ilike $3 or k.sku ilike $3)
       and ($4::date is null or m.fecha >= ($4::date)::timestamp at time zone 'America/Argentina/Buenos_Aires')
       and ($5::date is null or m.fecha < ($5::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
       and ($6::text is null or m.tipo = $6)
       and ($7::text is null or m.usuario_id = $7)
       and ($8::bigint is null or exists (select 1 from ubicacion u where u.deposito_id = $8 and u.id in (m.ubicacion_origen_id, m.ubicacion_destino_id)))
     order by m.fecha desc, m.id desc
     limit ${Math.trunc(limite)} offset ${Math.trunc(desplazamiento)}`,
    [org, f.variacionId, patron, f.desde, f.hasta, f.tipo, f.usuario, f.depositoId]);
}

/** Para los desplegables: depósitos, quienes movieron stock y, si viene ?v=, esa variación. */
export async function opcionesMovimientos(org: string, variacionId: number | null) {
  const [depositos, usuarios, variacion] = await Promise.all([
    consulta<{ id: number; nombre: string }>("select id::int, nombre from deposito where organizacion_id = $1 order by estado, nombre", [org]),
    consulta<{ id: string; nombre: string }>(`
      select x.usuario_id id, case when x.usuario_id = 'sistema' then 'Sistema' else coalesce(us.nombre, us.email, x.usuario_id) end nombre
        from (select distinct usuario_id from movimiento_stock where organizacion_id = $1 and usuario_id is not null) x
        left join usuarios us on us.id = x.usuario_id order by 2`, [org]),
    variacionId
      ? consulta<{ sku: string; titulo: string }>("select v.sku, titulo_variacion(v.id) titulo from variacion v where v.id = $2 and v.organizacion_id = $1", [org, variacionId])
      : Promise.resolve([]),
  ]);
  return { depositos, usuarios, variacion: variacion[0] ?? null };
}

/** "venta #123" a partir de la referencia del movimiento. */
export const referencia = (m: Pick<FilaMovimiento, "referencia_tipo" | "referencia_id">) =>
  m.referencia_tipo ? `${m.referencia_tipo.replace(/_/g, " ")}${m.referencia_id ? ` #${m.referencia_id}` : ""}` : null;
