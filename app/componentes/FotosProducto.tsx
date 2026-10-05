"use client";

// La foto principal al lado de un producto en una lista (pedido de Fer, 3/10; 5/10: la foto
// misma en lugar del 📷): al tocarla abre todas (producto_foto, por `orden`) en una ventanita
// liviana. Si el producto no tiene fotos no se muestra. La lista trae las direcciones con
//   (select array_agg(url order by orden) from producto_foto where producto_id = p.id) fotos

import { useEffect, useState } from "react";

export default function FotosProducto({ fotos, titulo, tamano = 40 }: { fotos: string[] | null | undefined; titulo: string; tamano?: number }) {
  const [abierta, setAbierta] = useState(false);
  const [grande, setGrande] = useState(0);
  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(false);
      if (e.key === "ArrowRight") setGrande((g) => (g + 1) % fotos!.length);
      if (e.key === "ArrowLeft") setGrande((g) => (g - 1 + fotos!.length) % fotos!.length);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierta, fotos]);
  if (!fotos || fotos.length === 0) return null;

  return (
    <>
      <button type="button" onClick={() => { setGrande(0); setAbierta(true); }} aria-label={`Ver fotos de ${titulo}`} title={`Ver fotos (${fotos.length})`}
        className="inline-block align-middle rounded-md border border-[#E3E9F0] bg-white hover:border-[#16577F] overflow-hidden shrink-0 p-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotos[0]} alt="" loading="lazy" className="object-cover block" style={{ width: tamano, height: tamano }} />
      </button>
      {abierta && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setAbierta(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Fotos de ${titulo}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold truncate">{titulo}</span>
              <button type="button" onClick={() => setAbierta(false)} aria-label="Cerrar"
                className="h-7 w-7 rounded-full text-[#5C6B76] hover:bg-[#E3E9F0] leading-none text-base">×</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotos[grande]} alt={`${titulo} (foto ${grande + 1})`} className="w-full max-h-[60vh] object-contain bg-[#FAFBFC] rounded-lg" />
            {fotos.length > 1 && (
              <div className="flex gap-1.5 mt-2 overflow-x-auto">
                {fotos.map((f, i) => (
                  <button key={i} type="button" onClick={() => setGrande(i)} aria-label={`Foto ${i + 1}`}
                    className={`shrink-0 rounded-md border-2 ${i === grande ? "border-[#16577F]" : "border-transparent"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f} alt="" className="h-14 w-14 object-cover rounded" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
