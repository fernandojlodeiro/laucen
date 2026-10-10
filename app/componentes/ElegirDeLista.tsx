"use client";

// Elegir de una tabla con más de 10 opciones (convención de AGENTS.md, pedido
// de Fer 10/10): se despliega como una lista, pero arriba se escribe para
// buscar; nunca un <select> largo que hay que recorrer a mano. Las opciones
// vienen enteras (son cientos, no miles; para miles, buscar en el servidor
// como ElegirFamilia). Busca sin importar mayúsculas ni acentos: primero las
// que empiezan con lo escrito, después las que lo tienen en cualquier parte.
// Flechas + Enter eligen; Enter nunca envía el formulario; Escape cierra.
// Con `name` deja el id en un campo oculto para el <form>; con `parametro`
// es un filtro que cambia la dirección al elegir. Con `crear`, si lo escrito
// no existe aparece el botón «+ Crear «…»».

import { useEffect, useRef, useState } from "react";
import { usarCambiarParametro } from "@/app/componentes/BuscadorVivo";

export type Opcion = { id: number; texto: string; detalle?: string };

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Las opciones que coinciden: primero las que empiezan con lo escrito. Pura. */
export function filtrarOpciones(opciones: Opcion[], texto: string): Opcion[] {
  const q = sinAcentos(texto);
  if (!q) return opciones;
  const empiezan = opciones.filter((o) => sinAcentos(o.texto).startsWith(q));
  const tienen = opciones.filter((o) => !sinAcentos(o.texto).startsWith(q) && sinAcentos(`${o.texto} ${o.detalle ?? ""}`).includes(q));
  return [...empiezan, ...tienen];
}

export default function ElegirDeLista({
  name, opciones: inicial, valor = null, vacio = "Sin elegir", placeholder = "Buscá…", etiqueta, parametro, limpiar = [],
  crear, className = "",
}: {
  name?: string;
  opciones: Opcion[];
  valor?: number | null;
  /** El texto de "ninguna" (primera opción): "Sin marca", "Todas las marcas"… */
  vacio?: string;
  placeholder?: string;
  /** Para lectores de pantalla ("Marca"). */
  etiqueta?: string;
  /** Filtro de una lista: al elegir, pone `parametro=<id>` en la dirección (o lo saca). */
  parametro?: string;
  limpiar?: string[];
  /** Crea una opción nueva con lo escrito (un botón explícito, nunca al dar Enter). */
  crear?: (texto: string) => Promise<Opcion | { error: string }>;
  className?: string;
}) {
  const cambiar = usarCambiarParametro();
  const [opciones, setOpciones] = useState(inicial);
  const textoDe = (id: number | null) => (id == null ? "" : opciones.find((o) => o.id === id)?.texto ?? "");
  const [elegido, setElegido] = useState<number | null>(valor);
  const [texto, setTexto] = useState(textoDe(valor));
  const [abierto, setAbierto] = useState(false);
  const [marca, setMarca] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  // Si el valor cambia desde afuera (otra página del filtro), el texto lo sigue.
  const [visto, setVisto] = useState(valor);
  if (visto !== valor) { setVisto(valor); setElegido(valor); setTexto(textoDe(valor)); }

  const buscado = texto === textoDe(elegido) ? "" : texto;
  const filtradas = filtrarOpciones(opciones, buscado);
  const items: (Opcion | null)[] = [null, ...filtradas];
  const existe = !!buscado.trim() && opciones.some((o) => sinAcentos(o.texto) === sinAcentos(buscado));

  useEffect(() => {
    lista.current?.querySelector(`[data-i="${marca}"]`)?.scrollIntoView({ block: "nearest" });
  }, [marca]);

  const elegir = (o: Opcion | null) => {
    const id = o?.id ?? null;
    setElegido(id); setTexto(o?.texto ?? ""); setAbierto(false); setError(null);
    if (parametro) cambiar({ [parametro]: id != null ? String(id) : null, ...Object.fromEntries(limpiar.map((k) => [k, null])) });
  };

  const alCrear = async () => {
    if (!crear || !buscado.trim()) return;
    setCreando(true); setError(null);
    try {
      const r = await crear(buscado.trim());
      if ("error" in r) setError(r.error);
      else { setOpciones((x) => [...x, r].sort((a, b) => a.texto.localeCompare(b.texto, "es"))); elegir(r); }
    } catch {
      setError("No se pudo crear: probá de nuevo.");
    } finally { setCreando(false); }
  };

  return (
    <div ref={caja} className={`relative ${className}`}
      onBlur={(e) => { if (!caja.current?.contains(e.relatedTarget as Node)) { setAbierto(false); setTexto(textoDe(elegido)); } }}>
      {name && <input type="hidden" name={name} value={elegido ?? ""} />}
      <input value={texto} placeholder={elegido != null ? placeholder : parametro ? vacio : placeholder} aria-label={etiqueta} autoComplete="off"
        onFocus={(e) => { setAbierto(true); e.currentTarget.select(); setMarca(0); }}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); setMarca(e.target.value.trim() ? 1 : 0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setMarca((m) => Math.min(m + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setMarca((m) => Math.max(m - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (abierto && marca < items.length) elegir(items[marca]); }
          else if (e.key === "Escape") { setAbierto(false); setTexto(textoDe(elegido)); }
        }}
        className="w-full border border-[#E3E9F0] rounded-lg bg-white pl-2 pr-7 py-1.5 text-xs" />
      {/* La flechita dice que se despliega; la X (con algo elegido) lo saca. */}
      {elegido != null ? (
        <button type="button" onClick={() => elegir(null)} aria-label={vacio} title={vacio}
          className="absolute right-1 top-[15px] -translate-y-1/2 h-5 w-5 rounded-full text-[#5C6B76] hover:bg-[#E3E9F0] leading-none">×</button>
      ) : (
        <span aria-hidden className="pointer-events-none absolute right-2 top-[15px] -translate-y-1/2 text-[9px] text-[#5C6B76]">▼</span>
      )}
      {abierto && (
        <ul ref={lista} className="absolute left-0 z-50 mt-1 min-w-full w-max max-w-[min(28rem,90vw)] max-h-64 overflow-auto rounded-lg border border-[#C9D3DD] bg-white shadow-lg">
          {items.map((o, i) => (
            <li key={o?.id ?? "ninguna"} data-i={i}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(o)}
                className={`w-full text-left px-2 py-1.5 text-xs ${i === marca ? "bg-[#EEF3F8]" : ""} ${(o?.id ?? null) === elegido ? "font-semibold" : ""}`}>
                {o == null ? <span className="text-[#5C6B76]">{vacio}</span> : (
                  <>{o.texto}{o.detalle && <span className="ml-1 text-[10px] text-[#5C6B76]">{o.detalle}</span>}</>
                )}
              </button>
            </li>
          ))}
          {buscado.trim() && filtradas.length === 0 && <li className="px-2 py-1.5 text-xs text-[#5C6B76]">Ninguna coincide.</li>}
          {crear && buscado.trim() && !existe && (
            <li className="border-t border-[#E3E9F0] p-1.5">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={alCrear} disabled={creando}
                className="text-xs font-bold rounded-lg px-2 py-1 bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F]">
                {creando ? "Creando…" : `+ Crear «${buscado.trim()}»`}
              </button>
            </li>
          )}
          {error && <li className="px-2 py-1.5 text-xs text-[#C03420]">{error}</li>}
        </ul>
      )}
    </div>
  );
}
