"use client";

// Las filas de planes de cuotas (cuotas + interés %) de una familia o un
// producto: se agregan y se quitan acá; se guardan todas juntas con el botón
// del formulario. Sin filas = sin planes propios (hereda).

import { useState } from "react";
import CampoNumero from "@/app/componentes/CampoNumero";
import { SUAVE } from "@/app/botones";

const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";

export default function EditorPlanes({ planes }: { planes: { cuotas: number; interes_pct: number }[] }) {
  const [filas, setFilas] = useState(() => planes.map((p, i) => ({ k: i, ...p })));
  const [proxima, setProxima] = useState(planes.length);
  const agregar = () => {
    const ult = filas.at(-1)?.cuotas ?? 0;
    const sugerida = [3, 6, 9, 12, 18, 24].find((c) => c > ult) ?? Math.min(ult + 1, 24);
    setFilas([...filas, { k: proxima, cuotas: sugerida, interes_pct: 0 }]);
    setProxima(proxima + 1);
  };
  return (
    <div>
      <input type="hidden" name="filas" value={filas.map((f) => f.k).join(",")} />
      {filas.length === 0 && <p className="text-[11px] text-[#5C6B76] mb-1">Sin planes propios: hereda.</p>}
      {filas.length > 0 && (
        <div className="grid grid-cols-[5rem_6rem_auto] gap-x-2 gap-y-1 items-center text-[11px] font-semibold text-[#5C6B76] mb-1">
          <span className="text-right">Cuotas</span><span className="text-right">Interés %</span><span />
          {filas.map((f) => (
            <div key={f.k} className="contents">
              <CampoNumero name={`cuotas_${f.k}`} valor={f.cuotas} tipo="entero" className={`${CAMPO} w-full`} />
              <CampoNumero name={`interes_${f.k}`} valor={f.interes_pct} tipo="pct" className={`${CAMPO} w-full`} />
              <button type="button" onClick={() => setFilas(filas.filter((x) => x.k !== f.k))} className={SUAVE}>Quitar</button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={agregar} className={SUAVE}>+ Agregar plan</button>
      <span className="ml-2 text-[11px] text-[#5C6B76]">Interés 0 = sin interés (lo absorbés vos).</span>
    </div>
  );
}
