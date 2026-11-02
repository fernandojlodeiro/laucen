// El cliente de Drizzle, sobre una conexión directa (no sujeta a RLS) — el
// mismo patrón que CadaMes. `DATABASE_URL` puede ser la dirección del pooler
// de Supabase o sólo la contraseña de la base (ver lib/database-url.ts).
//
// El pooler de Supabase acepta 400 conexiones en total, entre todas las
// funciones de Vercel que estén vivas (bitácora #1009: una ráfaga de
// notificaciones de Mercado Libre lo llenó y la tienda dio 500). Por eso:
// - `attachDatabasePool` (de Vercel) cierra las conexiones ociosas antes de que
//   la función se duerma, así una función dormida no ocupa lugar;
// - las ociosas se cierran a los 5 segundos;
// - si el pooler contesta que está lleno (EMAXCONN), se reintenta unas veces
//   con espera corta en vez de tirar la pantalla al primer intento.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { databaseUrl } from "@/lib/database-url";

/** ¿El pooler rechazó la conexión por estar lleno? */
export function esPoolerLleno(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e);
  return m.includes("EMAXCONN") || m.includes("max client connections");
}

const ESPERAS_MS = [150, 400, 900, 1800];

/** Un Pool que, si el pooler está lleno, espera un poco y vuelve a pedir la
 *  conexión (hasta 4 veces, ~3 segundos en total). Vale para `query()` también:
 *  pg-pool pide su conexión con `connect(callback)`. */
class PoolConReintento extends Pool {
  constructor(config: PoolConfig) {
    super(config);
  }

  private async conectar(): Promise<PoolClient> {
    for (let intento = 0; ; intento++) {
      try {
        return await super.connect();
      } catch (e) {
        if (intento >= ESPERAS_MS.length || !esPoolerLleno(e)) throw e;
        await new Promise((r) => setTimeout(r, ESPERAS_MS[intento] + Math.random() * 100));
      }
    }
  }

  // @ts-expect-error — mismas dos formas que pg (promesa o callback), con otra firma de tipos.
  connect(cb?: (err: Error | undefined, client?: PoolClient, done?: (release?: unknown) => void) => void) {
    if (!cb) return this.conectar();
    this.conectar().then((c) => cb(undefined, c, (r?: unknown) => c.release(r as Error | boolean | undefined)), (e) => cb(e as Error));
  }
}

// Supabase exige SSL en la conexión directa. `rejectUnauthorized: false` es
// el mismo trato que usa Supabase en sus propios ejemplos con node-postgres
// desde un entorno serverless (Vercel) — sin esto, cualquier pantalla que
// toque la base tira un error 500 sin explicación.
export const pool = new PoolConReintento({
  connectionString: databaseUrl(),
  ssl: { rejectUnauthorized: false },
  idleTimeoutMillis: 5_000,
}) as unknown as Pool;

attachDatabasePool(pool);

export const db = drizzle(pool);
