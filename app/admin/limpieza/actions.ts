"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sosVos } from "@/lib/admin";
import { orgRequerida, sesionRequerida } from "@/lib/tenancy";
import { motivoErp } from "@/lib/erp/base";
import { deFondo } from "@/lib/tareas-fondo";
import { prepararNotebooksMl, textoResultadoMl, limpiarNotebooksLaucen } from "@/lib/limpieza-notebooks";

async function portero() {
  if (!(await sosVos())) redirect("/panel");
  return (await orgRequerida()).id;
}

function volver(mensaje: string, error = false): never {
  revalidatePath("/admin/limpieza");
  redirect(`/admin/limpieza?${error ? "error" : "ok"}=${encodeURIComponent(mensaje)}`);
}

/** Lee la cuenta en ML y deja preparado (sin mandar) el lote que elimina sus notebooks que no son de la lista. De fondo. */
export async function accionNotebooksMl(fd: FormData) {
  await portero();
  const s = await sesionRequerida();
  const canal = Number(fd.get("canal"));
  return deFondo(s, `limpieza-notebooks:${canal}`, "Notebooks a eliminar en Mercado Libre", async () => {
    const r = await prepararNotebooksMl(s.org.id, canal, s.usuario.id, Date.now() + 270_000);
    revalidatePath("/admin/limpieza");
    return textoResultadoMl(r);
  });
}

/** Borra de Laucen las notebooks que no son de la lista (las que tienen historia, las archiva). */
export async function accionNotebooksLaucen() {
  const org = await portero();
  let r;
  try { r = await limpiarNotebooksLaucen(org); } catch (e) { volver(motivoErp(e), true); }
  volver(`Notebooks en Laucen: ${r.borradas} borradas y ${r.archivadas} archivadas (tenían ventas o movimientos).`);
}
