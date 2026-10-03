"use server";

// Usuarios y roles: cambiar el rol de una persona, suspenderla o reactivarla,
// invitar por mail y el ABM de roles con sus permisos. Cada cambio pasa antes
// por el candado anti-encierro (lib/roles.ts, `habraAlgunAdmin`): nunca queda
// la organización sin nadie activo que pueda gestionar el equipo.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto } from "@/lib/erp/acciones";
import { sosVos } from "@/lib/admin";
import { tienePermiso, type Permisos } from "@/lib/permisos";
import { habraAlgunAdmin, permisosDesdeFormulario, cuantosUsanElRol, permisosQueNoTiene } from "@/lib/roles";

const VOLVER = "/config/usuarios";
const SIN_ADMIN = "Así la organización se queda sin nadie activo que pueda gestionar el equipo. Dejá al menos una persona activa con un rol que tenga «Gestionar equipo».";

/** Ver la pantalla pide "Usuarios y roles"; cambiar algo pide además
 *  "Gestionar equipo" (o ser Fer). La pantalla hace la misma cuenta. */
async function entrarEditando() {
  const s = await entrarErp("usuarios_ver");
  if (!tienePermiso(s.permisos, "gestionar_equipo") && !(await sosVos())) redirect(`${VOLVER}?error=${encodeURIComponent("Para cambiar usuarios y roles hace falta el permiso «Gestionar equipo».")}`);
  return s;
}

/** Los roles piden además «Administrar roles». */
async function entrarRoles() {
  const s = await entrarEditando();
  if (!tienePermiso(s.permisos, "roles_administrar") && !(await sosVos())) redirect(`${VOLVER}?error=${encodeURIComponent("Para crear, editar o borrar roles hace falta el permiso «Administrar roles».")}`);
  return s;
}

type Sesion = Awaited<ReturnType<typeof entrarEditando>>;

/** Nadie da un permiso que no tiene (el superadministrador los tiene todos). */
function sinEscalar(s: Sesion, permisos: Permisos, que: string) {
  const faltan = permisosQueNoTiene(s.permisos, permisos);
  if (faltan.length) throw new ErrorErp(`No podés ${que}: tiene permisos que vos no tenés (${faltan.slice(0, 4).join(", ")}${faltan.length > 4 ? "…" : ""}).`);
}

/** A un superadministrador sólo lo toca otro superadministrador. */
function protegerSuperadmin(s: Sesion, m: { superadmin: boolean }) {
  if (m.superadmin && !s.superadmin) throw new ErrorErp("Esa persona es superadministrador: sólo otro superadministrador puede cambiarla.");
}

const idTexto = (fd: FormData, k = "id") => {
  const v = texto(fd, k);
  if (!v) throw new ErrorErp("Falta elegir a quién.");
  return v;
};

async function membresiaDeLaOrg(org: string, id: string) {
  const m = await una<{ id: string; usuario_id: string; rol_id: string | null; permisos: Permisos; estado: string; superadmin: boolean; dueno: boolean }>(
    `select m.id, m.usuario_id, m.rol_id, m.permisos, m.estado::text estado, m.superadmin, o.dueno_usuario_id is not distinct from m.usuario_id dueno
       from membresias m join organizaciones o on o.id = m.organizacion_id where m.id = $2 and m.organizacion_id = $1`, [org, id]);
  if (!m) throw new ErrorErp("Esa persona no está en la organización.");
  return m;
}

async function rolDeLaOrg(org: string, id: string) {
  const r = await una<{ id: string; nombre: string; permisos: Permisos; protegido: boolean }>(
    "select id, nombre, permisos, protegido from roles where id = $2 and organizacion_id = $1", [org, id]);
  if (!r) throw new ErrorErp("Ese rol no es de esta organización.");
  return r;
}

// ── Personas ──

export async function accionCambiarRol(fd: FormData) {
  const s = await entrarEditando();
  await intentar(VOLVER, async () => {
    const m = await membresiaDeLaOrg(s.org.id, idTexto(fd));
    protegerSuperadmin(s, m);
    const rolId = idTexto(fd, "rol");
    const rol = await rolDeLaOrg(s.org.id, rolId);
    sinEscalar(s, rol.permisos ?? {}, `darle el rol «${rol.nombre}»`);
    if (!(await habraAlgunAdmin(s.org.id, { tipo: "membresia", membresiaId: m.id, rolId, permisos: m.permisos ?? {} }))) throw new ErrorErp(SIN_ADMIN);
    await consulta("update membresias set rol_id = $3 where id = $2 and organizacion_id = $1", [s.org.id, m.id, rolId]);
    revalidatePath(VOLVER);
    return "Rol cambiado.";
  });
}

