// El cliente de Drizzle, sobre una conexión directa (no sujeta a RLS) — el
// mismo patrón que CadaMes. `DATABASE_URL` puede ser la dirección del pooler
// de Supabase o sólo la contraseña de la base (ver lib/database-url.ts).

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl } from "@/lib/database-url";

// Supabase exige SSL en la conexión directa. `rejectUnauthorized: false` es
// el mismo trato que usa Supabase en sus propios ejemplos con node-postgres
// desde un entorno serverless (Vercel) — sin esto, cualquier pantalla que
// toque la base tira un error 500 sin explicación.
export const pool = new Pool({
  connectionString: databaseUrl(),
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool);
