"use client";

// Recuerda la última pestaña de envío elegida en el picking (Fer, 6/10): la
// deja en una cookie para la próxima vez que se entra sin elegir.

import { useEffect } from "react";
import { COOKIE_ENVIO } from "@/lib/deposito/picking-envio";

export default function RecordarEnvio({ valor }: { valor: string }) {
  useEffect(() => {
    try { document.cookie = `${COOKIE_ENVIO}=${encodeURIComponent(valor)}; path=/; max-age=31536000; samesite=lax`; } catch { /* sin cookies: no se recuerda */ }
  }, [valor]);
  return null;
}
