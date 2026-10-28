"use client";

// «Excel para el proveedor» con la cantidad elegida al lado (Fer, 28/10): la del típico, la del mejor momento o el
// promedio de las dos.

import { useState } from "react";
import { VERDE } from "@/app/botones";

export default function ExcelProveedor({ href, opciones }: { href: string; opciones: [string, string][] }) {
  const [cant, setCant] = useState(opciones[0][0]);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <label className="inline-flex items-center gap-1 text-[#5C6B76]" title="Qué cantidad va en el Excel del proveedor">
        Cantidad
        <select value={cant} onChange={(e) => setCant(e.target.value)} className="rounded-md border border-[#C9D3DD] bg-white px-1.5 py-1.5 text-xs text-[#1E2A32]">
          {opciones.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </label>
      <a href={`${href}${href.includes("?") ? "&" : "?"}cant=${cant}`} className={VERDE}
        title="Sólo lo que hay que comprar de esta lista: foto, SKU, título, cantidad, precio (FOB de la ficha), subtotal, total y la vía">Excel para el proveedor</a>
    </span>
  );
}
