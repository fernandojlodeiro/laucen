import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hora del build, para el pie de página ("¿ya se actualizó?").
  env: { BUILD_TIME: new Date().toISOString() },
};

export default nextConfig;
