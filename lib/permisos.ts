// El tipo `Permisos` y los presets de rol. Portado de src/lib/permisos.ts de
// CadaMes con la misma forma; las CLAVES son un punto de partida para Laucen,
// no las definitivas — ajustalas a las pantallas reales en cuanto existan.
//
// Regla que se porta de AGENTS.md ("quién puede hacer qué no lo decidimos
// nosotros"): `Permisos` es un `Partial`, así que una clave que se agregue
// después NACE APAGADA para los roles que ya existen. Toda migración que
// sume un permiso nuevo tiene que decidir explícitamente a qué rol existente
// se lo da (el default por ausencia es `false`, no un default explícito).
// EXCEPCIÓN hoy: los permisos de FUNCIONES (botones del menú) valen `true` si
// faltan — ver abajo y AGENTS.md.

export type PermisoKey =
  | "ver_config"
  | "gestionar_busquedas"
  | "ver_resultados"
  | "gestionar_equipo"
  | "radar_ver"
  | "radar_gastar"
  | "radar_configurar"
  | "importaciones_ver"
  | "importaciones_rubros"
  // Funciones del cimiento del ERP (orden 136): una por ítem del menú.
  | "panel_ver"
  | "pedidos_ver"
  | "clientes_ver"
  | "productos_ver"
  | "familias_ver"
  | "precios_ver"
  | "publicaciones_ver"
  | "cucardas_ver"
  | "depositos_ver"
  | "stock_ver"
  | "stock_ajustar"
  | "canales_ver"
  | "tipo_cambio_ver"
  | "usuarios_ver"
  | "importar_ver"
  | "proveedores_ver";

export const PERMISOS: { key: PermisoKey; label: string; ayuda: string }[] = [
  { key: "gestionar_busquedas", label: "Gestionar búsquedas", ayuda: "Crear, editar y pausar las búsquedas programadas." },
  { key: "ver_resultados", label: "Ver resultados", ayuda: "Ver los productos que encontró cada búsqueda." },
  { key: "ver_config", label: "Ver configuración", ayuda: "Los datos de la organización y su plan." },
  { key: "gestionar_equipo", label: "Gestionar equipo", ayuda: "Invitar personas y configurar sus permisos." },
  { key: "radar_ver", label: "Ver el Radar", ayuda: "Tendencias de Mercado Libre, categorías seguidas y publicaciones ya traídas." },
  { key: "radar_gastar", label: "Gastar en el Radar", ayuda: "Pedir búsquedas pagas (Apify) y prender \"profundizar\" en una categoría." },
  { key: "radar_configurar", label: "Configurar el Radar", ayuda: "Tope de gasto, frecuencia de los procesos automáticos y demás parámetros." },
  { key: "importaciones_ver", label: "Ver Importaciones", ayuda: "Buscador y consultas sobre los despachos de importación (ARCA + Softrade)." },
  { key: "importaciones_rubros", label: "Armar rubros", ayuda: "Crear, editar y borrar los rubros guardados (grupos de NCM)." },
  { key: "panel_ver", label: "Panel", ayuda: "La pantalla de inicio con lo pendiente." },
  { key: "pedidos_ver", label: "Pedidos", ayuda: "Listado y detalle de pedidos de todos los canales." },
  { key: "clientes_ver", label: "Clientes", ayuda: "Ver y corregir los datos de los clientes." },
  { key: "productos_ver", label: "Productos", ayuda: "Productos, variaciones, kits, fotos y cucardas." },
  { key: "familias_ver", label: "Familias", ayuda: "Familias de productos y lo que heredan sus productos." },
  { key: "precios_ver", label: "Listas de precios", ayuda: "Listas de precios y precios por variación." },
  { key: "publicaciones_ver", label: "Publicaciones", ayuda: "Publicaciones de cada variación en cada canal." },
  { key: "cucardas_ver", label: "Cucardas", ayuda: "Las cucardas (nuevo, novedad, última unidad…)." },
  { key: "depositos_ver", label: "Depósitos y ubicaciones", ayuda: "Depósitos y sus ubicaciones." },
  { key: "stock_ver", label: "Consulta de stock", ayuda: "Qué hay en cada depósito y ubicación." },
  { key: "stock_ajustar", label: "Ajustes de stock", ayuda: "Ajustar el stock a mano, con motivo." },
  { key: "canales_ver", label: "Canales", ayuda: "Canales de venta, su lista de precios y sus depósitos." },
  { key: "tipo_cambio_ver", label: "Tipo de cambio", ayuda: "El tipo de cambio del día y su historia." },
  { key: "usuarios_ver", label: "Usuarios y roles", ayuda: "Quién está en la organización y con qué rol." },
  { key: "importar_ver", label: "Importar datos", ayuda: "Importar productos, clientes, ventas y stock desde Excel." },
  { key: "proveedores_ver", label: "Proveedores", ayuda: "Ver y cargar proveedores." },
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

/** Las "funciones": el permiso de cada botón del menú inicial (el panel).
 *  Una función nueva agrega acá su permiso. Regla de AGENTS.md ("Permisos
 *  mientras Laucen lo usa sólo Fer"): mientras no exista la pantalla de roles
 *  y usuarios, una función que el rol no tiene cargada cuenta como PRENDIDA.
 *  Sólo un `false` explícito la apaga. */
export const FUNCIONES: PermisoKey[] = [
  "radar_ver", "importaciones_ver",
  "panel_ver", "pedidos_ver", "clientes_ver", "productos_ver", "familias_ver", "precios_ver",
  "publicaciones_ver", "cucardas_ver", "depositos_ver", "stock_ver", "stock_ajustar", "canales_ver",
  "tipo_cambio_ver", "usuarios_ver", "importar_ver", "proveedores_ver",
];

/** ¿La membresía tiene el permiso? Los de FUNCIONES, si faltan, valen true;
 *  el resto, si falta, vale false. */
export function tienePermiso(permisos: Permisos | null | undefined, key: PermisoKey): boolean {
  const valor = permisos?.[key];
  if (FUNCIONES.includes(key)) return valor !== false;
  return valor === true;
}
