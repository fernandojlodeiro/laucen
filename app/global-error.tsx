"use client";

// Si se rompe el marco entero (el layout raíz): el mismo cartel, con su propio <html>.
import "./globals.css";
import ErrorPantalla from "@/app/componentes/ErrorPantalla";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="es">
      <body><ErrorPantalla error={error} /></body>
    </html>
  );
}
