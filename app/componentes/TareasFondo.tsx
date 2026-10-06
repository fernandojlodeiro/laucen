"use client";

// Tareas de fondo en el navegador (Fer, 6/10; convención en AGENTS.md):
//   · <BotonTarea>: el botón de algo que demora. Al apretarlo lanza la tarea
//     (la acción del servidor llama a lanzarTarea, lib/tareas-fondo.ts), se
//     pone "Trabajando…" y deja seguir usando la pantalla (o irse a otra).
//   · <AvisosTareas> (en el marco, una sola vez): pregunta cada 3 segundos
//     mientras haya alguna corriendo; cuando una termina muestra un cartel
//     abajo a la derecha —verde si salió bien, rojo si no— y actualiza la
//     pantalla que se esté viendo.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

type Tarea = { id: number; tipo: string; titulo: string; estado: "corriendo" | "ok" | "error"; mensaje: string | null };
const LANZADA = "laucen-tarea-lanzada";
const CORRIENDO = "laucen-tareas-corriendo";
let corriendoAhora: string[] = [];

export function AvisosTareas() {
  const router = useRouter();
  const [carteles, setCarteles] = useState<Tarea[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mirar = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    let tareas: Tarea[] = [];
    try { tareas = ((await fetch("/api/tareas", { cache: "no-store" }).then((r) => r.json())) as { tareas?: Tarea[] }).tareas ?? []; } catch { /* sin red: se reintenta */ }
    const corriendo = tareas.filter((t) => t.estado === "corriendo");
    const terminadas = tareas.filter((t) => t.estado !== "corriendo");
    corriendoAhora = [...new Set(corriendo.map((t) => t.tipo))];
    window.dispatchEvent(new CustomEvent(CORRIENDO, { detail: corriendoAhora }));
    if (terminadas.length) {
      setCarteles((c) => [...c.filter((x) => !terminadas.some((t) => t.id === x.id)), ...terminadas]);
      fetch("/api/tareas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: terminadas.map((t) => t.id) }) }).catch(() => {});
      router.refresh();
      for (const t of terminadas) setTimeout(() => setCarteles((c) => c.filter((x) => x.id !== t.id)), t.estado === "ok" ? 8000 : 20000);
    }
    if (corriendo.length) timer.current = setTimeout(mirar, 3000);
  }, [router]);

  useEffect(() => {
    mirar();
    const lanzada = () => { setTimeout(mirar, 800); };
    window.addEventListener(LANZADA, lanzada);
    return () => { window.removeEventListener(LANZADA, lanzada); if (timer.current) clearTimeout(timer.current); };
  }, [mirar]);

  if (!carteles.length) return null;
  return (
    <div className="fixed bottom-20 md:bottom-4 right-4 z-[60] grid gap-2 w-80 max-w-[calc(100vw-2rem)] print:hidden" aria-live="polite">
      {carteles.map((t) => (
        <div key={t.id} role="status" className={`rounded-xl border px-3 py-2 text-xs shadow-md ${t.estado === "ok" ? "bg-[#EEF7F1] border-[#BFE3CC] text-[#1F6E4A]" : "bg-[#FDECEA] border-[#F3C6C0] text-[#C03420]"}`}>
          <div className="flex items-start justify-between gap-2">
            <b>{t.estado === "ok" ? "✓" : "✕"} {t.titulo}</b>
            <button type="button" onClick={() => setCarteles((c) => c.filter((x) => x.id !== t.id))} aria-label="Cerrar" className="leading-none opacity-60 hover:opacity-100">×</button>
          </div>
          {t.mensaje && <p className="mt-0.5">{t.mensaje}</p>}
        </div>
      ))}
    </div>
  );
}

/** El botón de algo que demora: lanza la tarea de fondo y dice "Trabajando…" mientras corre. */
export function BotonTarea({ accion, tipo, texto, clase, campos = {} }: {
  accion: (fd: FormData) => Promise<{ ok: boolean; mensaje?: string }>;
  tipo: string; texto: React.ReactNode; clase: string; campos?: Record<string, string>;
}) {
  const [corriendo, setCorriendo] = useState(false);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setCorriendo(corriendoAhora.includes(tipo));
    const f = (e: Event) => setCorriendo(((e as CustomEvent<string[]>).detail ?? []).includes(tipo));
    window.addEventListener(CORRIENDO, f);
    return () => window.removeEventListener(CORRIENDO, f);
  }, [tipo]);
  const ocupado = corriendo || pendiente;
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" disabled={ocupado} className={`${clase} disabled:opacity-60`}
        onClick={() => empezar(async () => {
          setError(null);
          const fd = new FormData();
          for (const [k, v] of Object.entries(campos)) fd.set(k, v);
          const r = await accion(fd).catch(() => ({ ok: false, mensaje: "No se pudo empezar. Probá de nuevo." }));
          if (!r.ok) { setError(r.mensaje ?? "No se pudo empezar."); return; }
          setCorriendo(true);
          window.dispatchEvent(new Event(LANZADA));
        })}>
        {ocupado ? "Trabajando…" : texto}
      </button>
      {error && <span className="text-[11px] text-[#C03420] mt-0.5">{error}</span>}
    </span>
  );
}
