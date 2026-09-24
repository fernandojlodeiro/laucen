"use client";

import { useActionState } from "react";
import Link from "next/link";
import { accionOlvide, type Problema } from "@/app/auth-actions";
import { VERDE, SUAVE } from "@/app/botones";

export default function Olvide() {
  const [problema, accion, pendiente] = useActionState<Problema, FormData>(accionOlvide, null);

  return (
    <main className="max-w-sm mx-auto p-6 mt-10">
      <h1 className="text-lg font-bold mb-4">Olvidé mi contraseña</h1>
      <form action={accion} className="grid gap-3">
        <label>
          <span className="text-xs text-[#5C6B76]">Email</span>
          <input name="email" type="email" required autoComplete="email"
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm" />
        </label>
        {problema && (
          <p className="text-xs bg-[#EEF3F8] text-[#16577F] rounded-lg px-3 py-2">{problema.texto}</p>
        )}
        <button disabled={pendiente} className={`${VERDE} w-full py-2.5`}>
          {pendiente ? "Enviando…" : "Mandarme el link"}
        </button>
      </form>
      <Link href="/login" className={`${SUAVE} inline-block mt-4`}>Volver</Link>
    </main>
  );
}
