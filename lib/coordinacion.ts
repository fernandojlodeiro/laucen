// El canal de coordinación: leerlo y escribirlo.
// Portado de CadaMes (src/lib/coordinacion.ts) tal cual, sin cambios de
// lógica. AJUSTAR sólo el import de "@/db" para que apunte al cliente de
// Drizzle de este proyecto.

import { db } from "@/db";
import { autores, bitacora, pendientes, lecturas } from "@/db/coordinacion";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

// ── Los vocabularios ───────────────────────────────────
//
// Están escritos acá y no en la pantalla porque los CHECK de la base los
// exigen: mandar un tipo que no está en esta lista hace estallar Postgres con
// un error crudo, y eso es exactamente lo que no puede llegar a una pantalla.

export const TIPOS = {
  entrega: "Entrega",
  avance: "Avance",
  orden: "Orden",
  decision: "Decisión",
  pregunta: "Pregunta",
  respuesta: "Respuesta",
  bloqueo: "Bloqueo",
  nota: "Nota",
} as const;
export type Tipo = keyof typeof TIPOS;

export const PRIORIDADES = { alta: "Alta", media: "Media", baja: "Baja" } as const;
export type Prioridad = keyof typeof PRIORIDADES;

export const ESTADOS = {
  abierto: "Abierto",
  en_curso: "En curso",
  resuelto: "Resuelto",
  descartado: "Descartado",
} as const;
export type Estado = keyof typeof ESTADOS;

/** `Object.hasOwn` y no `in`: `in` recorre el prototipo, así que
 *  `"toString" in TIPOS` da `true` y un formulario con `tipo=toString` pasaba
 *  el control y estallaba contra el CHECK de Postgres. */
const estaEnLaLista = (o: object, x: unknown): boolean =>
  typeof x === "string" && Object.hasOwn(o, x);

export const esTipo = (x: unknown): x is Tipo => estaEnLaLista(TIPOS, x);
export const esEstado = (x: unknown): x is Estado => estaEnLaLista(ESTADOS, x);
export const esPrioridad = (x: unknown): x is Prioridad => estaEnLaLista(PRIORIDADES, x);

/** Un campo de texto vacío es `null`, no `""`. */
export const limpiar = (x: FormDataEntryValue | null): string | null => {
  const s = typeof x === "string" ? x.trim() : "";
  return s === "" ? null : s;
};

// ── El hilo ────────────────────────────────────────────

export type Entrada = {
  id: number;
  ts: Date;
  autor: string;
  tipo: string;
  titulo: string;
  detalle: string | null;
  motivo: string | null;
  pendientes: string | null;
  refDoc: string | null;
  respondeA: number | null;
  /** Cuándo se dio por leída. `null` = todavía hay que mirarla. */
  vistoFer: Date | null;
  pideLectura?: boolean;
};

export type Hilo = Entrada & { respuestas: Entrada[] };

/** Cuelga cada respuesta debajo de la entrada RAÍZ del hilo, sin importar a
 *  cuántos niveles de profundidad esté. Una respuesta cuyo padre no está en
 *  la lista queda arriba igual, no se esconde. */
export function enHilos(entradas: Entrada[]): Hilo[] {
  const porId = new Map(entradas.map((e) => [e.id, e]));

  const raizDe = (e: Entrada): Entrada => {
    let actual = e;
    const visitados = new Set<number>([actual.id]);
    while (actual.respondeA !== null) {
      const padre = porId.get(actual.respondeA);
      if (!padre || visitados.has(padre.id)) break;
      actual = padre;
      visitados.add(actual.id);
    }
    return actual;
  };

  const raizId = new Map(entradas.map((e) => [e.id, raizDe(e).id]));

  return entradas
    .filter((e) => raizId.get(e.id) === e.id)
    .map((raiz) => ({
      ...raiz,
      respuestas: entradas
        .filter((e) => e.id !== raiz.id && raizId.get(e.id) === raiz.id)
        .sort((a, b) => a.id - b.id),
    }));
}

/** Lo que todavía tiene que mirar `quien`: no lo propio, y no lo ya visto. */
export function paraVos<T extends { autor: string; vistoFer: Date | null }>(
  entradas: T[],
  quien: string,
): T[] {
  return entradas.filter((e) => e.autor !== quien && e.vistoFer === null);
}

// ── Resolver un pendiente ──────────────────────────────

/** Volver un pendiente a abierto tiene que borrar quién y cuándo lo resolvió. */
export function alCambiarEstado(
  estado: Estado,
  quien: string,
  ahora: Date = new Date(),
): { estado: Estado; resueltoTs: Date | null; resueltoPor: string | null } {
  const cerrado = estado === "resuelto" || estado === "descartado";
  return {
    estado,
    resueltoTs: cerrado ? ahora : null,
    resueltoPor: cerrado ? quien : null,
  };
}

// ── Consultas ──────────────────────────────────────────

export async function ultimasEntradas(limite = 60): Promise<Entrada[]> {
  return db
    .select({
      id: bitacora.id, ts: bitacora.ts, autor: bitacora.autor, tipo: bitacora.tipo,
      titulo: bitacora.titulo, detalle: bitacora.detalle, motivo: bitacora.motivo,
      pendientes: bitacora.pendientes, refDoc: bitacora.refDoc, respondeA: bitacora.respondeA,
      vistoFer: bitacora.vistoFer,
      pideLectura: bitacora.pideLectura,
    })
    .from(bitacora)
    .orderBy(desc(bitacora.ts), desc(bitacora.id))
    .limit(limite);
}

export async function losPendientes() {
  return db.select().from(pendientes).orderBy(desc(pendientes.creadoTs));
}

export async function losAutores() {
  return db.select().from(autores).where(eq(autores.activo, true)).orderBy(asc(autores.slug));
}

/** Quién leyó cada entrada de las que piden lectura, y quién falta. */
export async function quienLeyo(ids: number[]): Promise<Map<number, string[]>> {
  if (ids.length === 0) return new Map();
  const filas = await db.select({ id: lecturas.bitacoraId, autor: lecturas.autor })
    .from(lecturas).where(inArray(lecturas.bitacoraId, ids));
  const salida = new Map<number, string[]>();
  for (const f of filas) salida.set(f.id, [...(salida.get(f.id) ?? []), f.autor]);
  return salida;
}

/** Confirmar que se leyó. Idempotente. */
export async function confirmarLectura(id: number, autor: string) {
  await db.insert(lecturas).values({ bitacoraId: id, autor }).onConflictDoNothing();
}

export async function marcarVisto(id: number, cuando: Date = new Date()) {
  await db.update(bitacora).set({ vistoFer: cuando })
    .where(and(eq(bitacora.id, id), isNull(bitacora.vistoFer)));
}

export async function anotar(fila: {
  autor: string; tipo: Tipo; titulo: string;
  detalle?: string | null; motivo?: string | null; pendientes?: string | null;
  refDoc?: string | null; respondeA?: number | null;
}) {
  await db.insert(bitacora).values(fila);
}
