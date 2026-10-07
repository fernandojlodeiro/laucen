import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { esRutaPublica } from "@/lib/rutas-publicas";
import { versión } from "@/lib/version";
import Marco from "@/app/componentes/marco/Marco";

// La pestaña del navegador dice siempre «Laucen», con su isólogo (Fer, 7/10): las
// pantallas del panel no ponen título propio. La tienda pública pone el suyo
// (app/tienda/[slug]/layout.tsx).
export const metadata: Metadata = {
  title: "Laucen",
  description: "Gestión de ventas, stock e importación",
  icons: { icon: "/marca/laucen-logo.svg", apple: "/marca/laucen-logo.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** Rutas que nunca llevan el marco del sistema (menú + barra de estado). */
function sinMarco(ruta: string) {
  return !ruta || esRutaPublica(ruta) || ruta.startsWith("/onboarding") || ruta.startsWith("/api/");
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ruta = (await headers()).get("x-ruta") ?? "";
  if (!sinMarco(ruta)) {
    return (
      <html lang="es">
        <body>
          <Marco version={versión()}>{children}</Marco>
        </body>
      </html>
    );
  }
  // La tienda dibuja su propio pie.
  if (ruta.startsWith("/tienda/")) {
    return (
      <html lang="es">
        <body>{children}</body>
      </html>
    );
  }
  return (
    <html lang="es">
      <body>
        {children}
        <footer className="text-center text-[11px] text-[#8A97A3] py-6">{versión()}</footer>
      </body>
    </html>
  );
}
