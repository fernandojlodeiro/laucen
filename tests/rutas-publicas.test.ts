// Lo que se llama sin sesión (los cron de Vercel, lo que dispara la base con su clave) tiene que estar en
// lib/rutas-publicas.ts: si no, el middleware lo manda al login y no corre (le pasó al Libro de IVA el 26/11).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esRutaPublica } from "@/lib/rutas-publicas";

test("cada cron de vercel.json es una ruta pública", () => {
  const { crons } = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] };
  for (const c of crons) assert.ok(esRutaPublica(c.path.split("?")[0]), `${c.path} pide login: sumalo a lib/rutas-publicas.ts`);
});

test("las rutas que corren con la clave de las tareas no piden login", () => {
  for (const r of ["/api/erp/tareas", "/api/libros-iva/cron"]) assert.ok(esRutaPublica(r), r);
});
