"use client";

// La foto principal al lado de un producto en una lista (pedido de Fer, 3/10; 5/10: la foto
// misma en lugar del 📷): al tocarla abre todas (producto_foto, por `orden`) en una ventanita
// liviana, todas del mismo tamaño (tocando una se ve grande). Si el producto no tiene fotos no se muestra. La lista trae las direcciones con
//   (select array_agg(url order by orden) from producto_foto where producto_id = p.id) fotos

import { useEffect, useState } from "react";

export default function FotosProducto({ fotos, titulo, tamano = 40, portada = 0 }: { fotos: string[] | null | undefined; titulo: string; tamano?: number; portada?: number }) {
  const [abierta, setAbierta] = useState(false);
  const [ampliada, setAmpliada] = useState<number | null>(null);
  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(false);
      if (e.key === "ArrowRight") setAmpliada((g) => ((g ?? -1) + 1) % fotos!.length);
      if (e.key === "ArrowLeft") setAmpliada((g) => ((g ?? 0) - 1 + fotos!.length) % fotos!.length);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierta, fotos]);
  if (!fotos || fotos.length === 0) return null;

  return (
    <>
      <button type="button" onClick={() => { setAmpliada(null); setAbierta(true); }} aria-label={`Ver fotos de ${titulo}`} title={`Ver fotos (${fotos.length})`}
        className="inline-block align-middle rounded-md border border-[#E3E9F0] bg-white hover:border-[#16577F] overflow-hidden shrink-0 p-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotos[portada] ?? fotos[0]} alt="" loading="lazy" className="object-cover block" style={{ width: tamano, height: tamano }} />
      </button>
      {abierta && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setAbierta(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Fotos de ${titulo}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold truncate">{titulo}</span>
              <button type="button" onClick={() => setAbierta(false)} aria-label="Cerrar"
                className="h-7 w-7 rounded-full text-[#5C6B76] hover:bg-[#E3E9F0] leading-none text-base">×</button>
            </div>
            {/* Todas del mismo tamaño (Fer, 6/10); tocando una se ve sola y grande. */}
            {ampliada == null ? (
              <div className={`grid gap-2 ${fotos.length === 1 ? "grid-cols-1 max-w-sm mx-auto" : "grid-cols-3 sm:grid-cols-4"}`}>
                {fotos.map((f, i) => (
                  <button key={i} type="button" onClick={() => setAmpliada(i)} aria-label={`Ver la foto ${i + 1} grande`}
                    className="aspect-square rounded-lg border border-[#E3E9F0] bg-[#FAFBFC] hover:border-[#16577F] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f} alt={`${titulo} (foto ${i + 1})`} className="w-full h-full object-contain" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <button type="button" onClick={() => setAmpliada(null)} aria-label="Volver a todas las fotos" className="block w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotos[ampliada]} alt={`${titulo} (foto ${ampliada + 1})`} className="w-full max-h-[60vh] object-contain bg-[#FAFBFC] rounded-lg" />
                <span className="block text-[11px] text-[#5C6B76] mt-1">Foto {ampliada + 1} de {fotos.length} · tocala para volver a todas (◀ ▶ con las flechas)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
