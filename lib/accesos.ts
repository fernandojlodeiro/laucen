// Los accesos directos de la barra de abajo del celular: cada usuario elige
// hasta 4 ítems del menú (Configuración › Mis accesos del celular); sin
// elegir, los de siempre (ACCESOS_CELULAR). Sólo valen los que su rol puede ver.

import { consulta, una } from "@/lib/erp/base";
import { ACCESOS_CELULAR, MENU, type ItemMenu } from "@/lib/menu";
import type { PermisoKey } from "@/lib/permisos";

export type Acceso = ItemMenu & { href: string };
export const MAX_ACCESOS = 4;

/** Todos los ítems del menú con pantalla que esta persona puede abrir (sin repetir direcciones). */
export function opcionesDeAcceso(puede: (p: PermisoKey) => boolean): Acceso[] {
  const vistos = new Set<string>();
  const out: Acceso[] = [];
  for (const s of MENU) {
    if (s.soloFer) continue;
    for (const i of s.items) {
      if (!i.href || (i.permiso && !puede(i.permiso)) || vistos.has(i.href)) continue;
      vistos.add(i.href);
      out.push({ ...i, href: i.href, icono: i.icono ?? ACCESOS_CELULAR.find((a) => a.href === i.href)?.icono ?? "▫️" });
    }
  }
  return out;
}

/** Los accesos de la barra de abajo de esta persona. */
export async function accesosDe(usuarioId: string, org: string, puede: (p: PermisoKey) => boolean): Promise<Acceso[]> {
  const f = await una<{ accesos_celular: string[] | null }>("select accesos_celular from usuario_preferencia where usuario_id = $1 and organizacion_id = $2", [usuarioId, org]);
  const opciones = opcionesDeAcceso(puede);
  const elegidos = Array.isArray(f?.accesos_celular) ? f.accesos_celular.map((h) => opciones.find((o) => o.href === h)).filter((x): x is Acceso => !!x) : [];
  if (elegidos.length) return elegidos.slice(0, MAX_ACCESOS);
  return ACCESOS_CELULAR.filter((a) => !a.permiso || puede(a.permiso));
}

export async function guardarAccesos(usuarioId: string, org: string, hrefs: string[]): Promise<void> {
  await consulta(`
    insert into usuario_preferencia (usuario_id, organizacion_id, accesos_celular) values ($1, $2, $3::jsonb)
    on conflict (usuario_id, organizacion_id) do update set accesos_celular = excluded.accesos_celular, actualizado_ts = now()`,
    [usuarioId, org, JSON.stringify(hrefs)]);
}
