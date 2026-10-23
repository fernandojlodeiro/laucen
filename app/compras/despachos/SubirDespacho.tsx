"use client";

// «Subir despacho (PDF)» (Fer, 23/10): arriba a la derecha de la lista. Se elige el PDF y listo: va del navegador a
// Storage, la IA lo lee y se crea el despacho en borrador con todo lo leído; después se abre para revisarlo.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subirArchivo } from "@/lib/supabase-navegador";
import { PRIMARIO } from "@/app/botones";
import { accionCrearDespachoDesdePdf } from "./acciones";

export default function SubirDespacho({ organizacionId }: { organizacionId: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState("");
  const [motivo, setMotivo] = useState("");

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setMotivo("");
    if (!/\.pdf$/i.test(archivo.name)) { setMotivo("Tiene que ser el PDF del despacho."); return; }
    setTrabajando("Subiendo…");
    const sub = await subirArchivo("importaciones", organizacionId, archivo, "despachos");
    if ("motivo" in sub && sub.motivo) { setTrabajando(""); setMotivo(sub.motivo); return; }
    setTrabajando("Leyendo con la IA…");
    const r = await accionCrearDespachoDesdePdf({ ruta: sub.ruta!, archivo: archivo.name });
    if ("motivo" in r) { setTrabajando(""); setMotivo(r.motivo); if (entrada.current) entrada.current.value = ""; return; }
    router.push(`/compras/despachos/${r.id}?ok=${encodeURIComponent(`Despacho creado desde el PDF. ${r.ok}`)}`);
  }

  return (
    <span className="relative inline-flex flex-col items-end">
      <input ref={entrada} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
      <button type="button" disabled={!!trabajando} onClick={() => entrada.current?.click()} className={`${PRIMARIO} disabled:opacity-60`}>
        {trabajando || "Subir despacho (PDF)"}
      </button>
      {trabajando === "Leyendo con la IA…" && <span className="text-[10px] text-[#5C6B76] mt-0.5">Tarda alrededor de un minuto.</span>}
      {motivo && <span role="alert" className="absolute top-full right-0 mt-1 z-10 w-72 text-xs rounded-lg px-3 py-2 bg-[#FDF1EF] text-[#C03420] shadow">{motivo}</span>}
    </span>
  );
}
