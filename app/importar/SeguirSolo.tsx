"use client";

// "Seguir" que se aprieta solo: mientras queden filas, cada vuelta procesa un
// lote (lo que entra en el tiempo de una función de Vercel) y vuelve a
// mandar el formulario. Se puede pausar; "Seguir" a mano retoma.

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { SUAVE, VERDE } from "@/app/botones";

function Boton({ auto }: { auto: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${VERDE} disabled:opacity-60`}>
      {pending ? "Importando… (sigue solo hasta terminar)" : auto ? "Siguiendo…" : "Seguir"}
    </button>
  );
}

export default function SeguirSolo({ accion, iid, auto, pausar }: {
  accion: (fd: FormData) => Promise<void>; iid: number; auto: boolean; pausar: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => form.current?.requestSubmit(), 800);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <form ref={form} action={accion} className="flex flex-wrap items-center gap-2 mb-4">
      <input type="hidden" name="id" value={iid} />
      <input type="hidden" name="seguir" value="1" />
      <Boton auto={auto} />
      {auto
        ? <Link href={pausar} className={SUAVE}>Pausar</Link>
        : <span className="text-xs text-[#5C6B76]">Quedaron filas sin procesar: sigue desde donde quedó, solo, hasta terminar.</span>}
    </form>
  );
}
