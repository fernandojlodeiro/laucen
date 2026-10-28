"use client";

// Sugerencia de compra: filtro por categoría (Fer, 12/10). El árbol hasta el tercer nivel, sólo las categorías con
// productos en la lista, todas tildadas de entrada; destildar una esconde sus productos (y los de sus subcategorías).
// Lo destildado va en la dirección (?sin_cat=ids, «0» = sin categoría). Sólo esconde renglones: no cambia los cálculos.

import { useState } from "react";
import { usarCambiarParametro } from "@/app/componentes/BuscadorVivo";
import { usarParametro } from "@/app/componentes/filtros-pendientes";
import type { NodoCategoria } from "@/lib/compras/sugerencia";

export default function Categorias({ nodos, sinCategoria, excluidas }: { nodos: NodoCategoria[]; sinCategoria: number; excluidas: number[] }) {
  const cambiar = usarCambiarParametro();
  const [abierto, setAbierto] = useState(false);
  const fuera = new Set(usarParametro("sin_cat", excluidas.join(",")).split(",").filter((x) => x !== "").map(Number));
  const hijos = (padre: number | null) => nodos.filter((n) => n.padre === padre);
  const descendientes = (id: number): number[] => hijos(id).flatMap((h) => [h.id, ...descendientes(h.id)]);
  const guardar = (ids: Set<number>) => cambiar({ sin_cat: ids.size ? [...ids].join(",") : null, p: null });
  const alternar = (id: number, tildada: boolean) => {
    const ids = new Set(fuera);
    if (tildada) { ids.delete(id); for (const d of descendientes(id)) ids.delete(d); } else ids.add(id);
    guardar(ids);
  };
  const Rama = ({ padre, apagada }: { padre: number | null; apagada: boolean }) => (
    <ul className={padre == null ? "" : "pl-4"}>
      {hijos(padre).map((n) => {
        const off = apagada || fuera.has(n.id);
        return (
          <li key={n.id}>
            <label className={`flex items-center gap-1.5 py-0.5 whitespace-nowrap ${apagada ? "opacity-50" : ""}`}>
              <input type="checkbox" checked={!off} disabled={apagada} onChange={(e) => alternar(n.id, e.target.checked)} className="h-3.5 w-3.5 accent-[#16577F]" />
              <span className={n.nivel === 1 ? "font-semibold" : ""}>{n.nombre}</span> <span className="text-[#5C6B76]">({n.productos})</span>
            </label>
            {n.nivel < 3 && <Rama padre={n.id} apagada={off} />}
          </li>
        );
      })}
    </ul>
  );
  return (
    <span className="relative inline-block text-xs">
      <button type="button" onClick={() => setAbierto(!abierto)} className="rounded-md border border-[#C9D3DD] bg-white px-2 py-1.5">
        Categorías {fuera.size ? `(${fuera.size} destildada${fuera.size === 1 ? "" : "s"})` : "(todas)"} ▾
      </button>
      {abierto && (
        <span className="absolute right-0 z-30 mt-1 block w-[26rem] max-h-[28rem] overflow-auto rounded-lg border border-[#E3E9F0] bg-white p-2 shadow-lg text-left">
          <span className="flex gap-2 mb-1.5">
            <button type="button" onClick={() => guardar(new Set())} className="rounded border border-[#E3E9F0] px-2 py-0.5">Tildar todas</button>
            <button type="button" onClick={() => guardar(new Set([0, ...hijos(null).map((n) => n.id)]))} className="rounded border border-[#E3E9F0] px-2 py-0.5">Destildar todas</button>
            <button type="button" onClick={() => setAbierto(false)} className="ml-auto rounded border border-[#E3E9F0] px-2 py-0.5">Cerrar</button>
          </span>
          <Rama padre={null} apagada={false} />
          {sinCategoria > 0 && (
            <label className="flex items-center gap-1.5 py-0.5 mt-1 border-t border-[#E3E9F0] pt-1">
              <input type="checkbox" checked={!fuera.has(0)} onChange={(e) => alternar(0, e.target.checked)} className="h-3.5 w-3.5 accent-[#16577F]" />
              Sin categoría <span className="text-[#5C6B76]">({sinCategoria})</span>
            </label>
          )}
        </span>
      )}
    </span>
  );
}
