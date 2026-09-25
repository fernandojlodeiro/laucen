#!/usr/bin/env node
// Paso del build de Vercel (package.json → "build"): sube AGENTS.md a
// coordinacion.documentos para que Cowork, que no tiene el repo, lo lea con
// su conector de Supabase. Sólo en producción (un preview de una rama no
// pisa lo de main). Si la base no responde: lo dice y sigue — NUNCA frena
// el deploy.

import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DOCUMENTOS = ["AGENTS.md"];

// Igual que lib/database-url.ts: DATABASE_URL es la dirección completa o sólo
// la contraseña; con sólo la contraseña se arma contra el pooler aws-0.
function urlDeLaBase() {
  const cruda = process.env.DATABASE_URL?.trim();
  if (!cruda) return null;
  const m = cruda.match(/postgres(?:ql)?:\/\/[^\s"'`]+/);
  if (m) return m[0];
  const pass = cruda.replace(/^["'`]|["'`]$/g, "");
  return `postgresql://postgres.pcltuzztybiovhuaheek:${encodeURIComponent(pass)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;
}

async function main() {
  if (process.env.VERCEL_ENV !== "production" && process.env.PUBLICAR_DOCUMENTOS !== "1") {
    console.log(`[documentos] no es producción (VERCEL_ENV=${process.env.VERCEL_ENV ?? "—"}): no se publica.`);
    return;
  }
  const url = urlDeLaBase();
  if (!url) { console.log("[documentos] falta DATABASE_URL: no se publica."); return; }
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null;
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const c = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, query_timeout: 15000 });
  try {
    await c.connect();
    await c.query(`create table if not exists coordinacion.documentos (
      nombre text primary key, contenido text not null, commit text,
      actualizado_ts timestamptz not null default now())`);
    await c.query("alter table coordinacion.documentos enable row level security");
    for (const nombre of DOCUMENTOS) {
      const contenido = readFileSync(path.join(RAIZ, nombre), "utf8");
      await c.query(`
        insert into coordinacion.documentos (nombre, contenido, commit, actualizado_ts)
        values ($1, $2, $3, now())
        on conflict (nombre) do update set contenido = excluded.contenido, commit = excluded.commit, actualizado_ts = now()`,
      [nombre, contenido, commit]);
      console.log(`[documentos] ${nombre} publicado (${contenido.length} caracteres, commit ${commit ?? "—"}).`);
    }
  } catch (e) {
    console.log(`[documentos] NO se pudo publicar (el deploy sigue igual): ${e?.message ?? e}`);
  } finally {
    await c.end().catch(() => {});
  }
}

await main();
