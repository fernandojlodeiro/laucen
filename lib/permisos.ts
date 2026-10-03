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
  | "precios_ml_ver"
  | "publicaciones_ver"
  | "cucardas_ver"
  | "depositos_ver"
  | "stock_ver"
  | "stock_ajustar"
  | "canales_ver"
  | "tipo_cambio_ver"
  | "usuarios_ver"
  | "importar_ver"
  | "proveedores_ver"
  | "envios_ver"
  | "preguntas_ver"
  | "reclamos_ver"
  | "picking_ver"
  | "picking_sin_escanear"
  | "recepcion_ver"
  | "etiquetas_ver"
  | "facturacion_ver"
  | "tienda_config"
  | "tienda_dominios"
  | "empresa_config"
  | "medios_pago_ver"
  | "reglas_ver"
  | "compras_ver"
  | "despachos_ver"
  | "cuentas_corrientes_ver"
  | "tesoreria_ver"
  | "contabilidad_ver"
  | "informes_stock_ver"
  | "informes_publicaciones_ver"
  | "facturacion_ml_ver"
  | "libros_iva_ver"
  | "informes_ventas_ver"
  // Equipo y asistente (pedido de Fer, 3/10).
  | "roles_administrar"
  | "asistente_usar"
  | "asistente_config"
  | "asistente_historial_ver"
  | "asistente_acciones"
  | "asistente_consultas";

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
  { key: "precios_ml_ver", label: "Precios en Mercado Libre", ayuda: "Tachado, planes de cuotas, márgenes, descuento por volumen y la vista previa para preparar los cambios en ML." },
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
  { key: "envios_ver", label: "Envíos", ayuda: "Envíos de los pedidos y sus etiquetas." },
  { key: "preguntas_ver", label: "Preguntas y mensajes", ayuda: "Responder preguntas y mensajes de Mercado Libre." },
  { key: "reclamos_ver", label: "Reclamos y devoluciones", ayuda: "Reclamos de Mercado Libre y de la web o el local, sus mensajes y las devoluciones." },
  { key: "picking_ver", label: "Picking", ayuda: "Preparar pedidos escaneando cada unidad." },
  { key: "picking_sin_escanear", label: "Preparar sin escanear", ayuda: "Dar un pedido por preparado con sólo su número (o su botón «Preparado», o escaneando su hoja), sin escanear cada producto: tilda todo. Provisorio, mientras no todos los productos tienen etiqueta." },
  { key: "recepcion_ver", label: "Recepción", ayuda: "Recibir mercadería y devoluciones escaneando." },
  { key: "etiquetas_ver", label: "Etiquetas", ayuda: "Imprimir etiquetas de producto y de ubicación." },
  { key: "facturacion_ver", label: "Facturación", ayuda: "Facturas y notas de crédito electrónicas (ARCA)." },
  { key: "empresa_config", label: "Empresa", ayuda: "Datos de la empresa, logo y datos fiscales." },
  { key: "tienda_config", label: "Tienda web", ayuda: "Configurar la tienda web y sus métodos de envío." },
  { key: "tienda_dominios", label: "Configurar dominios de la tienda", ayuda: "Conectar dominios propios a la tienda web (los agrega en Vercel) y borrarlos." },
  { key: "medios_pago_ver", label: "Medios de pago", ayuda: "Medios de pago de la tienda y sus credenciales." },
  { key: "reglas_ver", label: "Reglas comerciales y cuotas", ayuda: "Promociones, descuentos, envío bonificado y planes de cuotas." },
  { key: "compras_ver", label: "Facturas de compra", ayuda: "Cargar y registrar facturas de proveedores (ingresan stock y costo)." },
  { key: "despachos_ver", label: "Despachos de importación", ayuda: "Cargar despachos y prorratear sus costos." },
  { key: "cuentas_corrientes_ver", label: "Cuentas corrientes", ayuda: "Saldos de clientes y proveedores, recibos y órdenes de pago." },
  { key: "tesoreria_ver", label: "Caja y bancos", ayuda: "Cuentas de fondos, movimientos, transferencias y conciliación." },
  { key: "contabilidad_ver", label: "Contabilidad", ayuda: "Plan de cuentas, asientos, libro diario, mayores y balances." },
  { key: "informes_stock_ver", label: "Informes de inventario", ayuda: "Stock valorizado y stock por ubicación, con descarga a Excel." },
  { key: "informes_publicaciones_ver", label: "Cambios en publicaciones", ayuda: "Qué publicaciones de Mercado Libre cambiaron de estado, precio o stock, cuándo y si lo hizo Laucen o alguien afuera." },
  { key: "facturacion_ml_ver", label: "Facturación de Mercado Libre", ayuda: "Lo que cobran ML y Mercado Pago por período (leído de la API), retenciones y percepciones, y el control contra las facturas importadas de ARCA." },
  { key: "libros_iva_ver", label: "Libros de IVA", ayuda: "Libro IVA Ventas y Compras del mes, saldo técnico, Excel y los archivos del Libro de IVA Digital de ARCA." },
  { key: "informes_ventas_ver", label: "Rentabilidad por venta", ayuda: "Venta, cargos de Mercado Libre, costo y margen por venta o por producto." },
  { key: "roles_administrar", label: "Administrar roles", ayuda: "Crear, editar y borrar roles y sus permisos (nunca más permisos que los propios)." },
  { key: "asistente_usar", label: "Asistente", ayuda: "Preguntarle al asistente (la carita de abajo a la derecha) cómo se hace cada cosa y datos del sistema." },
  { key: "asistente_config", label: "Configurar el asistente", ayuda: "Nombre, carita, preguntas fuera del sistema y tope de gasto del asistente." },
  { key: "asistente_historial_ver", label: "Ver el historial del asistente", ayuda: "Leer las preguntas que le hizo cada persona al asistente y sus respuestas." },
  { key: "asistente_acciones", label: "Pedirle al asistente que haga cosas", ayuda: "Que el asistente prepare acciones (facturar pedidos, crear un cliente o un pedido, cambiar estados) para confirmar con un clic. Cada una pide además el permiso de su pantalla." },
  { key: "asistente_consultas", label: "Consultas libres al asistente", ayuda: "Que el asistente consulte cualquier dato (sólo lectura) y arme listados con Excel. Sólo de las tablas de las pantallas que el rol tiene." },
];

