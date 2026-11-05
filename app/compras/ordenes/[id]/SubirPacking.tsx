"use client";

// Subir el packing list de la orden (Excel del proveedor): cada caja con su número, peso, volumen y contenido.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subirArchivo } from "@/lib/supabase-navegador";
import { PRIMARIO } from "@/app/botones";
import { accionSubirPacking } from "../acciones";

export default function SubirPacking({ organizacionId, ordenId, reemplaza }: { organizacionId: string; ordenId: number; reemplaza: boolean }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string; avisos: string[] } | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!archivo) { setResultado({ ok: false, texto: "Elegí el packing list.", avisos: [] }); return; }
    if (!/\.xlsx$/i.test(archivo.name)) { setResultado({ ok: false, texto: "Tiene que ser un Excel .xlsx.", avisos: [] }); return; }
    setTrabajando(true); setResultado(null);
    const sub = await subirArchivo("importaciones", organizacionId, archivo, "packing");
    if ("motivo" in sub && sub.motivo) { setResultado({ ok: false, texto: sub.motivo, avisos: [] }); setTrabajando(false); return; }
    const r = await accionSubirPacking({ ordenId, ruta: sub.ruta!, archivo: archivo.name });
    setTrabajando(false);
    if ("motivo" in r) { setResultado({ ok: false, texto: r.motivo, avisos: [] }); return; }
    setResultado({ ok: true, texto: `${r.cajas} cajas, ${r.unidades} unidades.`, avisos: r.avisos });
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-end gap-3">
      <label className="text-xs"><span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">{reemplaza ? "Reemplazar el packing list (.xlsx)" : "Packing list del proveedor (.xlsx)"}</span>
        <input type="file" accept=".xlsx" disabled={trabajando} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-xs" /></label>
      <button disabled={trabajando} className={`${PRIMARIO} disabled:opacity-60`}>{trabajando ? "Leyendo…" : "Subir y leer"}</button>
      {resultado && (
        <div className={`w-full text-xs rounded-lg px-3 py-2 ${resultado.ok ? "bg-[#EEF8F1] text-[#1F7A3A]" : "bg-[#FDF1EF] text-[#C03420]"}`}>
          {resultado.texto}
          {resultado.avisos.length > 0 && <ul className="mt-1 text-[#8a6100] list-disc pl-4">{resultado.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
        </div>
      )}
    </form>
  );
}
