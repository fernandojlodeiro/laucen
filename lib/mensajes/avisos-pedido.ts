// Los avisos del pedido por WhatsApp (Fer, 25/10): los mismos que salen por mail.
//   - Los de cambio de estado —pago confirmado, despachado, listo para retirar—, a los clientes que eligieron
//     WhatsApp (la casilla del pago de la tienda: cliente.factura_por_whatsapp) y tienen el número cargado.
//   - Los del seguimiento de un pedido sin pagar (lib/pedidos/seguimiento.ts) —recibido, pago sin completar,
//     recordatorio, último día, reserva anulada—, a todos los que tienen un número, lo hayan tildado o no.
// Dentro de las 24 h del último mensaje del cliente: un mensaje de texto con el link del pedido. Fuera: la
// plantilla de Meta de ese aviso, con su botón. Las plantillas se mandan a Meta a mano (Configuración ›
// Plantillas de WhatsApp); hasta que Meta la aprueba, el aviso queda pendiente y se reintenta (3 días).
// Lo usa la cola de los mails (lib/correo/mails.ts → procesarCola).

import { una } from "@/lib/erp/base";
import { ventanaAbierta } from "@/lib/mensajes/reglas";
import { urlTienda } from "@/lib/tienda/dominios-tienda";
import { esSeguimiento, sigueCorrespondiendo, asegurarCodigo, reservaLegible, type TipoSeguimiento } from "@/lib/pedidos/seguimiento";

export type TipoAviso = "pagado" | "despachado" | "listo_retirar" | TipoSeguimiento;
export const IDIOMA = "es_AR";

type Aviso = { plantilla: string; cuerpo: string; boton: string | null; conReserva?: boolean };
const AVISOS: Record<TipoAviso, Aviso> = {
  pagado: { plantilla: "pedido_pagado", boton: "Ver mi pedido",
    cuerpo: "Hola {{1}}, ya tenemos el pago de tu pedido #{{2}}. Ya lo estamos preparando y te avisamos cuando esté listo." },
  despachado: { plantilla: "pedido_despachado", boton: "Ver mi pedido",
    cuerpo: "Hola {{1}}, despachamos tu pedido #{{2}}. Con el botón de abajo podés ver el pedido y seguirlo." },
  listo_retirar: { plantilla: "pedido_listo_retirar", boton: "Ver mi pedido",
    cuerpo: "Hola {{1}}, tu pedido #{{2}} ya está listo para retirar. Con el botón de abajo ves el detalle, la dirección y el horario." },
  recibido: { plantilla: "pedido_recibido_reserva", boton: "Ver mi pedido", conReserva: true,
    cuerpo: "Hola {{1}}, recibimos tu pedido #{{2}}. Te guardamos los productos hasta {{3}}.\nCon el botón de abajo ves lo que compraste, cómo pagarlo y cómo recibirlo. Si tenés alguna duda, respondé este mensaje." },
  pago_incompleto: { plantilla: "pedido_pago_incompleto", boton: "Elegir cómo pagar",
    cuerpo: "Hola {{1}}, recibimos tu pedido #{{2}}, pero el pago no llegó a completarse. Te guardamos los productos por 24 horas.\nCon el botón de abajo podés volver a intentarlo o elegir otra forma de pago. Si preferís pagar de una forma que no viste en la página, respondé este mensaje y lo vemos juntos." },
  recordatorio: { plantilla: "pedido_recordatorio_pago", boton: "Ver mi pedido", conReserva: true,
    cuerpo: "Hola {{1}}, todavía no nos llegó el pago de tu pedido #{{2}}. Te seguimos guardando los productos hasta {{3}}.\nSi ya pagaste, respondé este mensaje con el comprobante. Si necesitás otra forma de pago, escribinos y te ayudamos." },
  ultimo_dia: { plantilla: "pedido_ultimo_dia_reserva", boton: "Ver mi pedido",
    cuerpo: "Hola {{1}}, hoy es el último día de la reserva de tu pedido #{{2}}. Si no recibimos el pago, mañana se liberan los productos.\nSi ya pagaste, respondé este mensaje con el comprobante y lo confirmamos enseguida." },
  reserva_anulada: { plantilla: "pedido_reserva_anulada", boton: null,
    cuerpo: "Hola {{1}}, como no recibimos el pago, liberamos la reserva de tu pedido #{{2}}. Si todavía lo querés, respondé este mensaje y te ayudamos a armarlo de nuevo." },
};

