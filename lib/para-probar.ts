// Para probar: la cola de lo que hay que ir a mirar.
// Portado de CadaMes (src/lib/para-probar.ts) sin cambios de lógica.
//
// AJUSTAR: el vocabulario `AREAS` de abajo son las secciones del panel de
// CadaMes. Reemplazalo por las pantallas/módulos reales de este proyecto
// (dejé una lista de arranque razonable para un buscador con cron).

import { db } from "@/db";
import { paraProbar, paraProbarVueltas } from "@/db/coordinacion";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { PRIORIDADES, esPrioridad, type Prioridad } from "@/lib/coordinacion";

// ── Los vocabularios ───────────────────────────────────

/** Qué partes del sistema puede tocar un cambio. AJUSTAR a las pantallas
 *  reales del proyecto — esto es sólo un punto de partida. */
export const AREAS = {
  busqueda: "Búsqueda",
  parametros: "Parámetros de búsqueda",
  resultados: "Resultados",
  cron: "Cron",
  panel: "Panel",
  interno: "Por dentro",
} as const;
export type Area = keyof typeof AREAS;

export const ESTADOS_PRUEBA = {
  por_probar: "Por probar",
  ok: "Anda",
  con_fallas: "Con fallas",
  /** No es una falla: un detalle chico. No aparece entre lo que falló. */
  observado: "Observado",
} as const;
export type EstadoPrueba = keyof typeof ESTADOS_PRUEBA;

export const TIPOS_DE_VUELTA = {
  falla: "Falló",
  observado: "Observado",
  arreglo: "Arreglado",
  ok: "Anda",
  nota: "Nota",
} as const;
export type TipoDeVuelta = keyof typeof TIPOS_DE_VUELTA;

export const MARCAS = ["ok", "con_fallas", "observado", "por_probar", "nota"] as const;
export type Marca = (typeof MARCAS)[number];

const estaEnLaLista = (o: object, x: unknown): boolean =>
  typeof x === "string" && Object.hasOwn(o, x);

export const esArea = (x: unknown): x is Area => estaEnLaLista(AREAS, x);
export const esEstadoPrueba = (x: unknown): x is EstadoPrueba => estaEnLaLista(ESTADOS_PRUEBA, x);
export const esMarca = (x: unknown): x is Marca => (MARCAS as readonly string[]).includes(x as string);
export { PRIORIDADES, esPrioridad };

export function areasDe(valores: unknown[]): Area[] {
  const elegidas = new Set(valores.filter(esArea));
  return (Object.keys(AREAS) as Area[]).filter((a) => elegidas.has(a));
}

// ── La fila ────────────────────────────────────────────

export type Fila = {
  id: number;
  ts: Date;
  autor: string;
  pedidoPor: string | null;
  sesion: string | null;
  titulo: string;
  detalle: string | null;
  areas: string[];
  prioridad: string;
  estado: string;
  version: string | null;
};

export type Vuelta = {
  id: number;
  paraProbarId: number;
  ts: Date;
  autor: string;
  sesion: string | null;
  tipo: string;
  texto: string | null;
  version: string | null;
};

/** La letra de la vuelta: 1a, 1b, 1c. */
export function letra(indice: number): string {
  return indice < 26 ? String.fromCharCode(97 + indice) : String(indice + 1);
}

// ── Filtrar y ordenar ──────────────────────────────────

export type Filtro = {
  estado?: EstadoPrueba | null;
  prioridad?: Prioridad | null;
  area?: Area | null;
  autor?: string | null;
};

export function filtrar<T extends Pick<Fila, "estado" | "prioridad" | "areas" | "autor">>(
  filas: T[],
  f: Filtro,
): T[] {
  return filas.filter((x) =>
    (!f.estado || x.estado === f.estado)
    && (!f.prioridad || x.prioridad === f.prioridad)
    && (!f.area || x.areas.includes(f.area))
    && (!f.autor || x.autor === f.autor));
}

export function contar(filas: Pick<Fila, "estado" | "prioridad">[]) {
  const porProbar = filas.filter((f) => f.estado === "por_probar");
  return {
    porProbar: porProbar.length,
    deAlta: porProbar.filter((f) => f.prioridad === "alta").length,
    conFallas: filas.filter((f) => f.estado === "con_fallas").length,
    observados: filas.filter((f) => f.estado === "observado").length,
    chequeadas: filas.filter((f) => f.estado === "ok").length,
  };
}

export function areasConAlgo(filas: Pick<Fila, "areas">[]): { area: Area; cuantos: number }[] {
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    for (const a of new Set(f.areas)) cuenta.set(a, (cuenta.get(a) ?? 0) + 1);
  }
  return (Object.keys(AREAS) as Area[])
    .filter((a) => cuenta.has(a))
    .map((a) => ({ area: a, cuantos: cuenta.get(a)! }));
}

