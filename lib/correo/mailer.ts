// El correo de Laucen (Fer, 24/10). Lo mismo que CadaMes (src/lib/mailer.ts):
// sale por el SMTP de Google Workspace con una casilla real y su contraseña de
// aplicación —por Resend, los mails caían en Promociones o spam: lo que pesa es la
// reputación de por dónde sale, no cómo se ve—. La cuenta, la contraseña y el
// "Responder a" se cargan en Configuración › Correo (correo_config).
//
// El remitente es el de la marca (hola@daitom.com.ar, hola@tiendavirtual.com.ar…):
// para que Gmail lo acepte, esa dirección tiene que estar en "Enviar como" de la
// casilla que manda; si no, Google la reemplaza por la casilla.
//
// Nunca tira: devuelve si salió y el motivo. Cada envío queda en correo_enviado,
// y con `clave` no se manda dos veces lo mismo (ej. "pedido:123:pagado").
// No se le manda a un dominio que no recibe correo (sin MX): mandarle a
// direcciones que no existen es como se quema la reputación de una casilla.

import type { Transporter } from "nodemailer";
import { consulta, una } from "@/lib/erp/base";

export type Remitente = { nombre: string; email: string | null };
export type Mail = {
  para: string; asunto: string; html: string; texto?: string;
  remitente: Remitente; tipo: string; clave?: string | null;
  pedidoId?: number | null; comprobanteId?: number | null;
  adjuntos?: { nombre: string; datos: Uint8Array; tipo: string }[];
};
export type Resultado = { ok: boolean; motivo?: string; ya?: boolean };

type Config = { smtp_usuario: string | null; smtp_clave: string | null; responder_a: string | null; activo: boolean };

export async function configCorreo(org: string): Promise<Config | null> {
  return una<Config>("select smtp_usuario, smtp_clave, responder_a, activo from correo_config where organizacion_id = $1", [org]);
}

export const correoListo = (c: Config | null): c is Config & { smtp_usuario: string; smtp_clave: string } =>
  !!c?.activo && !!c.smtp_usuario && !!c.smtp_clave;

// ── El dominio tiene que poder recibir ─────────────────
const dominiosVistos = new Map<string, boolean>();

/** ¿El dominio de esa dirección recibe correo? Pide MX y nada más; si el DNS no contesta, se manda igual. */
export async function puedeRecibir(email: string): Promise<boolean> {
  const dominio = email.split("@")[1]?.trim().toLowerCase();
  if (!dominio || !dominio.includes(".")) return false;
  const visto = dominiosVistos.get(dominio);
  if (visto !== undefined) return visto;
  let recibe: boolean;
  try {
    const dns = await import("node:dns/promises");
    const mx = await dns.resolveMx(dominio);
    recibe = mx.some((r) => r.exchange.trim() !== "" && r.exchange.trim() !== ".");
  } catch (e) {
    const codigo = (e as { code?: string }).code ?? "";
    recibe = !["ENODATA", "ENOTFOUND", "NXDOMAIN"].includes(codigo);
  }
  dominiosVistos.set(dominio, recibe);
  return recibe;
}

// La conexión SMTP se reusa (abrirla es lo caro); se rehace si cambia la cuenta.
let smtp: { clave: string; t: Transporter } | null = null;

async function transporte(c: Config & { smtp_usuario: string; smtp_clave: string }): Promise<Transporter> {
  const clave = `${c.smtp_usuario}:${c.smtp_clave}`;
  if (smtp?.clave === clave) return smtp.t;
  const { createTransport } = await import("nodemailer");
  // La contraseña de aplicación de Google se muestra en cuatro bloques con espacios: sin espacios.
  const t = createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: c.smtp_usuario, pass: c.smtp_clave.replace(/\s+/g, "") } });
  smtp = { clave, t };
  return t;
}

const comillas = (s: string) => `"${s.replace(/["\\]/g, "")}"`;

