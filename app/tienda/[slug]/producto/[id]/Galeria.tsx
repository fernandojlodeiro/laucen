"use client";

// Galería de la ficha: foto grande y miniaturas. En el celular la foto grande
// también se desliza de costado.

import { useEffect, useRef, useState } from "react";

export default function Galeria({ fotos, titulo }: { fotos: string[]; titulo: string }) {
  const [actual, setActual] = useState(0);
  const tira = useRef<HTMLDivElement>(null);
  const clave = fotos.join("|");

  // Otra variación, otras fotos: volver a la primera.
  useEffect(() => { setActual(0); tira.current?.scrollTo({ left: 0 }); }, [clave]);

  if (!fotos.length) {
    return <div className="aspect-square w-full rounded-2xl bg-gray-50 grid place-items-center text-gray-300 text-sm">Sin foto</div>;
  }

  const ir = (i: number) => {
    setActual(i);
    const el = tira.current;
    if (el) el.scrollTo({ left: el.clientWidth * i, behavior: "smooth" });
  };

  return (
    <div className="space-y-3">
      <div ref={tira} onScroll={(e) => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (i !== actual) setActual(i); }}
        className="flex aspect-square w-full snap-x snap-mandatory overflow-x-auto rounded-2xl bg-gray-50 [scrollbar-width:none]">
        {fotos.map((f, i) => (
          <img key={f + i} src={f} alt={`${titulo} — foto ${i + 1}`} loading={i === 0 ? "eager" : "lazy"}
            className="h-full w-full shrink-0 snap-center object-contain p-3" />
        ))}
      </div>
      {fotos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {fotos.map((f, i) => (
            <button key={f + i} type="button" onClick={() => ir(i)} aria-label={`Ver foto ${i + 1}`}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-gray-50 ${i === actual ? "border-[var(--acento)]" : "border-transparent"}`}>
              <img src={f} alt="" className="h-full w-full object-contain p-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
