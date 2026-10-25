"use client";

// Varias imágenes de una vez para el alta de banners: se suben directo del
// navegador al bucket público "productos" (carpeta "tienda/banners") y el
// formulario manda un link por imagen (cada una queda como un banner).

import { useState } from "react";
import { subirArchivo } from "@/lib/supabase-navegador";
import { SUAVE } from "@/app/botones";

export default function SubirVarias({ name, organizacionId }: { name: string; organizacionId: string }) {
  const [links, setLinks] = useState<string[]>([]);
  const [subiendo, setSubiendo] = useState(0);
  const [motivo, setMotivo] = useState<string | null>(null);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = [...(e.target.files ?? [])];
    e.target.value = "";
    const imagenes = archivos.filter((a) => a.type.startsWith("image/"));
    setMotivo(imagenes.length < archivos.length ? "Algún archivo no era una imagen (JPG, PNG o WebP) y quedó afuera." : null);
    setSubiendo(imagenes.length);
    for (const a of imagenes) {
      const r = await subirArchivo("productos", organizacionId, a, "tienda/banners");
      if ("motivo" in r) setMotivo(r.motivo ?? null); else if (r.url) setLinks((l) => [...l, r.url!]);
      setSubiendo((n) => n - 1);
    }
  }

  return (
    <div>
      {links.map((l) => <input key={l} type="hidden" name={name} value={l} />)}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {links.map((l) => (
            <span key={l} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l} alt="" className="h-16 aspect-[3/1] object-cover rounded border border-[#E3E9F0] bg-[#FAFBFC]" />
              <button type="button" onClick={() => setLinks((x) => x.filter((y) => y !== l))} aria-label="Sacar esta imagen" title="Sacar esta imagen"
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-[#E3E9F0] bg-white text-[11px] text-[#C03420] shadow">✕</button>
            </span>
          ))}
        </div>
      )}
      <label className={`${SUAVE} cursor-pointer ${subiendo ? "opacity-60" : ""}`}>
        {subiendo ? `Subiendo… (faltan ${subiendo})` : links.length ? "Sumar más imágenes" : "Elegir imágenes"}
        <input type="file" accept="image/*" multiple onChange={elegir} disabled={subiendo > 0} className="hidden" />
      </label>
      {motivo && <p role="alert" className="text-[11px] text-[#C03420] mt-1">{motivo}</p>}
    </div>
  );
}
