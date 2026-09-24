// Sistema de login multi-cliente, portado de CadaMes (src/db/schema.ts,
// recortado a lo mínimo de tenancy: sin facturación, sin planes de CadaMes,
// sin vocabulario del cliente — eso se agrega cuando el negocio lo pida).
//
// AJUSTAR: `@/db` tiene que apuntar al cliente de Drizzle de este proyecto.

import { pgTable, pgEnum, text, jsonb, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey().default(sql`gen_random_uuid()::text`);

export const estadoMembresiaEnum = pgEnum("estado_membresia", [
  "INVITADO", "ACTIVO", "SUSPENDIDO",
]);

/** Identidad global del login. El vínculo con organizaciones vive en `membresias`. */
export const usuarios = pgTable("usuarios", {
  id: id(),
  email: text("email").notNull().unique(),
  /** El id de Supabase Auth. No cambia aunque cambie el email — es el
   *  vínculo estable que usa `asegurarUsuario()` para encontrar la sesión. */
  authId: text("auth_id"),
  nombre: text("nombre").notNull(),
  telefono: text("telefono"),
  creadoEl: timestamp("creado_el").notNull().defaultNow(),
});

/** AJUSTAR: acá van los campos propios del negocio a medida que aparezcan
 *  (vocabulario del cliente, config, lo que sea). En CadaMes esta tabla tiene
 *  decenas de columnas de facturación/plan/asistente — no se portaron. */
export const organizaciones = pgTable("organizaciones", {
  id: id(),
  nombre: text("nombre").notNull(),
  creadaEl: timestamp("creada_el").notNull().defaultNow(),
});

/** Un rol por organización, con permisos como jsonb. Los tres presets de
 *  fábrica se siembran una vez (`asegurarRolesDeLaOrg`) y desde ahí no tienen
 *  nada de especial: se renombran, editan y borran. El marcado `protegido`
 *  (el Admin inicial) no se puede borrar ni dejar sin gestionar el equipo. */
export const roles = pgTable("roles", {
  id: id(),
  organizacionId: text("organizacion_id").notNull().references(() => organizaciones.id),
  nombre: text("nombre").notNull(),
  permisos: jsonb("permisos").$type<Record<string, boolean>>().notNull().default({}),
  protegido: boolean("protegido").notNull().default(false),
  creadoEl: timestamp("creado_el").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("rol_nombre_unico_por_org").on(t.organizacionId, t.nombre),
  index("rol_org_idx").on(t.organizacionId),
]);

/** Membresía N:M usuario ↔ organización. Si tiene rol, valen los permisos DEL
 *  ROL; `permisos` es para quien tiene permisos a medida sin rol asignado. */
export const membresias = pgTable("membresias", {
  id: id(),
  usuarioId: text("usuario_id").notNull().references(() => usuarios.id),
  organizacionId: text("organizacion_id").notNull().references(() => organizaciones.id),
  rolId: text("rol_id").references(() => roles.id),
  permisos: jsonb("permisos").$type<Record<string, boolean>>().notNull().default({}),
  estado: estadoMembresiaEnum("estado").notNull().default("ACTIVO"),
  invitadoPor: text("invitado_por"),
  creadaEl: timestamp("creada_el").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("membresia_unica").on(t.usuarioId, t.organizacionId),
  index("membresia_org_idx").on(t.organizacionId),
]);
