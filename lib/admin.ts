// El portón de las herramientas internas (bitácora, para probar): sólo el
// dueño de Laucen, no un cliente de una organización. Ahora que el proyecto
// tiene login real (lib/supabase.ts), esto ya no es un placeholder — es el
// mismo patrón que `esAdminDeCadames()` en CadaMes: falla cerrado, resuelto
// contra una variable de entorno y nada más.

import { usuarioActual } from "@/lib/supabase";

function listaDeAdmins(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** ¿El que está mirando es el dueño de Laucen? Falla cerrado: sin la
 *  variable cargada, nadie entra. */
export async function sosVos(): Promise<boolean> {
  const admins = listaDeAdmins();
  if (admins.length === 0) return false;
  const u = await usuarioActual();
  return !!u?.email && admins.includes(u.email.toLowerCase());
}
