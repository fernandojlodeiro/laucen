"use client";

// El selector de vista de las listas que la tienen (AGENTS.md): qué columnas
// se ven y en qué orden. "Estándar" es la de siempre; las otras las arma
// cada organización en "Configurar vistas…". La última elegida se recuerda
// (cookie de esta pantalla).

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SUAVE } from "@/app/botones";
import { recordar } from "./DescargarExcel";

export default function SelectorVista({ pantalla, ruta, vistas, activa }: {
  pantalla: string; ruta: string; vistas: { id: number; nombre: string }[]; activa: number | null;
}) {
  const router = useRouter();
  const aqui = usePathname();
  const sp = useSearchParams();
  const [cargando, empezar] = useTransition();
  const cambiar = (valor: string) => {
    recordar(`vista_${pantalla}`, valor || "0", ruta);
    const p = new URLSearchParams(sp.toString());
    p.delete("p"); p.delete("ok"); p.delete("error");
    const s = p.toString();
    empezar(() => {
      router.replace(s ? `${aqui}?${s}` : aqui, { scroll: false });
      router.refresh();
    });
  };
  const volver = `${aqui}${sp.toString() ? `?${sp}` : ""}`;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cargando ? "opacity-60" : ""}`}>
      <label className="inline-flex items-center gap-1">
        <span className="text-[11px] font-semibold text-[#5C6B76]">Vista</span>
        <select value={activa ?? ""} onChange={(e) => cambiar(e.target.value)} disabled={cargando}
          className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white">
          <option value="">Estándar</option>
          {vistas.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
      </label>
      <Link href={`/listas/${pantalla}/configurar?tipo=vista&volver=${encodeURIComponent(volver)}`} className={`${SUAVE} !py-1.5`}
        title="Armar, renombrar o borrar vistas">⚙ Configurar vistas…</Link>
    </span>
  );
}
