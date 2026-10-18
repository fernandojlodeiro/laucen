"use client";

// Piezas del espacio personal que necesitan el navegador: el botón que lanza
// algo de fondo ("Trabajando…" mientras corre) y la actualización sola de la
// pantalla mientras haya algo corriendo.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function Refrescar({ activo, cada = 4 }: { activo: boolean; cada?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => router.refresh(), cada * 1000);
    return () => clearInterval(t);
  }, [activo, cada, router]);
  return null;
}

type Accion = (fd: FormData) => Promise<{ ok: boolean; mensaje?: string }>;

/** Un botón que lanza algo de fondo. `corriendo`: hay algo corriendo en el espacio. */
export function BotonFondo({ accion, campos, texto, clase, corriendo, conMes = false, meses = [] }: {
  accion: Accion; campos: Record<string, string>; texto: string; clase: string; corriendo: boolean; conMes?: boolean; meses?: { valor: string; texto: string }[];
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mes, setMes] = useState(meses[0]?.valor ?? "");
  const ocupado = pendiente || corriendo;
  const lanzar = () => empezar(async () => {
    setError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    if (conMes) fd.set("mes", mes);
    const r = await accion(fd).catch(() => ({ ok: false, mensaje: "No se pudo empezar. Probá de nuevo." }));
    if (!r.ok) setError(r.mensaje ?? "No se pudo empezar.");
    router.refresh();
  });
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center gap-1">
        {conMes && (
          <select value={mes} onChange={(e) => setMes(e.target.value)} disabled={ocupado} aria-label="Mes"
            className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white">
            {meses.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
          </select>
        )}
        <button type="button" disabled={ocupado} onClick={lanzar} className={`${clase} disabled:opacity-60`}>{ocupado ? "Trabajando…" : texto}</button>
      </span>
      {error && <span className="text-[11px] text-[#C03420]">{error}</span>}
    </span>
  );
}
