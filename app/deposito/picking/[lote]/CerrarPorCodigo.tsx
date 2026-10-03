"use client";

// Cerrar pedidos escaneando el código de barras de su hoja de preparación:
// el lector dice qué pedido es y pregunta ahí mismo "¿Marcar preparado? Sí /
// No". Escanear el mismo código otra vez es el "Sí" (cómodo con la pistola).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Escaner from "@/app/deposito/Escaner";
import { VERDE, SUAVE } from "@/app/botones";
import { accionBuscarPedidoLote, accionPreparadoPorCodigo, type PedidoEscaneado, type ResultadoEscaneo } from "../acciones";

type Encontrado = Extract<PedidoEscaneado, { ok: true }>;

export default function CerrarPorCodigo({ lote }: { lote: number }) {
  const router = useRouter();
  const [, transicion] = useTransition();
  const [pregunta, setPregunta] = useState<Encontrado | null>(null);
  const [ultimo, setUltimo] = useState<ResultadoEscaneo | null>(null);
  const [mandando, setMandando] = useState(false);

  async function confirmar(p: Encontrado) {
    setMandando(true);
    const r = await accionPreparadoPorCodigo(lote, p.id);
    setMandando(false);
    setPregunta(null);
    setUltimo(r);
    if (r.ok) transicion(() => router.refresh());
    return r.ok;
  }

  async function alLeer(codigo: string) {
    const r = await accionBuscarPedidoLote(lote, codigo);
    if (!r.ok) { setPregunta(null); setUltimo({ ok: false, mensaje: r.mensaje }); return false; }
    if (r.preparado) { setPregunta(null); setUltimo({ ok: false, mensaje: `El pedido ${r.id} ya está preparado.` }); return false; }
    if (r.enEspera) { setPregunta(null); setUltimo({ ok: false, mensaje: `El pedido ${r.id} es un carrito de Mercado Libre en espera (le puede llegar otro ítem): cerralo pasados los 10 minutos.` }); return false; }
    // El mismo pedido dos veces seguidas = Sí.
    if (pregunta?.id === r.id) return confirmar(r);
    setUltimo(null);
    setPregunta(r);
    return true;
  }

  return (
    <div className="space-y-2">
      <Escaner alLeer={alLeer} placeholder="Escaneá el código de la hoja (N.º de pedido)" />
      {pregunta && (
        <div className="rounded-xl border-2 border-[#16577F] bg-white p-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-3xl font-black text-[#16577F] leading-tight">#{pregunta.id}</div>
            <div className="text-sm truncate">{pregunta.cliente ?? "Sin cliente"} · {pregunta.unidades} unidad{pregunta.unidades === 1 ? "" : "es"}</div>
            <div className="text-xs text-[#5C6B76]">¿Marcar preparado? (o escaneá la hoja otra vez)</div>
          </div>
          <button type="button" disabled={mandando} onClick={() => confirmar(pregunta)} className={`${VERDE} text-base px-5 py-3 disabled:opacity-60`}>Sí</button>
          <button type="button" onClick={() => setPregunta(null)} className={`${SUAVE} text-base px-5 py-3`}>No</button>
        </div>
      )}
      {ultimo && (
        <p role={ultimo.ok ? "status" : "alert"}
          className={`text-sm font-semibold rounded-lg px-3 py-2 ${ultimo.ok ? "bg-[#EEF7F1] text-[#1F6E4A]" : "bg-[#FDF1EF] text-[#C03420]"}`}>
          {ultimo.ok ? "✓ " : "✗ "}{ultimo.mensaje}
        </p>
      )}
    </div>
  );
}
