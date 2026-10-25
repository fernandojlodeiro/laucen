"use client";

// «Agregar envío sin cargo» en la ficha del pedido (Fer, 25/10; lib/pedidos/envio.ts): un pedido que
// retiraba pasa a mandarse. Se abre ahí mismo (la vista no salta) y el «listo» sale en el mismo lugar.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ElegirProvincia from "@/app/componentes/ElegirProvincia";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { accionAgregarEnvio } from "./acciones";
import type { DireccionEnvio } from "@/lib/pedidos/envio";

const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white w-full";
const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";

export default function AgregarEnvio({ pid, metodos, inicial }: { pid: number; metodos: { id: number; nombre: string }[]; inicial: Partial<DireccionEnvio> }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [metodo, setMetodo] = useState(metodos[0]?.id ?? 0);
  const [d, setD] = useState<DireccionEnvio>({ calle: "", numero: "", piso: "", localidad: "", provincia: "", codigo_postal: "", recibe: "", telefono: "", ...inicial });
  const [aviso, setAviso] = useState<{ ok?: string; error?: string } | null>(null);
  const [grabando, grabar] = useTransition();
  const campo = (k: keyof DireccionEnvio, etiqueta: string, clase = "") => (
    <label className={clase}><span className={ETIQUETA}>{etiqueta}</span>
      <input value={d[k]} onChange={(e) => setD((x) => ({ ...x, [k]: e.target.value }))} className={CAMPO} /></label>
  );
  const guardar = () => grabar(async () => {
    const r = await accionAgregarEnvio(pid, metodo, d);
    setAviso(r);
    if (r.ok) { setAbierto(false); router.refresh(); }
  });

  return (
    <div className="mt-3 pt-3 border-t border-[#E3E9F0] text-xs grid gap-2">
      {aviso && <p role={aviso.error ? "alert" : "status"} className={`rounded-lg px-3 py-2 ${aviso.error ? "bg-[#FDF1EF] text-[#C03420]" : "bg-[#EEF7F1] text-[#1F6E4A]"}`}>{aviso.error ?? aviso.ok}</p>}
      {!abierto ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[#5C6B76]">Retira en el local. Si pide que se lo mandemos:</span>
          <button type="button" className={SUAVE} onClick={() => { setAviso(null); setAbierto(true); }}>🚚 Agregar envío sin cargo</button>
        </div>
      ) : (
        <div className="rounded-xl border border-[#C9D3DD] bg-[#FAFBFC] p-3 grid gap-2">
          <div className="flex items-center justify-between">
            <b className="text-sm">Agregar envío sin cargo</b>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="h-6 w-6 rounded-full text-[#5C6B76] hover:bg-[#E3E9F0] leading-none">×</button>
          </div>
          <p className="text-[#5C6B76]">El total del pedido no cambia. Con la dirección cargada, aparece «Despachar por OCA».</p>
          <label><span className={ETIQUETA}>Cómo se manda</span>
            <select value={metodo} onChange={(e) => setMetodo(Number(e.target.value))} className={CAMPO}>
              {metodos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select></label>
          <div className="grid grid-cols-6 gap-2">
            {campo("calle", "Calle", "col-span-3")}{campo("numero", "Número")}{campo("piso", "Piso / depto", "col-span-2")}
          </div>
          <div className="grid grid-cols-6 gap-2">
            {campo("localidad", "Localidad", "col-span-3")}
            <label className="col-span-2"><span className={ETIQUETA}>Provincia</span>
              <ElegirProvincia valor={d.provincia || undefined} alCambiar={(x) => setD((y) => ({ ...y, provincia: x }))} /></label>
            {campo("codigo_postal", "CP")}
          </div>
          <div className="grid grid-cols-2 gap-2">{campo("recibe", "Recibe")}{campo("telefono", "Teléfono")}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${PRIMARIO} disabled:opacity-60`} disabled={grabando || !metodo} onClick={guardar}>{grabando ? "Grabando…" : "Agregar el envío"}</button>
            <button type="button" className={SUAVE} disabled={grabando} onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
