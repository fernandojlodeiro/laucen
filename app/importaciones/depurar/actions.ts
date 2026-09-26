"use server";

// Guarda lo que Fer tildó en /importaciones/depurar. Sólo Fer (sosVos): son
// datos globales. Guardar no borra nada de la base: eso es "aplicar", aparte.

import { redirect } from "next/navigation";
import { pool } from "@/db";
import { sosVos } from "@/lib/admin";

export async function accionGuardarDepuracion(fd: FormData) {
  if (!(await sosVos())) redirect("/importaciones");
  const marcados = [...new Set(fd.getAll("sacar").map(String).filter((x) => /^\d{2}(\d{2})?$/.test(x)))];
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    await cliente.query("update arca_depuracion set excluir = (prefijo = any($1::text[])), actualizado_ts = now() where excluir <> (prefijo = any($1::text[]))", [marcados]);
    await cliente.query(`insert into arca_depuracion (prefijo, excluir, propuesta)
                         select unnest($1::text[]), true, false on conflict (prefijo) do nothing`, [marcados]);
    await cliente.query("commit");
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
  redirect("/importaciones/depurar?ok=1");
}
