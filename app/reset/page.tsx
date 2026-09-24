"use client";

// Se llega acá con una sesión temporal ya cargada por /auth/callback (el
// link del mail). Sólo pide la contraseña nueva.

import { useActionState } from "react";
import { accionNuevaPassword, type Problema } from "@/app/auth-actions";
import { VERDE } from "@/app/botones";

export default function Reset() {
  const [problema, accion, pendiente] = useActionState<Problema, FormData>(accionNuevaPassword, null);

  return (
    <main className="max-w-sm mx-auto p-6 mt-10">
      <h1 className="text-lg font-bold mb-4">Elegí una contraseña nueva</h1>
      <form action={accion} className="grid gap-3">
        <label>
          <span className="text-xs text-[#5C6B76]">Contraseña nueva</span>
          <input name="password" type="password" required minLength={8} autoComplete="new-password"
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm" />
        </label>
        {problema && (
          <p className="text-xs text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2">{problema.texto}</p>
        )}
        <button disabled={pendiente} className={`${VERDE} w-full py-2.5`}>
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </main>
  );
}
