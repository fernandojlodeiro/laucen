// Radar: tendencias de Mercado Libre (ver db/radar.sql).

import { pgTable, text, bigint, integer, boolean, timestamp, date, jsonb, doublePrecision, primaryKey } from "drizzle-orm/pg-core";
import { organizaciones } from "@/db/tenancy";

export const meliCategorias = pgTable("meli_categorias", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  padreId: text("padre_id"),
  nivel: integer("nivel").notNull(),
  ruta: text("ruta").notNull(),
  publicaciones: integer("publicaciones"),
  esHoja: boolean("es_hoja").notNull().default(false),
  leidaEl: timestamp("leida_el", { withTimezone: true }).notNull().defaultNow(),
  hijosLeidosEl: timestamp("hijos_leidos_el", { withTimezone: true }),
});

export const meliTendenciasLecturas = pgTable("meli_tendencias_lecturas", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  categoriaId: text("categoria_id").notNull(),
  semana: date("semana").notNull(),
  leidaEl: timestamp("leida_el", { withTimezone: true }).notNull().defaultNow(),
  respuesta: jsonb("respuesta").notNull(),
});

export const meliTendencias = pgTable("meli_tendencias", {
  lecturaId: bigint("lectura_id", { mode: "number" }).notNull().references(() => meliTendenciasLecturas.id, { onDelete: "cascade" }),
  posicion: integer("posicion").notNull(),
  palabra: text("palabra").notNull(),
  url: text("url"),
  grupo: text("grupo").notNull(),
}, (t) => [primaryKey({ columns: [t.lecturaId, t.posicion] })]);

export const meliBusquedas = pgTable("meli_busquedas", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  palabra: text("palabra").notNull(),
  categoriaId: text("categoria_id"),
  fuente: text("fuente").notNull(),
  origen: text("origen").notNull().default("manual"),
  organizacionId: text("organizacion_id").references(() => organizaciones.id, { onDelete: "set null" }),
  usuarioId: text("usuario_id"),
  estado: text("estado").notNull().default("corriendo"),
  error: text("error"),
  totalResultados: text("total_resultados"),
  costoUsd: doublePrecision("costo_usd"),
  runId: text("run_id"),
  pedidaEl: timestamp("pedida_el", { withTimezone: true }).notNull().defaultNow(),
  terminadaEl: timestamp("terminada_el", { withTimezone: true }),
});

export const meliPublicaciones = pgTable("meli_publicaciones", {
  busquedaId: bigint("busqueda_id", { mode: "number" }).notNull().references(() => meliBusquedas.id, { onDelete: "cascade" }),
  posicion: integer("posicion").notNull(),
  itemId: text("item_id"),
  productoId: text("producto_id"),
  titulo: text("titulo").notNull(),
  url: text("url"),
  foto: text("foto"),
  precio: doublePrecision("precio"),
  precioAnterior: doublePrecision("precio_anterior"),
  moneda: text("moneda"),
  vendidos: integer("vendidos"),
  vendidosTexto: text("vendidos_texto"),
  stockTexto: text("stock_texto"),
  vendedor: text("vendedor"),
  tiendaOficial: boolean("tienda_oficial"),
  envioGratis: boolean("envio_gratis"),
  full: boolean("envio_full"),
  estrellas: doublePrecision("estrellas"),
  opiniones: integer("opiniones"),
  datos: jsonb("datos"),
}, (t) => [primaryKey({ columns: [t.busquedaId, t.posicion] })]);

export const radarSeguidas = pgTable("radar_seguidas", {
  organizacionId: text("organizacion_id").notNull().references(() => organizaciones.id, { onDelete: "cascade" }),
  categoriaId: text("categoria_id").notNull(),
  profundizar: boolean("profundizar").notNull().default(false),
  desde: timestamp("desde", { withTimezone: true }).notNull().defaultNow(),
  creadoPor: text("creado_por"),
}, (t) => [primaryKey({ columns: [t.organizacionId, t.categoriaId] })]);

export const radarConfig = pgTable("radar_config", {
  organizacionId: text("organizacion_id").primaryKey().references(() => organizaciones.id, { onDelete: "cascade" }),
  topeSemanalUsd: doublePrecision("tope_semanal_usd").notNull().default(5),
  tendenciasCada: integer("tendencias_cada").notNull().default(7),
  tendenciasUnidad: text("tendencias_unidad").notNull().default("dias"),
  tendenciasDesde: date("tendencias_desde").notNull().defaultNow(),
  arbolCada: integer("arbol_cada").notNull().default(1),
  arbolUnidad: text("arbol_unidad").notNull().default("meses"),
  arbolDesde: date("arbol_desde").notNull().defaultNow(),
  palabrasAProfundizar: integer("palabras_a_profundizar").notNull().default(3),
  fuenteApify: text("fuente_apify").notNull().default("karamelo"),
  mostrarSalieron: boolean("mostrar_salieron").notNull().default(true),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
});

export const radarProcesos = pgTable("radar_procesos", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  tipo: text("tipo").notNull(),
  organizacionId: text("organizacion_id").references(() => organizaciones.id, { onDelete: "cascade" }),
  origen: text("origen").notNull().default("cron"),
  empezo: timestamp("empezo", { withTimezone: true }).notNull().defaultNow(),
  termino: timestamp("termino", { withTimezone: true }),
  estado: text("estado").notNull().default("corriendo"),
  detalle: jsonb("detalle"),
});
