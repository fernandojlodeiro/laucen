// Procesos automáticos del Radar. El cron de Vercel llama una vez por día y
// acá se decide, según la configuración de cada organización ("cada N días/
// meses, desde tal fecha"), qué toca. Todo es retomable: si una corrida no
// termina (límite de tiempo de Vercel), queda "parcial" y la del día siguiente
// sigue donde quedó, sin repetir lo ya hecho (una lectura/búsqueda por semana).

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { organizaciones } from "@/db/tenancy";
import { radarProcesos, radarSeguidas } from "@/db/radar";
import { SITIO, hoyAR, semanaDe, type Grupo } from "./base";
import { configDe, toca } from "./config";
import { cargarArbol } from "./categorias";
import { lecturaDeLaSemana, palabrasDe } from "./tendencias";
import { TopeDeGasto, actualizarCostos, buscarConApify } from "./busquedas";

type Origen = "cron" | "manual";

async function abrirProceso(tipo: string, organizacionId: string | null, origen: Origen) {
  const [p] = await db.insert(radarProcesos).values({ tipo, organizacionId, origen }).returning();
  return p;
}
async function cerrarProceso(id: number, estado: "ok" | "parcial" | "fallo", detalle: unknown) {
  await db.update(radarProcesos).set({ estado, detalle, termino: new Date() }).where(eq(radarProcesos.id, id));
}

async function ultimaOk(tipo: string, organizacionId: string | null) {
  const [p] = await db.select().from(radarProcesos).where(and(
    eq(radarProcesos.tipo, tipo), eq(radarProcesos.estado, "ok"),
    organizacionId ? eq(radarProcesos.organizacionId, organizacionId) : isNull(radarProcesos.organizacionId),
  )).orderBy(desc(radarProcesos.empezo)).limit(1);
  return p ?? null;
}

/** Tendencias de una organización: la general + sus seguidas; después
 *  "profundizar" (Apify) en las seguidas que lo tienen prendido, hasta el
 *  tope de gasto. */
export async function procesoTendencias(organizacionId: string, origen: Origen, hasta: number) {
  const proc = await abrirProceso("tendencias", organizacionId, origen);
  const detalle: Record<string, unknown> = { semana: semanaDe() };
  try {
    const config = await configDe(organizacionId);
    const seguidas = await db.select().from(radarSeguidas).where(eq(radarSeguidas.organizacionId, organizacionId));
    const cats = [SITIO, ...seguidas.map((s) => s.categoriaId)];
    const leidas: string[] = [], fallidas: string[] = [];
    for (const c of cats) {
      if (Date.now() > hasta) break;
      (await lecturaDeLaSemana(c, organizacionId) ? leidas : fallidas).push(c);
    }
    detalle.tendencias = { leidas: leidas.length, fallidas };

    // Profundizar: las N primeras palabras de cada grupo, con Apify.
    const palabras: { palabra: string; categoriaId: string }[] = [];
    for (const s of seguidas.filter((x) => x.profundizar)) {
      const l = await lecturaDeLaSemana(s.categoriaId, organizacionId);
      if (!l) continue;
      const lista = await palabrasDe([l.id]);
      for (const g of ["crecimiento", "buscadas", "populares"] as Grupo[]) {
        lista.filter((p) => p.grupo === g).slice(0, config.palabrasAProfundizar)
          .forEach((p) => palabras.push({ palabra: p.palabra, categoriaId: s.categoriaId }));
      }
    }
    let hechas = 0, tope = false;
    const errores: string[] = [];
    // De a 4 en paralelo; cada una tarda ~1 min. Lo que no entra, mañana.
    for (let i = 0; i < palabras.length && !tope && Date.now() + 150_000 < hasta; i += 4) {
      await Promise.all(palabras.slice(i, i + 4).map(async (p) => {
        try {
          await buscarConApify({ ...p, organizacionId, origen: "cron" }, 120);
          hechas++;
        } catch (e) {
          if (e instanceof TopeDeGasto) tope = true;
          else errores.push(`${p.palabra}: ${String(e).slice(0, 120)}`);
        }
      }));
    }
    detalle.profundizar = { pedidas: palabras.length, hechas, tope, errores };
    const completo = fallidas.length === 0 && (tope || hechas >= palabras.length);
    await cerrarProceso(proc.id, completo ? "ok" : "parcial", detalle);
    return detalle;
  } catch (e) {
    await cerrarProceso(proc.id, "fallo", { ...detalle, error: String(e).slice(0, 500) });
    throw e;
  }
}

