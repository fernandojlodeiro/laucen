"use client";

// Sube el comprobante de pago de un pedido (foto o PDF) directo del navegador al bucket privado
// «comprobantes» y le pide al servidor que lo anote en el pedido.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { subirArchivo } from "@/lib/supabase-navegador";
import { SUAVE } from "@/app/botones";
import { guardarComprobantePago } from "./acciones";

export default function SubirComprobante({ orgId, pedidoId }: { orgId: string; pedidoId: number }) {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<string | null>(null);

  async function subir(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/") && f.type !== "application/pdf") { setEstado("Tiene que ser una foto o un PDF."); return; }
    setEstado("Subiendo…");
    const r = await subirArchivo("comprobantes", orgId, f, `pedidos/${pedidoId}`);
    if ("motivo" in r) { setEstado(r.motivo ?? "No se pudo subir."); return; }
    const fd = new FormData();
    fd.set("pedido_id", String(pedidoId));
    fd.set("ruta", r.ruta);
    fd.set("nombre", f.name.slice(0, 120));
    fd.set("tipo", f.type);
    const g = await guardarComprobantePago(fd);
    setEstado(g.motivo ?? null);
    if (archivo.current) archivo.current.value = "";
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input ref={archivo} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
      <button type="button" className={SUAVE} disabled={estado === "Subiendo…"} onClick={() => archivo.current?.click()}>📎 Subir comprobante</button>
      {estado && <span className="text-xs text-[#5C6B76]">{estado}</span>}
    </span>
  );
}