export async function accionSuspender(fd: FormData) {
  const s = await entrarEditando();
  await intentar(VOLVER, async () => {
    const m = await membresiaDeLaOrg(s.org.id, idTexto(fd));
    if (m.id === s.membresia.id) throw new ErrorErp("No te podés suspender a vos mismo.");
    if (m.dueno) throw new ErrorErp("Es el dueño de la organización: no se puede suspender.");
    protegerSuperadmin(s, m);
    if (!(await habraAlgunAdmin(s.org.id, { tipo: "estado", membresiaId: m.id, estado: "SUSPENDIDO" }))) throw new ErrorErp(SIN_ADMIN);
    await consulta("update membresias set estado = 'SUSPENDIDO' where id = $2 and organizacion_id = $1", [s.org.id, m.id]);
    revalidatePath(VOLVER);
    return "Suspendido: ya no puede entrar a la organización.";
  });
}

export async function accionReactivar(fd: FormData) {
  const s = await entrarEditando();
  await intentar(VOLVER, async () => {
    const m = await membresiaDeLaOrg(s.org.id, idTexto(fd));
    protegerSuperadmin(s, m);
    // Si nunca se registró vuelve a quedar invitado; si ya había entrado, activo.
    const yaEntro = await una<{ ok: boolean }>("select auth_id is not null ok from usuarios where id = $1", [m.usuario_id]);
    await consulta("update membresias set estado = $3::estado_membresia where id = $2 and organizacion_id = $1",
      [s.org.id, m.id, yaEntro?.ok ? "ACTIVO" : "INVITADO"]);
    revalidatePath(VOLVER);
    return "Reactivado.";
  });
}

/** Invita por mail: deja la membresía como INVITADO. No se manda ningún mail:
 *  la persona se registra con ese mismo mail (o entra, si ya tenía cuenta) y
 *  al entrar queda activa sola (lib/tenancy.ts, `membresiasDelUsuario`). */
export async function accionInvitar(fd: FormData) {
  const s = await entrarEditando();
  await intentar(VOLVER, async () => {
    const email = (texto(fd, "email") ?? "").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorErp("Escribí un mail válido.");
    const rolId = idTexto(fd, "rol");
    const rol = await rolDeLaOrg(s.org.id, rolId);
    sinEscalar(s, rol.permisos ?? {}, `invitar con el rol «${rol.nombre}»`);
    const nombre = texto(fd, "nombre") ?? email;
    await consulta("insert into usuarios (email, nombre) values ($1, $2) on conflict (email) do nothing", [email, nombre]);
    const u = await una<{ id: string }>("select id from usuarios where email = $1", [email]);
    if (!u) throw new ErrorErp("No se pudo invitar. Probá de nuevo en un momento.");
    const ya = await una<{ estado: string }>("select estado::text estado from membresias where usuario_id = $1 and organizacion_id = $2", [u.id, s.org.id]);
    if (ya) throw new ErrorErp(ya.estado === "SUSPENDIDO" ? "Esa persona ya está en la organización, suspendida: reactivala desde la lista." : "Esa persona ya está en la organización.");
    await consulta(`insert into membresias (usuario_id, organizacion_id, rol_id, estado, invitado_por) values ($1, $2, $3, 'INVITADO', $4)`,
      [u.id, s.org.id, rolId, s.usuario.id]);
    revalidatePath(VOLVER);
    return `Listo: ${email} quedó invitado. Avisale que se registre (o entre, si ya tiene cuenta) con ese mismo mail.`;
  });
}

/** Cancela una invitación que todavía no se usó (borra la membresía). */
export async function accionCancelarInvitacion(fd: FormData) {
  const s = await entrarEditando();
  await intentar(VOLVER, async () => {
    const m = await membresiaDeLaOrg(s.org.id, idTexto(fd));
    if (m.estado !== "INVITADO") throw new ErrorErp("Sólo se borra una invitación pendiente; a quien ya entró, suspendelo.");
    await consulta("delete from membresias where id = $2 and organizacion_id = $1 and estado = 'INVITADO'", [s.org.id, m.id]);
    revalidatePath(VOLVER);
    return "Invitación borrada.";
  });
}

// ── Roles ──

export async function accionCrearRol(fd: FormData) {
  const s = await entrarRoles();
  await intentar(VOLVER, async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("El rol necesita un nombre.");
    const base = texto(fd, "base");
    const permisos = base ? (await rolDeLaOrg(s.org.id, base)).permisos ?? {} : {};
    sinEscalar(s, permisos, "copiar los permisos de ese rol");
    const r = await una<{ id: string }>("insert into roles (organizacion_id, nombre, permisos) values ($1, $2, $3) returning id",
      [s.org.id, nombre, JSON.stringify(permisos)]);
    revalidatePath(VOLVER);
    return { ir: `${VOLVER}?rol=${r!.id}&ok=${encodeURIComponent("Rol creado: tildá sus permisos y guardá.")}#rol-${r!.id}` };
  });
}

