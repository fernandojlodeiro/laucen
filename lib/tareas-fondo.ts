// Tareas que corren de fondo (Fer, 6/10; convención en AGENTS.md): un botón
// que demora no deja la pantalla esperando. La acción llama a lanzarTarea():
// queda anotada en tarea_fondo como "corriendo", el trabajo sigue después de
// contestar (after) y, al terminar, la fila pasa a "ok" o "error" con su
// mensaje. En el navegador, app/componentes/TareasFondo.tsx muestra el botón
// "Trabajando…", el cartel al terminar y actualiza la pantalla.

import { after } from "next/server";
import { consulta, una, motivoErp } from "@/lib/erp/base";

export type TareaVista = { id: number; tipo: string; titulo: string; estado: "corriendo" | "ok" | "error"; mensaje: string | null };

/** Lanza `trabajo` de fondo. Si ya hay una del mismo tipo corriendo en la
 *  organización, no lanza otra. Devuelve el id de la tarea. */
export async function lanzarTarea(org: string, usuarioId: string, tipo: string, titulo: string, trabajo: () => Promise<string>): Promise<number> {
  // Una que quedó "corriendo" más de 10 minutos se da por caída.
  await consulta(`update tarea_fondo set estado = 'error', mensaje = 'No terminó (se cortó): probá de nuevo.', terminado_ts = now()
                   where organizacion_id = $1 and estado = 'corriendo' and creado_ts < now() - interval '10 minutes'`, [org]);
  const ya = await una<{ id: number }>("select id::int from tarea_fondo where organizacion_id = $1 and tipo = $2 and estado = 'corriendo' limit 1", [org, tipo]);
  if (ya) return ya.id;
  const f = await una<{ id: number }>("insert into tarea_fondo (organizacion_id, usuario_id, tipo, titulo) values ($1, $2, $3, $4) returning id::int",
    [org, usuarioId, tipo, titulo]);
  const id = f!.id;
  after(async () => {
    try {
      const mensaje = await trabajo();
      await consulta("update tarea_fondo set estado = 'ok', mensaje = $2, terminado_ts = now() where id = $1", [id, mensaje]);
    } catch (e) {
      console.error(`[tarea ${tipo}]`, e);
      await consulta("update tarea_fondo set estado = 'error', mensaje = $2, terminado_ts = now() where id = $1", [id, motivoErp(e)]).catch(() => {});
    }
  });
  return id;
}

/** Las de la persona: las que corren y las terminadas que todavía no vio. */
export async function tareasDe(org: string, usuarioId: string): Promise<TareaVista[]> {
  return consulta<TareaVista>(`
    select id::int, tipo, titulo, estado, mensaje from tarea_fondo
     where organizacion_id = $1 and (estado = 'corriendo' or (usuario_id = $2 and not avisado and terminado_ts > now() - interval '1 day'))
     order by id`, [org, usuarioId]);
}

export async function marcarAvisadas(org: string, usuarioId: string, ids: number[]) {
  if (!ids.length) return;
  await consulta("update tarea_fondo set avisado = true where organizacion_id = $1 and usuario_id = $2 and id = any($3::bigint[])", [org, usuarioId, ids]);
}

/** Para una acción de botón: la lanza de fondo con lo que antes iba en
 *  intentar() (devuelve el mensaje del cartel; un error tira ErrorErp). */
export async function deFondo(s: { org: { id: string }; usuario: { id: string } }, tipo: string, titulo: string,
  trabajo: () => Promise<string | void | { ir: string }>): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await lanzarTarea(s.org.id, s.usuario.id, tipo, titulo, async () => {
      const r = await trabajo();
      return typeof r === "string" ? r : "Listo.";
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}
