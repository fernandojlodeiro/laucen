// Ayudas para las acciones de servidor del ERP: leer el formulario y volver
// a la pantalla con un aviso (?ok=… o ?error=… ya en criollo).

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { leerNumero } from "@/lib/numeros";
import { motivoErp } from "@/lib/erp/base";

export const texto = (fd: FormData, k: string): string | null => {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
export const numero = (fd: FormData, k: string): number | null => leerNumero(fd.get(k));
export const entero = (fd: FormData, k: string): number | null => {
  const n = leerNumero(fd.get(k));
  return n == null ? null : Math.trunc(n);
};
export const id = (fd: FormData, k = "id"): number => {
  const n = Number(fd.get(k));
  return Number.isInteger(n) && n > 0 ? n : 0;
};
export const tildado = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "1";

function conAviso(volver: string, clave: "ok" | "error", mensaje: string) {
  const [base, query = ""] = volver.split("?");
  const p = new URLSearchParams(query);
  p.delete("ok"); p.delete("error");
  p.set(clave, mensaje);
  return `${base}?${p}`;
}

/** Corre la acción y vuelve a `volver`: con ?ok= si salió (si `fn` devuelve
 *  otra dirección, va ahí), o con ?error= en criollo si falló. */
export async function intentar(volver: string, fn: () => Promise<string | { ok: string } | { ir: string } | void>): Promise<never> {
  let destino: string;
  try {
    const r = await fn();
    destino = typeof r === "string" ? conAviso(volver, "ok", r) : r && "ir" in r ? r.ir : r && "ok" in r ? conAviso(volver, "ok", r.ok) : volver;
  } catch (e) {
    destino = await conAltaAbierta(conAviso(volver, "error", motivoErp(e)));
  }
  redirect(destino);
}

/** Si el alta falló, el formulario sigue abierto con el error (AGENTS.md:
 *  el alta va detrás de "Nuevo …", y su estado está en ?nuevo=). Se toma de
 *  la pantalla desde la que se mandó (la dirección de origen del pedido),
 *  siempre que se vuelva a esa misma pantalla. Vale para todas las acciones
 *  sin tocar cada formulario. */
async function conAltaAbierta(destino: string): Promise<string> {
  try {
    const origen = (await headers()).get("referer");
    if (!origen) return destino;
    const de = new URL(origen);
    const nuevo = de.searchParams.get("nuevo");
    const [base, query = ""] = destino.split("?");
    if (!nuevo || de.pathname !== base) return destino;
    const p = new URLSearchParams(query);
    if (!p.has("nuevo")) p.set("nuevo", nuevo);
    return `${base}?${p}`;
  } catch {
    return destino;
  }
}
