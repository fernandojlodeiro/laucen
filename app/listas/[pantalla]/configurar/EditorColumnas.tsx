"use client";

// Armar una configuración de lista (Excel o vista): el nombre, qué columnas
// (cajas para tildar) y en qué orden (flechas ↑ ↓). Las tildadas van arriba
// en su orden; las demás, abajo, en el orden del catálogo.

import Link from "next/link";
import { useState } from "react";
import { VERDE, SUAVE, BOTON } from "@/app/botones";

const FLECHA = `${BOTON} !px-2 !py-1 bg-white border border-[#E3E9F0] text-[#16577F] disabled:opacity-30`;

export default function EditorColumnas({ catalogo, elegidas, nombre, accion, ocultos, cancelar }: {
  catalogo: { clave: string; titulo: string }[];
  elegidas: string[];
  nombre: string;
  accion: (fd: FormData) => Promise<void>;
  ocultos: Record<string, string>;
  cancelar: string;
}) {
  const existe = new Set(catalogo.map((c) => c.clave));
  const [orden, setOrden] = useState(() => [...new Set(elegidas)].filter((k) => existe.has(k)));
  const titulo = new Map(catalogo.map((c) => [c.clave, c.titulo]));
  const resto = catalogo.filter((c) => !orden.includes(c.clave));
  const mover = (i: number, d: -1 | 1) => setOrden((o) => {
    const n = [...o];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    return n;
  });
  return (
    <form action={accion} className="space-y-3">
      {Object.entries(ocultos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="columnas" value={JSON.stringify(orden)} />
      <label className="block max-w-sm">
        <span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Nombre</span>
        <input name="nombre" defaultValue={nombre} required maxLength={60} placeholder="Ej. Para el contador"
          className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white w-full" autoFocus />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold text-[#5C6B76] mb-1">Columnas elegidas, en este orden ({orden.length})</p>
          {orden.length === 0 && <p className="text-xs text-[#C03420]">Tildá al menos una columna.</p>}
          <ol className="space-y-1">
            {orden.map((k, i) => (
              <li key={k} className="flex items-center gap-2 bg-white border border-[#E3E9F0] rounded-lg px-2 py-1">
                <span className="w-5 text-right text-[11px] text-[#5C6B76] tabular-nums">{i + 1}</span>
                <label className="flex items-center gap-2 flex-1 text-xs cursor-pointer">
                  <input type="checkbox" checked onChange={() => setOrden((o) => o.filter((x) => x !== k))} className="h-4 w-4 accent-[#16577F]" />
                  {titulo.get(k)}
                </label>
                <button type="button" className={FLECHA} onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${titulo.get(k)}`}>↑</button>
                <button type="button" className={FLECHA} onClick={() => mover(i, 1)} disabled={i === orden.length - 1} aria-label={`Bajar ${titulo.get(k)}`}>↓</button>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#5C6B76] mb-1">Otras columnas</p>
          {resto.length === 0 && <p className="text-xs text-[#5C6B76]">Están todas elegidas.</p>}
          <ul className="space-y-1">
            {resto.map((c) => (
              <li key={c.clave}>
                <label className="flex items-center gap-2 text-xs cursor-pointer px-2 py-1">
                  <input type="checkbox" checked={false} onChange={() => setOrden((o) => [...o, c.clave])} className="h-4 w-4 accent-[#16577F]" />
                  {c.titulo}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex gap-2">
        <button className={VERDE} disabled={orden.length === 0}>Guardar</button>
        <Link href={cancelar} className={SUAVE} scroll={false}>Cancelar</Link>
      </div>
    </form>
  );
}
