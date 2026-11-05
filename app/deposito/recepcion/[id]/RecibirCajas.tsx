"use client";

// Recibir las cajas de una orden de compra al exterior (Fer, 5/11): se escanea (o se toca) la etiqueta de la caja
// (M0226-34), aparece lo que debería traer según el packing list, se corrige lo que se contó y «Recibir la caja» la deja
// entera en una ubicación con su mismo código.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Escaner, { pitido } from "@/app/deposito/Escaner";
import { VERDE, SUAVE } from "@/app/botones";
import { accionRecibirCaja } from "../acciones";

export type CajaParaRecibir = { id: number; codigo: string; recibida: boolean; items: { id: number; sku: string; cantidad: number; enSistema: boolean }[] };

export default function RecibirCajas({ recepcion, cajas }: { recepcion: number; cajas: CajaParaRecibir[] }) {
  const router = useRouter();
  const [, transicion] = useTransition();
  const campo = useRef<HTMLInputElement>(null);
  const [caja, setCaja] = useState<CajaParaRecibir | null>(null);
  const [cant, setCant] = useState<Record<number, string>>({});
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  function elegir(k: CajaParaRecibir) {
    if (k.recibida) { setAviso({ ok: false, mensaje: `La caja ${k.codigo} ya se recibió.` }); pitido(false); return false; }
    setCaja(k);
    setCant(Object.fromEntries(k.items.map((i) => [i.id, String(i.cantidad)])));
    setAviso(null);
    return true;
  }

  function leer(codigo: string) {
    const t = codigo.trim().toUpperCase().replace(/\s+/g, "");
    const k = cajas.find((x) => x.codigo.toUpperCase() === t || x.codigo.toUpperCase().replace("-", "") === t.replace("-", ""));
    if (!k) { setAviso({ ok: false, mensaje: `${codigo} no es una caja de esta orden.` }); pitido(false); return false; }
    return elegir(k);
  }

  async function recibir() {
    if (!caja || enviando) return;
    setEnviando(true);
    const cantidades: Record<number, number> = {};
    for (const i of caja.items) cantidades[i.id] = Math.max(0, Math.trunc(Number(String(cant[i.id] ?? i.cantidad).replace(",", ".")) || 0));
    const r = await accionRecibirCaja(recepcion, caja.id, cantidades).catch(() => ({ ok: false, mensaje: "No se pudo recibir. Probá de nuevo." }));
    setAviso(r); pitido(r.ok); setEnviando(false);
    if (r.ok) { setCaja(null); transicion(() => router.refresh()); }
    campo.current?.focus();
  }

  const pendientes = cajas.filter((k) => !k.recibida);
  return (
    <div className="space-y-3">
      <Escaner alLeer={leer} campoRef={campo} placeholder="Escaneá la etiqueta de la caja (ej. M0226-34)" />
      {aviso && (
        <p role={aviso.ok ? "status" : "alert"} className={`text-sm font-semibold rounded-lg px-3 py-2 ${aviso.ok ? "bg-[#EEF7F1] text-[#1F6E4A]" : "bg-[#FDF1EF] text-[#C03420]"}`}>
          {aviso.ok ? "✓ " : "✗ "}{aviso.mensaje}
        </p>
      )}
      {caja && (
        <div className="bg-white border-2 border-[#16577F] rounded-xl p-3 space-y-2">
          <div className="text-2xl font-black">{caja.codigo}</div>
          <p className="text-[11px] text-[#5C6B76]">Lo que dice el packing list. Corregí lo que contaste de más o de menos.</p>
          <ul className="divide-y divide-[#E3E9F0]">
            {caja.items.map((i) => (
              <li key={i.id} className="flex items-center gap-2 py-1.5">
                <span className={`flex-1 font-mono text-sm ${i.enSistema ? "" : "text-[#C03420]"}`}>{i.sku}{!i.enSistema && " (no está en el sistema)"}</span>
                <input value={cant[i.id] ?? ""} onChange={(e) => setCant({ ...cant, [i.id]: e.target.value })} inputMode="numeric" aria-label={`Cantidad de ${i.sku}`}
                  className="w-24 border-2 border-[#E3E9F0] rounded-xl px-3 py-2 text-lg font-bold text-right tabular-nums" />
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={recibir} disabled={enviando} className={`${VERDE} text-lg px-4 py-3 flex-1 disabled:opacity-60`}>{enviando ? "Recibiendo…" : "Recibir la caja"}</button>
            <button type="button" onClick={() => setCaja(null)} className={`${SUAVE} text-base px-4 py-3`}>Descartar</button>
          </div>
        </div>
      )}
      {!caja && pendientes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pendientes.map((k) => <button key={k.id} type="button" onClick={() => elegir(k)} className={`${SUAVE} font-mono`}>{k.codigo}</button>)}
        </div>
      )}
    </div>
  );
}
