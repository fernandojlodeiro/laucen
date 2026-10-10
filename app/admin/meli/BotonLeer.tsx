"use client";

// Botón "Leer" de la lectura con Apify: se deshabilita y avisa mientras corre,
// así un segundo clic no dispara otra corrida (ni se paga dos veces, 30/9).
// `texto`: otro rótulo (ej. "Probar las búsquedas", que tarda segundos).

import { useFormStatus } from "react-dom";
import { PRIMARIO } from "@/app/botones";

export default function BotonLeer({ texto }: { texto?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${PRIMARIO} disabled:opacity-60`}>
      {pending ? (texto ? "Trabajando…" : "Leyendo… (uno o dos minutos)") : texto ?? "Leer"}
    </button>
  );
}
