"use client";

// «Preparado rápido» (provisorio, con el permiso "Preparar sin escanear";
// pedido de Fer 3/10): se escribe o escanea el número de pedido (el de
// Laucen o el del canal), dice cuál es y pregunta "¿Marcar preparado?" ahí
// mismo. Con el Sí el pedido queda preparado con todo tildado, sin escanear
// cada producto. Escanear el mismo número otra vez también es el Sí.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Escaner from "@/app/deposito/Escaner";
import { VERDE, SUAVE } from "@/app/botones";
import { accionBuscarRapido, accionPreparadoRapido, type PedidoRapido, type ResultadoEscaneo } from "./acciones";

type Encontrado = Extract<PedidoRapido, { ok: true }>;

export default function PreparadoRapido() {
  const router = useRouter();
  const [, transicion] = useTransition();
  const [pregunta, setPregunta] = useState<Encontrado | null>(null);
  const [ultimo, setUltimo] = useState<ResultadoEscaneo | null>(null);
  const [mandando, setMandando] = useState(false);

  async function confirmar(p: Encontrado) {
    setMandando(true);
    const r = await accionPreparadoRapido(String(p.id));
    setMandando(false);
    setPregunta(null);
    setUltimo(r);
    if (r.ok) transicion(() => router.refresh());
    return r.ok;
  }

  async function alLeer(codigo: string) {
    const r = await accionBuscarRapido(codigo);
    if (!r.ok) { setPregunta(null); setUltimo({ ok: false, mensaje: r.mensaje }); return false; }
    if (pregunta?.id === r.id) return confirmar(r);
    setUltimo(null);
    setPregunta(r);
    return true;
  }

  return (
    <div className="space-y-2">
      <Escaner alLeer={alLeer} autoFoco={false} placeholder="N.º de pedido (de Laucen o de Mercado Libre)" />
      {pregunta && (
        <div className="rounded-xl border-2 border-[#16577F] bg-white p-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-3xl font-black text-[#16577F] leading-tight">#{pregunta.id}</div>
            <div className="text-sm truncate">{pregunta.cliente ?? "Sin cliente"} · {pregunta.unidades} unidad{pregunta.unidades === 1 ? "" : "es"}{pregunta.lote ? ` · en el lote #${pregunta.lote}` : ""}</div>
            <div className="text-xs text-[#5C6B76]">¿Marcar preparado con todo juntado? (o escribí el número otra vez)</div>
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
