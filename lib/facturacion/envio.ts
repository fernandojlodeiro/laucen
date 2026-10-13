// Mandarle la factura al cliente (pedido de Fer, 13/10). Por WhatsApp, al número
// confirmado de su ficha (cliente.whatsapp) y si la casilla «Enviarle la factura
// por WhatsApp» está tildada. Por mail todavía no: falta configurar el correo
// (la casilla ya está en la ficha).
// - Una venta de Mercado Libre no se manda por WhatsApp (la factura va a ML),
//   salvo que el cliente nos haya escrito por WhatsApp por esa compra.
// - Dentro de las 24 h del último mensaje del cliente va el PDF; fuera, la
//   plantilla «factura» de Meta con el botón para bajarlo (la crea Laucen la
//   primera vez; hasta que Meta la aprueba, queda pendiente y se reintenta).

import { randomBytes } from "node:crypto";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { TIPOS_CBTE } from "@/lib/arca/facturar";
import { urlPanel } from "@/lib/tienda/dominios";
import { ventanaAbierta } from "@/lib/mensajes/reglas";

export const PLANTILLA_FACTURA = "factura_emitida";
export const IDIOMA_PLANTILLA = "es_AR";

const numero = (pv: number, n: string | number | null) => `${String(pv).padStart(5, "0")}-${String(n ?? "").padStart(8, "0")}`;

/** ¿Le corresponde la factura por WhatsApp sola (al autorizarse)? Pura. */
export function correspondeWhatsapp(x: { tipo_cbte: number; factura_por_whatsapp: boolean | null; whatsapp: string | null; canal_tipo: string | null; chat_reciente: boolean }):
  { ok: true } | { ok: false; motivo: string } {
  if (TIPOS_CBTE[x.tipo_cbte]?.nc) return { ok: false, motivo: "Una nota de crédito no se manda." };
  if (x.factura_por_whatsapp === false) return { ok: false, motivo: "El cliente no quiere la factura por WhatsApp." };
  if (!x.whatsapp) return { ok: false, motivo: "El cliente no tiene WhatsApp confirmado." };
  if (x.canal_tipo === "mercadolibre" && !x.chat_reciente) return { ok: false, motivo: "Venta de Mercado Libre: la factura va a Mercado Libre." };
  return { ok: true };
}

/** La dirección pública para bajar el PDF (un código al azar por comprobante). */
export async function enlaceFactura(org: string, id: number): Promise<{ token: string; url: string }> {
  const r = await una<{ t: string }>(`update comprobante set enlace_token = coalesce(enlace_token, $3) where id = $1 and organizacion_id = $2 returning enlace_token t`,
    [id, org, randomBytes(18).toString("hex")]);
  if (!r) throw new ErrorErp("El comprobante no existe.");
  return { token: r.t, url: `${urlPanel()}/api/factura/${r.t}` };
}

/** La plantilla de Meta (categoría utilidad): saludo, qué comprobante es y un botón con el enlace. */
export function plantillaFactura(base: string) {
  return {
    name: PLANTILLA_FACTURA, language: IDIOMA_PLANTILLA, category: "UTILITY",
    components: [
      { type: "BODY", text: "Hola {{1}}, te enviamos la {{2}} de tu compra. La podés ver y descargar con el botón de abajo.",
        example: { body_text: [["Juan", "Factura B 00001-00000123"]] } },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver la factura", url: `${base}/api/factura/{{1}}`, example: [`${base}/api/factura/a1b2c3d4`] }] },
    ],
  };
}

type Datos = {
  id: number; estado: string; tipo_cbte: number; punto_venta: number; numero: string | null; pedido_id: number | null; canal_tipo: string | null;
  cliente_id: number | null; nombre: string | null; nombre_pila: string | null; whatsapp: string | null; factura_por_whatsapp: boolean | null;
  chat_reciente: boolean; corregida: boolean; wa_estado: string | null;
};

async function datosDe(org: string, id: number): Promise<Datos | null> {
  return una<Datos>(`
    select cb.id::int, cb.estado, cb.tipo_cbte, cb.punto_venta, cb.numero::text, cb.pedido_id::int, ca.tipo canal_tipo, cl.id::int cliente_id,
           cl.nombre, cl.nombre_pila, cl.whatsapp, cl.factura_por_whatsapp, cb.wa_estado,
           -- Nos escribió por WhatsApp por esta compra (desde una semana antes del pedido).
           exists (select 1 from chat ch join chat_mensaje m on m.chat_id = ch.id
                    where ch.cliente_id = cl.id and ch.canal = 'whatsapp' and m.direccion = 'entrante' and m.ts >= coalesce(p.creado_ts, cb.creado_ts) - interval '7 days') chat_reciente,
           -- Reemplaza a otra factura del mismo pedido anulada con nota de crédito (refacturación).
           exists (select 1 from comprobante o join comprobante nc on nc.comprobante_asociado_id = o.id and nc.estado = 'autorizado'
                    where o.pedido_id = cb.pedido_id and o.id <> cb.id and o.tipo_cbte in (1, 6, 11)) corregida
      from comprobante cb left join pedido p on p.id = cb.pedido_id left join canal ca on ca.id = p.canal_id
      left join cliente cl on cl.id = coalesce(cb.cliente_id, p.cliente_id)
     where cb.id = $1 and cb.organizacion_id = $2`, [id, org]);
}

async function anotar(org: string, id: number, estado: string, detalle: string, enviado = false) {
  await consulta(`update comprobante set wa_estado = $3, wa_detalle = $4, wa_intentos = wa_intentos + 1${enviado ? ", wa_enviado_ts = now()" : ""}
                   where id = $1 and organizacion_id = $2`, [id, org, estado, detalle.slice(0, 500)]);
}

