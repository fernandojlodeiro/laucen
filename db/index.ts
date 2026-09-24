// El cliente de Drizzle, sobre una conexión directa (no sujeta a RLS) — el
// mismo patrón que CadaMes. `DATABASE_URL` sale de Supabase → Settings →
// Database → Connection string (modo "Session" o el pooler transaction, con
// la contraseña de la base).

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export const db = drizzle(pool);
