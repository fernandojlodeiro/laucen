"use server";

// Vendedores referentes (lib/compras/referentes.ts): leer un vendedor, rearmar el cruce, ordenar con IA, marcar para
// cotizar o descartar (todas las publicaciones del mismo producto juntas).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, texto } from "@/lib/erp/acciones";
import { deFondo } from "@/lib/tareas-fondo";
import { armarCruce, decidirVarias, marcarLosQueSeVen } from "@/lib/compras/referentes";
import { pedirIa, recompararTodo } from "@/lib/compras/referentes-ia";
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

/** Ordenar con IA: agrupa lo que falta y lo compara con el catálogo (lib/compras/referentes-ia.ts). Con «recomparar», vuelve
 *  a comparar todos los grupos (después de cargar productos nuevos). */
export async function accionIa(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const recomparar = fd.get("recomparar") === "1";
  return deFondo(s, "referentes-ia", "Ordenar con IA", async () => {
    if (recomparar) await recompararTodo(s.org.id);
    await pedirIa(s.org.id);
    revalidatePath(LISTA);
    return "La IA está ordenando la lista: tarda unos minutos y el avance se ve debajo del título.";
  });
}

/** La caja «Cotizar» (graba al tocarla): tildada = para cotizar; destildada = sin decidir. */
export async function accionCotizar(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await decidirVarias(s.org.id, String(fd.get("items")).split(","), fd.get("valor") === "1" ? "cotizar" : null, s.usuario.id);
  revalidatePath(LISTA);
}

export async function accionDescartar(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await intentar(volver(fd), async () => {
    await decidirVarias(s.org.id, String(fd.get("items")).split(","), fd.get("deshacer") === "1" ? null : "descartado", s.usuario.id);
    revalidatePath(LISTA);
  });
}

/** «Marcar los N que se ven para cotizar» / «Desmarcar los que se ven»: con los filtros de la pantalla (campo `filtros`, la
 *  dirección sin la página). */
export async function accionMarcarVistos(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const sp = Object.fromEntries(new URLSearchParams(String(fd.get("filtros") ?? "")));
  const marcar = fd.get("marcar") === "1";
  return deFondo(s, `referentes-marcar-${marcar ? "1" : "0"}`, marcar ? "Marcar para cotizar" : "Desmarcar", async () => {
    const n = await marcarLosQueSeVen(s.org.id, sp, marcar, s.usuario.id);
    revalidatePath(LISTA);
    return marcar ? `${n} productos marcados para cotizar.` : `${n} productos desmarcados.`;
  });
}
