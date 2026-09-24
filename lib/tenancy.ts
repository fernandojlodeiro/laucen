// Multi-tenancy: membresías N:M usuario ↔ organización. El vínculo y los
// permisos viven en `membresias`, no en `usuarios` — `usuarios` es sólo
// identidad global (id · email · nombre).
//
// Portado de src/lib/tenancy.ts de CadaMes, sin la parte de planes de
// CadaMes (`planQueRige`/`featuresDelPlan`) ni los guardianes de aislamiento
// de tablas de negocio (`miembroDeLaOrg`, etc. — esos se escriben cuando
// exista la tabla real: el patrón es "todo id que viaja en un formulario se
// re-consulta filtrando por organizacionId", ver el ejemplo comentado abajo).

import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/db";
import { usuarios, organizaciones, membresias } from "@/db/tenancy";
import { and, eq, ne } from "drizzle-orm";
import { usuarioActual } from "@/lib/supabase";
import { tienePermiso, type Permisos, type PermisoKey } from "@/lib/permisos";
import { rolesDeLaOrg, permisosEfectivos } from "@/lib/roles";

const COOKIE_ORG = "org_activa";

/** Encuentra o crea la fila `usuarios` de esta identidad, y la vincula por
 *  `auth_id` si todavía no lo estaba. Por auth_id primero, y sólo por
 *  auth_id: no por email, porque email es editable. */
export async function vincularUsuario(identidad: {
  authId: string; email: string; nombre: string;
}): Promise<typeof usuarios.$inferSelect | null> {
  const { authId, nombre } = identidad;
  const email = identidad.email.toLowerCase();

  let [u] = await db.select().from(usuarios).where(eq(usuarios.authId, authId));
  if (u) return u;

  const [porEmail] = await db.select().from(usuarios).where(eq(usuarios.email, email));
  if (porEmail) {
    await db.update(usuarios).set({ authId }).where(eq(usuarios.id, porEmail.id));
    return { ...porEmail, authId };
  }

  [u] = await db.insert(usuarios).values({ email, nombre, authId })
    .onConflictDoNothing().returning();
  if (u) return u;
  // Vacío = otro request la creó en el medio (dos pestañas abiertas).
  [u] = await db.select().from(usuarios).where(eq(usuarios.authId, authId));
  if (u) return u;
  [u] = await db.select().from(usuarios).where(eq(usuarios.email, email));
  return u ?? null;
}

/** Asegura que exista la fila `usuarios` del login actual (upsert por auth_id). */
export async function asegurarUsuario() {
  const user = await usuarioActual();
  if (!user?.email) return null;
  const meta = user.user_metadata ?? {};
  const email = user.email.toLowerCase();
  const nombre = String(meta.nombre || meta.full_name || meta.name || "").trim() || email;
  return vincularUsuario({ authId: user.id, email, nombre });
}

/** Membresías activas del usuario (con su organización). Acepta las
 *  invitaciones pendientes (INVITADO→ACTIVO) al leerlas. */
export async function membresiasDelUsuario(usuarioId: string) {
  const filas = await db
    .select({ membresia: membresias, org: organizaciones })
    .from(membresias)
    .innerJoin(organizaciones, eq(membresias.organizacionId, organizaciones.id))
    .where(and(eq(membresias.usuarioId, usuarioId), ne(membresias.estado, "SUSPENDIDO")))
    .orderBy(organizaciones.nombre);

  if (filas.some((f) => f.membresia.estado === "INVITADO")) {
    await db.update(membresias)
      .set({ estado: "ACTIVO" })
      .where(and(eq(membresias.usuarioId, usuarioId), eq(membresias.estado, "INVITADO")));
    for (const f of filas) {
      if (f.membresia.estado === "INVITADO") f.membresia.estado = "ACTIVO";
    }
  }
  return filas;
}

export type Sesion = {
  usuario: typeof usuarios.$inferSelect;
  org: typeof organizaciones.$inferSelect;
  membresia: typeof membresias.$inferSelect;
  permisos: Permisos;
  cantidadOrgs: number;
};

/** Sesión completa para la organización activa, o null. Envuelta en `cache()`:
 *  se resuelve una sola vez por request. */
export const sesionActual = cache(async function sesionActual(): Promise<Sesion | null> {
  const u = await asegurarUsuario();
  if (!u) return null;

  const filas = await membresiasDelUsuario(u.id);
  if (!filas.length) return null;

  const cookieStore = await cookies();
  const elegida = cookieStore.get(COOKIE_ORG)?.value;
  const activa = filas.find((f) => f.org.id === elegida) ?? filas[0];

  const rolesDeEstaOrg = await rolesDeLaOrg(activa.org.id);

  return {
    usuario: u,
    org: activa.org,
    membresia: activa.membresia,
    permisos: permisosEfectivos(activa.membresia, rolesDeEstaOrg),
    cantidadOrgs: filas.length,
  };
});

/** Sesión requerida: sin usuario/membresía → onboarding. */
export async function sesionRequerida(): Promise<Sesion> {
  const s = await sesionActual();
  if (!s) redirect("/onboarding");
  return s;
}

export async function orgDelUsuario() {
  const s = await sesionActual();
  return s?.org ?? null;
}

export async function orgRequerida() {
  return (await sesionRequerida()).org;
}

/** ¿La sesión actual tiene el permiso? */
export async function puede(permiso: PermisoKey): Promise<boolean> {
  const s = await sesionActual();
  return tienePermiso(s?.permisos, permiso);
}

/** Fija la organización activa (selector cuando el usuario tiene varias). */
export async function fijarOrgActiva(organizacionId: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_ORG, organizacionId, { httpOnly: true, sameSite: "lax", path: "/" });
}

// ── Guardián de aislamiento (patrón a repetir con cada tabla de negocio) ──
//
// Todo id que viaja en un formulario tiene que verificarse contra la org
// activa ANTES de usarse — nunca confiar en el id solo. Ejemplo con una
// tabla `busquedas` (organizacionId, id): agregar cuando esa tabla exista.
//
// export async function busquedaDeLaOrg(organizacionId: string, busquedaId: string) {
//   const [b] = await db.select().from(busquedas)
//     .where(and(eq(busquedas.id, busquedaId), eq(busquedas.organizacionId, organizacionId)));
//   return b ?? null;
// }
