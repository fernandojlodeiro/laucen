"use client";

// El botón de una acción de Mercado Libre en la ficha del reclamo. Las que
// mueven plata o abren mediación preguntan ahí mismo "¿Seguro? Sí / No"
// antes de mandar (AGENTS.md: nada de alertas del navegador). Va adentro del
// formulario de la acción (los campos y la acción los pone la ficha).

import { useState } from "react";
import { BotonEnviar } from "@/app/radar/Cliente";
import { PRIMARIO, SUAVE, BORRAR } from "@/app/botones";

export default function BotonAccion({ texto, confirmar = false, pregunta = "¿Seguro? Va a Mercado Libre." }: {
  texto: string; confirmar?: boolean; pregunta?: string;
}) {
  const [preguntando, setPreguntando] = useState(false);
  if (!confirmar) return <BotonEnviar clase={PRIMARIO} corriendo="Mandando…">{texto}</BotonEnviar>;
  if (!preguntando) return <button type="button" onClick={() => setPreguntando(true)} className={PRIMARIO}>{texto}</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      <span className="font-semibold">{pregunta}</span>
      <BotonEnviar clase={BORRAR} corriendo="Mandando…">Sí</BotonEnviar>
      <button type="button" onClick={() => setPreguntando(false)} className={SUAVE}>No</button>
    </span>
  );
}
