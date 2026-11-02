"use client";
// La lista de «A buscar» (page.tsx): tocando uno se abre dónde apareció (de entrada, su ubicación), cuántas (si eran
// varias) y los dos botones. «No apareció ninguna» pregunta ahí mismo: Sí / No.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FotosProducto from "@/app/componentes/FotosProducto";
import ElegirUbicacion, { type OpcionUbicacion } from "@/app/componentes/ElegirUbicacion";
import { ANCHO_NUMERO } from "@/lib/numeros";
import type { Buscando } from "@/lib/deposito/control";
import { accionResolver, type Respuesta } from "../acciones";

const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-3";
const pesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

export default function Resolver({ items, ubicaciones, vacio }: { items: Buscando[]; ubicaciones: OpcionUbicacion[]; vacio: string }) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const [aviso, setAviso] = useState<Respuesta | null>(null);
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className={`${CAJA} text-sm text-[#5C6B76]`}>{vacio}</p>}
      {items.map((b) => (
        <div key={b.id} className={`${CAJA} ${abierto === b.id ? "border-[#16577F]" : ""}`}>
          <div className="flex items-start gap-3">
            <FotosProducto fotos={b.fotos} titulo={b.titulo} tamano={64} />
            <button type="button" onClick={() => setAbierto(abierto === b.id ? null : b.id)} aria-expanded={abierto === b.id} className="min-w-0 flex-1 text-left">
              <span className="block text-base font-bold text-[#16577F]">{b.sku}</span>
              <span className="block text-sm text-[#2A3640] line-clamp-2">{b.titulo}</span>
              <span className="block text-sm">Faltaba{b.diferencia > 1 ? `n ${b.diferencia}` : ""} en <b>{b.codigo}</b> <span className="text-[#5C6B76]">({b.deposito})</span></span>
              <span className="block text-xs text-[#5C6B76]">{b.fecha}{b.persona ? ` · ${b.persona}` : ""}{b.precio != null ? ` · ${pesos(b.precio * b.diferencia)}` : ""}</span>
            </button>
          </div>
          {abierto === b.id && <Abierto b={b} ubicaciones={ubicaciones} alTerminar={(r) => { setAviso(r); if (r.ok) setAbierto(null); }} />}
        </div>
      ))}
      {aviso && (
        <div role="status" className={`fixed inset-x-3 bottom-20 md:bottom-12 z-50 mx-auto max-w-xl rounded-xl px-4 py-3 text-sm shadow-lg flex items-start justify-between gap-3 ${aviso.ok ? "bg-[#E8F5EE] text-[#0F5A40] border border-[#BFE3D0]" : "bg-[#FDECEA] text-[#8A2416] border border-[#F2C2BB]"}`}>
          <span>{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} className="rounded-lg border border-current/30 px-2 py-0.5 text-xs font-bold">Cerrar</button>
        </div>
      )}
    </div>
  );
}

function Abierto({ b, ubicaciones, alTerminar }: { b: Buscando; ubicaciones: OpcionUbicacion[]; alTerminar: (r: Respuesta) => void }) {
  const router = useRouter();
  const [ubicacion, setUbicacion] = useState(String(b.ubicacion_id));
  const [cuantas, setCuantas] = useState(b.diferencia);
  const [preguntando, setPreguntando] = useState(false);
  const [trabajando, empezar] = useTransition();
  const resolver = (aparecieron: number) => empezar(async () => {
    alTerminar(await accionResolver(b.id, aparecieron, Number(ubicacion) || null));
    router.refresh();
  });

  return (
    <div className="mt-3 space-y-3 border-t border-[#E3E9F0] pt-3">
      <label className="block">
        <span className="block text-xs font-semibold text-[#5C6B76] mb-1">¿Dónde apareció?</span>
        <ElegirUbicacion opciones={ubicaciones} valor={ubicacion} alCambiar={setUbicacion} grande />
      </label>
      {b.diferencia > 1 && (
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">¿Cuántas aparecieron? <span className="font-normal text-[#5C6B76]">(las demás se descuentan)</span></span>
          <input value={cuantas} inputMode="numeric" aria-label="Cuántas aparecieron"
            onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); setCuantas(Number.isFinite(n) ? Math.min(n, b.diferencia) : 0); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
            className={`h-11 w-20 ${ANCHO_NUMERO} rounded-xl border-2 border-[#E3E9F0] px-2 text-xl font-bold text-right tabular-nums`} />
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={trabajando || cuantas < 1} onClick={() => resolver(cuantas)}
          className="rounded-xl bg-[#167655] text-white py-4 text-base font-bold disabled:opacity-50">✓ Apareció</button>
        {preguntando ? (
          <span className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#C03420] px-2 text-sm">
            <span className="font-semibold">¿Se descuenta{b.diferencia > 1 ? "n" : ""}?</span>
            <button type="button" disabled={trabajando} onClick={() => resolver(0)} className="rounded-lg bg-[#C03420] text-white px-3 py-1.5 font-bold disabled:opacity-50">Sí</button>
            <button type="button" disabled={trabajando} onClick={() => setPreguntando(false)} className="rounded-lg border border-[#E3E9F0] bg-white px-3 py-1.5 font-bold">No</button>
          </span>
        ) : (
          <button type="button" disabled={trabajando} onClick={() => setPreguntando(true)}
            className="rounded-xl bg-[#C03420] text-white py-4 text-base font-bold disabled:opacity-50">✗ No apareció</button>
        )}
      </div>
      {trabajando && <p className="text-sm text-[#5C6B76]">Trabajando…</p>}
      <p className="text-xs text-[#5C6B76]"><Link href={`/catalogo/productos/${b.producto_id}`} className="underline">Ver la ficha del producto</Link></p>
    </div>
  );
}
