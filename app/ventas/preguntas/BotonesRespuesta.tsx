"use client";

// «Proponer con IA» y «Enviar»/«Responder» en el mismo formulario (Fer, 22/10): cada uno dice que trabaja sólo
// cuando lo tocaste a él (antes, al proponer, el de enviar decía «Enviando…»), y los dos quedan quietos mientras tanto.

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export default function BotonesRespuesta({ proponer, claseProponer, claseEnviar, textoEnviar }: {
  proponer: (fd: FormData) => Promise<void>; claseProponer: string; claseEnviar: string; textoEnviar: string;
}) {
  const { pending } = useFormStatus();
  const [cual, setCual] = useState<"proponer" | "enviar" | null>(null);
  useEffect(() => { if (!pending) setCual(null); }, [pending]);
  return (
    <div className="flex flex-wrap gap-2">
      <button formAction={proponer} onClick={() => setCual("proponer")} disabled={pending} className={`${claseProponer} disabled:opacity-60`}>
        {pending && cual === "proponer" ? "Proponiendo…" : "Proponer con IA"}
      </button>
      <button onClick={() => setCual("enviar")} disabled={pending} className={`${claseEnviar} disabled:opacity-60`}>
        {pending && cual === "enviar" ? "Enviando…" : textoEnviar}
      </button>
    </div>
  );
}
