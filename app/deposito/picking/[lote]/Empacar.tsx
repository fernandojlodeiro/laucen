"use client";

// Empacar escaneando (alternativo): en la mesa se escanea cada producto y
// la pantalla dice, grande, a qué pedido va y qué le falta. Cuando un pedido
// queda completo se cierra solo (preparado) y se abre su etiqueta (sólo la
// de ese pedido) en otra pestaña para imprimirla. Un producto que sobra o
// que no es del lote suena con error.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Escaner from "@/app/deposito/Escaner";
import { PRIMARIO } from "@/app/botones";
import { accionEmpacar, type ResultadoEmpaque } from "../acciones";
import Cantidad, { cantidadDe } from "./Cantidad";

export default function Empacar({ lote, tam }: { lote: number; tam: string }) {
  const router = useRouter();
  const [, transicion] = useTransition();
  const [r, setR] = useState<ResultadoEmpaque | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const etiqueta = (pedido: number) => `/deposito/hojas?lote=${lote}&p=${pedido}&solo=etiqueta&tam=${encodeURIComponent(tam)}`;

  async function alLeer(codigo: string) {
    const x = await accionEmpacar(lote, codigo, cantidadDe(cantidad));
    setR(x);
    if (x.ok) {
      setCantidad("1");
      // La etiqueta del pedido que se completó (si el navegador bloquea la
      // pestaña, queda el botón para abrirla).
      if (x.preparado) window.open(etiqueta(x.pedidoId), "_blank");
      transicion(() => router.refresh());
    }
    return x.ok;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <Cantidad valor={cantidad} cambiar={setCantidad} />
        <div className="flex-1 min-w-0"><Escaner alLeer={alLeer} placeholder="Escaneá o escribí el código o SKU del producto" /></div>
      </div>
      {r && !r.ok && (
        <p role="alert" className="text-base font-bold rounded-lg px-3 py-3 bg-[#FDF1EF] text-[#C03420]">✗ {r.mensaje}</p>
      )}
      {r && r.ok && (
        <div role="status" className={`rounded-xl border-2 p-3 ${r.preparado ? "border-[#167655] bg-[#EEF7F1]" : "border-[#16577F] bg-white"}`}>
          <div className="text-[11px] font-semibold text-[#5C6B76] uppercase tracking-wide">Va al pedido</div>
          <div className="text-5xl font-black text-[#16577F] leading-tight">#{r.pedidoId}</div>
          <div className="text-sm mb-2"><b>{r.sku}</b> {r.titulo}{r.kit && <b> × {r.kit.cantidad} = {r.kit.unidades} unidad{r.kit.unidades === 1 ? "" : "es"}</b>}</div>
          {r.preparado ? (
            <>
              <p className="text-lg font-bold text-[#1F6E4A]">Completo ✓ — quedó preparado.{r.loteTerminado ? " Era el último del lote." : ""}</p>
              <a href={etiqueta(r.pedidoId)} target="_blank" rel="noreferrer" className={`${PRIMARIO} text-base px-4 py-3 inline-block mt-2`}>🖨 Imprimir su etiqueta</a>
            </>
          ) : r.faltan.length ? (
            <>
              <p className="text-sm font-bold">Le falta:</p>
              <ul className="text-sm">
                {r.faltan.map((f) => <li key={`${f.sku}-${f.ubicacion}`}><b>{f.faltan}</b> × {f.sku} <span className="text-[#5C6B76]">{f.titulo} · {f.ubicacion}</span></li>)}
              </ul>
            </>
          ) : null}
          {r.aviso && <p className="text-sm font-semibold text-[#8a5a00] mt-2">{r.aviso}</p>}
        </div>
      )}
    </div>
  );
}
