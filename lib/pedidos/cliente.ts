// Cambiar el cliente de un pedido (Fer, 25/10: el 150420 se cargó con la razón
// social propia y ARCA rechazó la factura). Vale para cualquier pedido no
// cancelado, también los de Mercado Libre, pagado o no:
//   - sin factura: se cambia y se factura con el cliente nuevo;
//   - con factura vigente: después del cambio va «Refacturar» (nota de crédito
//     idéntica y factura nueva con el cliente nuevo; eso lo hace la acción).
// Queda registro: el cliente original (con sus datos fiscales de ese momento y
// el contacto que escribió el comprador en la tienda) en
// datos_externos.cliente_original —sólo el primero, los cambios siguientes no
// lo pisan— y una línea por cambio en el historial del pedido.
// Frenos: un pedido que ya entró en la cuenta corriente de alguien (se
// destrabará cuando haga falta) y una factura que quedó a medio camino
// (pendiente o con error: se reintenta tal cual, con el cliente viejo).

import { una, enTransaccion, ErrorErp } from "@/lib/erp/base";

/** ¿Se puede cambiar el cliente? null = sí; si no, el motivo. */
export async function motivoNoCambiaCliente(org: string, pid: number): Promise<string | null> {
  const p = await una<{ estado: string; cc: boolean; a_medias: boolean }>(`
    select p.estado,
           exists (select 1 from cc_movimiento m where m.organizacion_id = p.organizacion_id
                     and ((m.referencia_tipo = 'pedido' and m.referencia_id = p.id)
                       or (m.referencia_tipo = 'comprobante' and m.referencia_id in (select id from comprobante where pedido_id = p.id)))) cc,
           exists (select 1 from comprobante cb where cb.pedido_id = p.id and cb.estado in ('pendiente', 'error')) a_medias
      from pedido p where p.id = $1 and p.organizacion_id = $2`, [pid, org]);
  if (!p) return "El pedido no existe.";
  if (p.estado === "cancelado") return "El pedido está cancelado.";
  if (p.cc) return "Este pedido ya está en una cuenta corriente: por ahora el cliente no se cambia.";
  if (p.a_medias) return "Hay una factura que quedó a medio salir: terminala con «Facturar» y después cambiá el cliente.";
  return null;
}

export type CambioCliente = { anterior: string | null; nuevo: string; facturado: boolean };

export async function cambiarClientePedido(org: string, pid: number, clienteId: number, quien: string): Promise<CambioCliente> {
  const motivo = await motivoNoCambiaCliente(org, pid);
  if (motivo) throw new ErrorErp(motivo);
  const nuevo = await una<{ nombre: string }>("select coalesce(razon_social, nombre) nombre from cliente where id = $1 and organizacion_id = $2", [clienteId, org]);
  if (!nuevo) throw new ErrorErp("El cliente no existe.");

  return enTransaccion(async (c) => {
    const p = (await c.query<{ estado: string; cliente_id: string | null; anterior: string | null; original: unknown; facturado: boolean }>(`
      select p.estado, p.cliente_id, coalesce(cl.razon_social, cl.nombre) anterior, p.datos_externos -> 'cliente_original' original,
             exists (select 1 from comprobante cb where cb.pedido_id = p.id and cb.tipo_cbte in (1, 6, 11) and cb.estado = 'autorizado'
                       and not exists (select 1 from comprobante nc where nc.comprobante_asociado_id = cb.id and nc.estado = 'autorizado')) facturado
        from pedido p left join cliente cl on cl.id = p.cliente_id where p.id = $1 and p.organizacion_id = $2 for update of p`, [pid, org])).rows[0];
    if (!p) throw new ErrorErp("El pedido no existe.");
    if (Number(p.cliente_id) === clienteId) throw new ErrorErp("Ése ya es el cliente del pedido.");
    // El original, una sola vez: el cliente con sus datos de hoy y lo que escribió el comprador en la tienda.
    await c.query(`
      update pedido p set cliente_id = $3,
             datos_externos = case when coalesce(p.datos_externos, '{}'::jsonb) ? 'cliente_original' then p.datos_externos
               else coalesce(p.datos_externos, '{}'::jsonb) || jsonb_build_object('cliente_original', jsonb_strip_nulls(jsonb_build_object(
                 'id', cl.id, 'nombre', cl.nombre, 'razon_social', cl.razon_social, 'cuit', cl.cuit,
                 'documento', nullif(concat_ws(' ', cl.documento_tipo, cl.documento_numero), ''), 'condicion_iva', cl.condicion_iva,
                 'email', cl.email, 'contacto', p.datos_externos #> '{tienda,contacto}', 'cambiado_ts', now(), 'cambiado_por', $4::text))) end
        from pedido p0 left join cliente cl on cl.id = p0.cliente_id
       where p.id = $1 and p.organizacion_id = $2 and p0.id = p.id`, [pid, org, clienteId, quien]);
    // El contacto de la tienda era de quien compró: con otro cliente, los avisos y la factura van a los datos del nuevo.
    await c.query("update pedido set datos_externos = datos_externos #- '{tienda,contacto}' where id = $1", [pid]);
    await c.query(`insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota)
                   values ($1, $2, $3, $3, $4, $5)`,
      [org, pid, p.estado, quien, `Cliente cambiado: ${p.anterior ?? "consumidor final"} → ${nuevo.nombre}`]);
    return { anterior: p.anterior, nuevo: nuevo.nombre, facturado: p.facturado };
  });
}
