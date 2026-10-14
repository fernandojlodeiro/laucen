"use client";

// El informe «Seguimientos totales» de Virtual Seller: va directo del navegador a Storage y la importación corre de fondo
// (al terminar, el cartel de abajo a la derecha y la pantalla se actualiza sola).

import { useState } from "react";
import { subirArchivo } from "@/lib/supabase-navegador";
import { PRIMARIO } from "@/app/botones";
import { avisarTareaLanzada } from "@/app/componentes/TareasFondo";
import { accionImportarSeguimientosVs } from "./acciones";

export default function SubirSeguimientosVs({ organizacionId }: { organizacionId: string }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [paso, setPaso] = useState("");
  const [motivo, setMotivo] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMotivo("");
    if (!archivo) { setMotivo("Elegí el archivo."); return; }
    setPaso("Subiendo…");
    const r = await subirArchivo("importaciones", organizacionId, archivo, "seguimientos");
    if ("motivo" in r && r.motivo) { setPaso(""); setMotivo(r.motivo); return; }
    setPaso("Leyendo el archivo…");
    const x = await accionImportarSeguimientosVs({ ruta: r.ruta!, nombre: archivo.name }).catch(() => ({ ok: false, mensaje: "No se pudo empezar. Probá de nuevo." }));
    setPaso("");
    if (!x.ok) { setMotivo(x.mensaje ?? "No se pudo empezar."); return; }
    avisarTareaLanzada();
    setArchivo(null);
    (e.target as HTMLFormElement).reset();
  }

  return (
    <form onSubmit={enviar} className="bg-white border border-[#E3E9F0] rounded-xl p-3 flex flex-wrap items-center gap-3">
      <input type="file" accept=".xls,.xlsx,.html,.htm" disabled={!!paso} className="text-xs" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      <button disabled={!!paso} className={`${PRIMARIO} disabled:opacity-60`}>{paso ? "Trabajando…" : "Importar"}</button>
      {paso && <span className="text-xs text-[#5C6B76]">{paso}</span>}
      {motivo && <span className="text-xs text-[#C03420]">{motivo}</span>}
    </form>
  );
}
