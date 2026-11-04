"use server";

// Acciones de Catálogo › Catálogos que armó ML: «Ganar» y «Soltar» (lib/precios-ml/catalogo-ganar.ts). El botón
// es el clic de Fer: el cambio sale por la cola sin lote.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, id, texto } from "@/lib/erp/acciones";
import { ErrorErp } from "@/lib/erp/base";
import { ganarCatalogo, soltarCatalogo } from "@/lib/precios-ml/catalogo-ganar";

const BASE = "/catalogo/catalogos-ml";

const datos = (fd: FormData) => {
  const canal = id(fd, "canal"), item = texto(fd, "item");
  if (!canal || !item || !/^MLA\d+$/.test(item)) throw new ErrorErp("Falta la publicación.");
  return { canal, item };
};

export async function accionGanar(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  await intentar(BASE, async () => {
    const { canal, item } = datos(fd);
    const precio = await ganarCatalogo(s.org.id, canal, item, s.usuario.id);
    revalidatePath(BASE);
    return `${item}: mandado a Mercado Libre a $ ${precio.toLocaleString("es-AR")}, fuera de las campañas. El motor de precios no la toca hasta que la sueltes.`;
  });
}

export async function accionSoltar(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  await intentar(BASE, async () => {
    const { canal, item } = datos(fd);
    await soltarCatalogo(s.org.id, canal, item);
    revalidatePath(BASE);
    return `${item}: vuelve al motor de precios.`;
  });
}
