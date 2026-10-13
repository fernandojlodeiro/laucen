"use server";

// Configuración › Respuestas de la IA (pedido de Fer, 13/10): las reglas que la IA
// respeta al contestar preguntas y mensajes de Mercado Libre y WhatsApp. Una sola
// para toda la empresa (config_org 'reglas_ia'); la firma sigue siendo de cada canal.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp } from "@/lib/erp/base";
import { intentar } from "@/lib/erp/acciones";
import { guardarReglasIa } from "@/lib/canales/textos";

const VOLVER = "/config/respuestas-ia";
const MAXIMO_REGLAS = 5000;

export async function accionGuardarReglasIa(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(VOLVER, async () => {
    const t = String(fd.get("reglas") ?? "").replace(/\r\n?/g, "\n");
    if (t.trim().length > MAXIMO_REGLAS) throw new ErrorErp(`Las reglas: hasta ${MAXIMO_REGLAS} letras.`);
    await guardarReglasIa(s.org.id, t);
    revalidatePath(VOLVER);
    return "Reglas grabadas: valen desde la próxima respuesta.";
  });
}
