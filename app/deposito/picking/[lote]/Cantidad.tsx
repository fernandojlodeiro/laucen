"use client";

// "Cantidad" al lado del lector (provisorio, pedido de Fer 3/10): para lo
// que no tiene etiqueta (diodos, packs que se arman al vender) se escribe
// cuántas van y después el SKU; así 20 diodos son una sola carga y no 20.
// Después de cada lectura buena vuelve a 1.

export default function Cantidad({ valor, cambiar }: { valor: string; cambiar: (v: string) => void }) {
  return (
    <label className="flex flex-col text-[11px] text-[#5C6B76] shrink-0">
      Cantidad
      <input value={valor} inputMode="numeric" onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => cambiar(e.target.value.replace(/\D/g, "").slice(0, 5))}
        className="w-20 border border-[#E3E9F0] rounded-lg px-2 py-3 text-lg font-bold text-right bg-white text-[#1D2A33]" />
    </label>
  );
}

/** Lo escrito en "Cantidad" como número (vacío o cero = 1). */
export const cantidadDe = (v: string) => Math.max(1, Number(v) || 1);