export const nombrePlantilla = (tipo: TipoAviso) => AVISOS[tipo].plantilla;

/** La plantilla de Meta de un aviso (categoría utilidad): saludo, número de pedido (y la reserva) y el botón con el link. */
export function plantillaAviso(tipo: TipoAviso, base: string) {
  const a = AVISOS[tipo];
  return {
    name: a.plantilla, language: IDIOMA, category: "UTILITY",
    components: [
      { type: "BODY", text: a.cuerpo, example: { body_text: [a.conReserva ? ["Juan", "150420", "el martes 28/10"] : ["Juan", "150420"]] } },
      ...(a.boton ? [{ type: "BUTTONS", buttons: [{ type: "URL", text: a.boton, url: `${base}/pedido/{{1}}`, example: [`${base}/pedido/a1b2c3d4`] }] }] : []),
    ],
  };
}

/** El texto dentro de las 24 h (sin plantilla): lo mismo, con el link escrito en lugar del botón. */
export function textoAviso(tipo: TipoAviso, nombre: string, pedido: number, link: string | null, nota?: string | null, reserva?: string | null) {
  const a = AVISOS[tipo];
  const t = a.cuerpo.replace("{{1}}", nombre || "").replace("Hola , ", "Hola, ").replace("{{2}}", String(pedido)).replace("{{3}}", reserva || "")
    .replace(/Con el botón de abajo/g, link ? "Con este link" : "En la página del pedido");
  return [t, nota?.trim() || null, a.boton && link ? `${a.boton === "Ver mi pedido" ? "Ver tu pedido" : a.boton}: ${link}` : null].filter(Boolean).join("\n\n");
}

export type ResultadoAviso = { estado: "enviado" | "pendiente" | "error" | "no_corresponde"; detalle: string };

