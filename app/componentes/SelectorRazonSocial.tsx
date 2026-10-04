"use client";

// El selector de razón social de las pantallas que se ven por CUIT (libros
// contables, IVA, cuentas corrientes, fondos…). Cambia la dirección (?rs=),
// como el buscador. Con una sola razón social no se dibuja (lib/razon-social.ts).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export default function SelectorRazonSocial({ razones, valor, todas = true }: {
  razones: { id: number; nombre: string }[]; valor: number | null; todas?: boolean;
}) {
  const router = useRouter();
  const aqui = usePathname();
  const sp = useSearchParams();
  const [cargando, empezar] = useTransition();
  if (razones.length < 2) return null;
  const cambiar = (v: string) => {
    const p = new URLSearchParams(sp.toString());
    p.set("rs", v);
    p.delete("p"); p.delete("ok"); p.delete("error");
    empezar(() => { router.replace(`${aqui}?${p}`, { scroll: false }); router.refresh(); });
  };
  return (
    <label className={`inline-flex items-center gap-1 text-xs ${cargando ? "opacity-60" : ""}`}>
      <span className="text-[11px] font-semibold text-[#5C6B76]">Razón social</span>
      <select value={valor ?? "todas"} onChange={(e) => cambiar(e.target.value)} disabled={cargando}
        className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white">
        {todas && <option value="todas">Todas</option>}
        {razones.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
      </select>
    </label>
  );
}
