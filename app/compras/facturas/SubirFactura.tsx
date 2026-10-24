"use client";

// «Subir factura» (Fer, 23/10): arriba a la derecha de Facturas de compra. Se elige el PDF (o la foto) y va del navegador a
// Storage; la IA la lee, se crea la factura (registrada si el proveedor ya tiene cuenta de gasto) y se abre.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subirArchivo } from "@/lib/supabase-navegador";
import { PRIMARIO } from "@/app/botones";
import { accionSubirFactura } from "./acciones";

export default function SubirFactura({ organizacionId }: { organizacionId: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState("");
  const [motivo, setMotivo] = useState("");

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setMotivo("");
    if (!/\.(pdf|png|jpe?g|webp)$/i.test(archivo.name)) { setMotivo("Tiene que ser el PDF de la factura (o una foto en JPG o PNG)."); return; }
    setTrabajando("Subiendo…");
    const sub = await subirArchivo("importaciones", organizacionId, archivo, "facturas");
    if ("motivo" in sub && sub.motivo) { setTrabajando(""); setMotivo(sub.motivo); return; }
    setTrabajando("Leyendo con la IA…");
    const r = await accionSubirFactura({ ruta: sub.ruta!, archivo: archivo.name, tipo: archivo.type });
    if ("motivo" in r) { setTrabajando(""); setMotivo(r.motivo); if (entrada.current) entrada.current.value = ""; return; }
    router.push(`/compras/facturas/${r.id}?ok=${encodeURIComponent(r.ok)}`);
  }

  return (
    <span className="relative inline-flex flex-col items-end">
      <input ref={entrada} type="file" accept=".pdf,application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
      <button type="button" disabled={!!trabajando} onClick={() => entrada.current?.click()} className={`${PRIMARIO} disabled:opacity-60`}>
        {trabajando || "Subir factura"}
      </button>
      {trabajando === "Leyendo con la IA…" && <span className="text-[10px] text-[#5C6B76] mt-0.5">Tarda menos de un minuto.</span>}
      {motivo && <span role="alert" className="absolute top-full right-0 mt-1 z-10 w-72 text-xs rounded-lg px-3 py-2 bg-[#FDF1EF] text-[#C03420] shadow">{motivo}</span>}
    </span>
  );
}
