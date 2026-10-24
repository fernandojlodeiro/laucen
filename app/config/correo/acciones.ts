"use server";

// Configuración › Correo (correo_config, lib/correo/mailer.ts): la cuenta que manda, su contraseña
// de aplicación (nunca vuelve a la pantalla: vacía = queda la que estaba), "Responder a",
// prenderlo/apagarlo y mandar un mail de prueba.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, ErrorErp } from "@/lib/erp/base";
import { intentar, texto } from "@/lib/erp/acciones";
import { enviarMail, motivoLegible, plantilla } from "@/lib/correo/mailer";
import { tiendaParaPedido } from "@/lib/correo/mails";
import { nombreTienda } from "@/lib/tienda/tienda";
import { urlTienda } from "@/lib/tienda/dominios-tienda";

const BASE = "/config/correo";
const esMail = (x: string | null) => !!x && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);

export async function accionGuardarCorreo(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(BASE, async () => {
    const usuario = texto(fd, "smtp_usuario")?.toLowerCase() ?? null, clave = texto(fd, "smtp_clave"), responder = texto(fd, "responder_a")?.toLowerCase() ?? null;
    if (usuario && !esMail(usuario)) throw new ErrorErp("La cuenta que manda tiene que ser un mail (ej. fer@cadames.com.ar).");
    if (responder && !esMail(responder)) throw new ErrorErp("«Responder a» tiene que ser un mail.");
    if (clave && clave.replace(/\s+/g, "").length !== 16) throw new ErrorErp("La contraseña de aplicación de Google tiene 16 letras (se muestra en cuatro grupos de cuatro).");
    await consulta(`insert into correo_config (organizacion_id, smtp_usuario, smtp_clave, responder_a) values ($1, $2, $3, $4)
                    on conflict (organizacion_id) do update set smtp_usuario = excluded.smtp_usuario,
                      smtp_clave = coalesce(excluded.smtp_clave, correo_config.smtp_clave), responder_a = excluded.responder_a, actualizado_ts = now()`,
      [s.org.id, usuario, clave ? clave.replace(/\s+/g, "") : null, responder]);
    revalidatePath(BASE);
    return "Grabado.";
  });
}

export async function accionActivarCorreo(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(BASE, async () => {
    const activo = fd.get("valor") === "1";
    await consulta(`insert into correo_config (organizacion_id, activo) values ($1, $2)
                    on conflict (organizacion_id) do update set activo = excluded.activo, actualizado_ts = now()`, [s.org.id, activo]);
    revalidatePath(BASE);
    return activo ? "Prendido: Laucen manda los mails a los clientes." : "Apagado: Laucen no manda ningún mail a los clientes.";
  });
}

export async function accionProbarCorreo(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(BASE, async () => {
    const para = texto(fd, "para")?.toLowerCase() ?? null;
    if (!esMail(para)) throw new ErrorErp("Escribí a qué mail mandar la prueba.");
    const t = await tiendaParaPedido(s.org.id, null);
    const marca = { nombre: t ? nombreTienda(t) : s.org.nombre, web: t ? await urlTienda(t) : "laucen.com", color: t?.config.color_boton ?? null };
    const r = await enviarMail(s.org.id, {
      para: para!, asunto: `Prueba del correo de ${marca.nombre}`, tipo: "prueba", remitente: { nombre: marca.nombre, email: t?.config.email ?? null },
      html: plantilla(marca, "Prueba del correo", "<p>Si te llegó a la bandeja de entrada (y no a spam), el correo de Laucen está andando. Probá responderlo: la respuesta tiene que llegar a la casilla de «Responder a».</p>"),
    });
    revalidatePath(BASE);
    if (!r.ok) throw new ErrorErp(motivoLegible(r.motivo));
    return `Prueba mandada a ${para}. Fijate que llegue a la bandeja de entrada.`;
  });
}