export type Permisos = Partial<Record<PermisoKey, boolean>>;

export type PresetKey = "ADMIN" | "COLABORADOR";

export const todos = (v: boolean): Record<PermisoKey, boolean> =>
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
  "panel_ver", "pedidos_ver", "clientes_ver", "productos_ver", "familias_ver", "precios_ver", "precios_ml_ver",
  "publicaciones_ver", "cucardas_ver", "depositos_ver", "stock_ver", "stock_ajustar", "canales_ver",
  "tipo_cambio_ver", "usuarios_ver", "importar_ver", "proveedores_ver",
  "envios_ver", "preguntas_ver", "reclamos_ver", "picking_ver", "recepcion_ver", "etiquetas_ver", "facturacion_ver",
  "tienda_config", "empresa_config", "medios_pago_ver", "reglas_ver",
  "compras_ver", "despachos_ver", "cuentas_corrientes_ver", "tesoreria_ver", "contabilidad_ver",
  "informes_stock_ver", "informes_publicaciones_ver", "facturacion_ml_ver", "informes_ventas_ver",
  "libros_iva_ver",
  // No es un botón del menú, pero se comporta como función: el asistente
  // está prendido para todos salvo que el rol lo apague.
  "asistente_usar",
];

/** ¿La membresía tiene el permiso? Los de FUNCIONES, si faltan, valen true;
 *  el resto, si falta, vale false. */
export function tienePermiso(permisos: Permisos | null | undefined, key: PermisoKey): boolean {
  const valor = permisos?.[key];
  if (FUNCIONES.includes(key)) return valor !== false;
  return valor === true;
}
