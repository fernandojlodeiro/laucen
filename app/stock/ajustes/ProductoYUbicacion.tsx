"use client";

// Producto + ubicación de un ajuste o transferencia. El producto se busca mientras se escribe, por
// SKU, código de barras o descripción (todas las palabras, en cualquier parte). Al elegirlo se
// muestran las ubicaciones donde está: si es una sola, queda elegida; si son varias, se toca la que
// corresponde. La ubicación también se puede buscar entre todas (para sumar en una donde no había).

import { useEffect, useRef, useState } from "react";
import ElegirUbicacion, { type OpcionUbicacion } from "@/app/componentes/ElegirUbicacion";
import { buscarVariaciones, ubicacionesDe, type VariacionHallada, type UbicacionConStock } from "./buscar";

export const FIRME = "border-2 border-[#5C6B76] rounded-lg px-3 py-2 text-sm text-[#16212B] bg-white focus:border-[#16577F] focus:outline-none";
const ETIQ = "block text-xs font-semibold text-[#3D4A54] mb-0.5";

export default function ProductoYUbicacion({ opciones, nombreUbicacion, etiquetaUbicacion, skuInicial = "" }: {
  opciones: OpcionUbicacion[]; nombreUbicacion: string; etiquetaUbicacion: string; skuInicial?: string;
}) {
  const [texto, setTexto] = useState(skuInicial);
  const [sku, setSku] = useState(skuInicial);
  const [hallados, setHallados] = useState<VariacionHallada[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [marca, setMarca] = useState(0);
  const [donde, setDonde] = useState<UbicacionConStock[] | null>(null);
  const [ubicacion, setUbicacion] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  const turno = useRef(0);

  useEffect(() => {
    if (!abierto || texto.trim().length < 2) { setHallados([]); return; }
    const mio = ++turno.current;
    const t = setTimeout(() => {
      buscarVariaciones(texto).then((r) => { if (mio === turno.current) { setHallados(r); setMarca(0); } }).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [texto, abierto]);

  const elegir = async (v: VariacionHallada) => {
    setSku(v.sku); setTexto(`${v.sku} — ${v.titulo}`); setAbierto(false); setDonde(null);
    const u = await ubicacionesDe(v.id).catch(() => []);
    setDonde(u);
    if (u.length === 1) setUbicacion(String(u[0].id));
    else setUbicacion("");
  };

  return (
    <>
      <div className="w-full">
        <span className={ETIQ}>Producto: SKU, código de barras o descripción</span>
        <div ref={caja} className="relative"
          onBlur={(e) => { if (!caja.current?.contains(e.relatedTarget as Node)) setAbierto(false); }}>
          <input type="hidden" name="sku" value={sku} />
          <input value={texto} autoComplete="off" placeholder="Escribí y elegí el producto…" aria-label="Producto"
            onChange={(e) => { setTexto(e.target.value); setSku(e.target.value.trim()); setDonde(null); setAbierto(true); }}
            onFocus={(e) => { setAbierto(true); e.currentTarget.select(); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setMarca((m) => Math.min(m + 1, hallados.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setMarca((m) => Math.max(m - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); if (abierto && hallados[marca]) void elegir(hallados[marca]); }
              else if (e.key === "Escape") setAbierto(false);
            }}
            className={`w-full ${FIRME}`} />
          {abierto && texto.trim().length >= 2 && (
            <ul className="absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-auto rounded-lg border-2 border-[#5C6B76] bg-white shadow-lg">
              {hallados.length === 0 && <li className="px-3 py-2 text-sm text-[#5C6B76]">Ninguno coincide.</li>}
              {hallados.map((v, i) => (
                <li key={v.id}>
                  <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => void elegir(v)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2 text-sm ${i === marca ? "bg-[#EEF3F8]" : ""}`}>
                    {v.foto
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={v.foto} alt="" className="h-10 w-10 rounded-md object-cover border border-[#E3E9F0] shrink-0" />
                      : <span className="h-10 w-10 rounded-md bg-[#EEF3F8] shrink-0" />}
                    <span className="min-w-0">
                      <span className="font-mono font-semibold">{v.sku}</span>{v.estado === "archivado" && <span className="text-[#8a6100]"> (inactivo)</span>}
                      <span className="block truncate text-[#3D4A54]">{v.titulo}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {donde && donde.length === 0 && <p className="text-xs text-[#5C6B76] mt-1">Ese producto no tiene stock en ninguna ubicación.</p>}
        {donde && donde.length > 1 && (
          <div className="mt-1.5">
            <span className="text-xs text-[#3D4A54]">Está en {donde.length} ubicaciones, elegí una:</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {donde.map((u) => (
                <button key={u.id} type="button" onClick={() => setUbicacion(String(u.id))} aria-pressed={String(u.id) === ubicacion}
                  className={`rounded-lg border-2 px-2.5 py-1.5 text-sm ${String(u.id) === ubicacion ? "border-[#16577F] bg-[#EEF3F8] font-semibold" : "border-[#C9D3DD] bg-white hover:border-[#5C6B76]"}`}>
                  {u.texto} <span className="tabular-nums text-[#5C6B76]">({u.cantidad})</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {donde && donde.length === 1 && <p className="text-xs text-[#167655] mt-1">Está sólo en {donde[0].texto} ({donde[0].cantidad}): ya quedó elegida.</p>}
      </div>
      <div><span className={ETIQ}>{etiquetaUbicacion}</span>
        <ElegirUbicacion name={nombreUbicacion} className="w-72" firme opciones={opciones} valor={ubicacion} alCambiar={setUbicacion} />
      </div>
    </>
  );
}
