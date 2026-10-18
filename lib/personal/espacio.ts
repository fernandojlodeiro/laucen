// Espacio personal (pedido de Fer, 18/10; db/personal.sql): un lugar aparte
// de la empresa para conectar cuentas personales. Cada espacio es de una
// persona —el superadministrador que creó una organización— y entra sólo él
// y quien él autorice. Todo lo de acá lee y escribe el esquema "personal";
// nada de la empresa (organizacion_id) se toca.

import { redirect } from "next/navigation";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { sesionActual, type Sesion } from "@/lib/tenancy";

export type Espacio = { id: number; esDueno: boolean; dueno: string };

/** ¿Creó alguna organización? (el dueño es su superadministrador de nacimiento). */
async function esCreador(usuarioId: string) {
  return !!(await una("select 1 from organizaciones where dueno_usuario_id = $1 limit 1", [usuarioId]));
}

/** El espacio al que entra el usuario: el suyo (si creó una organización, se crea solo la
 *  primera vez) o aquel en el que lo autorizaron. null si no tiene ninguno. */
export async function espacioDe(usuarioId: string, crear = false): Promise<Espacio | null> {
  const propio = await una<{ id: number }>("select id::int from personal.espacio where dueno_usuario_id = $1", [usuarioId]);
  if (propio) return { id: propio.id, esDueno: true, dueno: "" };
  if (await esCreador(usuarioId)) {
    if (!crear) return { id: 0, esDueno: true, dueno: "" };
    const f = await una<{ id: number }>(`insert into personal.espacio (dueno_usuario_id) values ($1)
      on conflict (dueno_usuario_id) do update set dueno_usuario_id = excluded.dueno_usuario_id returning id::int`, [usuarioId]);
    return { id: f!.id, esDueno: true, dueno: "" };
  }
  const ajeno = await una<{ id: number; dueno: string }>(`
    select e.id::int, coalesce(nullif(u.nombre, ''), u.email) dueno
      from personal.acceso a join personal.espacio e on e.id = a.espacio_id join usuarios u on u.id = e.dueno_usuario_id
     where a.usuario_id = $1 order by a.creado_ts limit 1`, [usuarioId]);
  return ajeno ? { id: ajeno.id, esDueno: false, dueno: ajeno.dueno } : null;
}

/** ¿Mostrar el acceso al espacio personal? (sin crearlo). */
export async function tieneEspacio(usuarioId: string) {
  return !!(await espacioDe(usuarioId).catch(() => null));
}

/** Entrada a toda pantalla o acción del espacio: sin espacio, al panel. */
export async function entrarPersonal(): Promise<{ sesion: Sesion; espacio: Espacio }> {
  await asegurarEsquemaErp();
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");
  const espacio = await espacioDe(sesion.usuario.id, true);
  if (!espacio) redirect("/panel");
  return { sesion, espacio };
}

export type Autorizado = { usuarioId: string; nombre: string; email: string; desde: string };

export async function autorizados(espacioId: number): Promise<Autorizado[]> {
  return consulta<Autorizado>(`
    select u.id "usuarioId", coalesce(u.nombre, '') nombre, u.email, to_char(a.creado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY') desde
      from personal.acceso a join usuarios u on u.id = a.usuario_id where a.espacio_id = $1 order by a.creado_ts`, [espacioId]);
}

/** Sólo el dueño autoriza, y sólo a alguien que ya es usuario de Laucen. */
export async function autorizar(espacio: Espacio, quien: string, email: string) {
  if (!espacio.esDueno) throw new ErrorErp("Sólo el dueño del espacio autoriza a otras personas.");
  const limpio = email.trim().toLowerCase();
  if (!limpio) throw new ErrorErp("Escribí el mail de la persona.");
  const u = await una<{ id: string }>("select id from usuarios where lower(email) = $1", [limpio]);
  if (!u) throw new ErrorErp("Ese mail no es de ningún usuario de Laucen: primero tiene que tener su usuario.");
  if (u.id === quien) throw new ErrorErp("Ése sos vos: ya entrás como dueño.");
  await consulta("insert into personal.acceso (espacio_id, usuario_id, autorizado_por) values ($1, $2, $3) on conflict do nothing", [espacio.id, u.id, quien]);
}

export async function desautorizar(espacio: Espacio, usuarioId: string) {
  if (!espacio.esDueno) throw new ErrorErp("Sólo el dueño del espacio saca autorizaciones.");
  await consulta("delete from personal.acceso where espacio_id = $1 and usuario_id = $2", [espacio.id, usuarioId]);
}
