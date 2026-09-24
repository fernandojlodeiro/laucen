"use client";

// Botón que se deshabilita mientras la corrida está en curso: un doble clic
// no dispara la búsqueda dos veces (y no se paga dos veces).

import { useFormStatus } from "react-dom";
import { PRIMARIO } from "@/app/botones";

export default function BotonCorrer() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${PRIMARIO} disabled:opacity-60`}>
      {pending ? "Corriendo… (hasta 4 min)" : "Correr"}
    </button>
  );
}
