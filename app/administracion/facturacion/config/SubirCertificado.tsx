"use client";

// Campo para pegar el certificado de ARCA, o elegir el archivo .crt/.pem
// (se lee en el navegador y se vuelca en el campo; se guarda con el botón).

import { useState } from "react";
import { BotonEnviar } from "@/app/radar/Cliente";
import { VERDE, SUAVE } from "@/app/botones";

export default function SubirCertificado({ accion }: { accion: (fd: FormData) => Promise<void> }) {
  const [pem, setPem] = useState("");
  const leer = async (f: File | undefined) => { if (f) setPem(await f.text()); };
  return (
    <form action={accion} className="grid gap-2">
      <textarea name="certificado" value={pem} onChange={(e) => setPem(e.target.value)} rows={5}
        placeholder="-----BEGIN CERTIFICATE-----" className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-[11px] bg-white font-mono w-full" />
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${SUAVE} cursor-pointer`}>
          Elegir archivo .crt / .pem
          <input type="file" accept=".crt,.pem,.cer,text/plain" className="hidden" onChange={(e) => leer(e.target.files?.[0])} />
        </label>
        <BotonEnviar clase={VERDE} corriendo="Guardando…">Guardar certificado</BotonEnviar>
      </div>
    </form>
  );
}