/** Árbol de categorías (global). Si es un ciclo nuevo, relee todo lo leído
 *  antes del arranque del ciclo; si no, completa lo que falta. */
export async function procesoArbol(origen: Origen, hasta: number, nuevoCiclo: boolean) {
  const proc = await abrirProceso("arbol", null, origen);
  // El corte del ciclo: cuándo arrancó este refresco (se guarda en el detalle).
  const recientes = await db.select().from(radarProcesos)
    .where(and(eq(radarProcesos.tipo, "arbol"), isNull(radarProcesos.organizacionId)))
    .orderBy(desc(radarProcesos.empezo)).limit(2);
  const anterior = recientes.find((p) => p.id !== proc.id);
  const corteAnterior = (anterior?.detalle as { corte?: string } | null)?.corte;
  const corte = nuevoCiclo || !corteAnterior ? proc.empezo : new Date(corteAnterior);
  try {
    const r = await cargarArbol({ corte, hasta });
    const detalle = { corte: corte.toISOString(), ...r };
    await cerrarProceso(proc.id, r.pendientes === 0 ? "ok" : "parcial", detalle);
    return detalle;
  } catch (e) {
    await cerrarProceso(proc.id, "fallo", { corte: corte.toISOString(), error: String(e).slice(0, 500) });
    throw e;
  }
}

/** Lo que corre el cron diario: para cada organización, lo que le toca según
 *  su configuración; el árbol, según la configuración más frecuente. */
export async function correrCron(hasta: number) {
  const hoy = hoyAR();
  const resumen: Record<string, unknown> = { hoy };
  await actualizarCostos().catch(() => 0);

  const orgs = await db.select({ id: organizaciones.id }).from(organizaciones);
  const configs = await Promise.all(orgs.map((o) => configDe(o.id)));

  // Árbol: si el último ciclo quedó parcial, se sigue; si no, ¿toca uno nuevo?
  const [ultArbol] = await db.select().from(radarProcesos)
    .where(and(eq(radarProcesos.tipo, "arbol"), isNull(radarProcesos.organizacionId)))
    .orderBy(desc(radarProcesos.empezo)).limit(1);
  const okArbol = await ultimaOk("arbol", null);
  const tocaArbol = configs.some((c) => toca(c.arbolCada, c.arbolUnidad, c.arbolDesde, okArbol?.empezo ?? null, hoy));
  const sigueParcial = !!ultArbol && ultArbol.estado !== "ok";
  if (tocaArbol || sigueParcial) {
    const limite = Math.min(hasta, Date.now() + 100_000); // el árbol no se come toda la corrida
    resumen.arbol = await procesoArbol("cron", limite, tocaArbol && !sigueParcial).catch((e) => ({ error: String(e) }));
  }

  for (const c of configs) {
    const ok = await ultimaOk("tendencias", c.organizacionId);
    const [ult] = await db.select().from(radarProcesos)
      .where(and(eq(radarProcesos.tipo, "tendencias"), eq(radarProcesos.organizacionId, c.organizacionId)))
      .orderBy(desc(radarProcesos.empezo)).limit(1);
    const parcialDeEstaSemana = ult && ult.estado !== "ok" && semanaDe(ult.empezo) === semanaDe();
    if (toca(c.tendenciasCada, c.tendenciasUnidad, c.tendenciasDesde, ok?.empezo ?? null, hoy) || parcialDeEstaSemana) {
      resumen[`tendencias:${c.organizacionId}`] = await procesoTendencias(c.organizacionId, "cron", hasta)
        .catch((e) => ({ error: String(e) }));
    }
  }
  return resumen;
}

export async function ultimosProcesos(organizacionId: string, n = 10) {
  const [propios, arbol] = await Promise.all([
    db.select().from(radarProcesos).where(eq(radarProcesos.organizacionId, organizacionId)).orderBy(desc(radarProcesos.empezo)).limit(n),
    db.select().from(radarProcesos).where(and(eq(radarProcesos.tipo, "arbol"), isNull(radarProcesos.organizacionId))).orderBy(desc(radarProcesos.empezo)).limit(n),
  ]);
  return [...propios, ...arbol].sort((a, b) => b.empezo.getTime() - a.empezo.getTime()).slice(0, n);
}
