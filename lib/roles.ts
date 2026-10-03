// Cómo se resuelven y se siembran los roles de una organización. Portado tal
// cual de src/lib/roles.ts de CadaMes.

import { db } from "@/db";
import { roles, membresias } from "@/db/tenancy";
import { and, eq } from "drizzle-orm";
import { PERMISOS, PRESETS, tienePermiso, type Permisos } from "@/lib/permisos";

export type Rol = typeof roles.$inferSelect;
export type Membresia = typeof membresias.$inferSelect;

/** Los permisos que valen para una persona: los del rol, o los suyos. */
export function permisosEfectivos(
  membresia: Pick<Membresia, "rolId" | "permisos">,
  rolesDeLaOrg: Pick<Rol, "id" | "permisos">[],
): Permisos {
  if (membresia.rolId) {
    const rol = rolesDeLaOrg.find((r) => r.id === membresia.rolId);
    if (rol) return (rol.permisos ?? {}) as Permisos;
  }
  return (membresia.permisos ?? {}) as Permisos;
}

export function permisosDesdeFormulario(formData: FormData, prefijo = "perm_"): Permisos {
  const permisos: Permisos = {};
  for (const p of PERMISOS) permisos[p.key] = formData.get(`${prefijo}${p.key}`) === "on";
  return permisos;
}

export function rolesDeLaOrg(organizacionId: string) {
  return db.select().from(roles).where(eq(roles.organizacionId, organizacionId)).orderBy(roles.nombre);
}

export async function rolDeLaOrg(organizacionId: string, rolId: string): Promise<Rol | null> {
  const [r] = await db.select().from(roles)
    .where(and(eq(roles.id, rolId), eq(roles.organizacionId, organizacionId)));
  return r ?? null;
}

/** Siembra los roles de fábrica si la organización todavía no tiene ninguno. */
export async function asegurarRolesDeLaOrg(organizacionId: string): Promise<Rol[]> {
  const existentes = await rolesDeLaOrg(organizacionId);
  if (existentes.length) return existentes;

  await db.insert(roles).values(
    Object.entries(PRESETS).map(([key, p]) => ({
      organizacionId,
      nombre: p.label,
      permisos: p.permisos as Record<string, boolean>,
      protegido: key === "ADMIN",
    })),
  ).onConflictDoNothing();

  return rolesDeLaOrg(organizacionId);
}

export function mismosPermisos(a: Permisos, b: Permisos): boolean {
  return PERMISOS.every((p) => (a[p.key] === true) === (b[p.key] === true));
}

// ── Candado anti-encierro: nunca dejar la organización sin admin ──

export type CambioDePermisos =
  | { tipo: "rol_editado"; rolId: string; permisos: Permisos }
  | { tipo: "rol_borrado"; rolId: string }
  | { tipo: "membresia"; membresiaId: string; rolId: string | null; permisos: Permisos }
  | { tipo: "estado"; membresiaId: string; estado: string }
  | { tipo: "superadmin"; membresiaId: string };

/** ¿Después de este cambio va a seguir habiendo alguien con "gestionar_equipo"
 *  (un superadministrador activo cuenta siempre)?
 *  Se corre ANTES de aplicar el cambio, para poder rechazarlo. */
export async function habraAlgunAdmin(
  organizacionId: string,
  cambio: CambioDePermisos,
): Promise<boolean> {
  const listaRoles = (await rolesDeLaOrg(organizacionId)).map((r) => ({
    id: r.id,
    permisos: (r.permisos ?? {}) as Permisos,
  }));
  const equipo = await db.select().from(membresias).where(eq(membresias.organizacionId, organizacionId));

  const rolesSimulados = listaRoles
    .filter((r) => !(cambio.tipo === "rol_borrado" && r.id === cambio.rolId))
    .map((r) => (cambio.tipo === "rol_editado" && r.id === cambio.rolId ? { ...r, permisos: cambio.permisos } : r));

  return equipo.some((m) => {
    let rolId = m.rolId;
    let permisos = (m.permisos ?? {}) as Permisos;
    let estado: string = m.estado;

    if (cambio.tipo === "membresia" && m.id === cambio.membresiaId) {
      rolId = cambio.rolId; permisos = cambio.permisos;
    }
    if (cambio.tipo === "estado" && m.id === cambio.membresiaId) estado = cambio.estado;
    if (cambio.tipo === "rol_borrado" && m.rolId === cambio.rolId) rolId = null;

    // Sólo cuenta quien ya entra: un suspendido no, y un invitado que todavía
    // no se registró tampoco (si nunca se registra, la organización queda sin nadie).
    if (estado !== "ACTIVO") return false;
    if (m.superadmin && !(cambio.tipo === "superadmin" && m.id === cambio.membresiaId)) return true;
    return tienePermiso(permisosEfectivos({ rolId, permisos }, rolesSimulados), "gestionar_equipo");
  });
}

/** Anti-escalada: nadie da un permiso que no tiene. Devuelve las etiquetas de
 *  los permisos de `pedidos` que `propios` no tiene (vacío = puede darlos).
 *  El superadministrador tiene todos, así que a él nunca le falta ninguno. */
export function permisosQueNoTiene(propios: Permisos, pedidos: Permisos): string[] {
  return PERMISOS.filter((p) => tienePermiso(pedidos, p.key) && !tienePermiso(propios, p.key)).map((p) => p.label);
}

export async function cuantosUsanElRol(organizacionId: string, rolId: string): Promise<number> {
  const filas = await db.select({ id: membresias.id }).from(membresias)
    .where(and(eq(membresias.organizacionId, organizacionId), eq(membresias.rolId, rolId)));
  return filas.length;
}
