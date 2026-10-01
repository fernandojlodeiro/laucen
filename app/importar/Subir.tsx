"use client";

// Subir un Excel: va directo del navegador a Supabase Storage (Vercel no deja
// pasar archivos grandes por el servidor) y después el servidor lo baja y lo
// lee. Si el libro tiene varias hojas, pregunta cuál.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subirArchivo } from "@/lib/supabase-navegador";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { accionLeerArchivo } from "./acciones";

const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";
const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";

export default function Subir({ organizacionId, destinos }: { organizacionId: string; destinos: { clave: string; nombre: string }[] }) {
  const router = useRouter();
  const [destino, setDestino] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [paso, setPaso] = useState<"" | "subiendo" | "leyendo">("");
  const [motivo, setMotivo] = useState("");
  // Si el libro tiene varias hojas: el archivo ya subido y las hojas para elegir.
  const [subido, setSubido] = useState<{ ruta: string; nombre: string; hojas: string[] } | null>(null);
  const [hoja, setHoja] = useState("");

  async function leer(ruta: string, nombre: string, hojaElegida?: string) {
    setPaso("leyendo");
    const r = await accionLeerArchivo({ ruta, archivo: nombre, destino, hoja: hojaElegida ?? null });
    if ("id" in r) { router.push(`/importar/${r.id}`); return; }
    setPaso("");
    if ("hojas" in r) { setSubido({ ruta, nombre, hojas: r.hojas }); setHoja(r.hojas[0]); return; }
    setMotivo(r.motivo);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMotivo("");
    if (!destino) { setMotivo("Elegí qué querés importar."); return; }
    if (subido) { await leer(subido.ruta, subido.nombre, hoja); return; }
    if (!archivo) { setMotivo("Elegí el archivo."); return; }
    if (!/\.(xlsx|csv)$/i.test(archivo.name)) { setMotivo("Tiene que ser un Excel .xlsx o un .csv (si es .xls viejo, abrilo y guardalo como .xlsx o .csv)."); return; }
    setPaso("subiendo");
    const r = await subirArchivo("importaciones", organizacionId, archivo, "importar");
    if ("motivo" in r && r.motivo) { setPaso(""); setMotivo(r.motivo); return; }
    await leer(r.ruta!, archivo.name);
  }

  const ocupado = paso !== "";
  return (
    <form onSubmit={enviar} className="bg-white border border-[#E3E9F0] rounded-xl p-3 flex flex-wrap items-end gap-3">
      <label><span className={ETIQUETA}>Qué es</span>
        <select value={destino} onChange={(e) => setDestino(e.target.value)} className={CAMPO} disabled={ocupado}>
          <option value="">Elegí…</option>
          {destinos.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
        </select></label>
      {!subido ? (
        <label><span className={ETIQUETA}>Archivo Excel (.xlsx) o .csv</span>
          <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" disabled={ocupado}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-xs" /></label>
      ) : (
        <label><span className={ETIQUETA}>El archivo tiene varias hojas: ¿cuál?</span>
          <select value={hoja} onChange={(e) => setHoja(e.target.value)} className={CAMPO} disabled={ocupado}>
            {subido.hojas.map((h) => <option key={h} value={h}>{h}</option>)}
          </select></label>
      )}
      <button disabled={ocupado} className={`${PRIMARIO} disabled:opacity-60`}>
        {paso === "subiendo" ? "Subiendo…" : paso === "leyendo" ? "Leyendo las filas…" : subido ? "Leer esa hoja" : "Subir y leer"}
      </button>
      {subido && !ocupado && <button type="button" onClick={() => { setSubido(null); setArchivo(null); }} className={SUAVE}>Otro archivo</button>}
      {motivo && <p role="alert" className="w-full text-xs rounded-lg px-3 py-2 bg-[#FDF1EF] text-[#C03420]">{motivo}</p>}
    </form>
  );
}
