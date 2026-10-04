"use client";

// Buscador de productos de la portada: busca al tipear (desde la segunda letra),
// con la caja "Comienza por" tildada de entrada, y agrega con un clic.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { accionBuscarParaPortada, accionAgregarPortada } from "./acciones";
import type { ProductoHallado } from "@/lib/tienda/portada";

export default function Buscador({ canalId, lista }: { canalId: number; lista: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [comienza, setComienza] = useState(true);
  const [hallados, setHallados] = useState<ProductoHallado[]>([]);
  const [error, setError] = useState("");
  const [buscando, setBuscando] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turno = useRef(0);

  const correr = (t: string, c: boolean) => {
    if (espera.current) clearTimeout(espera.current);
    if (t.trim().length < 2) { setHallados([]); return; }
    espera.current = setTimeout(async () => {
      const mio = ++turno.current;
      setBuscando(true);
      try { const r = await accionBuscarParaPortada(canalId, lista, t, c); if (mio === turno.current) setHallados(r); }
      finally { if (mio === turno.current) setBuscando(false); }
    }, 250);
  };
  const agregar = async (p: ProductoHallado) => {
    setError("");
    const r = await accionAgregarPortada(canalId, lista, p.id);
    if (r.error) { setError(r.error); return; }
    setHallados((h) => h.filter((x) => x.id !== p.id));
    router.refresh();
  };

  return (
    <div className="text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative inline-flex">
          <input value={texto} onChange={(e) => { setTexto(e.target.value); correr(e.target.value, comienza); }} autoFocus autoComplete="off"
            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
            placeholder="Buscar por SKU, título o marca" className="border border-[#E3E9F0] rounded-lg pl-2 pr-7 py-1.5 text-xs bg-white w-80" />
          {texto && <button type="button" onClick={() => { setTexto(""); setHallados([]); }} aria-label="Borrar la búsqueda"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full text-[#5C6B76] hover:bg-[#E3E9F0] leading-none">×</button>}
        </span>
        <label className="inline-flex items-center gap-1.5 text-[#5C6B76] whitespace-nowrap">
          <input type="checkbox" checked={comienza} onChange={(e) => { setComienza(e.target.checked); correr(texto, e.target.checked); }} className="h-4 w-4 accent-[#16577F]" /> Comienza por
        </label>
        {buscando && <span className="text-[11px] text-[#5C6B76]">Buscando…</span>}
      </div>
      {error && <p className="mt-1 text-[#C03420]">{error}</p>}
      {hallados.length > 0 && (
        <ul className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-[#E3E9F0] divide-y divide-[#EEF1F4] bg-white">
          {hallados.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => agregar(p)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-[#EEF3F8]">
                {p.foto ? <img src={p.foto} alt="" className="h-8 w-8 rounded object-contain bg-white border border-[#E3E9F0]" /> : <span className="h-8 w-8 rounded bg-[#F3F6F9] border border-[#E3E9F0]" />}
                <span className="font-mono text-[#5C6B76] whitespace-nowrap">{p.sku}</span>
                <span className="flex-1 truncate">{p.titulo}</span>
                <span className="text-[#16577F] font-bold whitespace-nowrap">+ Agregar</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
