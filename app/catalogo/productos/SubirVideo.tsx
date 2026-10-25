"use client";

// Sube el video de un producto directo del navegador a Supabase Storage (bucket público
// videos_tienda, hasta 200 MB) y le pide al servidor que lo guarde en el producto. Se ve en la
// ficha de la tienda, después de la primera foto. Uno por producto: subir otro lo reemplaza.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { subirArchivo } from "@/lib/supabase-navegador";
import { SUAVE } from "@/app/botones";
import { guardarVideoSubido } from "./acciones";

const MAX_MB = 200;

export default function SubirVideo({ orgId, productoId, hay }: { orgId: string; productoId: number; hay: boolean }) {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<string | null>(null);

  async function subir(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("video/")) { setEstado("Eso no es un video."); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setEstado(`El video pesa más de ${MAX_MB} MB: achicalo y probá de nuevo.`); return; }
    setEstado("Subiendo el video… (puede tardar)");
    const r = await subirArchivo("videos_tienda", orgId, f, `productos/${productoId}`);
    if ("motivo" in r) { setEstado(r.motivo ?? "No se pudo subir."); return; }
    const fd = new FormData();
    fd.set("producto_id", String(productoId));
    fd.set("url", r.url ?? "");
    fd.set("ruta", r.ruta);
    const g = await guardarVideoSubido(fd);
    setEstado(g.motivo ?? null);
    if (archivo.current) archivo.current.value = "";
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input ref={archivo} type="file" accept="video/*" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
      <button type="button" className={SUAVE} disabled={!!estado?.startsWith("Subiendo")} onClick={() => archivo.current?.click()}>
        🎬 {hay ? "Cambiar el video" : "Subir video"}
      </button>
      {estado && <span className="text-xs text-[#5C6B76]">{estado}</span>}
    </span>
  );
}
