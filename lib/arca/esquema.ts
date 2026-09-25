// Crea las tablas de Importaciones (ARCA + Softrade) si no existen, corriendo
// db/arca.sql (idempotente) una vez por arranque del servidor. Mismo patrón
// que lib/radar/esquema.ts. La carga de datos no pasa por acá: la hace
// scripts/arca/cargar.mjs desde la PC donde están los archivos.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@/db";

let listo: Promise<void> | null = null;

export function asegurarEsquemaArca(): Promise<void> {
  listo ??= (async () => {
    const sql = await readFile(path.join(process.cwd(), "db", "arca.sql"), "utf8");
    const cliente = await pool.connect();
    try {
      await cliente.query("begin");
      // Si hay una carga de ARCA en curso (scripts/arca/cargar.mjs tiene el
      // mismo candado), las tablas ya existen: no se espera — si no, la
      // pantalla quedaba colgada hasta que terminara la carga.
      const r = await cliente.query<{ ok: boolean }>("select pg_try_advisory_xact_lock(7212002) as ok");
      if (!r.rows[0].ok) {
        await cliente.query("rollback");
        listo = null; // se reintenta en el próximo pedido
        return;
      }
      await cliente.query(sql);
      await cliente.query("commit");
    } catch (e) {
      await cliente.query("rollback").catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
  })().catch((e) => {
    listo = null;
    throw e;
  });
  return listo;
}
