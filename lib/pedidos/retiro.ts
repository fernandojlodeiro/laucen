// «Cliente presente: retira» (Fer, 7/10): el cliente vino al local a buscar su
// pedido. En un solo paso: si se cobra al retirar («A cobrar»), se confirma el
// cobro con el medio que dijo (a cuenta corriente no se cobra); el pedido queda entregado (el stock sale como
// vendido); y si todavía no tiene factura, se factura en el momento. Si la
// factura falla, el pedido queda entregado igual y se avisa (se reintenta
// desde la factura).

import { una, ErrorErp } from "@/lib/erp/base";
import { cambiarEstado } from "@/lib/pedidos";
import { entregarYCobrar } from "@/lib/tienda/pagos/confirmar";
import { prepararFactura, emitir } from "@/lib/arca/facturar";
import { encolar } from "@/lib/mercadolibre/cola";

export async function clientePresenteRetira(org: string, pedidoId: number, quien: string, medio: string | null): Promise<{ hecho: string[]; fallo: string[] }> {
  const p = await una<{ estado: string; estado_pago: string }>("select estado, estado_pago from pedido where id = $1 and organizacion_id = $2", [pedidoId, org]);
  if (!p) throw new ErrorErp("El pedido no existe.");
  if (p.estado !== "preparado") throw new ErrorErp("Primero preparalo: el cliente retira un pedido preparado.");
  const hecho: string[] = [], fallo: string[] = [];
  if (p.estado_pago === "a_convenir") {
    // A cuenta corriente: no se cobra ahora; se entrega y la factura lo carga a su cuenta.
    await cambiarEstado(org, pedidoId, "entregado", quien, "cliente presente: retiró (a cuenta corriente)");
    hecho.push("entregado a cuenta corriente");
  } else if (p.estado_pago !== "pagado") {
    if (!medio) throw new ErrorErp("Elegí con qué pagó.");
    await entregarYCobrar(org, pedidoId, medio, quien);
    hecho.push("cobrado y entregado");
  } else {
    await cambiarEstado(org, pedidoId, "entregado", quien, "cliente presente: retiró");
    hecho.push("entregado");
  }
  const facturado = await una("select 1 from comprobante where pedido_id = $1 and organizacion_id = $2 and tipo_cbte in (1, 6, 11) and estado in ('autorizado', 'pendiente')", [pedidoId, org]);
  if (facturado) return { hecho, fallo };
  try {
    const id = await prepararFactura(org, pedidoId, quien);
    const r = await emitir(org, id);
    if (r.estado === "autorizado") {
      const n = await una<{ texto: string }>(`select (case tipo_cbte when 1 then 'Factura A ' when 6 then 'Factura B ' else 'Factura C ' end)
        || lpad(punto_venta::text, 5, '0') || '-' || lpad(numero::text, 8, '0') texto from comprobante where id = $1`, [id]);
      hecho.push(`${n?.texto ?? "factura"} emitida`);
    } else fallo.push(`Factura: ${r.mensaje}`);
  } catch (e) {
    fallo.push(`Factura: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { hecho, fallo };
}

/** Una venta de Mercado Libre sin envío que el comprador retiró en el local (Fer, 22/10). Queda
 *  entregada; si todavía no tiene factura, se revisa lo que escribió el comprador y se factura (al
 *  autorizarse se sube sola a Mercado Libre); y se le avisa a Mercado Libre que la venta se concretó
 *  (POST /orders/{id}/feedback con fulfilled: true, por la cola, una por orden del carrito): así la
 *  venta pasa a «entregada» en Mercado Libre y al comprador le piden que lo confirme. */
export async function clientePresenteRetiraMl(org: string, pedidoId: number, quien: string): Promise<{ hecho: string[]; fallo: string[] }> {
  const p = await una<{ estado: string; canal_id: number; id_externo: string | null; ordenes: Record<string, { status?: string }> | null; retira: boolean }>(`
    select p.estado, p.canal_id::int, p.id_externo, p.datos_externos #> '{ml,ordenes}' ordenes, ${SQL_ML_RETIRA} retira
      from pedido p join canal ca on ca.id = p.canal_id where p.id = $1 and p.organizacion_id = $2 and ca.tipo = 'mercadolibre'`, [pedidoId, org]);
  if (!p) throw new ErrorErp("El pedido no existe o no es de Mercado Libre.");
  if (!p.retira) throw new ErrorErp("Esta venta de Mercado Libre tiene envío: se entrega por el envío, no en el local.");
  if (p.estado !== "preparado") throw new ErrorErp("Primero preparalo: el cliente retira un pedido preparado.");
  const hecho: string[] = [], fallo: string[] = [];
  await cambiarEstado(org, pedidoId, "entregado", quien, "cliente presente: retiró en el local");
  hecho.push("entregado");

  const facturado = await una("select 1 from comprobante where pedido_id = $1 and organizacion_id = $2 and tipo_cbte in (1, 6, 11) and estado in ('autorizado', 'pendiente')", [pedidoId, org]);
  if (!facturado) {
    try {
      // Como la facturación automática: antes, lo que pidió el comprador para la factura (con duda, no se factura).
      const { revisarPedido } = await import("@/lib/facturacion/revision");
      const rev = await revisarPedido(org, pedidoId);
      if (rev.retenida) fallo.push("Factura retenida: mirá lo que pidió el comprador en el pedido");
      else {
        const id = await prepararFactura(org, pedidoId, quien);
        const r = await emitir(org, id);
        if (r.estado === "autorizado") hecho.push("factura emitida y enviada a Mercado Libre");
        else fallo.push(`Factura: ${r.mensaje}`);
      }
    } catch (e) {
      fallo.push(`Factura: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Las órdenes del carrito que siguen en pie (o la orden sola).
  const ordenes = p.ordenes && Object.keys(p.ordenes).length
    ? Object.entries(p.ordenes).filter(([, o]) => o?.status !== "cancelled" && o?.status !== "invalid").map(([id]) => id)
    : p.id_externo ? [p.id_externo] : [];
  if (!ordenes.length) fallo.push("Mercado Libre: no se encontró el número de orden para avisar la entrega");
  else {
    await encolar(org, ordenes.map((o) => ({
      canalId: p.canal_id, itemId: `orden ${o}`, tipo: "otro" as const,
      payload: {
        descripcion: `Venta concretada: el comprador retiró la orden ${o} en el local (pedido ${pedidoId})`,
        pedidos: [{ metodo: "POST", ruta: `/orders/${o}/feedback`, cuerpo: { fulfilled: true, rating: "positive", message: "¡Gracias por tu compra! Retiraste tu pedido en el local." } }],
      },
    })), { origen: "boton", usuarioId: quien });
    hecho.push("avisado a Mercado Libre que lo retiró");
  }
  return { hecho, fallo };
}

/** SQL (pedido `p`, canal `ca`): venta de Mercado Libre sin envío, la que retira en el local (como el picking, lib/deposito/picking.ts). */
export const SQL_ML_RETIRA = `(ca.tipo = 'mercadolibre' and coalesce((p.envio ->> 'sin_envio')::boolean, false)
  and (select e.logistica from envio e where e.pedido_id = p.id and coalesce(e.estado, '') <> 'cancelled' order by e.id desc limit 1) is null)`;
