import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hora del build, para el pie de página ("¿ya se actualizó?").
  env: { BUILD_TIME: new Date().toISOString() },
  // lib/radar/esquema.ts lee este archivo en el servidor: que viaje con el deploy.
  outputFileTracingIncludes: { "/**": ["./db/radar.sql"] },
};

export default nextConfig;
