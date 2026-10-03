"use server";

// Configuración → Asistente: graba el nombre, la carita, las preguntas fuera
// del sistema y el tope de gasto (lib/asistente/config.ts).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, tildado } from "@/lib/erp/acciones";
import { guardarConfigAsistente } from "@/lib/asistente/config";

const VOLVER = "/config/asistente";

export async function accionGuardarAsistente(fd: FormData) {
  const s = await entrarErp("asistente_config");
  await intentar(`${VOLVER}?editar=ficha`, async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("El asistente necesita un nombre.");
    if (nombre.length > 40) throw new ErrorErp("El nombre es muy largo (hasta 40 letras).");
    const tope = numero(fd, "tope");
    if (tope == null || tope < 0) throw new ErrorErp("Poné el tope de gasto por mes en dólares (0 lo apaga).");
    await guardarConfigAsistente(s.org.id, { nombre, carita: tildado(fd, "carita"), fueraDelSistema: tildado(fd, "fuera"), topeUsd: tope });
    revalidatePath("/", "layout");
    return { ir: `${VOLVER}?ok=${encodeURIComponent("Grabado.")}` };
  });
}
