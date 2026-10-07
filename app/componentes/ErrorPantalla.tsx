"use client";

// Cuando una pantalla se rompe en el navegador (Fer, 7/10: «Application
// error: a client-side exception…»). Lo más común es que se haya subido una
// versión nueva de Laucen mientras la pantalla estaba abierta: el navegador
// pide pedazos de la versión vieja que ya no existen. En ese caso se recarga
// sola (una vez por minuto como mucho, para no quedar en un bucle). Si es
// otra cosa, un cartel en criollo con «Recargar».

import { useEffect } from "react";

const CLAVE = "laucen_recarga_por_version";

const esVersionNueva = (e: Error) =>
  /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Failed to find Server Action|unexpected response was received from the server|Failed to fetch/i
    .test(`${e?.name ?? ""} ${e?.message ?? ""}`);

export default function ErrorPantalla({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const nueva = esVersionNueva(error);
  useEffect(() => {
    console.error(error);
    if (!nueva) return;
    try {
      const ultima = Number(sessionStorage.getItem(CLAVE) ?? 0);
      if (Date.now() - ultima < 60_000) return;
      sessionStorage.setItem(CLAVE, String(Date.now()));
    } catch { /* sin almacenamiento: se recarga igual */ }
    window.location.reload();
  }, [error, nueva]);

  return (
    <div className="max-w-md mx-auto my-16 p-5 rounded-xl border border-[#E3E9F0] bg-white text-sm text-[#1E2A32]">
      <p className="font-bold mb-1">{nueva ? "Laucen se actualizó" : "Algo falló al mostrar esta pantalla"}</p>
      <p className="text-[#5C6B76] mb-3">
        {nueva ? "Se subió una versión nueva mientras tenías la pantalla abierta. Recargando…"
          : "Lo que estabas haciendo puede haberse grabado igual: recargá para ver cómo quedó."}
      </p>
      <button type="button" onClick={() => (reset && !nueva ? reset() : window.location.reload())}
        className="text-xs font-bold rounded-lg px-3 py-2 bg-[#16577F] text-white">Recargar</button>
    </div>
  );
}
