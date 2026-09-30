"use client";

// Botón "Leer" de la lectura con Apify: se deshabilita y avisa mientras corre,
// así un segundo clic no dispara otra corrida (ni se paga dos veces, 30/9).

import { useFormStatus } from "react-dom";
import { PRIMARIO } from "@/app/botones";

export default function BotonLeer() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${PRIMARIO} disabled:opacity-60`}>
      {pending ? "Leyendo… (uno o dos minutos)" : "Leer"}
    </button>
  );
}
