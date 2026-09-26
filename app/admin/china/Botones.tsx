"use client";

// Los dos botones del banco. Mientras algo corre, los dos quedan
// deshabilitados: un doble clic no paga dos veces.

import { useFormStatus } from "react-dom";
import { PRIMARIO, SUAVE } from "@/app/botones";

export default function Botones({ traducir, puedeTraducir }: { traducir: (f: FormData) => Promise<void>; puedeTraducir: boolean }) {
  const { pending, action } = useFormStatus();
  const traduciendo = pending && action === traducir;
  return (
    <div className="flex flex-wrap gap-2">
      {puedeTraducir && (
        <button formAction={traducir} disabled={pending} className={`${SUAVE} disabled:opacity-60`}>
          {traduciendo ? "Traduciendo…" : "Traducir con Claude"}
        </button>
      )}
      <button disabled={pending} className={`${PRIMARIO} disabled:opacity-60`}>
        {pending && !traduciendo ? "Corriendo… (hasta 4 min)" : "Correr en Apify"}
      </button>
    </div>
  );
}