/** Manda la factura por WhatsApp. Devuelve qué pasó, en criollo. Con `manual`, tira ErrorErp si no se puede. */
export async function enviarFacturaWhatsapp(org: string, id: number, o: { manual?: boolean } = {}): Promise<string> {
  const d = await datosDe(org, id);
  if (!d) throw new ErrorErp("El comprobante no existe.");
  if (d.estado !== "autorizado") throw new ErrorErp("El comprobante todavía no está autorizado por ARCA.");
  if (!d.whatsapp) throw new ErrorErp("El cliente no tiene WhatsApp confirmado: cargalo en su ficha.");
  const { credencialDeOrg, chatDe, guardarMensaje } = await import("@/lib/mensajes/chats");
  const cred = await credencialDeOrg(org);
  if (!cred) {
    if (o.manual) throw new ErrorErp("No hay una línea de WhatsApp conectada (Ventas › WhatsApp).");
    await anotar(org, id, "pendiente", "Esperando que se conecte una línea de WhatsApp.");
    return "Pendiente: no hay línea de WhatsApp conectada.";
  }
  const { enviarDocumento, enviarPlantilla, estadoPlantilla, crearPlantilla } = await import("@/lib/mensajes/meta");
  const cuenta = { token: cred.token, phoneNumberId: cred.phoneNumberId };
  const nombreCbte = `${TIPOS_CBTE[d.tipo_cbte]?.nombre ?? "Factura"} ${numero(d.punto_venta, d.numero)}`;
  const { token, url } = await enlaceFactura(org, id);
  const chat = await chatDe(org, "whatsapp", d.whatsapp);
  const saludo = (d.nombre_pila || d.nombre || "").split(/[ ,]/)[0] || "";
  let r;
  if (ventanaAbierta(chat.ultimoEntranteTs)) {
    const texto = `${saludo ? `Hola ${saludo}, ` : "Hola, "}te mandamos la ${d.corregida ? "factura corregida" : "factura"} de tu compra (${nombreCbte}).`;
    r = await enviarDocumento(cuenta, d.whatsapp, url, `${nombreCbte.replace(/\s+/g, "-")}.pdf`, texto);
  } else {
    // Fuera de las 24 h: sólo con la plantilla aprobada por Meta.
    let estado: string | null;
    try {
      estado = await estadoPlantilla(cred.wabaId, cred.token, PLANTILLA_FACTURA);
      if (!estado) { await crearPlantilla(cred.wabaId, cred.token, plantillaFactura(urlPanel())); estado = "PENDING"; }
    } catch (e) {
      const motivo = `No se pudo consultar la plantilla de WhatsApp: ${e instanceof Error ? e.message : String(e)}`;
      await anotar(org, id, "pendiente", motivo);
      if (o.manual) throw new ErrorErp(motivo);
      return motivo;
    }
    if (estado !== "APPROVED") {
      const motivo = estado === "REJECTED" ? "Meta rechazó la plantilla de la factura: se manda cuando el cliente escriba (dentro de las 24 h)."
        : "La plantilla de la factura está en aprobación en Meta: sale sola cuando la aprueben.";
      await anotar(org, id, estado === "REJECTED" ? "error" : "pendiente", motivo);
      if (o.manual) throw new ErrorErp(motivo);
      return motivo;
    }
    r = await enviarPlantilla(cuenta, d.whatsapp, PLANTILLA_FACTURA, IDIOMA_PLANTILLA, [saludo || "cliente", d.corregida ? `${nombreCbte} (corregida)` : nombreCbte], token);
  }
  if (!r.ok) {
    // WhatsApp frenando o muchos mensajes seguidos: se reintenta; lo demás queda con error.
    const reintentar = r.codigo === 130429 || r.codigo === 131048 || r.codigo === 131056;
    await anotar(org, id, reintentar ? "pendiente" : "error", r.motivo);
    if (o.manual) throw new ErrorErp(r.motivo);
    return r.motivo;
  }
  await anotar(org, id, "enviado", `A ${d.whatsapp}`, true);
  await guardarMensaje({ org, chatId: chat.id, clase: "operador", texto: `📄 ${nombreCbte}${d.corregida ? " (corregida)" : ""}: ${url}`, wamid: r.wamid, estado: "enviado" }).catch(() => null);
  return `${nombreCbte} enviada por WhatsApp a ${d.whatsapp}.`;
}

/** Recién autorizada (lo llama `emitir`): si le corresponde, sale por WhatsApp. No tira. */
export async function alAutorizarWhatsapp(org: string, id: number): Promise<void> {
  try {
    const d = await datosDe(org, id);
    if (!d || !correspondeWhatsapp(d).ok) return;
    await enviarFacturaWhatsapp(org, id);
  } catch (e) {
    console.error("[factura por WhatsApp]", id, e instanceof Error ? e.message : e);
  }
}

/** Las que quedaron pendientes (plantilla en aprobación, sin línea, WhatsApp frenando), de los últimos 3 días. */
export async function reintentarFacturasWhatsapp(org: string, hastaMs: number): Promise<{ enviadas: number }> {
  const filas = await consulta<{ id: number }>(`
    select id::int from comprobante where organizacion_id = $1 and wa_estado = 'pendiente' and wa_intentos < 30
       and autorizado_ts > now() - interval '3 days' order by id limit 20`, [org]);
  let enviadas = 0;
  for (const { id } of filas) {
    if (Date.now() > hastaMs) break;
    try { if ((await enviarFacturaWhatsapp(org, id)).includes("enviada")) enviadas++; } catch { /* queda anotado */ }
  }
  return { enviadas };
}
