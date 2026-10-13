"use server";

// Sugerencia de compra: grabar los montos y criterios de «¿avión o barco?» (lib/compras/via.ts).

import { revalidatePath, revalidateTag } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, numero } from "@/lib/erp/acciones";
import { CAMPOS_VIA, guardarConfigVia, type ConfigVia } from "@/lib/compras/via";
import { pedirTanda } from "@/lib/compras/precio-mercado";
import { consulta } from "@/lib/erp/base";
import { deFondo } from "@/lib/tareas-fondo";

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

/** Busca el precio de mercado (Mercado Libre, Apify) de los productos de la lista que se está viendo. */
export async function accionPrecioMercado(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const ids = String(fd.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return deFondo(s, "precio-mercado", "Precio de mercado", async () => {
    const productos = await consulta<{ id: number; titulo: string }>("select id::int, titulo from producto where organizacion_id = $1 and id = any($2::bigint[])", [s.org.id, ids]);
    const r = await pedirTanda(s.org.id, s.usuario.id, productos);
    revalidatePath(LISTA);
    return `Buscando ${r.total} productos en Mercado Libre (unos US$ ${r.usd.toFixed(2)}). Tarda unos ${Math.max(2, Math.ceil(r.total / 25) * 4)} minutos; la columna «Mercado» se va llenando.`;
  });
}
