// Entregas en el local (Fer, 29/10): en el celular, los pedidos que ya están preparados y los vienen a buscar —de la
// tienda web o de Mercado Libre sin envío—, con un buscador por número de pedido o cliente. Al tocar uno, «Sacar foto
// del conforme»: la foto del remito de entrega firmado queda en el pedido (como el conforme de retiro de su ficha) y, si
// ya está cobrado, el pedido queda entregado (como «Cliente presente: retira»).

import { entrarErp, Pantalla } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { sqlACobrar } from "@/lib/pedidos";
import Entregas, { type PedidoAEntregar } from "./Entregas";

export const dynamic = "force-dynamic";

/** SQL (alias `p`, `ca` canal, `me` método de envío, `e` el envío): lo que se retira en el local. */
const SQL_RETIRA = `(coalesce(p.envio ->> 'metodo' = 'Retira', false) or me.tipo = 'retiro'
  or (ca.tipo = 'mercadolibre' and e.logistica is null and coalesce((p.envio ->> 'sin_envio')::boolean, false)))`;

export default async function EntregasEnElLocal() {
  const s = await entrarErp("picking_ver");
  const pedidos = await consulta<PedidoAEntregar>(`
    select p.id::int, p.id_externo, ca.nombre canal, cl.nombre cliente, ${sqlACobrar("p")} a_cobrar, p.total_ars::float total_ars,
           to_char(p.fecha at time zone 'America/Argentina/Buenos_Aires', 'DD/MM') fecha,
           coalesce((select json_agg(concat(l.cantidad::int, ' × ', coalesce(nullif(l.titulo, ''), l.sku)) order by l.orden, l.id)
                       from pedido_linea l where l.pedido_id = p.id and l.variacion_id is not null), '[]') productos,
           exists (select 1 from pedido_conforme_retiro r where r.pedido_id = p.id) con_conforme
      from pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
      left join metodo_envio me on me.id = p.metodo_envio_id
      left join lateral (select logistica from envio where pedido_id = p.id and coalesce(estado, '') <> 'cancelled' order by id desc limit 1) e on true
     where p.organizacion_id = $1 and p.estado = 'preparado' and ${SQL_RETIRA}
     order by p.fecha`, [s.org.id]);
  return (
    <Pantalla titulo="Entregas en el local" subtitulo="Los pedidos preparados que vienen a buscar: sacale una foto al remito de entrega firmado" ancho="max-w-2xl">
      <Entregas orgId={s.org.id} pedidos={pedidos} />
    </Pantalla>
  );
}
