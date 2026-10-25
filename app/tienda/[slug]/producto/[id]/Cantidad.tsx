"use client";

// La cantidad en la ficha, como en Mercado Libre: un desplegable de 1 a 10 unidades y, si hay más
// stock, "Más de 10 unidades", que lo cambia por un campo para escribir la cantidad (hasta lo
// disponible). Antes el desplegable cortaba en 30 aunque hubiera miles (Fer, 24/10: diodos).

import { useState } from "react";

const TOPE = 10;

export default function Cantidad({ disponible }: { disponible: number }) {
  const [escribir, setEscribir] = useState(false);
  const [valor, setValor] = useState(TOPE + 1);
  const clase = "rounded bg-transparent py-1 font-semibold text-[var(--texto)] outline-none focus:ring-1 focus:ring-[var(--boton)]";
  if (escribir) {
    return (
      <input id="cantidad" name="cantidad" type="number" inputMode="numeric" min={1} max={disponible} required autoFocus value={valor}
        onChange={(e) => setValor(Math.max(1, Math.min(disponible, Math.trunc(Number(e.target.value)) || 1)))}
        className={`${clase} w-24 border border-[var(--linea)] px-2`} aria-label="Cantidad de unidades" />
    );
  }
  return (
    <select id="cantidad" name="cantidad" defaultValue="1" className={clase}
      onChange={(e) => { if (e.target.value === "mas") setEscribir(true); }}>
      {Array.from({ length: Math.min(disponible, TOPE) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? "1 unidad" : `${n} unidades`}</option>)}
      {disponible > TOPE && <option value="mas">Más de {TOPE} unidades</option>}
    </select>
  );
}
