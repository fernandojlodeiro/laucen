"use client";

// Piezas del Radar que necesitan el navegador: pestañas (saben en qué página
// están), botón que se bloquea mientras corre, y el tacho que pregunta ahí
// mismo "Sí / No".

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { BORRAR, SUAVE, ICONO_BORRAR } from "@/app/botones";

export function Pestanas({ items }: { items: { href: string; texto: string }[] }) {
  const ruta = usePathname();
  return (
    <nav className="flex gap-1 border-b border-[#E3E9F0] mb-4">
      {items.map((i) => {
        // La primera pestaña es la raíz de la sección: sólo se prende exacta.
        const activa = i.href === items[0].href ? ruta === i.href : ruta.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href}
            className={`px-3 py-2 text-xs font-bold -mb-px border-b-2 rounded-t-lg ${activa ? "border-[#16577F] text-[#16577F] bg-white" : "border-transparent text-[#5C6B76] hover:text-[#16577F]"}`}>
            {i.texto}
          </Link>
        );
      })}
    </nav>
  );
}

/** Botón de envío que se deshabilita mientras corre (un doble clic no dispara dos veces). */
export function BotonEnviar({ clase, children, corriendo = "Corriendo…" }: { clase: string; children: React.ReactNode; corriendo?: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className={`${clase} disabled:opacity-60`}>{pending ? corriendo : children}</button>;
}

/** Tacho que, al tocarlo, pregunta en su lugar "¿…? Sí / No". */
export function TachoConfirmar({ accion, campos, pregunta }: {
  accion: (fd: FormData) => Promise<void>;
  campos: Record<string, string>;
  pregunta: string;
}) {
  const [preguntando, setPreguntando] = useState(false);
  if (!preguntando) {
    return <button type="button" onClick={() => setPreguntando(true)} className={ICONO_BORRAR} aria-label={pregunta}>🗑</button>;
  }
  return (
    <form action={accion} className="flex items-center gap-1 text-xs">
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <span>{pregunta}</span>
      <button className={BORRAR}>Sí</button>
      <button type="button" onClick={() => setPreguntando(false)} className={SUAVE}>No</button>
    </form>
  );
}

/** Botón que, antes de mandar, pregunta ahí mismo "¿…? Sí / No" (para
 *  acciones que casi nunca hacen falta). */
export function BotonConfirmar({ accion, campos, clase, texto, pregunta, corriendo }: {
  accion: (fd: FormData) => Promise<void>;
  campos: Record<string, string>;
  clase: string;
  texto: string;
  pregunta: string;
  corriendo: string;
}) {
  const [preguntando, setPreguntando] = useState(false);
  if (!preguntando) return <button type="button" onClick={() => setPreguntando(true)} className={clase}>{texto}</button>;
  return (
    <form action={accion} className="flex items-center gap-1 text-xs">
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <span>{pregunta}</span>
      <BotonEnviar clase={BORRAR} corriendo={corriendo}>Sí</BotonEnviar>
      <button type="button" onClick={() => setPreguntando(false)} className={SUAVE}>No</button>
    </form>
  );
}
