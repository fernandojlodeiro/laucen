"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { meliPruebas } from "@/db/meli";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { correrActor } from "@/lib/apify";
import { ACTORES, MAX } from "./config";

const CORRIENDO = { estado: "corriendo" };

/** Corre la búsqueda en los actores elegidos. Sólo con el botón (nunca al
 *  cargar la página), y si ya hay una corrida en curso de hace menos de 5
 *  minutos no arranca otra: manda a verla. */
export async function accionCorrerApify(formData: FormData) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const q = String(formData.get("q") ?? "").trim();
  const elegidos = formData.getAll("actor").map(String).filter((a) => ACTORES.includes(a));
  if (!q || !elegidos.length) redirect("/admin/meli/apify");

  const [enCurso] = await db.select({ id: meliPruebas.id }).from(meliPruebas).where(and(
    eq(meliPruebas.organizacionId, sesion.org.id),
    like(meliPruebas.consulta, "apify:%"),
    sql`${meliPruebas.resultados} = ${JSON.stringify(CORRIENDO)}::jsonb`,
    gt(meliPruebas.ts, sql`now() - interval '5 minutes'`),
  )).limit(1);
  if (enCurso) redirect(`/admin/meli/apify?prueba=${enCurso.id}`);

  const [fila] = await db.insert(meliPruebas)
    .values({ organizacionId: sesion.org.id, consulta: `apify: ${q}`, resultados: CORRIENDO })
    .returning({ id: meliPruebas.id });
  const resultados = await Promise.all(elegidos.map((a) => correrActor(a.replace("/", "~"), q, MAX, 240)));
  await db.update(meliPruebas).set({ resultados }).where(eq(meliPruebas.id, fila.id));
  redirect(`/admin/meli/apify?prueba=${fila.id}`);
}
