// El presupuesto formal que arma la IA de los mensajes (Fer, 26/10): cuando un cliente pide presupuesto por
// WhatsApp, la IA lo arma con productos de la tienda y se lo manda en PDF. Es un presupuesto como los del panel
// (canal local, con la lista de precios de la tienda: los mismos precios que vio el cliente; no reserva stock, pero nunca
// lleva más unidades de las disponibles en el canal;
// vale 30 días, como los que hace Fer —Fer, 26/10—, y la IA no lo menciona) y queda en Pedidos para el equipo. El PDF es el de la página pública del pedido.

import { una, consulta, motivoErp } from "@/lib/erp/base";
import { crearPedidoAMano } from "@/lib/pedidos/a-mano";
import { asegurarCodigo } from "@/lib/pedidos/seguimiento";
import { urlTienda } from "@/lib/tienda/dominios-tienda";
import { formatear } from "@/lib/moneda";
import type { Tienda } from "@/lib/tienda/tienda";
import type { Chat } from "@/lib/mensajes/chats";

const MAX_ITEMS = 30;
/** Hasta cuándo vale: hoy + 30 días, en hora argentina (AAAA-MM-DD). */
const VIGENCIA = () => new Date(Date.now() + 30 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

/** `enviar`: false cuando la persona pidió que la IA sólo sugiera: se arma y el link va en el texto sugerido. */
export async function armarPresupuestoIa(org: string, chat: Chat, t: Tienda, e: Record<string, unknown>, o: { enviar: boolean } = { enviar: true }): Promise<string> {
  const para = String(e.a_nombre_de ?? "").trim().slice(0, 150);
  if (!para) return "Falta a nombre de quién va el presupuesto: preguntáselo.";
  const items = (Array.isArray(e.items) ? e.items : []) as { producto?: unknown; sku?: unknown; cantidad?: unknown }[];
  if (!items.length) return "Faltan los productos del presupuesto.";
  if (items.length > MAX_ITEMS) return `Son demasiados productos: hasta ${MAX_ITEMS} por presupuesto.`;
  const canal = await una<{ id: number }>("select id::int from canal where organizacion_id = $1 and tipo = 'local' and estado = 'activo' order by id limit 1", [org]);
  if (!canal) return "No se puede armar el presupuesto desde acá: derivalo a una persona.";

  const lineas: { variacionId: number; cantidad: number }[] = [];
  const faltan: string[] = [];
  for (const it of items) {
    const producto = Number(it.producto);
    const cantidad = Math.trunc(Number(it.cantidad));
    if (!Number.isInteger(producto) || cantidad < 1 || cantidad > 100000) return "Algún producto no tiene número o cantidad válidos.";
    // Sólo lo que está a la venta en la tienda (activo, con precio en su lista).
    const vars = await consulta<{ id: number; sku: string; disp: number }>(`
      select v.id::int, v.sku, greatest(stock_disponible_canal($1, v.id, $4), 0)::int disp from variacion v join producto p on p.id = v.producto_id
       where p.organizacion_id = $1 and p.id = $2 and p.estado = 'activo' and v.estado = 'activa'
         and exists (select 1 from precio_de($1, v.id, $3) pr where coalesce(pr.venta_ars, 0) > 0)
       order by v.orden, v.id`, [org, producto, t.listaId, canal.id]);
    if (!vars.length) return `El producto ${producto} no está a la venta en la tienda: sacalo del presupuesto.`;
    const sku = String(it.sku ?? "").trim();
    const v = sku ? vars.find((x) => x.sku.toLowerCase() === sku.toLowerCase()) : vars.length === 1 ? vars[0] : null;
    if (!v) return sku ? `El producto ${producto} no tiene la variante ${sku}: mirala con ver_producto.`
      : `El producto ${producto} tiene varias variantes (${vars.map((x) => x.sku).join(", ")}): preguntale cuál quiere o elegila con ver_producto y pasá el SKU.`;
    // Nunca más de lo que hay (Fer, 29/10: un presupuesto ofreció 10 de un sensor del que había 5).
    if (cantidad > v.disp) { faltan.push(v.disp > 0 ? `del producto ${producto} (${v.sku}) hay ${v.disp}, no ${cantidad}` : `del producto ${producto} (${v.sku}) no hay stock`); continue; }
    lineas.push({ variacionId: v.id, cantidad });
  }
  if (faltan.length) return `No lo armé: ${faltan.join("; ")}. Armalo de nuevo con lo que hay (sacá lo que no hay) y decile al cliente cuántas tenemos.`;

  let pedidoId: number, total: number;
  try {
    const r = await crearPedidoAMano(org, "ia-mensajes", {
      canalId: canal.id, clienteId: chat.clienteId, lineas, pago: "a_convenir", medio: null, entrega: "retiro",
      presupuesto: { vigencia: VIGENCIA() }, listaId: t.listaId, moneda: t.moneda,
      notas: `Lo armó la IA por ${chat.canal === "whatsapp" ? `WhatsApp (${chat.externo})` : chat.canal} para ${para}.`,
    }, "ia-mensajes");
    pedidoId = r.pedidoId;
    total = Number((await una<{ t: string }>("select case when moneda = 'USD' then total_usd else total_ars end t from pedido where id = $1", [pedidoId]))?.t ?? r.totalArs);
  } catch (err) {
    console.error("[presupuesto-ia]", motivoErp(err));
    return "No se pudo armar el presupuesto: derivalo a una persona.";
  }
  await consulta("update pedido set datos_externos = jsonb_set(datos_externos, '{presupuesto}', jsonb_build_object('para', $2::text)) where id = $1", [pedidoId, para]);
  const codigo = await asegurarCodigo(org, pedidoId);
  const link = codigo ? await urlTienda(t, `/pedido/${codigo}/pdf`) : null;
  const resumen = `Presupuesto N.º ${pedidoId} por ${formatear(total, t.moneda)} (no menciones su validez)`;
  if (!link) return `${resumen}. No se pudo generar el link del PDF: derivalo a una persona para que se lo mande.`;
  if (!o.enviar) return `${resumen}. Todavía no se lo mandaste: poné este link al PDF en tu mensaje: ${link}`;
  if (chat.canal !== "whatsapp") return `${resumen}. Pasale este link al PDF: ${link}`;

  const { credencialDeOrg, guardarMensaje } = await import("@/lib/mensajes/chats");
  const { enviarDocumento } = await import("@/lib/mensajes/meta");
  const cred = await credencialDeOrg(org);
  if (!cred) return `${resumen}. No hay línea de WhatsApp para adjuntarlo: pasale este link al PDF: ${link}`;
  const r = await enviarDocumento({ token: cred.token, phoneNumberId: cred.phoneNumberId }, chat.externo, link, `Presupuesto-${pedidoId}.pdf`, `Presupuesto N.º ${pedidoId} — ${para}`);
  if (!r.ok) return `${resumen}. El PDF no se pudo adjuntar (${r.motivo}): pasale este link: ${link}`;
  await guardarMensaje({ org, chatId: chat.id, clase: "ia", texto: `📄 Presupuesto N.º ${pedidoId} (PDF): ${link}`, wamid: r.wamid, estado: "enviado" }).catch(() => null);
  return `Listo: ${resumen}. Ya le llegó el PDF por este chat: avisale en tu mensaje (sin repetir el link) y contale lo que no entró, si hay algo. Si había un caso abierto por este presupuesto, cerralo con ya_lo_pude_resolver.`;
}
