"use server";

// Acciones de la cola de Mercado Libre: reintentar errores, descartar, y el
// clic de Fer que manda un lote preparado ("Mandar a Mercado Libre").

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, id, texto } from "@/lib/erp/acciones";
import { reintentarErrores, descartar, mandarLote, descartarLote, sacarDelLote } from "@/lib/mercadolibre/cola";
import { autorizarAgrupado, frenarAgrupado } from "@/lib/mercadolibre/agrupado-auto";

const BASE = "/config/canales/cola";
const volver = (fd: FormData) => {
  const v = texto(fd, "volver");
  return v && v.startsWith(BASE) ? v : BASE;
};
/** Después de mandar o descartar un lote, la pantalla pasa al próximo que espera el clic. */
const alSiguienteLote = (fd: FormData) => {
  const u = new URL(volver(fd), "http://x");
  u.searchParams.delete("lote");
  return u.pathname + u.search;
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
  await intentar(alSiguienteLote(fd), async () => {
    const n = await mandarLote(s.org.id, id(fd, "lote"), s.usuario.id);
    revalidatePath(BASE);
    return `Mandado: ${n} cambio${n === 1 ? "" : "s"} en la cola. Salen solos en los próximos minutos; el resultado de cada uno queda en «Enviados» o «Con error». Abajo queda elegido el próximo lote que espera tu clic, si hay.`;
  });
}

export async function accionDescartarLote(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(alSiguienteLote(fd), async () => {
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

/** El clic de Fer que autoriza agrupar los planes de todas las cuentas, de a tandas (lib/mercadolibre/agrupado-auto.ts). */
export async function accionAgruparTodo(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volver(fd), async () => {
    const n = await autorizarAgrupado(s.org.id, s.usuario.id);
    revalidatePath(BASE);
    return n ? `Agrupado en marcha en ${n} cuenta${n === 1 ? "" : "s"}: sale de a tandas, solo. El avance queda en este recuadro.` : "No hay cuentas de Mercado Libre conectadas.";
  });
}

export async function accionFrenarAgrupado(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volver(fd), async () => {
    const n = await frenarAgrupado(s.org.id);
    revalidatePath(BASE);
    return n ? "Frenado: no sale ninguna tanda más (lo que ya estaba en la cola termina de salir)." : "No estaba andando.";
  });
}
