import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hora del build, para el pie de página ("¿ya se actualizó?").
  env: { BUILD_TIME: new Date().toISOString() },
  // lib/radar/esquema.ts y lib/arca/esquema.ts leen estos archivos en el
  // servidor: que viajen con el deploy.
  outputFileTracingIncludes: { "/**": ["./db/radar.sql", "./db/arca.sql"] },
};

export default nextConfig;
