"use server";

// Rubros guardados: grupos de NCM de cada organización. Todo pasa por el
// permiso importaciones_rubros y se chequea que el rubro sea de la
// organización activa.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pool } from "@/db";
import { sesionRequerida } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";

async function org(): Promise<string> {
  const s = await sesionRequerida();
  if (!tienePermiso(s.permisos, "importaciones_rubros")) redirect("/importaciones/rubros?error=permiso");
  return s.org.id;
}

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const numero = (fd: FormData, k: string) => Number(fd.get(k));

async function esSuyo(rubroId: number, organizacionId: string): Promise<boolean> {
  const r = await pool.query("select 1 from rubros where id = $1 and organizacion_id = $2", [rubroId, organizacionId]);
  return !!r.rowCount;
}

/** Normaliza un código NCM de cualquier nivel tal como está en ref_ncm. */
function codigos(fd: FormData): string[] {
  return [...new Set(fd.getAll("ncm").map((x) => String(x).trim()).filter((x) => /^[\d.]+[A-Z]?$/.test(x)))];
}

export async function accionCrearRubro(fd: FormData) {
  const o = await org();
  const nombre = texto(fd, "nombre");
  if (!nombre) redirect("/importaciones/rubros?error=nombre");
  const r = await pool.query<{ id: number }>("insert into rubros (organizacion_id, nombre) values ($1, $2) returning id::int", [o, nombre]);
  const ncms = codigos(fd);
  if (ncms.length) {
    await pool.query("insert into rubro_ncm (rubro_id, ncm) select $1, unnest($2::text[]) on conflict do nothing", [r.rows[0].id, ncms]);
  }
  redirect(`/importaciones/rubros?r=${r.rows[0].id}`);
}

export async function accionRenombrarRubro(fd: FormData) {
  const o = await org();
  const id = numero(fd, "id");
  const nombre = texto(fd, "nombre");
  if (nombre) await pool.query("update rubros set nombre = $1 where id = $2 and organizacion_id = $3", [nombre, id, o]);
  redirect(`/importaciones/rubros?r=${id}`);
}

export async function accionBorrarRubro(fd: FormData) {
  const o = await org();
  await pool.query("delete from rubros where id = $1 and organizacion_id = $2", [numero(fd, "id"), o]);
  redirect("/importaciones/rubros");
}

/** Agrega NCM tildadas a un rubro existente (desde la búsqueda de NCM o la ficha de un importador). */
export async function accionAgregarNcm(fd: FormData) {
  const o = await org();
  const id = numero(fd, "rubro");
  const volver = texto(fd, "volver") || `/importaciones/rubros?r=${id}`;
  if (!(await esSuyo(id, o))) redirect("/importaciones/rubros?error=rubro");
  const ncms = codigos(fd);
  if (ncms.length) {
    await pool.query("insert into rubro_ncm (rubro_id, ncm) select $1, unnest($2::text[]) on conflict do nothing", [id, ncms]);
  }
  revalidatePath("/importaciones/rubros");
  redirect(volver.startsWith("/importaciones") ? volver : "/importaciones/rubros");
}

export async function accionQuitarNcm(fd: FormData) {
  const o = await org();
  const id = numero(fd, "rubro");
  if (await esSuyo(id, o)) await pool.query("delete from rubro_ncm where rubro_id = $1 and ncm = $2", [id, texto(fd, "ncm")]);
  redirect(`/importaciones/rubros?r=${id}`);
}
