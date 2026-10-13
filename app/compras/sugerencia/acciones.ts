"use server";

// Sugerencia de compra: grabar los montos y criterios de «¿avión o barco?» (lib/compras/via.ts).

import { revalidatePath, revalidateTag } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, numero } from "@/lib/erp/acciones";
import { CAMPOS_VIA, guardarConfigVia, type ConfigVia } from "@/lib/compras/via";

const LISTA = "/compras/sugerencia";

export async function accionGuardarVia(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await intentar(LISTA, async () => {
    const c = Object.fromEntries(CAMPOS_VIA.map(([k]) => [k, numero(fd, k) ?? -1])) as ConfigVia;
    await guardarConfigVia(s.org.id, c);
    revalidateTag(`sugerencia-compra-${s.org.id}`);
    revalidatePath(LISTA);
    return "Grabado.";
  });
}
