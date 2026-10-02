"use client";

// La parte de trabajo de una recepción: escanear el producto, decir cuántos
// (+1 / +10), la ubicación (escaneando la etiqueta de la estantería o de la
// lista; vacío = la general) y, en una devolución, si vuelve como nuevo o
// va a caja abierta. "Recibir" mueve el stock y la lista se redibuja.
// Escanear otra vez el mismo producto suma uno a la cantidad.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Escaner, { pitido } from "@/app/deposito/Escaner";
import { leerNumero } from "@/lib/numeros";
import { VERDE, SUAVE } from "@/app/botones";
import { accionBuscarProducto, accionRecibir, type ProductoLeido } from "../acciones";

type Ubicacion = { codigo: string; descripcion: string | null };
type Aviso = { ok: boolean; mensaje: string };

const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-3";
const BOTON_GRANDE = `${SUAVE} text-lg px-4 py-3 min-w-16`;

export default function Recibir({ recepcion, devolucion, ubicaciones }: { recepcion: number; devolucion: boolean; ubicaciones: Ubicacion[] }) {
  const router = useRouter();
  const [, transicion] = useTransition();
  const campo = useRef<HTMLInputElement>(null);
  const [producto, setProducto] = useState<Extract<ProductoLeido, { ok: true }> | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [ubicacion, setUbicacion] = useState("");
  const [condicion, setCondicion] = useState<"nuevo" | "caja_abierta">("nuevo");
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [enviando, setEnviando] = useState(false);

  const n = leerNumero(cantidad) ?? 0;
  const sumar = (k: number) => setCantidad(String(Math.max(1, Math.trunc(n) + k)));

  async function leerProducto(codigo: string) {
    const r = await accionBuscarProducto(codigo);
    if (!r.ok) { setAviso({ ok: false, mensaje: r.mensaje }); return false; }
    if (producto && producto.id === r.id) sumar(1);
    else { setProducto(r); setCantidad("1"); setCondicion("nuevo"); }
    setAviso(null);
    return true;
  }

  function leerUbicacion(codigo: string) {
    const u = ubicaciones.find((x) => x.codigo.toLowerCase() === codigo.trim().toLowerCase());
    if (!u) { setAviso({ ok: false, mensaje: `El depósito no tiene la ubicación ${codigo}.` }); return false; }
    setUbicacion(u.codigo);
    setAviso(null);
    campo.current?.focus();
    return true;
  }

  async function confirmar() {
    if (!producto || enviando) return;
    setEnviando(true);
    try {
      const r = await accionRecibir(recepcion, { codigo: producto.sku, cantidad: n, ubicacion, condicion });
      setAviso(r);
      pitido(r.ok);
      if (r.ok) {
        setProducto(null);
        setCantidad("1");
        transicion(() => router.refresh());
      }
    } catch {
      setAviso({ ok: false, mensaje: "No se pudo recibir. Probá de nuevo." });
      pitido(false);
    } finally {
      setEnviando(false);
      campo.current?.focus();
    }
  }

  return (
    <div className="space-y-3">
      <Escaner alLeer={leerProducto} campoRef={campo} placeholder="Escaneá el producto" />

      {aviso && (
        <p role={aviso.ok ? "status" : "alert"}
          className={`text-sm font-semibold rounded-lg px-3 py-2 ${aviso.ok ? "bg-[#EEF7F1] text-[#1F6E4A]" : "bg-[#FDF1EF] text-[#C03420]"}`}>
          {aviso.ok ? "✓ " : "✗ "}{aviso.mensaje}
        </p>
      )}

      {producto && (
        <div className={`${CAJA} border-2 border-[#16577F] space-y-3`}>
          <div className="flex gap-3">
            {producto.foto
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={producto.foto} alt="" className="w-20 h-20 object-contain rounded-lg border border-[#E3E9F0] shrink-0" />
              : <div className="w-20 h-20 rounded-lg border border-[#E3E9F0] bg-[#FAFBFC] shrink-0" />}
            <div className="min-w-0">
              <div className="text-base font-bold break-all">{producto.sku}</div>
              <div className="text-sm leading-snug">{producto.titulo}</div>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[#5C6B76] mb-1">Cantidad</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => sumar(-1)} className={BOTON_GRANDE} aria-label="Uno menos">−1</button>
              <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="numeric" aria-label="Cantidad"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmar(); } }}
                className="w-24 border-2 border-[#E3E9F0] rounded-xl px-3 py-2.5 text-2xl font-bold text-right tabular-nums" />
              <button type="button" onClick={() => sumar(1)} className={BOTON_GRANDE}>+1</button>
              <button type="button" onClick={() => sumar(10)} className={BOTON_GRANDE}>+10</button>
            </div>
          </div>

          {condicion === "nuevo" && (
            <div>
              <div className="text-[11px] font-semibold text-[#5C6B76] mb-1">
                Ubicación: <b className="text-base text-[#16577F]">{ubicacion || "general"}</b>
              </div>
              <Escaner alLeer={leerUbicacion} autoFoco={false} devolverFoco={false} chico placeholder="Escaneá la etiqueta de la ubicación" />
              <select value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} aria-label="Ubicación"
                className="mt-2 w-full border border-[#E3E9F0] rounded-lg px-2 py-2.5 text-base bg-white">
                <option value="">General</option>
                {ubicaciones.map((u) => <option key={u.codigo} value={u.codigo}>{u.codigo}{u.descripcion ? ` — ${u.descripcion}` : ""}</option>)}
              </select>
            </div>
          )}

          {devolucion && (
            <fieldset>
              <legend className="text-[11px] font-semibold text-[#5C6B76] mb-1">¿Vuelve a la venta como nuevo o va a caja abierta?</legend>
              <div className="grid grid-cols-2 gap-2">
                {([["nuevo", "Como nuevo"], ["caja_abierta", "Caja abierta"]] as const).map(([k, t]) => (
                  <label key={k} className={`flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-base ${condicion === k ? "border-[#16577F] bg-[#EEF3F8]" : "border-[#E3E9F0]"}`}>
                    <input type="radio" name="condicion" checked={condicion === k} onChange={() => setCondicion(k)} className="h-5 w-5 accent-[#16577F]" />{t}
                  </label>
                ))}
              </div>
              {condicion === "caja_abierta" && <p className="text-[11px] text-[#5C6B76] mt-1">Va a la ubicación general del depósito de caja abierta.</p>}
            </fieldset>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={confirmar} disabled={enviando || n < 1}
              className={`${VERDE} text-lg px-4 py-3 flex-1 disabled:opacity-60`}>
              {enviando ? "Recibiendo…" : `Recibir ${n >= 1 ? Math.trunc(n) : ""}`}
            </button>
            <button type="button" onClick={() => { setProducto(null); campo.current?.focus(); }} className={`${SUAVE} text-base px-4 py-3`}>Descartar</button>
          </div>
        </div>
      )}
    </div>
  );
}
