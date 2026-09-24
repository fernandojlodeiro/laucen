import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Laucen",
  description: "Búsqueda de productos en China para importar",
};

/** Hora del último deploy en hora argentina, más el commit corto. */
function versión() {
  const hora = process.env.BUILD_TIME
    ? new Date(process.env.BUILD_TIME).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : "";
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return [hora && `Actualizado ${hora}`, commit].filter(Boolean).join(" · ");
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <footer className="text-center text-[11px] text-[#8A97A3] py-6">{versión()}</footer>
      </body>
    </html>
  );
}
