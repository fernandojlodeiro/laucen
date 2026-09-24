// Qué rutas no piden login. Portado del patrón de src/lib/rutas-publicas.ts
// de CadaMes. AJUSTAR a medida que se agreguen pantallas públicas (landing,
// precios, etc.).

export const RUTAS_PUBLICAS = [
  "/login",
  "/registro",
  "/olvide",
  "/reset",
  "/auth/callback",
];

export function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
