"use client";

// Sube fotos de un producto (o de una de sus variaciones) directo del
// navegador a Supabase Storage, y después le pide al servidor que guarde la
// fila (guardarFotoSubida). Se pueden elegir varias a la vez.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { subirArchivo } from "@/lib/supabase-navegador";
import { SUAVE } from "@/app/botones";
import { guardarFotoSubida } from "./acciones";

export default function SubirFoto({ orgId, productoId, variacionId, texto = "Subir fotos" }: {
  orgId: string; productoId: number; variacionId?: number; texto?: string;
}) {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<string | null>(null);

  async function subir(lista: FileList | null) {
    if (!lista?.length) return;
    const fotos = Array.from(lista).filter((f) => f.type.startsWith("image/"));
    if (!fotos.length) { setEstado("Eso no es una imagen."); return; }
    for (const [i, f] of fotos.entries()) {
      setEstado(`Subiendo ${i + 1} de ${fotos.length}…`);
      const r = await subirArchivo("productos", orgId, f, `productos/${productoId}`);
      if ("motivo" in r) { setEstado(r.motivo ?? "No se pudo subir."); return; }
      const fd = new FormData();
      fd.set("producto_id", String(productoId));
      if (variacionId) fd.set("variacion_id", String(variacionId));
      fd.set("url", r.url ?? "");
      fd.set("ruta", r.ruta);
      const g = await guardarFotoSubida(fd);
      if (g.motivo) { setEstado(g.motivo); router.refresh(); return; }
    }
    setEstado(null);
    if (archivo.current) archivo.current.value = "";
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input ref={archivo} type="file" accept="image/*" multiple className="hidden" onChange={(e) => subir(e.target.files)} />
      <button type="button" className={SUAVE} disabled={!!estado?.startsWith("Subiendo")} onClick={() => archivo.current?.click()}>
        📷 {texto}
      </button>
      {estado && <span className="text-xs text-[#5C6B76]">{estado}</span>}
    </span>
  );
}
