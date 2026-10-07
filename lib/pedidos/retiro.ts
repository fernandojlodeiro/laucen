// «Cliente presente: retira» (Fer, 7/10): el cliente vino al local a buscar su
// pedido. En un solo paso: si se cobra al retirar («A cobrar»), se confirma el
// cobro con el medio que dijo; el pedido queda entregado (el stock sale como
// vendido); y si todavía no tiene factura, se factura en el momento. Si la
// factura falla, el pedido queda entregado igual y se avisa (se reintenta
// desde la factura).

import { una, ErrorErp } from "@/lib/erp/base";
import { cambiarEstado } from "@/lib/pedidos";
import { entregarYCobrar } from "@/lib/tienda/pagos/confirmar";
import { prepararFactura, emitir } from "@/lib/arca/facturar";

export async function clientePresenteRetira(org: string, pedidoId: number, quien: string, medio: string | null): Promise<{ hecho: string[]; fallo: string[] }> {
  const p = await una<{ estado: string; estado_pago: string }>("select estado, estado_pago from pedido where id = $1 and organizacion_id = $2", [pedidoId, org]);
  if (!p) throw new ErrorErp("El pedido no existe.");
  if (p.estado !== "preparado") throw new ErrorErp("Primero preparalo: el cliente retira un pedido preparado.");
  const hecho: string[] = [], fallo: string[] = [];
  if (p.estado_pago !== "pagado") {
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
