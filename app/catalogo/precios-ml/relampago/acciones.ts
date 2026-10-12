"use server";

// Precios en ML › Ofertas relámpago: grabar el piso de un producto y preparar el lote para entrar. Entrar sale a Mercado
// Libre sólo con el clic de «Mandar a Mercado Libre» del lote (una relámpago activada no se puede borrar).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, id, numero } from "@/lib/erp/acciones";
import { entrarRelampago, guardarPiso, guardarPrecioRelampago, prepararRelampagos } from "@/lib/precios-ml/relampago";
import { texto } from "@/lib/erp/acciones";
import { RELAMPAGO_PML } from "@/app/catalogo/precios-ml/lista";

const volver = (fd: FormData) => texto(fd, "volver") || (id(fd, "canal") ? `${RELAMPAGO_PML}?canal=${id(fd, "canal")}` : RELAMPAGO_PML);

export async function accionGuardarPiso(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  await intentar(volver(fd), async () => {
    await guardarPiso(s.org.id, id(fd, "producto"), numero(fd, "piso"));
    revalidatePath(RELAMPAGO_PML);
    return "Grabado.";
  });
}

/** El precio de entrada de una fila, a mano (vacío: vuelve al sugerido). */
export async function accionGuardarPrecioRelampago(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  await intentar(volver(fd), async () => {
    await guardarPrecioRelampago(s.org.id, id(fd, "canal"), texto(fd, "item") ?? "", numero(fd, "precio"));
    revalidatePath(RELAMPAGO_PML);
    return "Grabado.";
  });
}

export async function accionPrepararRelampagos(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  await intentar(volver(fd), async () => {
    const r = await prepararRelampagos(s.org.id, s.usuario.id, id(fd, "canal") || null);
    revalidatePath(RELAMPAGO_PML);
    return r.filas
      ? `Preparado${r.lotes.length === 1 ? "" : "s"} ${r.lotes.length} lote${r.lotes.length === 1 ? "" : "s"} (${r.lotes.join(", ")}) con ${r.filas} publicacion${r.filas === 1 ? "" : "es"}: salen con «Mandar a Mercado Libre» en Configuración › Cola de Mercado Libre, pestaña Lotes preparados.`
      : "Ninguna propuesta alcanza el piso con el stock que pide (o ya están preparadas).";
  });
}

/** «Entrar» de una fila: tu clic manda la oferta a Mercado Libre (por la cola, en un par de minutos). */
export async function accionEntrarRelampago(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  await intentar(volver(fd), async () => {
    const f = await entrarRelampago(s.org.id, s.usuario.id, id(fd, "canal"), texto(fd, "item") ?? "");
    revalidatePath(RELAMPAGO_PML);
    return `Mandada: ${f.item_id} entra a la oferta relámpago a ${f.rel!.toLocaleString("es-AR")} con ${f.stock_min} unidades. Sale a Mercado Libre en un par de minutos; en la columna «Entrar» ves si la aceptó.`;
  });
}
