"use client";

// El cartel de error de cualquier pantalla (ver app/componentes/ErrorPantalla.tsx).
import ErrorPantalla from "@/app/componentes/ErrorPantalla";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPantalla error={error} reset={reset} />;
}
