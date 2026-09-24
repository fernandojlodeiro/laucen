"use client";

// Pantalla de login mínima. AJUSTAR el diseño cuando exista una identidad
// visual propia de Laucen — esto es sólo para que el flujo funcione.

import { useActionState } from "react";
import Link from "next/link";
import { accionLogin, type Problema } from "@/app/auth-actions";
import { VERDE, SUAVE } from "@/app/botones";

export default function Login() {
  const [problema, accion, pendiente] = useActionState<Problema, FormData>(accionLogin, null);

  return (
    <main className="max-w-sm mx-auto p-6 mt-10">
      <h1 className="text-lg font-bold mb-4">Entrar</h1>
      <form action={accion} className="grid gap-3">
        <label>
          <span className="text-xs text-[#5C6B76]">Email</span>
          <input name="email" type="email" required autoComplete="email"
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm" />
        </label>
        <label>
          <span className="text-xs text-[#5C6B76]">Contraseña</span>
          <input name="password" type="password" required autoComplete="current-password"
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm" />
        </label>
        {problema && (
          <p className="text-xs text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2">{problema.texto}</p>
        )}
        <button disabled={pendiente} className={`${VERDE} w-full py-2.5`}>
          {pendiente ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <div className="flex justify-between mt-4">
        <Link href="/registro" className={SUAVE}>Crear cuenta</Link>
        <Link href="/olvide" className={SUAVE}>Olvidé mi contraseña</Link>
      </div>
    </main>
  );
}
