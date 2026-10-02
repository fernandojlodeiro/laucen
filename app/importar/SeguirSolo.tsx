"use client";

// La importación que sigue sola: mientras está en segundo plano la procesan
// las tareas periódicas del servidor (cada 2 minutos, aunque se cierre la
// pestaña) y esta pantalla se refresca sola para mostrar el avance. "Pausar"
// la frena; "Seguir" la retoma desde donde quedó.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { APAGAR, VERDE } from "@/app/botones";

function Boton({ clase, texto, corriendo }: { clase: string; texto: string; corriendo: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className={`${clase} disabled:opacity-60`}>{pending ? corriendo : texto}</button>;
}

export default function SeguirSolo({ seguir, pausar, iid, andando }: {
  seguir: (fd: FormData) => Promise<void>; pausar: (fd: FormData) => Promise<void>; iid: number; andando: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!andando) return;
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [andando, router]);
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {andando ? (
        <>
          <span className="text-xs rounded-lg px-3 py-2 bg-[#E8F6EF] text-[#107740]">
            Importando sola en segundo plano. Podés cerrar la pestaña: sigue igual. Esta pantalla se actualiza cada 15 segundos.
          </span>
          <form action={pausar}>
            <input type="hidden" name="id" value={iid} />
            <Boton clase={APAGAR} texto="Pausar" corriendo="Pausando…" />
          </form>
        </>
      ) : (
        <>
          <form action={seguir}>
            <input type="hidden" name="id" value={iid} />
            <Boton clase={VERDE} texto="Seguir" corriendo="Arrancando…" />
          </form>
          <span className="text-xs text-[#5C6B76]">Está pausada: sigue desde donde quedó, sola, hasta terminar.</span>
        </>
      )}
    </div>
  );
}
