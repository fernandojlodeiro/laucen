"use client";

// El video va directo del navegador a Storage (Vercel corta los envíos de más de ~4 MB) y después se anota en Laucen.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subirVideo } from "@/lib/supabase-navegador";
import { PRIMARIO } from "@/app/botones";
import { accionRegistrarVideo } from "./actions";

export default function SubirVideo({ organizacionId }: { organizacionId: string }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [paso, setPaso] = useState("");
  const [motivo, setMotivo] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMotivo("");
    if (!archivo) { setMotivo("Elegí el video."); return; }
    setPaso(`Subiendo ${archivo.name} (${(archivo.size / 1048576).toFixed(1)} MB)… no cierres la pantalla.`);
    const r = await subirVideo(organizacionId, archivo);
    if ("motivo" in r) { setPaso(""); setMotivo(r.motivo ?? "No se pudo subir el video."); return; }
    const g = await accionRegistrarVideo({ ruta: r.ruta, nombre: archivo.name, bytes: archivo.size, tipo: archivo.type, url: r.url, vence: r.vence });
    setPaso("");
    if ("motivo" in g) { setMotivo("motivo" in g && g.motivo ? g.motivo : "No se pudo anotar el video."); return; }
    setArchivo(null);
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-center gap-2">
      <input type="file" accept="video/*,.mov,.mp4" disabled={!!paso} className="text-xs" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      <button disabled={!!paso} className={`${PRIMARIO} disabled:opacity-60`}>{paso ? "Trabajando…" : "Subir video"}</button>
      {paso && <span className="text-xs text-[#5C6B76]">{paso}</span>}
      {motivo && <span className="text-xs text-[#C03420]">{motivo}</span>}
    </form>
  );
}