/** Manda el aviso por WhatsApp si le corresponde. No tira: devuelve qué pasó. */
export async function avisarPorWhatsapp(org: string, pedidoId: number, tipo: TipoAviso, nota?: string | null): Promise<ResultadoAviso> {
  const seguimiento = esSeguimiento(tipo);
  const p = await una<{ codigo: string | null; whatsapp: string | null; quiere: boolean | null; nombre: string | null; canal_tipo: string; medio: string | null; en_seguimiento: boolean }>(`
    select p.codigo_seguimiento codigo, p.datos_externos #>> '{tienda,medio}' medio, pedido_en_seguimiento(p.id) en_seguimiento,
           ${seguimiento ? "coalesce(cl.whatsapp, whatsapp_normal(p.datos_externos #>> '{tienda,contacto,telefono}'), whatsapp_normal(cl.telefono_movil))" : "cl.whatsapp"} whatsapp,
           cl.factura_por_whatsapp quiere, coalesce(cl.nombre_pila, p.datos_externos #>> '{tienda,contacto,nombre}', cl.nombre) nombre, c.tipo canal_tipo
      from pedido p join canal c on c.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
     where p.id = $1 and p.organizacion_id = $2`, [pedidoId, org]);
  if (!p || p.canal_tipo === "mercadolibre") return { estado: "no_corresponde", detalle: "No es un pedido de la tienda." };
  if (seguimiento) {
    if (!(await sigueCorrespondiendo(pedidoId, tipo))) return { estado: "no_corresponde", detalle: "El pedido ya se pagó o cambió: el aviso no hace falta." };
    // El primero, sólo a los que esperan el pago (no a quien está pagando con tarjeta o Mercado Pago en ese momento).
    if (tipo === "recibido" && (!p.en_seguimiento || p.medio === "payway" || p.medio === "mercadopago")) return { estado: "no_corresponde", detalle: "No espera el pago." };
    if (!p.whatsapp) return { estado: "no_corresponde", detalle: "El cliente no tiene un WhatsApp cargado." };
  } else if (!p.whatsapp || p.quiere !== true) return { estado: "no_corresponde", detalle: "El cliente no eligió WhatsApp o no tiene el número." };
  const { credencialDeOrg, chatDe, guardarMensaje } = await import("@/lib/mensajes/chats");
  const cred = await credencialDeOrg(org);
  if (!cred) return { estado: "pendiente", detalle: "No hay una línea de WhatsApp conectada." };
  const { enviarTexto, enviarPlantilla, estadoPlantilla } = await import("@/lib/mensajes/meta");
  const { tiendaParaPedido } = await import("@/lib/correo/mails");
  const t = await tiendaParaPedido(org, pedidoId);
  const codigo = p.codigo ?? (seguimiento ? await asegurarCodigo(org, pedidoId) : null);
  const link = t && codigo ? await urlTienda(t, `/pedido/${codigo}`) : null;
  const reserva = AVISOS[tipo].conReserva ? await reservaLegible(pedidoId) : null;
  if (AVISOS[tipo].conReserva && !reserva) return { estado: "no_corresponde", detalle: "El pedido ya no tiene reserva." };
  const cuenta = { token: cred.token, phoneNumberId: cred.phoneNumberId };
  const nombre = (p.nombre ?? "").split(/[ ,]/)[0] ?? "";
  const chat = await chatDe(org, "whatsapp", p.whatsapp);
  let r;
  let texto: string;
  if (ventanaAbierta(chat.ultimoEntranteTs)) {
    texto = textoAviso(tipo, nombre, pedidoId, link, nota, reserva);
    r = await enviarTexto(cuenta, p.whatsapp, texto);
  } else {
    if (AVISOS[tipo].boton && (!t || !codigo)) return { estado: "error", detalle: "Sin link del pedido para la plantilla." };
    let estado: string | null;
    try {
      estado = await estadoPlantilla(cred.wabaId, cred.token, AVISOS[tipo].plantilla);
    } catch (e) {
      console.error("[aviso WhatsApp] plantilla", tipo, e instanceof Error ? e.message : e);
      return { estado: "pendiente", detalle: "No se pudo consultar la plantilla en Meta: se reintenta." };
    }
    // Nunca se manda sola: se manda a Meta desde Configuración › Plantillas de WhatsApp (Fer, 25/10).
    if (!estado) return { estado: "pendiente", detalle: "La plantilla de este aviso todavía no se mandó a Meta (Configuración › Plantillas de WhatsApp)." };
    if (estado === "REJECTED") return { estado: "error", detalle: "Meta rechazó la plantilla de este aviso." };
    if (estado !== "APPROVED") return { estado: "pendiente", detalle: "La plantilla está en aprobación en Meta: sale sola cuando la aprueben." };
    texto = textoAviso(tipo, nombre, pedidoId, link, null, reserva);
    r = await enviarPlantilla(cuenta, p.whatsapp, AVISOS[tipo].plantilla, IDIOMA,
      [nombre || "cliente", String(pedidoId), ...(reserva ? [reserva] : [])], AVISOS[tipo].boton ? codigo! : undefined);
  }
  if (!r.ok) {
    const reintentar = r.codigo === 130429 || r.codigo === 131048 || r.codigo === 131056;
    return { estado: reintentar ? "pendiente" : "error", detalle: r.motivo };
  }
  await guardarMensaje({ org, chatId: chat.id, clase: "operador", texto, wamid: r.wamid, estado: "enviado" }).catch(() => null);
  return { estado: "enviado", detalle: `A ${p.whatsapp}` };
}
