"use client";

// El botón de imprimir de la página de etiquetas (abre el diálogo del navegador).

import { PRIMARIO } from "@/app/botones";

export default function BotonImprimir() {
  return <button type="button" onClick={() => window.print()} className={`${PRIMARIO} text-base px-4 py-3`}>🖨 Imprimir</button>;
}
