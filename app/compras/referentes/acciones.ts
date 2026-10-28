"use server";

// Vendedores referentes (lib/compras/referentes.ts): leer un vendedor, rearmar el cruce, marcar para cotizar o descartar.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, texto } from "@/lib/erp/acciones";
import { deFondo } from "@/lib/tareas-fondo";
import { armarCruce, decidir } from "@/lib/compras/referentes";
import { pedirVendedor } from "@/lib/compras/vendedor-referente";

const LISTA = "/compras/referentes";
const volver = (fd: FormData) => { const v = String(fd.get("volver") ?? ""); return v.startsWith(LISTA) ? v : LISTA; };

export async function accionLeerVendedor(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await intentar(LISTA, async () => {
    const r = await pedirVendedor(s.org.id, texto(fd, "link") ?? "", texto(fd, "nombre") ?? "");
    revalidatePath(LISTA);
    return `Leyendo el vendedor (hasta US$ ${r.usd.toFixed(2)} de Apify). Tarda unos minutos; al terminar se suma a la lista.`;
  });
}

export async function accionCruce() {
  const s = await entrarErp("compras_ver");
  return deFondo(s, "referentes-cruce", "Cruce con el catálogo", async () => {
    const r = await armarCruce(s.org.id);
    revalidatePath(LISTA);
    return `Cruce listo: ${r.publicaciones} publicaciones, ${r.tenemos} ya las tenés.`;
  });
}

/** La caja «Cotizar» (graba al tocarla): tildada = para cotizar; destildada = sin decidir. */
export async function accionCotizar(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await decidir(s.org.id, String(fd.get("item")), fd.get("valor") === "1" ? "cotizar" : null, s.usuario.id);
  revalidatePath(LISTA);
}

export async function accionDescartar(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await intentar(volver(fd), async () => {
    await decidir(s.org.id, String(fd.get("item")), fd.get("deshacer") === "1" ? null : "descartado", s.usuario.id);
    revalidatePath(LISTA);
  });
}
