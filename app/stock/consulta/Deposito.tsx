"use client";

// Consulta de stock: el depósito elegido ("todos" o un id) queda guardado en
// una cookie del navegador, así la próxima vez abre como la última.

import { useEffect, useRef, useState } from "react";
import { usarCambiarParametro } from "@/app/componentes/BuscadorVivo";

const COOKIE_DEPOSITO = "stock_deposito"; // la lee page.tsx

/** Guarda la elección que vino en la dirección (si vino). */
export function RecordarDeposito({ valor }: { valor: string | null }) {
  useEffect(() => {
    if (valor) document.cookie = `${COOKIE_DEPOSITO}=${encodeURIComponent(valor)}; path=/stock; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [valor]);
  return null;
}

/** Lista de depósitos que cambia la pantalla apenas se elige uno. */
export function ElegirDeposito({ depositos, elegido }: { depositos: { id: number; nombre: string }[]; elegido: number }) {
  const cambiar = usarCambiarParametro();
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <label htmlFor="dep">Depósito</label>
      <select id="dep" defaultValue={String(elegido)} onChange={(e) => cambiar({ dep: e.target.value })}
        className="rounded-md border border-[#C9D3DD] bg-white px-2 py-1.5 text-xs">
        {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
      </select>
    </span>
  );
}

type Ubic = { deposito: string; ubicacion: string; cantidad: number };

/** La cantidad de una fila: al tocarla abre, encima de la tabla, en qué ubicaciones está. */
export function CantidadUbicaciones({ cantidad, ubicaciones }: { cantidad: number; ubicaciones: Ubic[] }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pos) return;
    const cerrar = (e: Event) => { if (e.type !== "mousedown" || !boton.current?.parentElement?.contains(e.target as Node)) setPos(null); };
    document.addEventListener("mousedown", cerrar);
    window.addEventListener("scroll", cerrar, true);
    return () => { document.removeEventListener("mousedown", cerrar); window.removeEventListener("scroll", cerrar, true); };
  }, [pos]);

  if (ubicaciones.length === 0) return <>{cantidad}</>;
  const variosDepositos = new Set(ubicaciones.map((u) => u.deposito)).size > 1;
  const abrir = () => {
    if (pos) return setPos(null);
    const r = boton.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  return (
    <span>
      <button ref={boton} type="button" onClick={abrir} title="Ver en qué ubicaciones está"
        className="text-[#16577F] underline decoration-dotted tabular-nums">{cantidad}</button>
      {pos && (
        <div style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-50 min-w-48 rounded-md border border-[#C9D3DD] bg-white p-2 shadow-lg text-left">
          <table className="w-full text-xs">
            <tbody>
              {ubicaciones.map((u, i) => (
                <tr key={i}>
                  <td className="pr-3 py-0.5 whitespace-nowrap">{variosDepositos ? `${u.deposito} · ` : ""}{u.ubicacion}</td>
                  <td className="py-0.5 text-right tabular-nums">{u.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </span>
  );
}
