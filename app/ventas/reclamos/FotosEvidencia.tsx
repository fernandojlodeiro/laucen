"use client";

// Las fotos de «La devolución llegó mal» (Fer, 29/10): hasta 6, de la máquina o de la cámara del celular. Cada una se
// achica acá mismo (1600 px, JPG) antes de enviarla, como en app/admin/china/FotoCampo.tsx: una foto de celular pesa
// varios MB y el formulario acepta hasta 5 en total.

import { useState } from "react";

const LADO = 1600;
export const MAX_FOTOS = 6;

async function achicar(archivo: File, i: number): Promise<File> {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  lienzo.getContext("2d")!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
  return blob ? new File([blob], `foto-${i + 1}.jpg`, { type: "image/jpeg" }) : archivo;
}

export default function FotosEvidencia() {
  const [vistas, setVistas] = useState<string[]>([]);
  const [aviso, setAviso] = useState("");

  async function elegidas(e: React.ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files ?? []);
    setAviso("");
    if (lista.length > MAX_FOTOS) setAviso(`Van las primeras ${MAX_FOTOS}.`);
    try {
      const chicas = await Promise.all(lista.slice(0, MAX_FOTOS).map((f, i) => achicar(f, i)));
      const dt = new DataTransfer();
      for (const f of chicas) dt.items.add(f);
      e.target.files = dt.files;
      setVistas(chicas.map((f) => URL.createObjectURL(f)));
    } catch {
      setAviso("No pude leer alguna de las fotos (probá con JPG o PNG).");
      setVistas([]);
      e.target.value = "";
    }
  }

  return (
    <div className="grid gap-1 text-xs">
      <span>Fotos (hasta {MAX_FOTOS}: el paquete con las etiquetas, abierto, lo que llegó)</span>
      <input name="fotos" type="file" accept="image/*" multiple onChange={elegidas}
        className="text-xs file:mr-2 file:rounded-lg file:border file:border-[#E3E9F0] file:bg-[#EEF3F8] file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#16577F]" />
      {vistas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {vistas.map((v) => <img key={v} src={v} alt="" className="w-14 h-14 object-cover rounded border border-[#E3E9F0]" />)}
        </div>
      )}
      {aviso && <span className="text-[#C03420]">{aviso}</span>}
    </div>
  );
}
