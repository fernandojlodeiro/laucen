// Laucen instalable en el celular (Fer, 25/10): «Agregar a pantalla de inicio» deja un ícono que abre Laucen como una
// app, sin la barra del navegador. En iPhone hace falta para recibir avisos (Apple sólo los deja a lo instalado).

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Laucen", short_name: "Laucen", description: "Gestión de ventas, stock e importación",
    start_url: "/panel", scope: "/", display: "standalone", background_color: "#ffffff", theme_color: "#16577F", lang: "es-AR",
    icons: [{ src: "/marca/laucen-logo.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
