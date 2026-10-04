// "Lo último que viste": las últimas fichas que abrió CADA usuario (se guardan
// en su preferencia, no en el navegador: lo ve igual desde cualquier equipo y
// no se mezcla con el de otra persona que use la misma computadora).

import { consulta, una } from "@/lib/erp/base";

export type Visto = { href: string; titulo: string; tipo: string };
export const MAX_HISTORIAL = 15;

const limpio = (v: unknown): Visto[] =>
  (Array.isArray(v) ? v : [])
    .filter((x): x is Visto => !!x && typeof x.href === "string" && x.href.startsWith("/") && typeof x.titulo === "string")
    .map((x) => ({ href: x.href.slice(0, 300), titulo: x.titulo.slice(0, 120), tipo: String(x.tipo ?? "").slice(0, 40) }))
    .slice(0, MAX_HISTORIAL);

export async function historialDe(usuarioId: string, org: string): Promise<Visto[]> {
  const f = await una<{ historial: unknown }>("select historial from usuario_preferencia where usuario_id = $1 and organizacion_id = $2", [usuarioId, org]);
  return limpio(f?.historial);
}

async function guardar(usuarioId: string, org: string, lista: Visto[]) {
  await consulta(`
    insert into usuario_preferencia (usuario_id, organizacion_id, historial) values ($1, $2, $3::jsonb)
    on conflict (usuario_id, organizacion_id) do update set historial = excluded.historial, actualizado_ts = now()`,
    [usuarioId, org, JSON.stringify(lista)]);
}

/** Anota una ficha arriba de todo (si ya estaba, la sube) y devuelve la lista. */
export async function anotarVisto(usuarioId: string, org: string, visto: Visto): Promise<Visto[]> {
  const [v] = limpio([visto]);
  const actual = await historialDe(usuarioId, org);
  if (!v) return actual;
  const nueva = [v, ...actual.filter((x) => x.href !== v.href)].slice(0, MAX_HISTORIAL);
  await guardar(usuarioId, org, nueva);
  return nueva;
}

export const borrarHistorial = (usuarioId: string, org: string) => guardar(usuarioId, org, []);
