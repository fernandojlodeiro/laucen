"use server";

// Consulta de stock: los pedidos que tienen reservada una variación (la ventanita del «Res.»).
// Lo reservado por pedido sale de los movimientos con referencia al pedido: reservas − liberaciones −
// ventas (db/stock.sql, mover_stock); quedan los que todavía tienen algo reservado.

import { entrarErp } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";

export type PedidoReserva = {
  id: number; fecha: string; cantidad: number; cliente: string | null; precio: number | null; total: number | null;
  moneda: string; canal: string | null; canal_id: number | null;
};

export async function reservasDeVariacion(variacionId: number): Promise<PedidoReserva[]> {
  const s = await entrarErp("stock_ver");
  return consulta<PedidoReserva>(`
    with r as (
      select m.referencia_id::bigint pedido_id,
             sum(case m.tipo when 'reserva' then m.cantidad else -m.cantidad end)::int cantidad
        from movimiento_stock m
       where m.organizacion_id = $1 and m.variacion_id = $2 and m.referencia_tipo = 'pedido' and m.referencia_id ~ '^\\d+$'
         and m.tipo in ('reserva', 'liberacion', 'venta')
       group by 1
    )
    select p.id::int, to_char(p.fecha at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YY HH24:MI') fecha, r.cantidad,
           coalesce(cl.razon_social, cl.nombre, p.datos_externos #>> '{tienda,contacto,nombre}') cliente,
           -- El precio de la línea de esta variación (o del kit que la lleva).
           (select case when p.moneda = 'USD' then l.precio_unit_usd else l.precio_unit_ars end from pedido_linea l
             where l.pedido_id = p.id and (l.variacion_id = $2 or exists (select 1 from kit_componente k where k.variacion_kit_id = l.variacion_id and k.variacion_componente_id = $2))
             order by (l.variacion_id = $2) desc limit 1)::float8 precio,
           (case when p.moneda = 'USD' then p.total_usd else p.total_ars end)::float8 total, p.moneda, c.nombre canal, c.id::int canal_id
      from r join pedido p on p.id = r.pedido_id and p.organizacion_id = $1
      left join cliente cl on cl.id = p.cliente_id left join canal c on c.id = p.canal_id
     where r.cantidad > 0
     order by p.fecha desc`, [s.org.id, variacionId]);
}
