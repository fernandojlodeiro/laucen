// Tendencias: una lectura por categoría por semana (la API cambia una vez por
// semana), con cada palabra en su grupo. La comparación contra la semana
// anterior se calcula al mostrar, no se guarda.

import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { meliTendencias, meliTendenciasLecturas } from "@/db/radar";
import { SITIO, grupoDe, ml, semanaDe, tokenML, type Grupo } from "./base";

export type Lectura = typeof meliTendenciasLecturas.$inferSelect;
export type Palabra = typeof meliTendencias.$inferSelect;

/** La lectura de esta semana de la categoría ('MLA' = todo ML); si no está,
 *  la pide a ML y la guarda. `null` si ML no respondió. */
export async function lecturaDeLaSemana(categoriaId: string, organizacionId?: string): Promise<Lectura | null> {
  const semana = semanaDe();
  const [ya] = await db.select().from(meliTendenciasLecturas)
    .where(and(eq(meliTendenciasLecturas.categoriaId, categoriaId), eq(meliTendenciasLecturas.semana, semana)));
  if (ya) return ya;

  const token = await tokenML(organizacionId);
  const r = await ml(categoriaId === SITIO ? `/trends/${SITIO}` : `/trends/${SITIO}/${categoriaId}`, token);
  // 404 = la categoría no tiene tendencias: se guarda vacía para no insistir.
  if (r.status !== 200 && r.status !== 404) return null;
  const lista = r.status === 200 && Array.isArray(r.datos) ? (r.datos as { keyword: string; url?: string }[]) : [];

  const [lectura] = await db.insert(meliTendenciasLecturas)
    .values({ categoriaId, semana, respuesta: { status: r.status, datos: r.datos } })
    .onConflictDoNothing().returning();
  if (!lectura) {
    // Otro pedido la guardó en el medio.
    const [otra] = await db.select().from(meliTendenciasLecturas)
      .where(and(eq(meliTendenciasLecturas.categoriaId, categoriaId), eq(meliTendenciasLecturas.semana, semana)));
    return otra ?? null;
  }
  if (lista.length) {
    await db.insert(meliTendencias).values(lista.map((t, i) => ({
      lecturaId: lectura.id, posicion: i + 1, palabra: t.keyword, url: t.url ?? null, grupo: grupoDe(i + 1),
    })));
  }
  return lectura;
}

/** La lectura anterior a `semana` de la categoría, si hay. */
export async function lecturaAnterior(categoriaId: string, semana: string): Promise<Lectura | null> {
  const [l] = await db.select().from(meliTendenciasLecturas)
    .where(and(eq(meliTendenciasLecturas.categoriaId, categoriaId), lt(meliTendenciasLecturas.semana, semana)))
    .orderBy(desc(meliTendenciasLecturas.semana)).limit(1);
  return l ?? null;
}

export function palabrasDe(lecturaIds: number[]) {
  if (!lecturaIds.length) return Promise.resolve([] as Palabra[]);
  return db.select().from(meliTendencias).where(inArray(meliTendencias.lecturaId, lecturaIds)).orderBy(asc(meliTendencias.posicion));
}

export type Cambio = { tipo: "nueva" } | { tipo: "sube" | "baja"; lugares: number } | { tipo: "igual" } | { tipo: "primera" };

export type Comparada = Palabra & { lugar: number; cambio: Cambio };

/** Las palabras de un grupo con su cambio contra la semana anterior (el
 *  lugar se cuenta dentro del grupo), más las que salieron. */
export function comparar(actuales: Palabra[], anteriores: Palabra[] | null, grupo: Grupo) {
  const act = actuales.filter((p) => p.grupo === grupo);
  const ant = anteriores?.filter((p) => p.grupo === grupo) ?? null;
  const antLugar = new Map(ant?.map((p, i) => [p.palabra.toLowerCase(), i + 1]) ?? []);
  const lista: Comparada[] = act.map((p, i) => {
    const lugar = i + 1;
    if (!ant) return { ...p, lugar, cambio: { tipo: "primera" } };
    const antes = antLugar.get(p.palabra.toLowerCase());
    if (!antes) return { ...p, lugar, cambio: { tipo: "nueva" } };
    if (antes === lugar) return { ...p, lugar, cambio: { tipo: "igual" } };
    return { ...p, lugar, cambio: antes > lugar ? { tipo: "sube", lugares: antes - lugar } : { tipo: "baja", lugares: lugar - antes } };
  });
  const actSet = new Set(act.map((p) => p.palabra.toLowerCase()));
  const salieron = ant?.filter((p) => !actSet.has(p.palabra.toLowerCase())).map((p) => p.palabra) ?? [];
  return { lista, salieron };
}

/** Resumen de novedades de una categoría (todas los grupos juntos), para
 *  "Mis categorías seguidas". */
export async function novedades(categoriaId: string) {
  const semana = semanaDe();
  const [actual] = await db.select().from(meliTendenciasLecturas)
    .where(and(eq(meliTendenciasLecturas.categoriaId, categoriaId), eq(meliTendenciasLecturas.semana, semana)));
  if (!actual) return null;
  const anterior = await lecturaAnterior(categoriaId, semana);
  const [act, ant] = await Promise.all([palabrasDe([actual.id]), anterior ? palabrasDe([anterior.id]) : Promise.resolve(null)]);
  let nuevas: string[] = [], subieron = 0;
  const salieron: string[] = [];
  for (const g of ["crecimiento", "buscadas", "populares"] as Grupo[]) {
    const c = comparar(act, ant, g);
    nuevas = nuevas.concat(c.lista.filter((p) => p.cambio.tipo === "nueva").map((p) => p.palabra));
    subieron += c.lista.filter((p) => p.cambio.tipo === "sube").length;
    salieron.push(...c.salieron);
  }
  return { leidaEl: actual.leidaEl, primera: !anterior, total: act.length, nuevas, subieron, salieron };
}
