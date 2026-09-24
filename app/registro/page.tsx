"use client";

// Registro en un solo paso: cuenta + organización + rol Admin. AJUSTAR el
// diseño cuando exista una identidad visual propia de Laucen.

import { useActionState } from "react";
import { accionRegistro, type Problema } from "@/app/auth-actions";
import { VERDE } from "@/app/botones";

export default function Registro() {
  const [problema, accion, pendiente] = useActionState<Problema, FormData>(accionRegistro, null);

  if (problema?.ok) {
    return (
      <main className="max-w-sm mx-auto p-6 mt-10">
        <h1 className="text-lg font-bold mb-4">Revisá tu mail</h1>
        <p className="text-sm text-[#1F6E4A] bg-[#EEF7F1] rounded-lg px-3 py-2">{problema.texto}</p>
      </main>
    );
  }

  return (
    <main className="max-w-sm mx-auto p-6 mt-10">
      <h1 className="text-lg font-bold mb-4">Crear cuenta</h1>
      <form action={accion} className="grid gap-3">
        <label>
          <span className="text-xs text-[#5C6B76]">Tu nombre</span>
          <input name="nombre" required className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm" />
        </label>
        <label>
          <span className="text-xs text-[#5C6B76]">Nombre de la organización</span>
          <input name="organizacion" required className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm" />
        </label>
        <label>
          <span className="text-xs text-[#5C6B76]">Email</span>
          <input name="email" type="email" required autoComplete="email"
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm" />
        </label>
        <label>
          <span className="text-xs text-[#5C6B76]">Contraseña</span>
          <input name="password" type="password" required minLength={8} autoComplete="new-password"
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm" />
        </label>
        {problema && (
          <p className="text-xs text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2">{problema.texto}</p>
        )}
        <button disabled={pendiente} className={`${VERDE} w-full py-2.5`}>
          {pendiente ? "Creando…" : "Crear cuenta"}
        </button>
      </form>
    </main>
  );
}
