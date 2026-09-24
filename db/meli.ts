// Conexión con Mercado Libre (ver db/meli.sql).

import { pgTable, text, bigint, timestamp, jsonb } from "drizzle-orm/pg-core";
import { organizaciones } from "@/db/tenancy";

export const meliCuentas = pgTable("meli_cuentas", {
  organizacionId: text("organizacion_id").primaryKey().references(() => organizaciones.id, { onDelete: "cascade" }),
  meliUserId: bigint("meli_user_id", { mode: "number" }).notNull(),
  meliNickname: text("meli_nickname"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiraEl: timestamp("expira_el", { withTimezone: true }).notNull(),
  actualizadoEl: timestamp("actualizado_el", { withTimezone: true }).notNull().defaultNow(),
});

export const meliPruebas = pgTable("meli_pruebas", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  organizacionId: text("organizacion_id").notNull().references(() => organizaciones.id, { onDelete: "cascade" }),
  consulta: text("consulta").notNull(),
  resultados: jsonb("resultados").notNull(),
});
