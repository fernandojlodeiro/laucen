// El canal de coordinación: bitácora + cola de "para probar".
// Portado de CadaMes (src/db/coordinacion.ts), con el esquema ya limpio
// (sin las columnas muertas que CadaMes todavía arrastra de su propia
// migración incremental — acá no hace falta esa historia).
//
// AJUSTAR: `@/db` tiene que resolver al cliente de Drizzle de ESTE proyecto,
// conectado a SU base de Supabase (no la de CadaMes).

import { pgSchema, text, bigint, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const coordinacion = pgSchema("coordinacion");

export const autores = coordinacion.table("autores", {
  slug: text("slug").primaryKey(),
  nombre: text("nombre").notNull(),
  /** `humano` | `agente`. */
  tipo: text("tipo").notNull(),
  color: text("color").notNull().default("#5C6B76"),
  activo: boolean("activo").notNull().default(true),
  creadoTs: timestamp("creado_ts", { withTimezone: true }).notNull().defaultNow(),
});

export const bitacora = coordinacion.table("bitacora", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  autor: text("autor").notNull().references(() => autores.slug),
  tipo: text("tipo").notNull(),
  titulo: text("titulo").notNull(),
  detalle: text("detalle"),
  motivo: text("motivo"),
  pendientes: text("pendientes"),
  refDoc: text("ref_doc"),
  respondeA: bigint("responde_a", { mode: "number" }),
  vistoFer: timestamp("visto_fer", { withTimezone: true }),
  pideLectura: boolean("pide_lectura").notNull().default(false),
}, (t) => [index("bitacora_ts_idx").on(t.ts)]);

export const lecturas = coordinacion.table("lecturas", {
  bitacoraId: bigint("bitacora_id", { mode: "number" }).notNull(),
  autor: text("autor").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("lecturas_bitacora_idx").on(t.bitacoraId)]);

export const pendientes = coordinacion.table("pendientes", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  creadoTs: timestamp("creado_ts", { withTimezone: true }).notNull().defaultNow(),
  autor: text("autor").notNull().references(() => autores.slug),
  titulo: text("titulo").notNull(),
  detalle: text("detalle"),
  porQueQuedo: text("por_que_quedo"),
  /** `alta` | `media` | `baja`. */
  prioridad: text("prioridad").notNull().default("media"),
  /** `abierto` | `en_curso` | `resuelto` | `descartado`. */
  estado: text("estado").notNull().default("abierto"),
  refDoc: text("ref_doc"),
  bitacoraId: bigint("bitacora_id", { mode: "number" }),
  resueltoTs: timestamp("resuelto_ts", { withTimezone: true }),
  resueltoPor: text("resuelto_por"),
  notaResolucion: text("nota_resolucion"),
}, (t) => [index("pendientes_estado_idx").on(t.estado, t.prioridad)]);

export const paraProbar = coordinacion.table("para_probar", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  autor: text("autor").notNull().references(() => autores.slug),
  pedidoPor: text("pedido_por").references(() => autores.slug),
  sesion: text("sesion"),
  titulo: text("titulo").notNull(),
  detalle: text("detalle"),
  /** El vocabulario está en lib/para-probar.ts. */
  areas: text("areas").array().notNull().default([]),
  /** `alta` | `media` | `baja`. */
  prioridad: text("prioridad").notNull().default("media"),
  /** `por_probar` | `ok` | `con_fallas` | `observado`. Lo que dijo la última vuelta. */
  estado: text("estado").notNull().default("por_probar"),
  version: text("version"),
}, (t) => [index("para_probar_estado_idx").on(t.estado, t.prioridad, t.ts)]);

export const paraProbarVueltas = coordinacion.table("para_probar_vueltas", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  paraProbarId: bigint("para_probar_id", { mode: "number" }).notNull()
    .references(() => paraProbar.id, { onDelete: "cascade" }),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  autor: text("autor").notNull().references(() => autores.slug),
  sesion: text("sesion"),
  /** `falla` | `arreglo` | `ok` | `nota`. */
  tipo: text("tipo").notNull(),
  texto: text("texto"),
  version: text("version"),
}, (t) => [index("para_probar_vueltas_hilo_idx").on(t.paraProbarId, t.ts, t.id)]);
