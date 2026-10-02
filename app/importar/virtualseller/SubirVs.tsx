"use client";

// Los tres archivos de Virtual Seller: van directo del navegador a Storage y
// después el servidor los lee y arma la importación.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subirArchivo } from "@/lib/supabase-navegador";
import { PRIMARIO } from "@/app/botones";
import { accionCargarVs } from "./acciones";

const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";
const CLAVES = [
  { k: "stock", t: "1. Stock por ubicación (las dos empresas)" },
  { k: "maestro", t: "2. Maestro de productos" },
  { k: "precios", t: "3. Lista de precios Lista_000" },
] as const;
type Clave = (typeof CLAVES)[number]["k"];

export default function SubirVs({ organizacionId }: { organizacionId: string }) {
  const router = useRouter();
  const [archivos, setArchivos] = useState<Partial<Record<Clave, File>>>({});
  const [paso, setPaso] = useState("");
  const [motivo, setMotivo] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMotivo("");
    if (CLAVES.some((c) => !archivos[c.k])) { setMotivo("Elegí los tres archivos."); return; }
    const subidos: Partial<Record<Clave, { ruta: string; nombre: string }>> = {};
    for (const c of CLAVES) {
      setPaso(`Subiendo ${c.t.slice(3).toLowerCase()}…`);
      const f = archivos[c.k]!;
      const r = await subirArchivo("importaciones", organizacionId, f, "virtualseller");
      if ("motivo" in r && r.motivo) { setPaso(""); setMotivo(r.motivo); return; }
      subidos[c.k] = { ruta: r.ruta!, nombre: f.name };
    }
    setPaso("Leyendo los archivos y trayendo las publicaciones de Mercado Libre… (puede tardar un minuto)");
    const r = await accionCargarVs(subidos as Record<Clave, { ruta: string; nombre: string }>);
    if ("id" in r) { router.push(`/importar/virtualseller/${r.id}`); return; }
    setPaso("");
    setMotivo(r.motivo);
  }

  return (
    <form onSubmit={enviar} className="bg-white border border-[#E3E9F0] rounded-xl p-3 grid gap-3">
      <div className="grid sm:grid-cols-3 gap-3">
        {CLAVES.map((c) => (
          <label key={c.k}><span className={ETIQUETA}>{c.t}</span>
            <input type="file" accept=".xlsx,.xls,.csv" disabled={!!paso} className="text-xs w-full"
              onChange={(e) => setArchivos((a) => ({ ...a, [c.k]: e.target.files?.[0] }))} /></label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={!!paso} className={`${PRIMARIO} disabled:opacity-60`}>{paso ? "Trabajando…" : "Subir y analizar"}</button>
        {paso && <span className="text-xs text-[#5C6B76]">{paso}</span>}
        {motivo && <span className="text-xs text-[#C03420]">{motivo}</span>}
      </div>
    </form>
  );
}
