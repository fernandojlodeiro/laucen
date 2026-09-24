"use client";

// Caso borde: cuenta creada pero sin ninguna organización todavía (casi
// nunca pasa, porque el registro ya crea la organización en el mismo paso).

import { useActionState } from "react";
import { accionCrearOrganizacion } from "@/app/onboarding-actions";
import { VERDE } from "@/app/botones";
import type { Problema } from "@/app/auth-actions";

export default function Onboarding() {
  const [problema, accion, pendiente] = useActionState<Problema, FormData>(accionCrearOrganizacion, null);

  return (
    <main className="max-w-sm mx-auto p-6 mt-10">
      <h1 className="text-lg font-bold mb-4">Creá tu organización</h1>
      <form action={accion} className="grid gap-3">
        <label>
          <span className="text-xs text-[#5C6B76]">Nombre de la organización</span>
          <input name="organizacion" required className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm" />
        </label>
        {problema && (
          <p className="text-xs text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2">{problema.texto}</p>
        )}
        <button disabled={pendiente} className={`${VERDE} w-full py-2.5`}>
          {pendiente ? "Creando…" : "Crear"}
        </button>
      </form>
    </main>
  );
}
