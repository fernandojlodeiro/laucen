"use server";

// Precios en ML › Ofertas relámpago: grabar el piso de un producto y preparar el lote para entrar. Entrar sale a Mercado
// Libre sólo con el clic de «Mandar a Mercado Libre» del lote (una relámpago activada no se puede borrar).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, id, numero } from "@/lib/erp/acciones";
import { guardarPiso, prepararRelampagos } from "@/lib/precios-ml/relampago";
import { RELAMPAGO_PML } from "@/app/catalogo/precios-ml/lista";

const volver = (fd: FormData) => {
  const c = id(fd, "canal");
  return c ? `${RELAMPAGO_PML}?canal=${c}` : RELAMPAGO_PML;
};

export async function accionGuardarPiso(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  await intentar(volver(fd), async () => {
    await guardarPiso(s.org.id, id(fd, "producto"), numero(fd, "piso"));
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
