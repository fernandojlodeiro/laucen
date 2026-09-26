"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { avanzar, crearCorrida, revisar } from "@/lib/piloto/proceso";
import { POR_DEFECTO, type Parametros } from "@/lib/piloto/tipos";

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
    modo: formData.get("modo") === "avion" ? "avion" : "barco",
    fleteM3Usd: numero(formData.get("fleteM3Usd"), d.fleteM3Usd)!,
    fleteKgUsd: numero(formData.get("fleteKgUsd"), d.fleteKgUsd)!,
    dolar: numero(formData.get("dolar"), d.dolar)!,
    seguroPct: numero(formData.get("seguroPct"), d.seguroPct)!,
    grisPct: numero(formData.get("grisPct"), d.grisPct)!,
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
