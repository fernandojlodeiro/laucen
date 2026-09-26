"use client";

// Campo numérico de Laucen: alineado a la derecha y, al salir del campo o al
// apretar Enter, se reescribe con el formato de su tipo (punto de miles en
// precios, un decimal en porcentajes). Enter no envía el formulario.

import { useState } from "react";
import { formatearNumero, leerNumero, type TipoNumero } from "@/lib/numeros";

export default function CampoNumero({ name, valor, tipo, className = "", placeholder }: {
  name: string; valor: number | null | undefined; tipo: TipoNumero; className?: string; placeholder?: string;
}) {
  const [texto, setTexto] = useState(formatearNumero(valor, tipo));
  const ordenar = () => {
    const n = leerNumero(texto);
    if (n != null) setTexto(formatearNumero(n, tipo));
  };
  return (
    <input name={name} value={texto} placeholder={placeholder} inputMode={tipo === "entero" ? "numeric" : "decimal"}
      onChange={(e) => setTexto(e.target.value)} onBlur={ordenar}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ordenar(); } }}
      className={`${className} text-right tabular-nums`} />
  );
}
