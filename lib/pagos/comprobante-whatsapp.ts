// Un comprobante de pago que llega por WhatsApp (Fer, 25/10): el cliente transfiere y manda la foto o el
// PDF al WhatsApp de la tienda. Si tiene un pedido de los últimos 10 días con el pago pendiente, el archivo
// queda en ese pedido como «Comprobante de pago» (origen WhatsApp) y se concilia en el momento con Mercado
// Pago (lib/pagos/comprobante.ts), igual que si lo subiera el equipo. Si cierra, se le confirma al cliente
// por el mismo chat y la IA no contesta encima; si no, sigue la conversación normal.
// El archivo no se copia: queda guardado en WhatsApp (ruta «wa/<id>») y el panel lo muestra pidiéndoselo
// a Meta (app/ventas/pedidos/[id]/comprobante/[cid]).

import { una } from "@/lib/erp/base";
import { GRAPH } from "@/lib/mensajes/meta";

/** Baja un archivo de WhatsApp por su id. */
export async function bajarDeWhatsapp(token: string, mediaId: string): Promise<{ datos: Buffer; tipo: string } | null> {
  const m = await fetch(`${GRAPH}/${mediaId}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null) as { url?: string; mime_type?: string } | null;
  if (!m?.url) return null;
  const r = await fetch(m.url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(25_000) }).catch(() => null);
  if (!r?.ok) return null;
  return { datos: Buffer.from(await r.arrayBuffer()), tipo: (m.mime_type ?? r.headers.get("content-type") ?? "").split(";")[0].trim() };
}

/** Lo procesa si corresponde. Devuelve el pedido si el pago quedó registrado (para confirmárselo al cliente). */
export async function recibirComprobanteWhatsapp(org: string, chatId: number, archivo: { mediaId: string; tipo: string; nombre: string | null }):
  Promise<{ pedidoId: number } | null> {
  if (archivo.tipo && !archivo.tipo.startsWith("image/") && archivo.tipo !== "application/pdf") return null;
  const { chatPorId, clientePorTelefono, credencialDeOrg } = await import("@/lib/mensajes/chats");
  const chat = await chatPorId(org, chatId);
  if (!chat) return null;
  const clienteId = chat.clienteId ?? await clientePorTelefono(org, chat.externo);
  if (!clienteId) return null;
  // El pedido más reciente del cliente que espera el pago (no cancelado, de los últimos 10 días).
  const p = await una<{ id: number }>(`
    select p.id::int from pedido p join canal c on c.id = p.canal_id
     where p.organizacion_id = $1 and p.cliente_id = $2 and c.tipo <> 'mercadolibre' and p.estado_pago = 'pendiente'
       and p.estado not in ('cancelado', 'devuelto', 'presupuesto') and p.creado_ts > now() - interval '10 days'
     order by (lower(coalesce(p.medio_pago, '')) like '%transfer%') desc, p.creado_ts desc limit 1`, [org, clienteId]);
  if (!p) return null;
  const cred = await credencialDeOrg(org);
  if (!cred) return null;
  const bajado = await bajarDeWhatsapp(cred.token, archivo.mediaId);
  const r = await una<{ id: number }>(`insert into pedido_comprobante_pago (organizacion_id, pedido_id, ruta, nombre, tipo, origen, subido_por)
                                        values ($1, $2, $3, $4, $5, 'whatsapp', 'sistema') returning id::int`,
    [org, p.id, `wa/${archivo.mediaId}`, archivo.nombre ?? (archivo.tipo === "application/pdf" ? "Comprobante (WhatsApp).pdf" : "Foto por WhatsApp"), bajado?.tipo ?? archivo.tipo]);
  const { conciliarComprobante } = await import("@/lib/pagos/comprobante");
  const v = await conciliarComprobante(org, r!.id, "sistema", bajado ?? undefined);
  return v.estado === "conciliado" && v.elegido ? { pedidoId: p.id } : null;
}
