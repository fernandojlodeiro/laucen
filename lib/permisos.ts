// El tipo `Permisos` y los presets de rol. Portado de src/lib/permisos.ts de
// CadaMes con la misma forma; las CLAVES son un punto de partida para Laucen,
// no las definitivas — ajustalas a las pantallas reales en cuanto existan.
//
// Regla que se porta de AGENTS.md ("quién puede hacer qué no lo decidimos
// nosotros"): `Permisos` es un `Partial`, así que una clave que se agregue
// después NACE APAGADA para los roles que ya existen. Toda migración que
// sume un permiso nuevo tiene que decidir explícitamente a qué rol existente
// se lo da (el default por ausencia es `false`, no un default explícito).

export type PermisoKey =
  | "ver_config"
  | "gestionar_busquedas"
  | "ver_resultados"
  | "gestionar_equipo";

export const PERMISOS: { key: PermisoKey; label: string; ayuda: string }[] = [
  { key: "gestionar_busquedas", label: "Gestionar búsquedas", ayuda: "Crear, editar y pausar las búsquedas programadas." },
  { key: "ver_resultados", label: "Ver resultados", ayuda: "Ver los productos que encontró cada búsqueda." },
  { key: "ver_config", label: "Ver configuración", ayuda: "Los datos de la organización y su plan." },
  { key: "gestionar_equipo", label: "Gestionar equipo", ayuda: "Invitar personas y configurar sus permisos." },
];

export type Permisos = Partial<Record<PermisoKey, boolean>>;

export type PresetKey = "ADMIN" | "COLABORADOR";

const todos = (v: boolean): Record<PermisoKey, boolean> =>
  Object.fromEntries(PERMISOS.map((p) => [p.key, v])) as Record<PermisoKey, boolean>;

export const PRESETS: Record<PresetKey, { label: string; descripcion: string; permisos: Permisos }> = {
  ADMIN: {
    label: "Admin",
    descripcion: "Acceso total.",
    permisos: todos(true),
  },
  COLABORADOR: {
    label: "Colaborador",
    descripcion: "Ve resultados y búsquedas, sin la configuración ni el equipo.",
    permisos: { ...todos(false), gestionar_busquedas: true, ver_resultados: true },
  },
};

/** ¿La membresía tiene el permiso? (un objeto vacío = sin permisos). */
export function tienePermiso(permisos: Permisos | null | undefined, key: PermisoKey): boolean {
  return !!permisos && permisos[key] === true;
}
