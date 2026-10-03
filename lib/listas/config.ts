// Las configuraciones guardadas de las listas (db/listas.sql): las de Excel y
// las vistas, por organización y pantalla. La vista elegida se recuerda en
// una cookie del navegador (una por pantalla, sólo para esa dirección).

import { cookies } from "next/headers";
import { consulta, una } from "@/lib/erp/base";

export type TipoConfig = "excel" | "vista";
export type Config = { id: number; nombre: string; columnas: string[] };

export const esTipoConfig = (t: unknown): t is TipoConfig => t === "excel" || t === "vista";

/** Nombre de la cookie que recuerda la elección de una pantalla. */
export const cookieDe = (tipo: TipoConfig, pantalla: string) => `${tipo}_${pantalla}`;

const columnasDe = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export async function configsDe(org: string, pantalla: string, tipo: TipoConfig): Promise<Config[]> {
  const filas = await consulta<{ id: number; nombre: string; columnas: unknown }>(
    "select id::int, nombre, columnas from lista_config where organizacion_id = $1 and pantalla = $2 and tipo = $3 order by nombre, id",
    [org, pantalla, tipo]);
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, columnas: columnasDe(f.columnas) }));
}

export async function configDe(org: string, pantalla: string, tipo: TipoConfig, id: number): Promise<Config | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const f = await una<{ id: number; nombre: string; columnas: unknown }>(
    "select id::int, nombre, columnas from lista_config where organizacion_id = $1 and pantalla = $2 and tipo = $3 and id = $4",
    [org, pantalla, tipo, id]);
  return f ? { id: f.id, nombre: f.nombre, columnas: columnasDe(f.columnas) } : null;
}

/** La configuración elegida en esta pantalla: la de la dirección (`?_vista=`
 *  o `?_cfg=`) o, si no, la que recuerda la cookie. null = la de siempre. */
export async function elegida(org: string, pantalla: string, tipo: TipoConfig, deDireccion?: string): Promise<{ todas: Config[]; activa: Config | null }> {
  const todas = await configsDe(org, pantalla, tipo);
  let id = Number(deDireccion) || 0;
  if (!deDireccion) {
    try {
      id = Number((await cookies()).get(cookieDe(tipo, pantalla))?.value) || 0;
    } catch {
      id = 0;
    }
  }
  return { todas, activa: todas.find((c) => c.id === id) ?? null };
}
