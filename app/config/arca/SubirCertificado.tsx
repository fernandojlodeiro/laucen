"use client";

// Paso 3 del trámite: el certificado (el "permiso") que devolvió ARCA. Se
// elige el archivo .crt/.pem (se lee en el navegador y se vuelca en el campo)
// o se pega el contenido; "Conectar" lo guarda.

import { useState } from "react";
import { BotonEnviar } from "@/app/radar/Cliente";
import { PRIMARIO, SUAVE } from "@/app/botones";

export default function SubirCertificado({ accion, ambiente, rs }: { accion: (fd: FormData) => Promise<void>; ambiente: string; rs: number }) {
  const [pem, setPem] = useState("");
  const [archivo, setArchivo] = useState<string | null>(null);
  const leer = async (f: File | undefined) => { if (f) { setPem(await f.text()); setArchivo(f.name); } };
  return (
    <form action={accion} className="grid gap-2">
      <input type="hidden" name="ambiente" value={ambiente} />
      <input type="hidden" name="rs" value={rs} />
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${SUAVE} cursor-pointer`}>
          Elegir el archivo que te dio ARCA
          <input type="file" accept=".crt,.pem,.cer,.txt,text/plain" className="hidden" onChange={(e) => leer(e.target.files?.[0])} />
        </label>
        {archivo && <span className="text-[11px] text-[#5C6B76]">{archivo}</span>}
      </div>
      <details>
        <summary className="text-[11px] text-[#5C6B76] cursor-pointer">…o pegá su contenido</summary>
        <textarea name="certificado" value={pem} onChange={(e) => setPem(e.target.value)} rows={5}
          placeholder="-----BEGIN CERTIFICATE-----" className="mt-1 border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-[11px] bg-white font-mono w-full" />
      </details>
      <div><BotonEnviar clase={PRIMARIO} corriendo="Conectando…">Conectar</BotonEnviar></div>
    </form>
  );
}
