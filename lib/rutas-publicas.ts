// Qué rutas no piden login. Portado del patrón de src/lib/rutas-publicas.ts
// de CadaMes. AJUSTAR a medida que se agreguen pantallas públicas (landing,
// precios, etc.).

export const RUTAS_PUBLICAS = [
  "/login",
  "/registro",
  "/olvide",
  "/reset",
  "/auth/callback",
  // La política de privacidad del sistema (la pide Google para la aplicación de Google Drive).
  "/privacidad",
  "/api/meli/notificaciones",
  "/api/meli/barrido",
  // La creación automática de lo que falta en ML: la llama pg_cron con meli_llave.
  "/api/meli/auto-altas",
  "/api/meli/catalogo-propio",
  "/api/meli/previa-resumen",
  // Publicidad: la lectura de cada hora (sólo lee de ML); la llama pg_cron con meli_llave.
  "/api/meli/publicidad",
  // Ventas de ML de los últimos 12 meses (sólo lee de ML, escribe ml_venta); la llama pg_cron con meli_llave.
  "/api/meli/ventas",
  "/api/erp/tareas",
  // Los avisos por mail de los pedidos de la tienda: la llama pg_cron con erp_llave.
  "/api/correo/cola",
  // La llama la base (pg_net) al cambiar el stock; se autentica con erp_llave.
  "/api/erp/stock",
  // La tienda web es pública (sus compradores no son usuarios del sistema).
  "/tienda",
  // Un dominio que apunta a Laucen y ninguna tienda tiene cargado (middleware.ts).
  "/dominio-no-configurado",
  "/api/tienda",
  "/api/radar/cron",
  "/api/china/foto",
  "/api/piloto/tanda",
  "/api/costos-ml/cron",
  "/api/tipo-cambio/cron",
  "/api/seguimiento/cron",
  // Las vueltas del precio de mercado: se relanzan solas; las protege el token de la tanda.
  "/api/precios-mercado",
  "/api/vendedor-referente",
  // La API del cimiento: se autentica con el token de cada canal, no con la sesión.
  "/api/pedidos",
  "/api/catalogo",
  // Los avisos de WhatsApp (Meta): se verifican con la firma de la app.
  "/api/whatsapp/webhook",
  // Los avisos de Windows: los pide la base (pg_cron) con erp_llave; el portero del navegador es un archivo suelto.
  "/api/avisos/push",
  // La exportación de Mercado Pago: la pide la base (pg_net) con erp_llave; sólo lee de Mercado Pago.
  "/api/mercadopago/exportacion",
  "/sw-avisos.js",
];

/** La landing ("/") es pública y es la única ruta exacta que no pide login;
 *  todo lo demás bajo "/" sí lo pide. */
export function esRutaPublica(pathname: string): boolean {
  if (pathname === "/") return true;
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
