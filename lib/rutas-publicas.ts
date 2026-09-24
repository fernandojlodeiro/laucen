// Qué rutas no piden login. Portado del patrón de src/lib/rutas-publicas.ts
// de CadaMes. AJUSTAR a medida que se agreguen pantallas públicas (landing,
// precios, etc.).

export const RUTAS_PUBLICAS = [
  "/login",
  "/registro",
  "/olvide",
  "/reset",
  "/auth/callback",
  "/api/meli/notificaciones",
];

/** La landing ("/") es pública y es la única ruta exacta que no pide login;
 *  todo lo demás bajo "/" sí lo pide. */
export function esRutaPublica(pathname: string): boolean {
  if (pathname === "/") return true;
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
