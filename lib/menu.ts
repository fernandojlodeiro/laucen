// El árbol del menú, en un solo lugar (orden 136, §2 bis). Para reordenar,
// renombrar o mover un ítem se toca SÓLO este archivo: la barra de arriba
// (PC), el menú completo del celular y la barra de accesos del celular salen
// de acá.
//
// Cada ítem es una "función": su permiso (lib/permisos.ts) decide si aparece.
// Un ítem sin `href` es un módulo que todavía no existe: se muestra
// deshabilitado con "próximamente" (AGENTS.md: no se esconde). Los de la
// sección `soloFer` son las herramientas internas (lib/admin.ts), no cuentan
// como funciones.

import type { PermisoKey } from "@/lib/permisos";

export type ItemMenu = {
  texto: string;
  /** Sin href = próximamente. */
  href?: string;
  permiso?: PermisoKey;
  icono?: string;
};

export type SeccionMenu = {
  texto: string;
  /** Si la sección es un solo destino (el Panel). */
  href?: string;
  permiso?: PermisoKey;
  soloFer?: boolean;
  items: ItemMenu[];
};

export const MENU: SeccionMenu[] = [
  { texto: "Panel", href: "/panel", permiso: "panel_ver", items: [] },
  {
    texto: "Ventas",
    items: [
      { texto: "Pedidos", href: "/ventas/pedidos", permiso: "pedidos_ver", icono: "🧾" },
      { texto: "Clientes", href: "/ventas/clientes", permiso: "clientes_ver", icono: "👤" },
      { texto: "Envíos", href: "/ventas/envios", permiso: "envios_ver", icono: "🚚" },
      { texto: "Preguntas y mensajes", href: "/ventas/preguntas", permiso: "preguntas_ver", icono: "💬" },
      { texto: "WhatsApp", href: "/ventas/mensajes", permiso: "mensajes_ver", icono: "🟢" },
      { texto: "Reclamos y devoluciones", href: "/ventas/reclamos", permiso: "reclamos_ver", icono: "↩️" },
    ],
  },
  {
    texto: "Catálogo",
    items: [
      { texto: "Productos", href: "/catalogo/productos", permiso: "productos_ver", icono: "📦" },
      { texto: "Familias", href: "/catalogo/familias", permiso: "familias_ver" },
      { texto: "Listas de precios", href: "/catalogo/precios", permiso: "precios_ver" },
      { texto: "Precios en Mercado Libre", href: "/catalogo/precios-ml", permiso: "precios_ml_ver" },
      { texto: "Vista previa de precios ML", href: "/catalogo/precios-ml/vista-previa", permiso: "precios_ml_ver" },
      { texto: "Publicaciones", href: "/catalogo/publicaciones", permiso: "publicaciones_ver" },
      { texto: "Vincular con Mercado Libre", href: "/catalogo/publicaciones/ml", permiso: "publicaciones_ver" },
    ],
  },
  {
    texto: "Stock",
    items: [
      { texto: "Consulta de stock", href: "/stock/consulta", permiso: "stock_ver", icono: "🔎" },
      { texto: "Picking", href: "/deposito/picking", permiso: "picking_ver", icono: "🧺" },
      { texto: "Recepción", href: "/deposito/recepcion", permiso: "recepcion_ver", icono: "📥" },
      { texto: "Etiquetas", href: "/deposito/etiquetas", permiso: "etiquetas_ver" },
      { texto: "Ajustes", href: "/stock/ajustes", permiso: "stock_ajustar" },
      { texto: "Movimientos de stock", href: "/stock/movimientos", permiso: "stock_ver" },
    ],
  },
  {
    texto: "Compras",
    items: [
      { texto: "Proveedores", href: "/compras/proveedores", permiso: "proveedores_ver" },
      { texto: "Facturas de compra", href: "/compras/facturas", permiso: "compras_ver" },
      { texto: "Despachos de importación", href: "/compras/despachos", permiso: "despachos_ver" },
    ],
  },
  {
    texto: "Administración",
    items: [
      { texto: "Facturación", href: "/administracion/facturacion", permiso: "facturacion_ver" },
      { texto: "Cuentas corrientes", href: "/administracion/cuentas-corrientes", permiso: "cuentas_corrientes_ver" },
      { texto: "Caja y bancos", href: "/administracion/tesoreria", permiso: "tesoreria_ver" },
      { texto: "Contabilidad", href: "/administracion/contabilidad", permiso: "contabilidad_ver" },
      { texto: "Libros de IVA", href: "/administracion/libros-iva", permiso: "libros_iva_ver" },
      { texto: "Facturación de Mercado Libre", href: "/administracion/facturacion-ml", permiso: "facturacion_ml_ver" },
    ],
  },
  {
    texto: "Informes",
    items: [
      { texto: "Stock valorizado", href: "/informes/stock-valorizado", permiso: "informes_stock_ver" },
      { texto: "Stock por ubicación", href: "/informes/stock-por-ubicacion", permiso: "informes_stock_ver" },
      { texto: "Cambios en publicaciones", href: "/informes/cambios-publicaciones", permiso: "informes_publicaciones_ver" },
      { texto: "Rentabilidad por venta", href: "/informes/rentabilidad", permiso: "informes_ventas_ver" },
    ],
  },
  {
    texto: "Sourcing",
    items: [
      { texto: "Radar", href: "/radar", permiso: "radar_ver" },
      { texto: "Importaciones ARCA", href: "/importaciones", permiso: "importaciones_ver" },
      { texto: "Búsqueda en China" },
    ],
  },
  {
    // Maestros que se tocan poco (pedido de Fer, 3/10). Marcas va acá cuando exista.
    texto: "Tablas generales",
    items: [
      { texto: "Depósitos y ubicaciones", href: "/stock/depositos", permiso: "depositos_ver" },
      { texto: "Cucardas", href: "/catalogo/cucardas", permiso: "cucardas_ver" },
    ],
  },
  {
    texto: "Tienda web",
    items: [
      { texto: "Tienda web", href: "/config/tienda", permiso: "tienda_config" },
      { texto: "Medios de pago", href: "/config/medios-pago", permiso: "medios_pago_ver" },
      { texto: "Métodos de envío", href: "/config/envios", permiso: "tienda_config" },
      { texto: "Reglas comerciales", href: "/config/reglas", permiso: "reglas_ver" },
      { texto: "Cuotas", href: "/config/cuotas", permiso: "reglas_ver" },
    ],
  },
  {
    texto: "Configuración",
    items: [
      { texto: "Empresa", href: "/config/empresa", permiso: "empresa_config" },
      { texto: "Facturación (ARCA)", href: "/config/arca", permiso: "facturacion_ver" },
      { texto: "Canales", href: "/config/canales", permiso: "canales_ver" },
      { texto: "Cola de Mercado Libre", href: "/config/canales/cola", permiso: "canales_ver" },
      { texto: "Tipo de cambio", href: "/config/tipo-cambio", permiso: "tipo_cambio_ver" },
      { texto: "Usuarios y roles", href: "/config/usuarios", permiso: "usuarios_ver" },
      { texto: "Asistente", href: "/config/asistente", permiso: "asistente_config" },
      { texto: "Importar datos", href: "/importar", permiso: "importar_ver" },
    ],
  },
  {
    texto: "Coordinación",
    soloFer: true,
    items: [
      { texto: "Bitácora", href: "/admin/bitacora" },
      { texto: "Para probar", href: "/admin/para-probar" },
      { texto: "Mercado Libre", href: "/admin/meli" },
      { texto: "Costos ML", href: "/admin/costos-ml" },
      { texto: "Ventas ML por categoría", href: "/admin/ventas-ml" },
      { texto: "China — pruebas", href: "/admin/china" },
      { texto: "Piloto", href: "/admin/piloto" },
      { texto: "Diagnóstico", href: "/admin/diagnostico" },
      { texto: "Limpieza de datos", href: "/admin/limpieza" },
    ],
  },
];

/** Los accesos directos de la barra inferior del celular (4; el 5.º botón es
 *  "Menú", que abre el árbol completo). Las sesiones que llenen pantallas de
 *  celular (picking, recepción) cambian esta lista. */
export const ACCESOS_CELULAR: (ItemMenu & { href: string })[] = [
  { texto: "Pedidos", href: "/ventas/pedidos", permiso: "pedidos_ver", icono: "🧾" },
  { texto: "Picking", href: "/deposito/picking", permiso: "picking_ver", icono: "🧺" },
  { texto: "Recepción", href: "/deposito/recepcion", permiso: "recepcion_ver", icono: "📥" },
  { texto: "Stock", href: "/stock/consulta", permiso: "stock_ver", icono: "🔎" },
];

/** El menú que ve esta persona: sin las secciones de Fer si no es Fer, sin
 *  los ítems cuya función el rol tiene apagada, y sin secciones vacías. */
export function menuPara(puede: (p: PermisoKey) => boolean, esFer: boolean): SeccionMenu[] {
  return MENU
    .filter((s) => (!s.soloFer || esFer) && (!s.permiso || puede(s.permiso)))
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.permiso || puede(i.permiso)) }))
    .filter((s) => s.href || s.items.length > 0);
}
