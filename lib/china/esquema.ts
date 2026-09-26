// Crea las tablas de China si no existen, corriendo db/china.sql (que es
// idempotente) una vez por arranque del servidor. Así la tabla existe antes de
// que el código la use, sin depender de que alguien aplique la migración a
// mano. Con candado (advisory lock) para que dos arranques en paralelo no se
// pisen.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@/db";

let listo: Promise<void> | null = null;

export function asegurarEsquema(): Promise<void> {
  listo ??= (async () => {
    const sql = await readFile(path.join(process.cwd(), "db", "china.sql"), "utf8");
    const cliente = await pool.connect();
    try {
      await cliente.query("begin");
      await cliente.query("select pg_advisory_xact_lock(7212003)");
      await cliente.query(sql);
      await cliente.query("commit");
    } catch (e) {
      await cliente.query("rollback").catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
  })().catch((e) => {
    listo = null; // que el próximo intento lo reintente
    throw e;
  });
  return listo;
}
