"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sosVos } from "@/lib/admin";
import { orgRequerida } from "@/lib/tenancy";
import { motivoErp } from "@/lib/erp/base";
import { borrarBasuraDeVs } from "@/lib/limpieza-listas";
import { borrarFantasmas, revisarFantasmas } from "@/lib/mercadolibre/fantasmas";
import {
  borrarFamiliasVs, borrarNotebooksSinStock, borrarPruebas, categoriasPorPredictor, categoriasPorPublicacion,
} from "@/lib/limpieza";

async function portero() {
  if (!(await sosVos())) redirect("/panel");
  return (await orgRequerida()).id;
}

function volver(mensaje: string, error = false): never {
  revalidatePath("/admin/limpieza");
  redirect(`/admin/limpieza?${error ? "error" : "ok"}=${encodeURIComponent(mensaje)}`);
}

export async function accionBorrarPruebas() {
  const org = await portero();
  let r;
  try { r = await borrarPruebas(org); } catch (e) { volver(motivoErp(e), true); }
  volver(`Borrado: ${r.pedidos} pedidos, ${r.picking} renglones de picking, ${r.envios} envíos, ${r.pagos} pagos, ${r.reclamos} reclamos, ${r.cargos} cargos de ML y ${r.movimientos} movimientos de stock.`);
}

export async function accionBorrarNotebooks() {
  const org = await portero();
  let r;
  try { r = await borrarNotebooksSinStock(org); } catch (e) { volver(motivoErp(e), true); }
  volver(`Notebooks sin stock borradas: ${r.simples} productos (de ellos, ${r.kits} kits).`);
}

export async function accionBorrarFamiliasVs() {
  const org = await portero();
  let r;
  try { r = await borrarFamiliasVs(org); } catch (e) { volver(motivoErp(e), true); }
  volver(`Familias de Virtual Seller borradas: ${r.familias}.`);
}

/** Un paso de la detección de categorías. `desde = 0` arranca por las
 *  publicaciones de ML (aunque estén pausadas); después sigue el predictor de
 *  a lotes hasta que no queden productos sin categoría. */
export async function accionCategorias(desde: number) {
  const org = await portero();
  try {
    let previo = { porPublicacion: 0, reubicados: 0 };
    if (desde === 0) previo = await categoriasPorPublicacion(org);
    const r = await categoriasPorPredictor(org, desde, 20);
    return { ok: true as const, ...r, ...previo };
  } catch (e) {
    return { ok: false as const, error: motivoErp(e) };
  }
}

/** Compara las publicaciones de una cuenta con las que ML devuelve ahora. Sólo lectura. */
export async function accionRevisarFantasmas(canalId: number) {
  const org = await portero();
  try {
    const r = await revisarFantasmas(org, canalId, Date.now() + 50_000);
    return { ok: true as const, enLaucen: r.enLaucen, enMl: r.enMl, faltan: r.fantasmas.length, soloEnMl: r.soloEnMl, ejemplos: r.ejemplos, confiable: r.confiable, motivo: r.motivo };
  } catch (e) {
    return { ok: false as const, error: motivoErp(e) };
  }
}

/** Borra de Laucen (nunca de ML) las publicaciones que ML ya no tiene. Vuelve a leer ML antes. */
export async function accionBorrarFantasmas(canalId: number) {
  const org = await portero();
  try {
    const r = await borrarFantasmas(org, canalId, Date.now() + 50_000);
    revalidatePath("/admin/limpieza");
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: motivoErp(e) };
  }
}

export async function accionBorrarBasura() {
  const org = await portero();
  let n;
  try { n = await borrarBasuraDeVs(org); } catch (e) { volver(motivoErp(e), true); }
  volver(`Basura de Virtual Seller borrada: ${n} productos.`);
}
