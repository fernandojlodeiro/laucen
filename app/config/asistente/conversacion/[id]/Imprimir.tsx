"use client";

// El botón que abre la ventana de imprimir del navegador (de ahí se elige
// "Guardar como PDF"). No sale en el papel.

import { PRIMARIO } from "@/app/botones";

export default function Imprimir() {
  return <button type="button" onClick={() => window.print()} className={`${PRIMARIO} print:hidden`}>🖨 Imprimir o guardar en PDF</button>;
}
