"use client";

// "Cancelar pedido" en una venta de Mercado Libre (Fer, 6/10): Laucen no la
// cancela; explica que se cancela desde Mercado Libre y que Laucen lee el
// cambio solo (el pedido queda cancelado y el stock vuelve).

import { useState } from "react";
import { BORRAR, SUAVE } from "@/app/botones";

export default function CancelarMl({ enlace }: { enlace: string | null }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <button type="button" onClick={() => setAbierto(true)} className={BORRAR}>Cancelar pedido</button>;
  return (
    <div role="status" className="rounded-xl border border-[#E3E9F0] bg-[#FAFBFC] p-3 text-xs grid gap-2">
      <p>
        <b>Las ventas de Mercado Libre se cancelan desde Mercado Libre.</b> Cancelala ahí y Laucen lee el cambio enseguida:
        el pedido queda cancelado y el stock reservado vuelve, como si la venta no hubiera existido.
      </p>
      <span className="flex flex-wrap gap-2">
        {enlace && <a href={enlace} target="_blank" rel="noopener noreferrer" className={SUAVE}>Abrir la venta en Mercado Libre ↗</a>}
        <button type="button" onClick={() => setAbierto(false)} className={SUAVE}>Cerrar</button>
      </span>
    </div>
  );
}
