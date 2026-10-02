"use client";

// Consulta de stock: el depósito elegido ("todos" o un id) queda guardado en
// una cookie del navegador, así la próxima vez abre como la última.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

/** Cambia un parámetro de la dirección sin recargar la página entera. */
function usarCambiarParametro() {
  const router = useRouter();
  return (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(cambios)) if (v) p.set(k, v); else p.delete(k);
    const s = p.toString();
    router.replace(s ? `${window.location.pathname}?${s}` : window.location.pathname, { scroll: false });
  };
}

/** Búsqueda al tipear (desde 2 letras), con una X para borrar, y las cajas "Comienza por" y "Mostrar inactivos". */
export function BuscadorVivo({ q, inactivos, comienza, autoFocus }: { q: string; inactivos: boolean; comienza: boolean; autoFocus: boolean }) {
  const cambiar = usarCambiarParametro();
  const [texto, setTexto] = useState(q);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = (t: string) => {
    setTexto(t);
    if (espera.current) clearTimeout(espera.current);
    const limpio = t.trim();
    if (limpio.length === 1) return; // con una sola letra no busca todavía
    espera.current = setTimeout(() => cambiar({ q: limpio || null, v: null }), 300);
  };

  return (
    <>
      <span className="relative inline-flex">
        <input value={texto} onChange={(e) => buscar(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          placeholder="SKU, título o código de barras" autoFocus={autoFocus}
          className="border border-[#E3E9F0] rounded-lg pl-2 pr-7 py-1.5 text-xs bg-white w-72" />
        {texto && (
          <button type="button" onClick={() => buscar("")} aria-label="Borrar la búsqueda"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full text-[#5C6B76] hover:bg-[#E3E9F0] leading-none">×</button>
        )}
      </span>
      <label className="inline-flex items-center gap-1.5 text-xs text-[#5C6B76] py-1.5 whitespace-nowrap">
        <input type="checkbox" defaultChecked={comienza} onChange={(e) => cambiar({ contiene: e.target.checked ? null : "1" })}
          className="h-4 w-4 accent-[#16577F]" />
        Comienza por
      </label>
      <label className="inline-flex items-center gap-1.5 text-xs text-[#5C6B76] py-1.5 whitespace-nowrap">
        <input type="checkbox" defaultChecked={inactivos} onChange={(e) => cambiar({ inactivos: e.target.checked ? "1" : null })}
          className="h-4 w-4 accent-[#16577F]" />
        Mostrar inactivos
      </label>
    </>
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
