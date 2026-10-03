// El tamaño del papel de etiquetas y hojas (10×15 de la térmica o A4). El
// último elegido queda en una cookie (la pone /deposito/hojas al imprimir).

import { cookies } from "next/headers";
import { TAMANOS, esTamHoja, COOKIE_TAM, type TamHoja } from "@/lib/deposito/hojas";
import { CAMPO } from "@/app/componentes/erp";

export async function tamElegido(): Promise<TamHoja> {
  const c = (await cookies()).get(COOKIE_TAM)?.value;
  return esTamHoja(c) ? c : "10x15";
}

export function SelectorTam({ tam, className = "" }: { tam: TamHoja; className?: string }) {
  return (
    <label className={`inline-flex items-center gap-1.5 text-xs text-[#5C6B76] ${className}`}>
      Papel
      <select name="tam" defaultValue={tam} className={CAMPO} aria-label="Tamaño del papel">
        {TAMANOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </select>
    </label>
  );
}
