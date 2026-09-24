// Arma la conexión a la base a partir de DATABASE_URL. Acepta dos formas:
// - la dirección completa (postgresql://…), aunque venga con `DATABASE_URL=`
//   adelante, entre comillas o con espacios;
// - sólo la contraseña de la base: la dirección se arma acá, contra el pooler
//   de Supabase (la conexión directa es sólo IPv6 y Vercel no llega).

export const PROYECTO = "pcltuzztybiovhuaheek";
export const POOLERS = ["aws-0-sa-east-1.pooler.supabase.com", "aws-1-sa-east-1.pooler.supabase.com"];

export function urlConPassword(password: string, host = POOLERS[0]): string {
  return `postgresql://postgres.${PROYECTO}:${encodeURIComponent(password)}@${host}:6543/postgres`;
}

export function databaseUrl(): string | undefined {
  const cruda = process.env.DATABASE_URL?.trim();
  if (!cruda) return undefined;
  const m = cruda.match(/postgres(?:ql)?:\/\/[^\s"'`]+/);
  if (m) return m[0];
  return urlConPassword(cruda.replace(/^["'`]|["'`]$/g, ""));
}
