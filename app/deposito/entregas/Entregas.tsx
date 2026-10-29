"use client";
// La lista de Entregas en el local (page.tsx): buscar por número de pedido o cliente, tocar uno y sacarle la foto al
// conforme. El «listo» queda flotando abajo, donde está el ojo, aunque el pedido salga de la lista al entregarse.

import { useState } from "react";
import SubirArchivo from "@/app/ventas/pedidos/[id]/SubirArchivo";

export type PedidoAEntregar = {
  id: number; id_externo: string | null; canal: string; cliente: string | null; a_cobrar: boolean; total_ars: number;
  fecha: string; productos: string[]; con_conforme: boolean;
};

const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-3";
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pesos = (n: number) => `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

export default function Entregas({ orgId, pedidos }: { orgId: string; pedidos: PedidoAEntregar[] }) {
  const [busca, setBusca] = useState("");
  const [elegido, setElegido] = useState<number | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);
  const q = plano(busca.trim().replace(/^#/, ""));
  const visibles = q ? pedidos.filter((p) => String(p.id).includes(q) || (p.id_externo ?? "").includes(q) || plano(p.cliente ?? "").includes(q)) : pedidos;

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">Buscar por número de pedido o cliente</span>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por N.º de pedido o cliente…" inputMode="search"
          className="w-full rounded-xl border border-[#E3E9F0] px-4 py-3 text-base" />
      </label>
      {visibles.length === 0 && (
        <p className={`${CAJA} text-sm text-[#5C6B76]`}>{pedidos.length ? "No hay ningún pedido preparado con esa búsqueda." : "No hay pedidos preparados esperando que los vengan a buscar."}</p>
      )}
      {visibles.map((p) => {
        const abierto = elegido === p.id;
        return (
          <div key={p.id} className={`${CAJA} ${abierto ? "border-[#16577F]" : ""}`}>
            <button type="button" onClick={() => setElegido(abierto ? null : p.id)} aria-expanded={abierto} className="w-full text-left">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold text-[#16577F]">#{p.id}</span>
                <span className="text-xs text-[#5C6B76]">{p.fecha} · {p.canal}</span>
              </span>
              <span className="block text-base font-semibold">{p.cliente ?? "Sin cliente"}</span>
              <span className="block text-sm text-[#5C6B76] truncate">{p.productos.join(" · ")}</span>
              <span className="flex flex-wrap gap-2 mt-1">
                {p.a_cobrar && <span className="rounded-full bg-[#FFE7B3] text-[#6B4A00] text-xs font-bold px-2 py-0.5">A cobrar {pesos(p.total_ars)}</span>}
                {p.con_conforme && <span className="rounded-full bg-[#E8F5EE] text-[#167655] text-xs font-bold px-2 py-0.5">Ya tiene un conforme</span>}
              </span>
            </button>
            {abierto && (
              <div className="mt-3 space-y-2">
                {p.a_cobrar && <p className="text-sm text-[#8a6100]">Este pedido se cobra al entregar: después de la foto, registrá el cobro en el pedido.</p>}
                <SubirArchivo orgId={orgId} pedidoId={p.id} clase="retiro" grande alTerminar={(texto, ok) => { setAviso({ texto: `#${p.id}: ${texto}`, ok }); if (ok) setElegido(null); }} />
              </div>
            )}
          </div>
        );
      })}
      {aviso && (
        <div role="status" className={`fixed inset-x-3 bottom-20 md:bottom-12 z-50 mx-auto max-w-xl rounded-xl px-4 py-3 text-sm shadow-lg flex items-start justify-between gap-3 ${aviso.ok ? "bg-[#E8F5EE] text-[#0F5A40] border border-[#BFE3D0]" : "bg-[#FDECEA] text-[#8A2416] border border-[#F2C2BB]"}`}>
          <span>{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} className="rounded-lg border border-current/30 px-2 py-0.5 text-xs font-bold">Cerrar</button>
        </div>
      )}
    </div>
  );
}
