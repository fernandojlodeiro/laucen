"use client";

// Sugerencia de compra: al pararse sobre el producto, un globo con la cuenta que queda en las columnas de la derecha
// (Fer, 28/10): la vía y por qué, el precio de venta y, para avión y barco, costo, ganancia y los dos porcentajes. Va fijo
// en la pantalla (no adentro de la tabla, que se desplaza y lo cortaría).

import { useState, type ReactNode } from "react";

export type Cuenta = {
  via: string; viaAyuda: string; tono: string; precio: string; precioDe: string; ml: string; flete: string; pedido: string;
  vias: { nombre: string; costo: string; ganancia: string; venta: string; costoPct: string; negativa: boolean }[];
};

const TONOS: Record<string, string> = {
  verde: "bg-[#E6F4EA] text-[#1F7A3A]", azul: "bg-[#E6EEF6] text-[#16577F]", ambar: "bg-[#FFF4D6] text-[#8a6100]", rojo: "bg-[#FBE9E7] text-[#C03420]", gris: "bg-[#EEF1F4] text-[#5C6B76]",
};

export default function Globo({ cuenta, children }: { cuenta: Cuenta; children: ReactNode }) {
  const [donde, setDonde] = useState<{ x: number; y: number } | null>(null);
  return (
    <span className="block" onMouseLeave={() => setDonde(null)}
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        // A la derecha del producto; si no entra abajo, se corre para arriba.
        setDonde({ x: Math.min(r.right + 8, window.innerWidth - 340), y: Math.min(r.top, window.innerHeight - 260) });
      }}>
      {children}
      {donde && (
        <span role="tooltip" style={{ left: donde.x, top: Math.max(8, donde.y) }}
          className="fixed z-50 block w-[330px] rounded-xl border border-[#E3E9F0] bg-white p-3 text-[11px] text-[#1E2A32] shadow-xl pointer-events-none">
          <span className="flex items-center gap-2">
            <b className={`rounded-md px-1.5 py-0.5 ${TONOS[cuenta.tono] ?? TONOS.gris}`}>{cuenta.via}</b>
            <span className="text-[#5C6B76]">flete avión {cuenta.flete} del FOB</span>
          </span>
          <span className="block mt-1 text-[#5C6B76]">{cuenta.viaAyuda}</span>
          <span className="block mt-2">Precio de venta <b>{cuenta.precio}</b> ({cuenta.precioDe}) · Mercado Libre {cuenta.ml}</span>
          <span className="mt-1.5 grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-x-2 gap-y-0.5 tabular-nums">
            <span /><span className="text-right text-[#5C6B76]">Costo</span><span className="text-right text-[#5C6B76]">Ganancia</span>
            <span className="text-right text-[#5C6B76]">s/ venta</span><span className="text-right text-[#5C6B76]">s/ costo</span>
            {cuenta.vias.map((v) => (
              <span key={v.nombre} className={`contents ${v.negativa ? "text-[#C03420]" : ""}`}>
                <b>{v.nombre}</b><span className="text-right">{v.costo}</span><span className="text-right">{v.ganancia}</span>
                <b className="text-right">{v.venta}</b><b className="text-right">{v.costoPct}</b>
              </span>
            ))}
          </span>
          <span className="block mt-2 text-[#5C6B76]">{cuenta.pedido}</span>
        </span>
      )}
    </span>
  );
}
