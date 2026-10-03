"use server";
// Ventas › WhatsApp › Configuración: graba la IA de la tienda (nombre, lo que
// sabe, tope, límite por hora, marca del teléfono, espera) y el interruptor
// general; desconectar el número.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero } from "@/lib/erp/acciones";
import { configMensajes, guardarConfigMensajes } from "@/lib/mensajes/config";
import { revisarMarca } from "@/lib/mensajes/reglas";

const VOLVER = "/ventas/mensajes/configuracion";

export async function accionGuardarMensajes(fd: FormData) {
  const s = await entrarErp("mensajes_config");
  await intentar(`${VOLVER}?editar=ficha`, async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("La IA necesita un nombre.");
    if (nombre.length > 40) throw new ErrorErp("El nombre es muy largo (hasta 40 letras).");
    const tope = numero(fd, "tope");
    if (tope == null || tope < 0) throw new ErrorErp("Poné el tope de gasto por mes en dólares (0 la apaga).");
    const porHora = numero(fd, "por_hora");
    if (porHora == null || porHora < 1 || porHora > 200) throw new ErrorErp("El límite por hora va de 1 a 200 respuestas.");
    const espera = numero(fd, "espera");
    if (espera == null || espera < 0 || espera > 40) throw new ErrorErp("La espera va de 0 a 40 segundos.");
    const marca = revisarMarca(fd.get("marca"));
    if (!marca.ok) throw new ErrorErp(marca.motivo);
    const info = String(fd.get("info") ?? "").slice(0, 20_000);
    await guardarConfigMensajes(s.org.id, { ...(await configMensajes(s.org.id)), nombre, topeUsd: tope, porHora, esperaSeg: espera, marca: marca.marca, info });
    revalidatePath("/ventas/mensajes", "layout");
    return { ir: `${VOLVER}?ok=${encodeURIComponent("Grabado.")}` };
  });
}

/** La IA de todos los chats, con un clic. */
export async function accionIaGeneral(fd: FormData) {
  const s = await entrarErp("mensajes_config");
  await intentar(VOLVER, async () => {
    const prendido = fd.get("valor") === "1";
    await guardarConfigMensajes(s.org.id, { ...(await configMensajes(s.org.id)), iaActiva: prendido });
    revalidatePath("/ventas/mensajes", "layout");
    return prendido ? "La IA vuelve a contestar los mensajes." : "La IA quedó apagada: los mensajes los contestan ustedes.";
  });
}

export async function accionDesconectar() {
  const s = await entrarErp("mensajes_config");
  await intentar(VOLVER, async () => {
    await consulta("update wa_credencial set estado = 'desconectado' where organizacion_id = $1", [s.org.id]);
    return "Listo: Laucen dejó de recibir y contestar los mensajes de ese número. En el teléfono sigue andando.";
  });
}