export function ultimaActividad(fila: Pick<Fila, "ts">, vueltas: Pick<Vuelta, "ts">[]): Date {
  return vueltas.reduce((max, v) => (v.ts > max ? v.ts : max), fila.ts);
}

export function ordenar<T extends Pick<Fila, "ts" | "id">>(
  filas: T[],
  vueltas: Map<number, Pick<Vuelta, "ts">[]> = new Map(),
): T[] {
  const cuando = (f: T) => ultimaActividad(f, vueltas.get(f.id) ?? []).getTime();
  return [...filas].sort((a, b) => cuando(b) - cuando(a) || b.id - a.id);
}

// ── Marcar ─────────────────────────────────────────────

export function alMarcar(
  marca: Marca,
  texto: string | null,
): { estado: EstadoPrueba | null; vuelta: { tipo: TipoDeVuelta; texto: string | null } } | null {
  switch (marca) {
    case "ok":
      return { estado: "ok", vuelta: { tipo: "ok", texto } };
    case "con_fallas":
      return texto ? { estado: "con_fallas", vuelta: { tipo: "falla", texto } } : null;
    case "observado":
      return texto ? { estado: "observado", vuelta: { tipo: "observado", texto } } : null;
    case "nota":
      return texto ? { estado: null, vuelta: { tipo: "nota", texto } } : null;
    case "por_probar":
      return { estado: "por_probar", vuelta: { tipo: "nota", texto: texto ?? "Vuelve a por probar." } };
  }
}

// ── La base ────────────────────────────────────────────

export async function todasLasFilas(limite = 300): Promise<Fila[]> {
  return db.select({
    id: paraProbar.id, ts: paraProbar.ts, autor: paraProbar.autor, pedidoPor: paraProbar.pedidoPor,
    sesion: paraProbar.sesion, titulo: paraProbar.titulo, detalle: paraProbar.detalle,
    areas: paraProbar.areas, prioridad: paraProbar.prioridad, estado: paraProbar.estado,
    version: paraProbar.version,
  }).from(paraProbar)
    .orderBy(desc(paraProbar.ts), desc(paraProbar.id))
    .limit(limite);
}

export async function vueltasDe(ids: number[]): Promise<Map<number, Vuelta[]>> {
  const m = new Map<number, Vuelta[]>();
  if (ids.length === 0) return m;
  const filas = await db.select().from(paraProbarVueltas)
    .where(inArray(paraProbarVueltas.paraProbarId, ids))
    .orderBy(asc(paraProbarVueltas.ts), asc(paraProbarVueltas.id));
  for (const v of filas) {
    const lista = m.get(v.paraProbarId) ?? [];
    lista.push(v);
    m.set(v.paraProbarId, lista);
  }
  return m;
}

export async function cargar(fila: {
  autor: string; pedidoPor?: string | null; sesion?: string | null; titulo: string; detalle?: string | null;
  areas: Area[]; prioridad: Prioridad; version?: string | null;
}): Promise<number> {
  const [r] = await db.insert(paraProbar).values(fila).returning({ id: paraProbar.id });
  return r.id;
}

export async function marcar(id: number, marca: Marca, texto: string | null, quien: string) {
  const cambio = alMarcar(marca, texto);
  if (!cambio) return false;
  await db.insert(paraProbarVueltas).values({ paraProbarId: id, autor: quien, ...cambio.vuelta });
  if (cambio.estado) {
    await db.update(paraProbar).set({ estado: cambio.estado }).where(eq(paraProbar.id, id));
  }
  return true;
}

export async function editarVuelta(id: number, texto: string | null, quien: string) {
  if (!texto) return false;
  const r = await db.update(paraProbarVueltas).set({ texto })
    .where(and(eq(paraProbarVueltas.id, id), eq(paraProbarVueltas.autor, quien)))
    .returning({ id: paraProbarVueltas.id });
  return r.length > 0;
}

export async function borrarVuelta(id: number, quien: string) {
  const r = await db.delete(paraProbarVueltas)
    .where(and(eq(paraProbarVueltas.id, id), eq(paraProbarVueltas.autor, quien)))
    .returning({ id: paraProbarVueltas.id });
  return r.length > 0;
}

export async function borrarHilo(id: number, quien: string) {
  const r = await db.delete(paraProbar)
    .where(and(eq(paraProbar.id, id), eq(paraProbar.autor, quien)))
    .returning({ id: paraProbar.id });
  return r.length > 0;
}
