"use client";

// Buscador del encabezado: una caja grande con la lupa a la derecha y
// sugerencias mientras se tipea (títulos de productos de la tienda, desde la
// segunda letra). Enter busca lo escrito; flechas + Enter abren la sugerencia.

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Sugerencia = { id: number; titulo: string; foto: string | null };

export default function Buscador({ slug, accion }: { slug: string; accion: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [lista, setLista] = useState<Sugerencia[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [marcada, setMarcada] = useState(-1);
  const caja = useRef<HTMLDivElement>(null);
  const ultimo = useRef(0);
  const idLista = useId();

  useEffect(() => { setQ(sp.get("q") ?? ""); }, [sp]);

  // En el dominio propio la tienda está en la raíz; en el panel, en /tienda/<slug>.
  const prefijo = () => (typeof window !== "undefined" && window.location.pathname.startsWith(`/tienda/${slug}`) ? `/tienda/${slug}` : "");

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) { setLista([]); return; }
    const n = ++ultimo.current;
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`${prefijo()}/sugerencias?q=${encodeURIComponent(texto)}`);
        const datos = (await r.json()) as Sugerencia[];
        if (n === ultimo.current) { setLista(datos); setMarcada(-1); }
      } catch { /* sin sugerencias */ }
    }, 150);
    return () => clearTimeout(id);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, []);

  const irA = (s: Sugerencia) => { setAbierto(false); router.push(`${prefijo()}/producto/${s.id}`); };

  const teclas = (e: React.KeyboardEvent) => {
    if (!abierto || !lista.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setMarcada((m) => (m + 1) % lista.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMarcada((m) => (m <= 0 ? lista.length - 1 : m - 1)); }
    else if (e.key === "Escape") setAbierto(false);
    else if (e.key === "Enter" && marcada >= 0) { e.preventDefault(); irA(lista[marcada]); }
  };

  // Resalta lo escrito dentro del título.
  const resaltar = (titulo: string) => {
    const i = titulo.toLowerCase().indexOf(q.trim().toLowerCase());
    if (i < 0 || !q.trim()) return titulo;
    return <>{titulo.slice(0, i)}<b className="font-semibold">{titulo.slice(i, i + q.trim().length)}</b>{titulo.slice(i + q.trim().length)}</>;
  };

  return (
    <div ref={caja} className="relative w-full">
      <form action={accion} role="search" onSubmit={() => setAbierto(false)}
        className="flex h-10 w-full items-center rounded-[2px] bg-white shadow-[0_1px_2px_0_rgba(0,0,0,.2)]">
        <input name="q" type="search" value={q} autoComplete="off" placeholder="Buscar productos, marcas y más…" aria-label="Buscar productos"
          role="combobox" aria-expanded={abierto && lista.length > 0} aria-controls={idLista} aria-autocomplete="list"
          onChange={(e) => { setQ(e.target.value); setAbierto(true); }} onFocus={() => setAbierto(true)} onKeyDown={teclas}
          className="h-full min-w-0 flex-1 rounded-l-[2px] bg-transparent px-4 text-base text-[var(--texto)] outline-none placeholder:text-black/40 [&::-webkit-search-cancel-button]:hidden" />
        <span aria-hidden className="h-6 w-px bg-black/10" />
        <button type="submit" aria-label="Buscar" className="grid h-full w-12 place-items-center text-black/50 hover:text-black/80">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </button>
      </form>
      {abierto && lista.length > 0 && (
        <ul id={idLista} role="listbox" className="absolute inset-x-0 top-full z-50 mt-0.5 overflow-hidden rounded-b bg-white py-1 shadow-[0_6px_16px_rgba(0,0,0,.2)]">
          {lista.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === marcada}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => irA(s)} onMouseEnter={() => setMarcada(i)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-[var(--texto)] ${i === marcada ? "bg-black/[.04]" : ""}`}>
                {s.foto
                  ? <img src={s.foto} alt="" className="h-8 w-8 shrink-0 object-contain" loading="lazy" />
                  : <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-black/40" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>}
                <span className="line-clamp-1">{resaltar(s.titulo)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
