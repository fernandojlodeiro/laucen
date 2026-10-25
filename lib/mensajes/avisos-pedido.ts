// Los avisos del pedido por WhatsApp (Fer, 25/10): los mismos que salen por mail —pago confirmado,
// despachado, listo para retirar— también por WhatsApp a los clientes que eligieron WhatsApp (la casilla
// del pago de la tienda: cliente.factura_por_whatsapp) y tienen el número cargado.
//   - Dentro de las 24 h del último mensaje del cliente: un mensaje de texto con el link del pedido.
//   - Fuera: la plantilla de Meta de ese aviso, con el botón «Ver mi pedido». Laucen la pide sola la
//     primera vez; hasta que Meta la aprueba, el aviso queda pendiente y se reintenta (3 días).
// Lo usa la cola de los mails (lib/correo/mails.ts → procesarCola).

import { una } from "@/lib/erp/base";
import { ventanaAbierta } from "@/lib/mensajes/reglas";
import { urlTienda } from "@/lib/tienda/dominios-tienda";

export type TipoAviso = "pagado" | "despachado" | "listo_retirar";
export const IDIOMA = "es_AR";

const NOMBRE_PLANTILLA: Record<TipoAviso, string> = { pagado: "pedido_pagado", despachado: "pedido_despachado", listo_retirar: "pedido_listo_retirar" };
const CUERPO: Record<TipoAviso, string> = {
  pagado: "Hola {{1}}, ya tenemos el pago de tu pedido #{{2}}. Ya lo estamos preparando y te avisamos cuando esté listo.",
  despachado: "Hola {{1}}, despachamos tu pedido #{{2}}. Con el botón de abajo podés ver el pedido y seguirlo.",
  listo_retirar: "Hola {{1}}, tu pedido #{{2}} ya está listo para retirar. Con el botón de abajo ves el detalle, la dirección y el horario.",
};

/** La plantilla de Meta de un aviso (categoría utilidad): saludo, número de pedido y el botón con el link. */
export function plantillaAviso(tipo: TipoAviso, base: string) {
  return {
    name: NOMBRE_PLANTILLA[tipo], language: IDIOMA, category: "UTILITY",
    components: [
      { type: "BODY", text: CUERPO[tipo], example: { body_text: [["Juan", "150420"]] } },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver mi pedido", url: `${base}/pedido/{{1}}`, example: [`${base}/pedido/a1b2c3d4`] }] },
    ],
  };
}

/** El texto dentro de las 24 h (sin plantilla): lo mismo, con el link escrito. */
export function textoAviso(tipo: TipoAviso, nombre: string, pedido: number, link: string | null, nota?: string | null) {
  const t = CUERPO[tipo].replace("{{1}}", nombre || "").replace("Hola , ", "Hola, ").replace("{{2}}", String(pedido))
    .replace(/ Con el botón de abajo[^.]*\./, "");
  return [t, nota?.trim() || null, link ? `Ver tu pedido: ${link}` : null].filter(Boolean).join("\n\n");
}

export type ResultadoAviso = { estado: "enviado" | "pendiente" | "error" | "no_corresponde"; detalle: string };

/** Manda el aviso por WhatsApp si le corresponde. No tira: devuelve qué pasó. */
export async function avisarPorWhatsapp(org: string, pedidoId: number, tipo: TipoAviso, nota?: string | null): Promise<ResultadoAviso> {
  const p = await una<{ codigo: string | null; whatsapp: string | null; quiere: boolean | null; nombre: string | null; canal_tipo: string }>(`
    select p.codigo_seguimiento codigo, cl.whatsapp, cl.factura_por_whatsapp quiere, coalesce(cl.nombre_pila, p.datos_externos #>> '{tienda,contacto,nombre}', cl.nombre) nombre, c.tipo canal_tipo
      from pedido p join canal c on c.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
     where p.id = $1 and p.organizacion_id = $2`, [pedidoId, org]);
  if (!p || p.canal_tipo === "mercadolibre") return { estado: "no_corresponde", detalle: "No es un pedido de la tienda." };
  if (!p.whatsapp || p.quiere !== true) return { estado: "no_corresponde", detalle: "El cliente no eligió WhatsApp o no tiene el número." };
  const { credencialDeOrg, chatDe, guardarMensaje } = await import("@/lib/mensajes/chats");
  const cred = await credencialDeOrg(org);
  if (!cred) return { estado: "pendiente", detalle: "No hay una línea de WhatsApp conectada." };
  const { enviarTexto, enviarPlantilla, estadoPlantilla, crearPlantilla } = await import("@/lib/mensajes/meta");
  const { tiendaParaPedido } = await import("@/lib/correo/mails");
  const t = await tiendaParaPedido(org, pedidoId);
  const link = t && p.codigo ? await urlTienda(t, `/pedido/${p.codigo}`) : null;
  const cuenta = { token: cred.token, phoneNumberId: cred.phoneNumberId };
  const nombre = (p.nombre ?? "").split(/[ ,]/)[0] ?? "";
  const chat = await chatDe(org, "whatsapp", p.whatsapp);
  let r;
  let texto: string;
  if (ventanaAbierta(chat.ultimoEntranteTs)) {
    texto = textoAviso(tipo, nombre, pedidoId, link, nota);
    r = await enviarTexto(cuenta, p.whatsapp, texto);
  } else {
    if (!t || !p.codigo) return { estado: "error", detalle: "Sin link del pedido para la plantilla." };
    const base = (await urlTienda(t, "")).replace(/\/$/, "");
    let estado: string | null;
    try {
      estado = await estadoPlantilla(cred.wabaId, cred.token, NOMBRE_PLANTILLA[tipo]);
      if (!estado) { await crearPlantilla(cred.wabaId, cred.token, plantillaAviso(tipo, base)); estado = "PENDING"; }
    } catch (e) {
      console.error("[aviso WhatsApp] plantilla", tipo, e instanceof Error ? e.message : e);
      return { estado: "pendiente", detalle: "No se pudo consultar la plantilla en Meta: se reintenta." };
    }
    if (estado === "REJECTED") return { estado: "error", detalle: "Meta rechazó la plantilla de este aviso." };
    if (estado !== "APPROVED") return { estado: "pendiente", detalle: "La plantilla está en aprobación en Meta: sale sola cuando la aprueben." };
    texto = textoAviso(tipo, nombre, pedidoId, link);
    r = await enviarPlantilla(cuenta, p.whatsapp, NOMBRE_PLANTILLA[tipo], IDIOMA, [nombre || "cliente", String(pedidoId)], p.codigo);
  }
  if (!r.ok) {
    const reintentar = r.codigo === 130429 || r.codigo === 131048 || r.codigo === 131056;
    return { estado: reintentar ? "pendiente" : "error", detalle: r.motivo };
  }
  await guardarMensaje({ org, chatId: chat.id, clase: "operador", texto, wamid: r.wamid, estado: "enviado" }).catch(() => null);
  return { estado: "enviado", detalle: `A ${p.whatsapp}` };
}
