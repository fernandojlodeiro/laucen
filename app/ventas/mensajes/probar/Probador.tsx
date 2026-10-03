"use client";
// El probador: un chat con aspecto de WhatsApp donde vos sos el cliente.

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CasoVista, MensajeVista } from "@/lib/mensajes/bandeja-tipos";
import { accionProbar, accionProbarDeNuevo } from "../acciones";

export default function Probador({ nombreIa, iaActiva, mensajes, casos }: { nombreIa: string; iaActiva: boolean; mensajes: MensajeVista[]; casos: CasoVista[] }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [preguntaBorrar, setPreguntaBorrar] = useState(false);
  const [cargando, empezar] = useTransition();
  const fondo = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { fondo.current?.scrollTo({ top: fondo.current.scrollHeight }); }, [mensajes.length, pendiente]);
  useLayoutEffect(() => {
    const t = caja.current; if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight + 2, 140)}px`;
    t.style.overflowY = t.scrollHeight + 2 > 140 ? "auto" : "hidden";
  }, [texto]);

  async function enviar() {
    const t = texto.trim();
    if (!t || pendiente) return;
    setPendiente(t); setTexto(""); setAviso(null);
    const r = await accionProbar(t);
    if (!r.ok) setAviso(r.error); else if (r.motivo) setAviso(`No contestó: ${r.motivo}`);
    empezar(() => { router.refresh(); });
    setPendiente(null);
  }

  return (
    <div className="max-w-xl mx-auto bg-white border border-[#E3E9F0] rounded-xl overflow-hidden flex flex-col h-[calc(100dvh-14rem)] min-h-[420px]">
      <header className="flex items-center gap-2 px-3 py-2 bg-[#075E54] text-white">
        <span className="h-8 w-8 rounded-full bg-white/20 grid place-items-center text-sm">🤖</span>
        <div className="flex-1">
          <div className="text-sm font-bold">{nombreIa}</div>
          <div className="text-[11px] opacity-80">{iaActiva ? "Prueba: vos sos el cliente" : "Está apagada (Configuración)"}</div>
        </div>
        {preguntaBorrar ? (
          <span className="flex items-center gap-1 text-xs">
            ¿Borrar la prueba?
            <button type="button" className="rounded-lg px-2 py-1 bg-white text-[#C03420] font-bold" onClick={async () => { await accionProbarDeNuevo(); setPreguntaBorrar(false); router.refresh(); }}>Sí</button>
            <button type="button" className="rounded-lg px-2 py-1 bg-white/20 font-bold" onClick={() => setPreguntaBorrar(false)}>No</button>
          </span>
        ) : (
          <button type="button" className="rounded-lg px-2 py-1 bg-white/20 text-xs font-bold" onClick={() => setPreguntaBorrar(true)}>Empezar de nuevo</button>
        )}
      </header>
      {casos.map((k) => <p key={k.id} className="text-[11px] bg-[#FDF6EC] text-[#8a6100] px-3 py-1.5 border-b border-[#F2D9B8]">⏳ Pasó a una persona: {k.asunto}</p>)}
      <div ref={fondo} className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 bg-[#EFEAE2]">
        {!mensajes.length && !pendiente && <p className="text-center text-xs text-[#5C6B76] mt-8">Escribí lo que te preguntaría un cliente: “¿tienen auriculares bluetooth?”, “¿cuánto sale el envío?”, “¿dónde está mi pedido 25?”.</p>}
        {mensajes.map((m) => (
          <div key={m.id} className={`flex ${m.clase === "entrante" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs shadow-sm whitespace-pre-wrap break-words ${m.clase === "entrante" ? "bg-[#D9FDD3]" : "bg-white"}`}>
              {m.texto}
              {m.clase === "ia" && m.usd > 0 && <div className="text-[10px] text-[#5C6B76] text-right mt-0.5">US$ {m.usd.toFixed(3)}</div>}
            </div>
          </div>
        ))}
        {pendiente && (
          <>
            <div className="flex justify-end"><div className="max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs shadow-sm bg-[#D9FDD3] whitespace-pre-wrap">{pendiente}</div></div>
            <div className="flex justify-start"><div className="rounded-lg px-2.5 py-1.5 text-xs shadow-sm bg-white text-[#5C6B76]">escribiendo…</div></div>
          </>
        )}
        {cargando && !pendiente && <p className="text-center text-[11px] text-[#5C6B76]">…</p>}
      </div>
      <footer className="border-t border-[#E3E9F0] p-2 bg-[#F0F2F5]">
        {aviso && <p className="text-xs text-[#8a6100] mb-1">{aviso}</p>}
        <div className="flex items-end gap-2">
          <textarea ref={caja} value={texto} onChange={(e) => setTexto(e.target.value)} rows={1} placeholder="Escribí como cliente…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
            className="flex-1 resize-none border border-[#E3E9F0] rounded-lg px-2 py-2 text-xs bg-white overflow-hidden" />
          <button type="button" onClick={enviar} disabled={!!pendiente || !texto.trim()} className="text-xs font-bold rounded-lg px-3 py-2 bg-[#167655] text-white disabled:opacity-50">Enviar</button>
        </div>
      </footer>
    </div>
  );
}
