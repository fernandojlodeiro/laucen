import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hora del build, para el pie de página ("¿ya se actualizó?").
  env: { BUILD_TIME: new Date().toISOString() },
  // lib/radar/esquema.ts y lib/arca/esquema.ts leen estos archivos en el
  // servidor: que viajen con el deploy.
  // Las fotos de la pantalla de China viajan en el formulario (hasta 4 MB).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  outputFileTracingIncludes: { "/**": ["./db/radar.sql", "./db/arca.sql", "./db/china.sql"] },
};

export default nextConfig;
