// Piezas comunes de las dos pestañas de etiquetas.

import { Pestanas } from "@/app/radar/Cliente";
import { ETIQUETA } from "@/app/componentes/erp";

export function PestanasEtiquetas() {
  return <Pestanas items={[{ href: "/deposito/etiquetas", texto: "Productos" }, { href: "/deposito/etiquetas/ubicaciones", texto: "Ubicaciones" }]} />;
}

/** Térmica 50×25 mm (una etiqueta por hoja) u hoja A4 con grilla de 3×8. */
export function ElegirFormato() {
  const opciones = [["termica", "Térmica 50×25 mm"], ["a4", "Hoja A4 (3×8)"]] as const;
  return (
    <fieldset>
      <legend className={ETIQUETA}>Formato</legend>
      <div className="grid grid-cols-2 gap-2">
        {opciones.map(([k, t], i) => (
          <label key={k} className="flex items-center gap-2 rounded-xl border border-[#E3E9F0] bg-white px-3 py-2.5 text-sm has-[:checked]:border-[#16577F] has-[:checked]:bg-[#EEF3F8]">
            <input type="radio" name="formato" value={k} defaultChecked={i === 0} className="h-5 w-5 accent-[#16577F]" />{t}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