/** Guarda el nombre y los permisos de un rol (la fila abierta con el lápiz). */
export async function accionGuardarRol(fd: FormData) {
  const s = await entrarRoles();
  const id = texto(fd, "id") ?? "";
  await intentar(`${VOLVER}?rol=${encodeURIComponent(id)}`, async () => {
    const rol = await rolDeLaOrg(s.org.id, idTexto(fd));
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("El rol necesita un nombre.");
    const permisos = permisosDesdeFormulario(fd);
    // El rol protegido (el Admin de fábrica) nunca pierde "Gestionar equipo".
    if (rol.protegido) permisos.gestionar_equipo = true;
    // Sólo cuenta lo que se prende ahora: lo que el rol ya tenía puede quedar.
    const nuevos = Object.fromEntries(Object.entries(permisos).filter(([k, v]) => v && !tienePermiso(rol.permisos ?? {}, k as keyof Permisos)));
    sinEscalar(s, nuevos, "guardar el rol así");
    if (!(await habraAlgunAdmin(s.org.id, { tipo: "rol_editado", rolId: rol.id, permisos }))) throw new ErrorErp(SIN_ADMIN);
    await consulta("update roles set nombre = $3, permisos = $4 where id = $2 and organizacion_id = $1",
      [s.org.id, rol.id, nombre, JSON.stringify(permisos)]);
    revalidatePath(VOLVER);
    return { ir: `${VOLVER}?ok=${encodeURIComponent(`Rol «${nombre}» guardado.`)}` };
  });
}

export async function accionBorrarRol(fd: FormData) {
  const s = await entrarRoles();
  await intentar(VOLVER, async () => {
    const rol = await rolDeLaOrg(s.org.id, idTexto(fd));
    if (rol.protegido) throw new ErrorErp("El rol Admin de fábrica no se puede borrar.");
    const n = await cuantosUsanElRol(s.org.id, rol.id);
    if (n > 0) throw new ErrorErp(`El rol «${rol.nombre}» lo tiene${n === 1 ? " una persona" : `n ${n} personas`}: cambiales el rol antes de borrarlo.`);
    if (!(await habraAlgunAdmin(s.org.id, { tipo: "rol_borrado", rolId: rol.id }))) throw new ErrorErp(SIN_ADMIN);
    await consulta("delete from roles where id = $2 and organizacion_id = $1", [s.org.id, rol.id]);
    revalidatePath(VOLVER);
    return `Rol «${rol.nombre}» borrado.`;
  });
}

// ── Superadministradores ──

/** Nombrar superadministrador: sólo lo hace otro superadministrador. */
export async function accionHacerSuperadmin(fd: FormData) {
  const s = await entrarEditando();
  await intentar(VOLVER, async () => {
    if (!s.superadmin) throw new ErrorErp("Sólo un superadministrador puede nombrar a otro.");
    const m = await membresiaDeLaOrg(s.org.id, idTexto(fd));
    if (m.superadmin) throw new ErrorErp("Ya es superadministrador.");
    if (m.estado === "SUSPENDIDO") throw new ErrorErp("Está suspendido: reactivalo primero.");
    await consulta("update membresias set superadmin = true where id = $2 and organizacion_id = $1", [s.org.id, m.id]);
    revalidatePath(VOLVER);
    return "Listo: ahora es superadministrador (tiene todos los permisos, sin importar su rol).";
  });
}

/** Sacarle el superadministrador a alguien (nunca al dueño). */
export async function accionQuitarSuperadmin(fd: FormData) {
  const s = await entrarEditando();
  await intentar(VOLVER, async () => {
    if (!s.superadmin) throw new ErrorErp("Sólo un superadministrador puede sacarle el superadministrador a otro.");
    const m = await membresiaDeLaOrg(s.org.id, idTexto(fd));
    if (m.dueno) throw new ErrorErp("Es el dueño de la organización: siempre es superadministrador.");
    if (!m.superadmin) throw new ErrorErp("No es superadministrador.");
    if (!(await habraAlgunAdmin(s.org.id, { tipo: "superadmin", membresiaId: m.id }))) throw new ErrorErp(SIN_ADMIN);
    await consulta("update membresias set superadmin = false where id = $2 and organizacion_id = $1", [s.org.id, m.id]);
    revalidatePath(VOLVER);
    return m.id === s.membresia.id ? "Ya no sos superadministrador: ahora valen los permisos de tu rol." : "Listo: ya no es superadministrador; valen los permisos de su rol.";
  });
}
