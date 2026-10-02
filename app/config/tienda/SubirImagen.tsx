"use client";

// Logo o banner de la tienda: se sube directo del navegador al bucket
// público "productos" (carpeta "tienda") y el formulario guarda el link.

import { useState } from "react";
import { subirArchivo } from "@/lib/supabase-navegador";
import { SUAVE, BORRAR } from "@/app/botones";

export default function SubirImagen({ name, valor, organizacionId, etiqueta, alto = "h-16" }: {
  name: string; valor: string | null; organizacionId: string; etiqueta: string; alto?: string;
}) {
  const [link, setLink] = useState(valor ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) { setMotivo("Tiene que ser una imagen (JPG, PNG o WebP)."); return; }
    setSubiendo(true); setMotivo(null);
    const r = await subirArchivo("productos", organizacionId, archivo, "tienda");
    setSubiendo(false);
    if ("motivo" in r) setMotivo(r.motivo ?? null); else if (r.url) setLink(r.url);
  }

  return (
    <div>
      <input type="hidden" name={name} value={link} />
      {link
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={link} alt={etiqueta} className={`${alto} max-w-full object-contain rounded border border-[#E3E9F0] bg-[#FAFBFC] mb-1`} />
        : <p className="text-[11px] text-[#5C6B76] mb-1">Sin {etiqueta.toLowerCase()}.</p>}
      <div className="flex flex-wrap gap-1">
        <label className={`${SUAVE} cursor-pointer ${subiendo ? "opacity-60" : ""}`}>
          {subiendo ? "Subiendo…" : link ? "Cambiar" : "Subir imagen"}
          <input type="file" accept="image/*" onChange={elegir} disabled={subiendo} className="hidden" />
        </label>
        {link && <button type="button" onClick={() => setLink("")} className={BORRAR}>Quitar</button>}
      </div>
      {motivo && <p role="alert" className="text-[11px] text-[#C03420] mt-1">{motivo}</p>}
    </div>
  );
}
