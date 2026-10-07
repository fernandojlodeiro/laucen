// Editar un pedido o un presupuesto (Fer, 7/10): el lápiz de la ficha.
//   - Un presupuesto se edita siempre (mientras no esté cancelado).
//   - Un pedido, sólo si todavía no se tocó: no es de Mercado Libre, no está
//     pagado, está Nuevo o A preparar (cuenta corriente), no entró en picking y
//     no tiene factura. Si está pagado, no se edita.
// Al grabar se cambian el cliente, la moneda, la lista, la entrega, el envío,
// las notas y las líneas. Las líneas se reemplazan con quitarLineas +
// agregarLineas (lib/pedidos), así la reserva de stock sigue sola: lo que se
// saca se libera y lo que se suma se reserva (si el pedido ya reservaba).

import { una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { agregarLineas, quitarLineas, type LineaEntrada } from "@/lib/pedidos";
import { convertir, type Moneda } from "@/lib/moneda";
import { avisarStockMl } from "@/lib/tienda/pagos/confirmar";

/** ¿Se puede editar? null = sí; si no, el motivo. */
export async function motivoNoEditable(org: string, pedidoId: number): Promise<string | null> {
  const p = await una<{ estado: string; estado_pago: string; canal_tipo: string; picking: boolean; factura: boolean }>(`
    select p.estado, p.estado_pago, c.tipo canal_tipo,
           exists (select 1 from picking_pedido pp where pp.pedido_id = p.id) picking,
           exists (select 1 from comprobante cb where cb.pedido_id = p.id and cb.estado in ('autorizado', 'pendiente')) factura
      from pedido p join canal c on c.id = p.canal_id where p.id = $1 and p.organizacion_id = $2`, [pedidoId, org]);
  if (!p) return "El pedido no existe.";
  if (p.estado === "presupuesto") return null;
  if (p.canal_tipo === "mercadolibre") return "Las ventas de Mercado Libre no se editan.";
  if (!["nuevo", "pagado"].includes(p.estado)) return "Ya está en preparación o más adelante: no se edita.";
  if (p.estado_pago === "pagado") return "Ya está pagado: no se edita.";
  if (p.picking) return "Ya entró en un lote de picking: no se edita.";
  if (p.factura) return "Ya tiene factura: no se edita.";
  return null;
}

export type Edicion = {
  clienteId: number | null;
  lineas: LineaEntrada[];
  moneda: Moneda | null;
  listaId: number | null;
  entrega: "retiro" | "envio";
  direccion: Record<string, string | null> | null;
  costoEnvio: number | null;
  notas: string | null;
  vigencia: string | null;
};

export async function editarPedido(org: string, pedidoId: number, quien: string, e: Edicion): Promise<void> {
  const motivo = await motivoNoEditable(org, pedidoId);
  if (motivo) throw new ErrorErp(motivo);
  if (!e.lineas.length) throw new ErrorErp("Dejale al menos un producto.");
  if (e.entrega === "envio" && (!e.direccion?.calle || !e.direccion?.localidad)) throw new ErrorErp("Para el envío completá al menos la calle y la localidad.");
  if (e.clienteId && !(await una("select 1 from cliente where id = $1 and organizacion_id = $2", [e.clienteId, org]))) throw new ErrorErp("El cliente no existe.");
  if (e.listaId && !(await una("select 1 from lista_precios where id = $1 and organizacion_id = $2", [e.listaId, org]))) throw new ErrorErp("Esa lista de precios no existe.");
  if (e.vigencia && !/^\d{4}-\d{2}-\d{2}$/.test(e.vigencia)) throw new ErrorErp("La fecha de vigencia no es válida.");

  await enTransaccion(async (c) => {
    const p = (await c.query<{ estado: string; moneda: Moneda; envio: Record<string, unknown> | null; fecha: string }>(`
      select estado, moneda, envio, to_char(fecha at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') fecha
        from pedido where id = $1 and organizacion_id = $2 for update`, [pedidoId, org])).rows[0];
    if (!p) throw new ErrorErp("El pedido no existe.");
    const moneda: Moneda = e.moneda ?? p.moneda;
    // La entrega: se respeta lo que traía (ej. el método de la tienda); se cambia retira/envío y la dirección.
    const viejo = (p.envio ?? {}) as Record<string, unknown>;
    const metodoViejo = typeof viejo.metodo === "string" ? viejo.metodo : null;
    const envio = e.entrega === "envio"
      ? { ...viejo, metodo: metodoViejo && metodoViejo !== "Retira" ? metodoViejo : "Envío", direccion: e.direccion }
      : { ...viejo, metodo: "Retira", direccion: null };
    const costo = e.entrega === "envio" ? Math.max(0, e.costoEnvio ?? 0) : 0;
    const otro = costo ? await convertir(org, costo, moneda, moneda === "ARS" ? "USD" : "ARS", p.fecha, c) : 0;
    const [envioArs, envioUsd] = moneda === "ARS" ? [costo, otro] : [otro, costo];
    await c.query(`update pedido set cliente_id = $3, moneda = $4, lista_precios_id = coalesce($5, lista_precios_id), envio = $6::jsonb,
                          costo_envio_ars = $7, notas = $8, vigencia = case when estado = 'presupuesto' then coalesce($9::date, vigencia) else vigencia end
                    where id = $1 and organizacion_id = $2`,
      [pedidoId, org, e.clienteId, moneda, e.listaId, JSON.stringify(envio), envioArs, e.notas, e.vigencia]);
    // Las líneas: se sacan todas (libera lo reservado) y se ponen las nuevas (reserva si corresponde).
    const viejas = (await c.query<{ id: string }>("select id from pedido_linea where pedido_id = $1", [pedidoId])).rows.map((x) => Number(x.id));
    await quitarLineas(org, pedidoId, viejas, quien, c, "edición del pedido");
    await agregarLineas(org, pedidoId, e.lineas, quien, c, { nota: "pedido editado" });
    // El total: las líneas más el envío, en las dos monedas.
    await c.query(`update pedido set
                     total_ars = coalesce((select sum(precio_unit_ars * cantidad) from pedido_linea where pedido_id = $1), 0) + $2,
                     total_usd = coalesce((select sum(precio_unit_usd * cantidad) from pedido_linea where pedido_id = $1), 0) + $3
                   where id = $1`, [pedidoId, envioArs, envioUsd]);
  });
  await avisarStockMl(org, pedidoId);
}
