// POST /api/pedidos — endpoint único para crear pedidos (orden 136, §8.3).
// Lo usan el carrito minorista, la planilla mayorista, los pedidos por
// WhatsApp y la sincronización de Mercado Libre. Autenticación: token del
// canal (lib/api/canal.ts). El contrato está en la bitácora (hilo 136).
//
// Cuerpo:
// { "canal": 3 (opcional; si viene tiene que ser el del token),
//   "id_externo": "2000001234" (opcional; repetir no duplica),
//   "cliente": { "id_externo", "nombre", "razon_social", "nombre_pila", "apellido", "email", "telefono",
//                "telefono_movil", "documento_tipo", "documento_numero", "cuit", "condicion_iva", "tipo",
//                "apodo_ml", "datos_externos": {"ml": {…crudo…}},
//                "direccion": {calle, numero, piso_depto, localidad, provincia, provincia_codigo, codigo_postal, pais},
//                "direccion_envio": {…lo mismo + receptor, receptor_telefono, referencia, latitud, longitud, id_externo} },
//   "lineas": [ { "variacion_id": 12 | "sku": "ABC-1", "cantidad": 2, "precio_unitario"?: 1500, "titulo"?: "…" } ],
//   "moneda"?: "ARS" | "USD", "medio_pago"?: "…", "estado_pago"?: "pendiente" | "pagado" | "a_convenir",
//   "envio"?: {…}, "notas"?: "…", "fecha"?: "2026-10-01T15:00:00-03:00" }
// Respuesta: 201 { pedido_id, cliente_id, creado: true, total: { ars, usd } }
//            200 igual con creado: false si ya existía ese id_externo en el canal.

import { canalDelPedido, noAutorizado, respuestaError } from "@/lib/api/canal";
import { crearPedido, type PedidoEntrada } from "@/lib/pedidos";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const canal = await canalDelPedido(req);
    if (!canal) return noAutorizado();
    let cuerpo: Record<string, unknown>;
    try {
      cuerpo = await req.json();
    } catch {
      return Response.json({ error: "El cuerpo no es JSON válido." }, { status: 400 });
    }
    if (cuerpo.canal != null && Number(cuerpo.canal) !== canal.id) {
      return Response.json({ error: "El canal del cuerpo no es el del token." }, { status: 403 });
    }
    if (!Array.isArray(cuerpo.lineas) || cuerpo.lineas.length === 0) {
      return Response.json({ error: "Faltan las líneas del pedido." }, { status: 400 });
    }
    const entrada: PedidoEntrada = {
      canalId: canal.id,
      id_externo: cuerpo.id_externo != null ? String(cuerpo.id_externo) : null,
      cliente: (cuerpo.cliente as PedidoEntrada["cliente"]) ?? null,
      lineas: (cuerpo.lineas as Record<string, unknown>[]).map((l) => ({
        variacion_id: l.variacion_id != null ? Number(l.variacion_id) : null,
        sku: l.sku != null ? String(l.sku) : null,
        cantidad: Number(l.cantidad),
        precio_unitario: l.precio_unitario != null ? Number(l.precio_unitario) : null,
        titulo: l.titulo != null ? String(l.titulo) : null,
      })),
      moneda: cuerpo.moneda === "USD" ? "USD" : cuerpo.moneda === "ARS" ? "ARS" : null,
      medio_pago: cuerpo.medio_pago != null ? String(cuerpo.medio_pago) : null,
      estado_pago: (cuerpo.estado_pago as PedidoEntrada["estado_pago"]) ?? null,
      envio: (cuerpo.envio as Record<string, unknown>) ?? null,
      notas: cuerpo.notas != null ? String(cuerpo.notas) : null,
      fecha: cuerpo.fecha != null ? String(cuerpo.fecha) : null,
    };
    const r = await crearPedido(canal.organizacionId, entrada, "sistema");
    return Response.json(
      { pedido_id: r.pedidoId, cliente_id: r.clienteId, creado: r.creado, total: r.total },
      { status: r.creado ? 201 : 200 });
  } catch (e) {
    return respuestaError(e);
  }
}
