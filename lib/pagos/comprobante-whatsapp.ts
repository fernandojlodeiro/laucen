// Un comprobante de pago que llega por WhatsApp (Fer, 25/10): el cliente transfiere y manda la foto o el
// PDF al WhatsApp de la tienda. Si tiene un pedido de los últimos 10 días con el pago pendiente, el archivo
// queda en ese pedido como «Comprobante de pago» (origen WhatsApp) y se concilia en el momento con Mercado
// Pago (lib/pagos/comprobante.ts), igual que si lo subiera el equipo. Si cierra, se le confirma al cliente
// por el mismo chat y la IA no contesta encima. Si no cierra (Fer, 2/11): el motivo va a las notas del pedido,
// se abre un caso «En espera» para una persona y al cliente sólo se le dice que se está verificando.
// El archivo no se copia: queda guardado en WhatsApp (ruta «wa/<id>») y el panel lo muestra pidiéndoselo
// a Meta (app/ventas/pedidos/[id]/comprobante/[cid]).

import { una, consulta } from "@/lib/erp/base";
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

export type ResultadoWhatsapp = { pedidoId: number; conciliado: boolean };

/** Lo procesa si corresponde. Devuelve el pedido y si el pago quedó registrado (null si no era para un pedido
 *  o no es un comprobante). Si no cerró, deja el motivo en las notas del pedido y abre un caso «En espera» en el
 *  chat para que una persona lo revise; al cliente se le contesta sólo que se está verificando. */
export async function recibirComprobanteWhatsapp(org: string, chatId: number, archivo: { mediaId: string; tipo: string; nombre: string | null }):
  Promise<ResultadoWhatsapp | null> {
  if (archivo.tipo && !archivo.tipo.startsWith("image/") && archivo.tipo !== "application/pdf") return null;
  const { chatPorId, clientePorTelefono, credencialDeOrg, abrirCaso } = await import("@/lib/mensajes/chats");
  const chat = await chatPorId(org, chatId);
  if (!chat) return null;
  const clienteId = chat.clienteId ?? await clientePorTelefono(org, chat.externo);
  if (!clienteId) return null;
  // El pedido más reciente del cliente que espera el pago (no cancelado, de los últimos 10 días).
  const p = await una<{ id: number }>(`
    select p.id::int from pedido p join canal c on c.id = p.canal_id
     where p.organizacion_id = $1 and p.cliente_id = $2 and c.tipo <> 'mercadolibre' and p.estado_pago in ('pendiente', 'a_cobrar')
       and p.estado not in ('cancelado', 'devuelto', 'presupuesto') and p.creado_ts > now() - interval '10 days'
     order by (lower(coalesce(p.medio_pago, '')) like '%transfer%') desc, p.creado_ts desc limit 1`, [org, clienteId]);
  if (!p) return null;
  // Ya cargado (lo procesó el webhook y ahora el repaso, o al revés): no se repite.
  if (await una("select 1 from pedido_comprobante_pago where organizacion_id = $1 and ruta = $2", [org, `wa/${archivo.mediaId}`])) return null;
  const cred = await credencialDeOrg(org);
  if (!cred) return null;
  const bajado = await bajarDeWhatsapp(cred.token, archivo.mediaId);
  const r = await una<{ id: number }>(`insert into pedido_comprobante_pago (organizacion_id, pedido_id, ruta, nombre, tipo, origen, subido_por)
                                        values ($1, $2, $3, $4, $5, 'whatsapp', 'sistema') returning id::int`,
    [org, p.id, `wa/${archivo.mediaId}`, archivo.nombre ?? (archivo.tipo === "application/pdf" ? "Comprobante (WhatsApp).pdf" : "Foto por WhatsApp"), bajado?.tipo ?? archivo.tipo]);
  const { conciliarComprobante, anotarEnPedido, asuntoCasoPago } = await import("@/lib/pagos/comprobante");
  const v = await conciliarComprobante(org, r!.id, "sistema", bajado ?? undefined);
  if (v.estado === "conciliado" && v.elegido) {
    await anotarEnPedido(org, p.id, `Comprobante de pago por WhatsApp: el pago quedó registrado solo. ${v.detalle}`);
    return { pedidoId: p.id, conciliado: true };
  }
  // Una foto que no es un comprobante (un producto, una captura cualquiera): sigue la conversación normal.
  if (v.estado === "no_es") return null;
  const motivo = v.estado === "sin_encontrar" ? `${v.detalle} Se sigue buscando sola cada media hora durante tres días.` : v.detalle;
  await anotarEnPedido(org, p.id, `Comprobante de pago por WhatsApp sin conciliar: ${motivo}`);
  await abrirCaso(org, chatId, asuntoCasoPago(p.id),
    `El cliente mandó el comprobante de pago del pedido #${p.id} y no se pudo conciliar con Mercado Pago. El motivo está en las notas del pedido.`);
  return { pedidoId: p.id, conciliado: false };
}

