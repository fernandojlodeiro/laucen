// Pagos desde la página del pedido: reintentar con Mercado Pago (una
// preferencia nueva) y los datos PÚBLICOS de Payway para el formulario de
// tarjeta. Las llaves privadas y el access token nunca salen del servidor.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { planesDelCarrito } from "@/lib/tienda/cuotas";
import { crearPreferencia } from "@/lib/tienda/pagos/mercadopago";
import { URL_PAYWAY } from "@/lib/tienda/pagos/payway";
import { nombreTienda, rutaTienda, type Tienda } from "@/lib/tienda/tienda";

async function credencial(t: Tienda, tipo: "mercadopago" | "payway") {
  return una<{ id: number; datos: Record<string, string> }>(`
    select m.id::int, c.datos from medio_pago m join medio_pago_credencial c on c.medio_pago_id = m.id
     where m.organizacion_id = $1 and (m.canal_id is null or m.canal_id = $2) and m.tipo = $3 and m.activo order by m.canal_id nulls last limit 1`,
    [t.organizacionId, t.canalId, tipo]);
}

/** Lo que el navegador necesita para tokenizar la tarjeta: la llave pública y la URL del ambiente. */
export async function paywayPublico(t: Tienda): Promise<{ publicKey: string; url: string } | null> {
  const c = await credencial(t, "payway");
  if (!c?.datos?.public_key) return null;
  return { publicKey: c.datos.public_key, url: c.datos.ambiente === "produccion" ? URL_PAYWAY.produccion : URL_PAYWAY.sandbox };
}

/** Una preferencia nueva de Mercado Pago para un pedido que no se pudo pagar. Devuelve la dirección de pago. */
export async function preferenciaNueva(t: Tienda, codigo: string, origen: string): Promise<string> {
  const org = t.organizacionId;
  const p = await una<{ id: number; total_ars: string; estado: string; estado_pago: string; email: string | null; nombre: string | null }>(`
    select p.id::int, p.total_ars, p.estado, p.estado_pago, cl.email, cl.nombre from pedido p left join cliente cl on cl.id = p.cliente_id
     where p.organizacion_id = $1 and p.canal_id = $2 and p.codigo_seguimiento = $3`, [org, t.canalId, codigo]);
  if (!p) throw new ErrorErp("No encontramos el pedido.");
  if (p.estado_pago === "pagado") throw new ErrorErp("El pedido ya está pagado.");
  if (p.estado === "cancelado") throw new ErrorErp("El pedido está cancelado.");
  const cred = await credencial(t, "mercadopago");
  if (!cred?.datos?.access_token) throw new ErrorErp("Mercado Pago no está disponible ahora. Escribinos y lo resolvemos.");
  const vars = await consulta<{ v: number }>("select variacion_id::int v from pedido_linea where pedido_id = $1 and variacion_id is not null", [p.id]);
  const planes = await planesDelCarrito(org, vars.map((x) => x.v));
  const seguir = `${origen}${rutaTienda(t, `/pedido/${codigo}`)}`;
  const pref = await crearPreferencia(cred.datos.access_token, {
    pedidoId: p.id, titulo: `${nombreTienda(t)} — pedido ${p.id}`, total: Number(p.total_ars), email: p.email, nombre: p.nombre,
    maxCuotas: planes.length ? planes[planes.length - 1].cuotas : null,
    exito: seguir, fallo: `${seguir}?pago=fallo`, pendiente: seguir, aviso: `${origen}/api/tienda/mercadopago?medio=${cred.id}`,
  });
  return pref.url;
}
