"use server";

// Configuración › Plantillas de WhatsApp: mandar una plantilla a Meta con un clic.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar } from "@/lib/erp/acciones";
import { mandarPlantilla } from "@/lib/mensajes/plantillas-cuenta";

const VOLVER = "/config/plantillas-whatsapp";

export async function accionMandarPlantilla(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(VOLVER, async () => {
    const r = await mandarPlantilla(s.org.id, String(fd.get("nombre") ?? ""));
    revalidatePath(VOLVER);
    return r;
  });
}
