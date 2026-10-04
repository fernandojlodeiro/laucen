"use server";

// Acciones de la cola de Mercado Libre: reintentar errores, descartar, y el
// clic de Fer que manda un lote preparado ("Mandar a Mercado Libre").

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, id, texto } from "@/lib/erp/acciones";
import { reintentarErrores, descartar, mandarLote, descartarLote, sacarDelLote } from "@/lib/mercadolibre/cola";

const BASE = "/config/canales/cola";
const volver = (fd: FormData) => {
  const v = texto(fd, "volver");
  return v && v.startsWith(BASE) ? v : BASE;
};

export async function accionReintentarErrores(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volver(fd), async () => {
    const fila = id(fd, "id");
    const n = await reintentarErrores(s.org.id, id(fd, "canal") || null, fila ? [fila] : undefined);
    revalidatePath(BASE);
    return n ? `Vuelven a la cola ${n} cambio${n === 1 ? "" : "s"}: salen en los próximos minutos.` : "No había nada para reintentar (o ya hay un cambio más nuevo esperando).";
  });
}

export async function accionDescartar(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volver(fd), async () => {
    const n = await descartar(s.org.id, [id(fd, "id")].filter(Boolean));
    revalidatePath(BASE);
    return n ? "Descartado: no se manda." : "Ya no estaba pendiente.";
  });
}

export async function accionMandarLote(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volver(fd), async () => {
    const n = await mandarLote(s.org.id, id(fd, "lote"), s.usuario.id);
    revalidatePath(BASE);
    return `Mandado: ${n} cambio${n === 1 ? "" : "s"} en la cola. Salen solos en los próximos minutos; el resultado de cada uno queda en «Enviados» o «Con error».`;
  });
}

export async function accionDescartarLote(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volver(fd), async () => {
    await descartarLote(s.org.id, id(fd, "lote"));
    revalidatePath(BASE);
    return "Lote descartado: no se mandó nada.";
  });
}

/** El tacho de una fila de un lote preparado: ese cambio no sale. */
export async function accionSacarDelLote(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volver(fd), async () => {
    const quedan = await sacarDelLote(s.org.id, id(fd, "id"));
    revalidatePath(BASE);
    return quedan ? `Sacado del lote: no se manda. Quedan ${quedan} en el lote.` : "Sacado del lote. No quedaba nada más: el lote quedó descartado.";
  });
}
