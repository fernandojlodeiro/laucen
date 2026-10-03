"use client";

// Elegir una familia (categoría) con buscador, nunca un desplegable (AGENTS.md):
// el árbol tiene miles (las categorías de Mercado Libre). Se escribe parte del
// nombre o del camino ("electro compo") y el servidor devuelve las primeras 50
// que coinciden, con su camino. Flechas + Enter eligen; Enter nunca envía el
// formulario; Escape cierra. Con `name` deja el id en un campo oculto para el
// <form>; con `parametro` es un filtro que cambia la dirección al elegir; con
// `alCambiar` lo maneja quien lo usa.

import { useEffect, useRef, useState } from "react";
import { accionBuscarFamilias } from "@/app/componentes/familias-buscar";
import { usarCambiarParametro } from "@/app/componentes/BuscadorVivo";
import type { FamiliaEncontrada } from "@/lib/erp/familias";

const MAX = 50;

export default function ElegirFamilia({
  name, valor = null, etiqueta = null, parametro, alCambiar, vacio = "Sin familia", propias = false, excluir,
  placeholder = "Buscá la familia…", className = "", limpiar = [],
}: {
  name?: string;
  /** El id elegido al abrir (o null) y su camino, para mostrarlo. */
  valor?: number | null; etiqueta?: string | null;
  /** Filtro de una lista: al elegir, pone `parametro=<id>` en la dirección (o lo saca). */
  parametro?: string;
  alCambiar?: (id: number | null) => void;
  /** El texto de "ninguna" (primera opción de la lista): "Sin familia", "Todas las familias"… */
  vacio?: string;
  /** Sólo familias propias (no las de Mercado Libre). */
  propias?: boolean;
  /** Saca esa familia y las que cuelgan de ella (para elegir padre). */
  excluir?: number;
  placeholder?: string; className?: string;
  /** Parámetros de la dirección que se sacan al filtrar (ej. la fila abierta). */
  limpiar?: string[];
}) {
  const cambiar = usarCambiarParametro();
  const [elegido, setElegido] = useState<{ id: number | null; texto: string }>({ id: valor, texto: valor ? etiqueta ?? "" : "" });
  const [texto, setTexto] = useState(elegido.texto);
  const [abierto, setAbierto] = useState(false);
  const [marca, setMarca] = useState(0);
  const [opciones, setOpciones] = useState<FamiliaEncontrada[]>([]);
  const [buscando, setBuscando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turno = useRef(0);

  // Si el valor cambia desde afuera (otra página del filtro), el texto lo sigue.
  const [visto, setVisto] = useState(valor);
  if (visto !== valor) {
    setVisto(valor);
    const nuevo = { id: valor, texto: valor ? etiqueta ?? "" : "" };
    setElegido(nuevo); setTexto(nuevo.texto);
  }

  const buscar = (t: string) => {
    if (espera.current) clearTimeout(espera.current);
    const limpio = t.trim();
    if (limpio.length === 1) return; // con una sola letra no busca todavía
    espera.current = setTimeout(async () => {
      const yo = ++turno.current;
      setBuscando(true);
      try {
        const r = await accionBuscarFamilias(limpio, { propias, excluir });
        if (yo === turno.current) { setOpciones(r); setMarca(0); }
      } catch {
        if (yo === turno.current) setOpciones([]);
      } finally {
        if (yo === turno.current) setBuscando(false);
      }
    }, limpio ? 200 : 0);
  };
  useEffect(() => () => { if (espera.current) clearTimeout(espera.current); }, []);

  // La lista: "ninguna" primero y después lo que encontró.
  const items: { id: number | null; nombre: string; camino: string }[] = [{ id: null, nombre: vacio, camino: "" }, ...opciones];

  const elegir = (o: { id: number | null; nombre: string; camino: string }) => {
    const nuevo = { id: o.id, texto: o.id ? o.camino : "" };
    setElegido(nuevo); setTexto(nuevo.texto); setAbierto(false);
    alCambiar?.(o.id);
    if (parametro) cambiar({ [parametro]: o.id ? String(o.id) : null, ...Object.fromEntries(limpiar.map((k) => [k, null])) });
  };

  return (
    <div ref={caja} className={`relative ${className}`}
      onBlur={(e) => { if (!caja.current?.contains(e.relatedTarget as Node)) { setAbierto(false); setTexto(elegido.texto); } }}>
      {name && <input type="hidden" name={name} value={elegido.id ?? ""} />}
      <input value={texto} placeholder={elegido.id ? placeholder : parametro ? vacio : placeholder} aria-label="Familia" autoComplete="off"
        title={elegido.texto || undefined}
        onFocus={(e) => { setAbierto(true); e.currentTarget.select(); buscar(""); }}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); buscar(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setMarca((m) => Math.min(m + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setMarca((m) => Math.max(m - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (abierto && items[marca]) elegir(items[marca]); }
          else if (e.key === "Escape") { setAbierto(false); setTexto(elegido.texto); }
        }}
        className="w-full border border-[#E3E9F0] rounded-lg bg-white pl-2 pr-7 py-1.5 text-xs" />
      {elegido.id != null && (
        <button type="button" onClick={() => elegir(items[0])} aria-label="Sacar la familia" title={vacio}
          className="absolute right-1 top-[15px] -translate-y-1/2 h-5 w-5 rounded-full text-[#5C6B76] hover:bg-[#E3E9F0] leading-none">×</button>
      )}
      {abierto && (
        <ul className="absolute left-0 z-50 mt-1 min-w-full w-max max-w-[min(36rem,90vw)] max-h-72 overflow-auto rounded-lg border border-[#C9D3DD] bg-white shadow-lg">
          {items.map((o, i) => (
            <li key={o.id ?? "ninguna"}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(o)}
                className={`w-full text-left px-2 py-1.5 text-xs ${i === marca ? "bg-[#EEF3F8]" : ""} ${o.id === elegido.id ? "font-semibold" : ""}`}>
                {o.id == null ? <span className="text-[#5C6B76]">{o.nombre}</span> : (
                  <>
                    <span className="block">{o.nombre}</span>
                    {o.camino !== o.nombre && <span className="block text-[10px] text-[#5C6B76]">{o.camino}</span>}
                  </>
                )}
              </button>
            </li>
          ))}
          {buscando && <li className="px-2 py-1.5 text-[10px] text-[#5C6B76]">Buscando…</li>}
          {!buscando && texto.trim().length >= 2 && texto !== elegido.texto && opciones.length === 0 && (
            <li className="px-2 py-1.5 text-xs text-[#5C6B76]">Ninguna coincide.</li>
          )}
          {!buscando && texto.trim().length === 1 && <li className="px-2 py-1.5 text-[10px] text-[#5C6B76]">Escribí una letra más…</li>}
          {opciones.length === MAX && <li className="px-2 py-1.5 text-[10px] text-[#5C6B76]">Se muestran las primeras {MAX}: seguí escribiendo.</li>}
        </ul>
      )}
    </div>
  );
}