/** El aviso al cliente por el mismo chat: «Recibimos tu pago» si cerró con Mercado Pago; si no, sólo que se está
 *  verificando (Fer, 2/11: sin más detalles; el motivo queda en las notas del pedido). */
export async function avisarComprobanteAlCliente(org: string, chatId: number, pedidoId: number, conciliado: boolean): Promise<void> {
  const { credencialDeOrg, chatPorId, guardarMensaje } = await import("@/lib/mensajes/chats");
  const { enviarTexto } = await import("@/lib/mensajes/meta");
  const [cred, chat] = await Promise.all([credencialDeOrg(org), chatPorId(org, chatId)]);
  if (!cred || !chat) return;
  const texto = conciliado
    ? `¡Gracias! Recibimos tu pago del pedido #${pedidoId}. Ya lo estamos preparando y te avisamos por acá cuando esté listo.`
    : "¡Gracias! Recibimos tu comprobante. Estamos verificando el pago y te avisamos por acá.";
  const r = await enviarTexto({ token: cred.token, phoneNumberId: cred.phoneNumberId }, chat.externo, texto);
  if (r.ok) await guardarMensaje({ org, chatId, clase: "operador", texto, wamid: r.wamid, estado: "enviado" }).catch(() => null);
}

/** Red de seguridad (corre con las tareas del ERP, cada pocos minutos o cada media hora): las fotos y PDF que mandaron
 *  por WhatsApp en los últimos 3 días clientes con un pedido sin pagar y que no quedaron cargadas como comprobante
 *  (el webhook se cortó, o el pedido no se encontró en ese momento) se procesan ahora. Cada mensaje se revisa una vez.
 *  Al cliente se le avisa sólo de 8 a 21 h. */
export async function repasarComprobantesWhatsapp(org: string, hastaMs: number): Promise<{ revisados: number; cargados: number }> {
  const filas = await consulta<{ id: number; chat_id: number; media: string; tipo: string; nombre: string | null }>(`
    select m.id::int, m.chat_id::int, m.adjunto ->> 'media_id' media, m.adjunto ->> 'tipo' tipo, m.adjunto ->> 'nombre' nombre
      from chat_mensaje m join chat ch on ch.id = m.chat_id
     where ch.organizacion_id = $1 and ch.canal = 'whatsapp' and m.clase = 'entrante' and m.adjunto ? 'media_id'
       and (m.adjunto ->> 'tipo' like 'image/%' or m.adjunto ->> 'tipo' = 'application/pdf')
       and m.ts > now() - interval '3 days' and m.ts < now() - interval '2 minutes'
       and not coalesce((m.adjunto ->> 'revisado')::boolean, false)
       and not exists (select 1 from pedido_comprobante_pago cp where cp.organizacion_id = $1 and cp.ruta = 'wa/' || (m.adjunto ->> 'media_id'))
       and exists (select 1 from pedido p join canal c on c.id = p.canal_id
                    where p.organizacion_id = $1 and p.cliente_id = ch.cliente_id and c.tipo <> 'mercadolibre'
                      and p.estado_pago in ('pendiente', 'a_cobrar') and p.estado not in ('cancelado', 'devuelto', 'presupuesto')
                      and p.creado_ts > now() - interval '10 days')
     order by m.ts limit 10`, [org]);
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  let cargados = 0;
  for (const f of filas) {
    if (Date.now() > hastaMs) break;
    await consulta(`update chat_mensaje set adjunto = adjunto || '{"revisado": true}'::jsonb where id = $1`, [f.id]);
    try {
      const r = await recibirComprobanteWhatsapp(org, f.chat_id, { mediaId: f.media, tipo: f.tipo, nombre: f.nombre });
      if (!r) continue;
      cargados++;
      if (hora >= 8 && hora < 21) await avisarComprobanteAlCliente(org, f.chat_id, r.pedidoId, r.conciliado).catch((e) => console.error("[comprobante] aviso", e));
    } catch (e) {
      console.error("[comprobante] repaso", org, f.id, e);
    }
  }
  return { revisados: filas.length, cargados };
}
