"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sosVos } from "@/lib/admin";
import { orgRequerida, sesionRequerida } from "@/lib/tenancy";
import { consulta, motivoErp } from "@/lib/erp/base";
import { deFondo } from "@/lib/tareas-fondo";
import { prepararGarantiaNotebooks, textoGarantia } from "@/lib/mercadolibre/garantia-notebooks";
import { prepararNotebooksMl, textoResultadoMl, limpiarNotebooksLaucen, revisarNotebooksMl, traerDescripcionesFaltantes } from "@/lib/limpieza-notebooks";

async function portero() {
  if (!(await sosVos())) redirect("/panel");
  return (await orgRequerida()).id;
}

function volver(mensaje: string, error = false): never {
  revalidatePath("/admin/limpieza");
  redirect(`/admin/limpieza?${error ? "error" : "ok"}=${encodeURIComponent(mensaje)}`);
}

/** "Revisar en ML": lee la cuenta entera y guarda el detalle de sus notebooks. Sólo lectura, de fondo. */
export async function accionRevisarNotebooksMl(fd: FormData) {
  await portero();
  const s = await sesionRequerida();
  const canal = Number(fd.get("canal"));
  return deFondo(s, `limpieza-notebooks:${canal}`, "Revisión de notebooks en Mercado Libre", async () => {
    const r = await revisarNotebooksMl(s.org.id, canal, Date.now() + 270_000);
    revalidatePath("/admin/limpieza");
    return r;
  });
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

/** Lee TODAS las cuentas de ML y deja preparado (sin mandar) un lote por cuenta que pone 1 año de garantía a sus notebooks activas. De fondo. */
export async function accionGarantiaNotebooksMl() {
  const org = await portero();
  const s = await sesionRequerida();
  return deFondo(s, "garantia-notebooks", "Garantía de notebooks en Mercado Libre", async () => {
    const cuentas = await consulta<{ id: number }>(
      "select c.id::int from meli_cuenta mc join canal c on c.id = mc.canal_id where mc.organizacion_id = $1 and mc.estado = 'activa' order by c.id", [org]);
    const hasta = Date.now() + 270_000;
    // Las cuentas son independientes (cada una con su propio ritmo en ML): se leen a la vez.
    const textos = await Promise.all(cuentas.map(async (c) => {
      try { return textoGarantia(await prepararGarantiaNotebooks(org, c.id, s.usuario.id, hasta)); }
      catch (e) { return `Canal ${c.id}: ${motivoErp(e)}`; }
    }));
    revalidatePath("/admin/limpieza");
    return textos.join(" ");
  });
}

/** Trae de ML (sólo lectura) la descripción de los productos activos que no tienen. De fondo. */
export async function accionDescripcionesMl() {
  await portero();
  const s = await sesionRequerida();
  return deFondo(s, "descripciones-ml", "Descripciones de Mercado Libre", async () => {
    const r = await traerDescripcionesFaltantes(s.org.id, Date.now() + 270_000);
    revalidatePath("/admin/limpieza");
    return r;
  });
}

/** Borra de Laucen las notebooks que no son de la lista (las que tienen historia, las archiva). */
export async function accionNotebooksLaucen() {
  const org = await portero();
  let r;
  try { r = await limpiarNotebooksLaucen(org); } catch (e) { volver(motivoErp(e), true); }
  volver(`Notebooks en Laucen: ${r.borradas} borradas y ${r.archivadas} archivadas (tenían ventas o movimientos).`);
}
