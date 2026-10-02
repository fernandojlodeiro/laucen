"use client";

// Consulta de stock: el depósito elegido ("todos" o un id) queda guardado en
// una cookie del navegador, así la próxima vez abre como la última.

import { useEffect } from "react";

const COOKIE_DEPOSITO = "stock_deposito"; // la lee page.tsx

/** Guarda la elección que vino en la dirección (si vino). */
export function RecordarDeposito({ valor }: { valor: string | null }) {
  useEffect(() => {
    if (valor) document.cookie = `${COOKIE_DEPOSITO}=${encodeURIComponent(valor)}; path=/stock; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [valor]);
  return null;
}

/** Lista de depósitos que cambia la pantalla apenas se elige uno. */
export function ElegirDeposito({ depositos, elegido, ocultos }: {
  depositos: { id: number; nombre: string }[]; elegido: number; ocultos: Record<string, string | null>;
}) {
  return (
    <form className="inline-flex items-center gap-2 text-xs">
      {Object.entries(ocultos).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor="dep">Depósito</label>
      <select id="dep" name="dep" defaultValue={String(elegido)} onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-[#C9D3DD] bg-white px-2 py-1.5 text-xs">
        {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
      </select>
    </form>
  );
}
