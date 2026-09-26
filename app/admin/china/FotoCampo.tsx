"use client";

// La foto para la búsqueda por foto: un link pegado o un archivo de la
// máquina. El archivo se achica acá mismo (1600 px, JPG) antes de enviarlo:
// una foto de celular pesa varios MB y Vercel acepta hasta 4.

import { useRef, useState } from "react";

const LADO = 1600;

async function achicar(archivo: File): Promise<File> {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  lienzo.getContext("2d")!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
  return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : archivo;
}

export default function FotoCampo({ link, clase }: { link: string; clase: string }) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  async function elegido(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setAviso("");
    if (!f) return setVista(null);
    try {
      const chica = await achicar(f);
      const dt = new DataTransfer();
      dt.items.add(chica);
      e.target.files = dt.files;
      setVista(URL.createObjectURL(chica));
    } catch {
      setAviso("No pude leer esa imagen (probá con un JPG o PNG).");
      setVista(null);
    }
  }

  return (
    <div className="grid gap-2 text-xs">
      <span>Foto, para los de búsqueda por foto: pegá el link de una imagen <b>o</b> elegí un archivo de tu máquina</span>
      <input name="imagen" type="url" defaultValue={link} placeholder="ej: https://http2.mlstatic.com/D_NQ_NP_2X_…-F.webp" className={clase} />
      <div className="flex flex-wrap items-center gap-2">
        <input ref={archivoRef} name="archivo" type="file" accept="image/*" onChange={elegido}
          className="text-xs file:mr-2 file:rounded-lg file:border file:border-[#E3E9F0] file:bg-[#EEF3F8] file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#16577F]" />
        {vista && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vista} alt="" className="w-16 h-16 object-cover rounded border border-[#E3E9F0]" />
        )}
      </div>
      {aviso && <span className="text-[#C03420]">{aviso}</span>}
    </div>
  );
}
