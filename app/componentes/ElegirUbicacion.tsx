"use client";

// Elegir una ubicación con buscador (pedido de Fer): son cientos, así que en
// vez de un desplegable se escribe y se filtra (por código al principio, o por
// cualquier parte del texto). Flechas + Enter eligen; Enter nunca envía el
// formulario. Con `name` deja el valor en un campo oculto para el <form>; con
// `valor`/`alCambiar` lo maneja quien lo usa.

import { useMemo, useRef, useState } from "react";

export type OpcionUbicacion = { valor: string; texto: string; detalle?: string | null };

const MAX = 60;

export default function ElegirUbicacion({ opciones, name, valor, alCambiar, placeholder = "Buscá la ubicación…", grande = false, className = "" }: {
  opciones: OpcionUbicacion[]; name?: string; valor?: string; alCambiar?: (v: string) => void;
  placeholder?: string; grande?: boolean; className?: string;
}) {
  const [propio, setPropio] = useState("");
  const elegido = valor ?? propio;
  const actual = opciones.find((o) => o.valor === elegido);
  const [texto, setTexto] = useState(actual?.texto ?? "");
  const [abierto, setAbierto] = useState(false);
  const [marca, setMarca] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  // Si el valor cambia desde afuera (ej. se escaneó una etiqueta), el texto lo sigue.
  const [visto, setVisto] = useState(elegido);
  if (visto !== elegido) { setVisto(elegido); setTexto(actual?.texto ?? ""); }

  const filtradas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    if (!t || (actual && texto === actual.texto)) return opciones.slice(0, MAX);
    const comienzan = opciones.filter((o) => o.texto.toLowerCase().startsWith(t) || o.texto.toLowerCase().includes(` · ${t}`));
    const resto = opciones.filter((o) => !comienzan.includes(o) && `${o.texto} ${o.detalle ?? ""}`.toLowerCase().includes(t));
    return [...comienzan, ...resto].slice(0, MAX);
  }, [texto, opciones, actual]);

  const elegir = (o: OpcionUbicacion) => {
    if (valor === undefined) setPropio(o.valor);
    alCambiar?.(o.valor);
    setTexto(o.texto);
    setAbierto(false);
  };

  const tamano = grande ? "px-2 py-2.5 text-base" : "px-2 py-1.5 text-xs";
  return (
    <div ref={caja} className={`relative ${className}`}
      onBlur={(e) => { if (!caja.current?.contains(e.relatedTarget as Node)) { setAbierto(false); setTexto(actual?.texto ?? ""); } }}>
      {name && <input type="hidden" name={name} value={elegido} />}
      <input value={texto} placeholder={placeholder} aria-label="Ubicación" autoComplete="off"
        onFocus={(e) => { setAbierto(true); e.currentTarget.select(); }}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); setMarca(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setMarca((m) => Math.min(m + 1, filtradas.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setMarca((m) => Math.max(m - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (abierto && filtradas[marca]) elegir(filtradas[marca]); }
          else if (e.key === "Escape") { setAbierto(false); }
        }}
        className={`w-full border border-[#E3E9F0] rounded-lg bg-white ${tamano}`} />
      {abierto && (
        <ul className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-[#C9D3DD] bg-white shadow-lg">
          {filtradas.length === 0 && <li className={`${tamano} text-[#5C6B76]`}>Ninguna coincide.</li>}
          {filtradas.map((o, i) => (
            <li key={o.valor}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(o)}
                className={`w-full text-left ${tamano} ${i === marca ? "bg-[#EEF3F8]" : ""} ${o.valor === elegido ? "font-semibold" : ""}`}>
                {o.texto}{o.detalle && <span className="text-[#5C6B76]"> — {o.detalle}</span>}
              </button>
            </li>
          ))}
          {filtradas.length === MAX && <li className={`${tamano} text-[10px] text-[#5C6B76]`}>Se muestran las primeras {MAX}: seguí escribiendo.</li>}
        </ul>
      )}
    </div>
  );
}
