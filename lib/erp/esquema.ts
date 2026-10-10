// Crea las tablas del cimiento del ERP (orden 136) si no existen, corriendo
// los db/*.sql del cimiento —que son idempotentes— una vez por arranque del
// servidor, en orden (cada uno usa tablas del anterior). Con candado
// (advisory lock) para que dos arranques en paralelo no se pisen. Mismo patrón
// que lib/radar/esquema.ts.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { pool } from "@/db";

export const ARCHIVOS_ERP = ["moneda", "eventos", "catalogo", "stock", "ventas", "importar", "compras", "mercadolibre", "deposito", "facturacion", "tienda", "administracion", "archivos", "listas", "precios_ml", "reclamos", "ml_facturacion", "equipo", "asistente", "mensajes", "tc_dia", "seguimiento"] as const;

/** Corre los .sql del cimiento contra una base (sirve también para los tests). */
export async function correrEsquemaErp(base: Pool): Promise<void> {
  const cliente = await base.connect();
  try {
    await cliente.query("begin");
    await cliente.query("select pg_advisory_xact_lock(7212136)");
    // Un servidor de un deploy VIEJO (Vercel deja vivo el deploy anterior un rato: las
    // pantallas abiertas antes del deploy le siguen mandando sus botones) no vuelve a
    // correr sus .sql viejos encima de los nuevos (7/10: así volvieron a la versión
    // anterior mover_stock, precio_de y el stock de los kits). Cada build anota su hora;
    // uno más viejo que el último que corrió, no corre.
    const build = process.env.BUILD_TIME ?? null;
    if (build) {
      await cliente.query(`create table if not exists esquema_build (clave text primary key, build_time timestamptz not null, corrido_ts timestamptz not null default now());
                           alter table esquema_build enable row level security;`);
      const r = await cliente.query<{ build_time: Date }>("select build_time from esquema_build where clave = 'erp'");
      if (r.rows[0] && new Date(r.rows[0].build_time).getTime() > new Date(build).getTime()) {
        console.warn(`[esquema] no corro los .sql: este deploy (${build}) es más viejo que el último que los corrió (${new Date(r.rows[0].build_time).toISOString()})`);
        await cliente.query("commit");
        return;
      }
    }
    for (const archivo of ARCHIVOS_ERP) {
      const sql = await readFile(path.join(process.cwd(), "db", `${archivo}.sql`), "utf8");
      await cliente.query(sql);
    }
    if (build) await cliente.query(`insert into esquema_build (clave, build_time) values ('erp', $1) on conflict (clave) do update set build_time = excluded.build_time, corrido_ts = now()`, [build]);
    await cliente.query("commit");
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

let listo: Promise<void> | null = null;

export function asegurarEsquemaErp(): Promise<void> {
  listo ??= correrEsquemaErp(pool).catch((e) => {
    listo = null; // que el próximo intento lo reintente
    throw e;
  });
  return listo;
}
