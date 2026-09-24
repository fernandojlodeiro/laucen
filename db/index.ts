// El cliente de Drizzle, sobre una conexión directa (no sujeta a RLS) — el
// mismo patrón que CadaMes. `DATABASE_URL` sale de Supabase → Settings →
// Database → Connection string (modo "Session" o el pooler transaction, con
// la contraseña de la base).

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Supabase exige SSL en la conexión directa. `rejectUnauthorized: false` es
// el mismo trato que usa Supabase en sus propios ejemplos con node-postgres
// desde un entorno serverless (Vercel) — sin esto, cualquier pantalla que
// toque la base tira un error 500 sin explicación.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool);