async function anotar(org: string, m: Mail, r: Resultado, remitente: string | null) {
  try {
    await consulta(`insert into correo_enviado (organizacion_id, clave, tipo, para, remitente, asunto, salio, motivo, pedido_id, comprobante_id)
                    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [org, r.ok ? m.clave ?? null : null, m.tipo, m.para.slice(0, 200), remitente, m.asunto.slice(0, 200), r.ok, r.ok ? null : (r.motivo ?? "").slice(0, 300) || null,
       m.pedidoId ?? null, m.comprobanteId ?? null]);
  } catch (e) {
    console.error("[correo] no se pudo anotar el envío:", e instanceof Error ? e.message : e);
  }
}

/** Manda un mail por la cuenta de la organización. No tira nunca. */
export async function enviarMail(org: string, m: Mail): Promise<Resultado> {
  const para = m.para.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return { ok: false, motivo: "mail_invalido" };
  if (m.clave && await una("select 1 from correo_enviado where organizacion_id = $1 and clave = $2 and salio", [org, m.clave])) return { ok: true, ya: true };
  const c = await configCorreo(org);
  if (!correoListo(c)) return { ok: false, motivo: "sin_configurar" };
  const desde = m.remitente.email || c.smtp_usuario;
  const from = `${comillas(m.remitente.nombre)} <${desde}>`;
  let r: Resultado;
  if (!(await puedeRecibir(para))) r = { ok: false, motivo: "dominio_sin_correo" };
  else {
    try {
      await (await transporte(c)).sendMail({
        from, to: para, subject: m.asunto, html: m.html, text: m.texto ?? aTextoPlano(m.html),
        // Las respuestas, a la casilla que se mira (Configuración › Correo); si no hay, al remitente.
        replyTo: c.responder_a || desde,
        attachments: m.adjuntos?.map((a) => ({ filename: a.nombre, content: Buffer.from(a.datos), contentType: a.tipo })),
      });
      r = { ok: true };
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      console.error("[correo]", m.tipo, motivo);
      smtp = null; // por si la conexión quedó mal: la próxima se rehace
      r = { ok: false, motivo };
    }
  }
  await anotar(org, { ...m, para }, r, desde);
  return r;
}

/** Lo que ve una persona cuando un mail no salió: sin nada de la cocina (el detalle queda en el registro). */
export function motivoLegible(motivo?: string): string {
  if (motivo === "sin_configurar") return "Todavía no está configurado el correo (Configuración › Correo).";
  if (motivo === "dominio_sin_correo" || motivo === "mail_invalido") return "Esa dirección de mail no existe o está mal escrita.";
  return "No se pudo mandar el mail. Probá de nuevo en un rato.";
}

function aTextoPlano(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2: $1")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/h\d>|<\/tr>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** El sobre de todos los mails: el nombre de la marca arriba (sin imágenes: los clientes de
 *  correo las bloquean), título, cuerpo, un botón con el link escrito abajo por si no anda, y
 *  el pie con la marca y su web. */
/** El WhatsApp para la firma: 5491178442020 → +54 9 11 7844-2020 (otro formato, tal cual con el +). */
export function whatsappLegible(n: string): string {
  const d = n.replace(/\D/g, "");
  const m = d.match(/^549(11|2\d{2}|3\d{2})(\d{3,4})(\d{4})$/);
  return m ? `+54 9 ${m[1]} ${m[2]}-${m[3]}` : `+${d}`;
}

/** El mail entero. `titulo` null = un mail normal, sin el título grande (Fer, 25/10: la factura). Todos terminan
 *  con la misma firma: «Saludos», la marca y por dónde comunicarse (este mail o el WhatsApp de la tienda). */
export function plantilla(marca: { nombre: string; web: string; color?: string | null; whatsapp?: string | null }, titulo: string | null, cuerpo: string, boton?: { texto: string; url: string }) {
  const color = marca.color && /^#[0-9a-f]{6}$/i.test(marca.color) ? marca.color : "#3483FA";
  const web = marca.web.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const wa = marca.whatsapp?.replace(/\D/g, "") || null;
  // Documento entero con viewport: sin eso, el celular lo dibuja como en una pantalla ancha y lo achica
  // o lo agranda a su gusto (Fer, 24/10: el total se partía en dos renglones). Márgenes chicos para que
  // en el celular el contenido tenga lugar.
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F5"><div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F5F5F5;padding:16px 8px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5E5E5;border-radius:12px;padding:22px 18px">
    <div style="font-size:15px;font-weight:700;color:#333">${escapar(marca.nombre)}</div>
    ${titulo ? `<h1 style="font-size:20px;margin:14px 0 16px;color:#222">${escapar(titulo)}</h1>` : `<div style="height:14px"></div>`}
    <div style="font-size:15px;line-height:1.6;color:#444;overflow-wrap:anywhere">${cuerpo}</div>
    ${boton ? `<p style="margin:24px 0 8px"><a href="${escapar(boton.url)}" style="background:${color};color:#fff;text-decoration:none;font-weight:700;border-radius:8px;padding:12px 22px;display:inline-block">${escapar(boton.texto)}</a></p>
    <p style="font-size:12px;color:#777;margin-top:16px">Si el botón no funciona, copiá y pegá este link:<br><span style="color:#2968C8;word-break:break-all">${escapar(boton.url)}</span></p>` : ""}
    <p style="font-size:15px;line-height:1.6;color:#444;margin:22px 0 0">Saludos,<br><b>${escapar(marca.nombre)}</b></p>
    <p style="font-size:13px;line-height:1.5;color:#666;margin:10px 0 0">Cualquier cosa, podés comunicarte respondiendo este mail${wa
      ? ` o por WhatsApp al <a href="https://wa.me/${wa}" style="color:${color};font-weight:700;white-space:nowrap">${escapar(whatsappLegible(wa))}</a>` : ""}.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#999;margin-top:16px">${escapar(marca.nombre)} · ${escapar(web)}</p>
</div></body></html>`;
}
