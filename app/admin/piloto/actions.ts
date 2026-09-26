"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { buscarCategorias } from "@/lib/radar/categorias";
import { avanzar, crearCorrida, revisar } from "@/lib/piloto/proceso";
import { POR_DEFECTO, type Parametros } from "@/lib/piloto/tipos";

/** Buscador de categorías del formulario (devuelve la lista, no navega). */
export async function accionBuscarCategorias(texto: string) {
  if (!(await sosVos()) || texto.trim().length < 2) return [];
  const r = await buscarCategorias(texto.trim(), 30);
  return r.map((c) => ({ id: c.id, ruta: c.ruta, nivel: c.nivel }));
}

const numero = (v: FormDataEntryValue | null, def: number | null) => {
  const t = String(v ?? "").replace(/\./g, "").replace(",", ".").trim();
  if (!t) return def;
  const n = Number(t);
  return Number.isFinite(n) ? n : def;
};

export async function accionCrearPiloto(formData: FormData) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  let categorias: Parametros["categorias"] = [];
  try {
    categorias = JSON.parse(String(formData.get("cats") ?? "[]"));
  } catch { /* queda vacío */ }
  if (!categorias.length) redirect("/admin/piloto?error=categorias");
  const d = POR_DEFECTO;
  const p: Parametros = {
    categorias: categorias.slice(0, 20),
    precioMin: numero(formData.get("precioMin"), null),
    precioMax: numero(formData.get("precioMax"), null),
    porCategoria: numero(formData.get("porCategoria"), d.porCategoria)!,
    listado: numero(formData.get("listado"), d.listado)!,
    fleteM3Usd: numero(formData.get("fleteM3Usd"), d.fleteM3Usd)!,
    dolar: numero(formData.get("dolar"), d.dolar)!,
    topeFletePct: numero(formData.get("topeFletePct"), d.topeFletePct)!,
    yuanPorDolar: numero(formData.get("yuanPorDolar"), d.yuanPorDolar)!,
    minimoMax: numero(formData.get("minimoMax"), d.minimoMax)!,
    topeApifyUsd: numero(formData.get("topeApifyUsd"), d.topeApifyUsd)!,
  };
  const id = await crearCorrida(sesion.org.id, p);
  redirect(`/admin/piloto/${id}`);
}

/** Una tanda de trabajo del piloto (la pantalla la repite hasta terminar). */
export async function accionAvanzar(id: number) {
  if (!(await sosVos())) return { terminado: true, hecho: "Sin permiso" };
  const sesion = await sesionRequerida();
  try {
    return await avanzar(id, sesion.org.id, Date.now() + 270_000);
  } catch (e) {
    console.error("[piloto] avanzar:", e);
    return { terminado: false, hecho: "Hubo un problema en esta tanda; se reintenta.", fallo: true };
  }
}

export async function accionRevisar(formData: FormData) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const id = Number(formData.get("producto"));
  const revision = String(formData.get("revision") ?? "") || null;
  const comentario = String(formData.get("comentario") ?? "").trim() || null;
  await revisar(id, sesion.org.id, revision, comentario);
  revalidatePath(`/admin/piloto/${formData.get("corrida")}/revision`);
}
