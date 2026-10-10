"use client";

// Avisos de la barra de estado (pedido de Fer, 10/10; lib/avisos.ts):
//   · <ContadoresEstado> (en la barra de abajo): los contadores, que se
//     refrescan solos. Lo que entró y el usuario todavía no vio se pinta en
//     amarillo hasta que entra a esa pantalla.
//   · <VigiaAvisos> (en el marco, una sola vez): pregunta cada 15 segundos.
//     Si el usuario está en la pantalla de un contador y entró algo, la
//     actualiza (salvo que esté escribiendo). Según lo que eligió en
//     Configuración › Mis avisos: suena cuando entra algo (como mucho una vez
//     cada tantos minutos) y abre de prepo una ventana con lo que la IA no
//     contestó. Con la pestaña a la vista se lo dice al servidor (?vista=1):
//     así los avisos de Windows no se duplican con la pantalla.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { esPantallaDe, type AvisoIa, type Contador, type EstadoAvisos } from "@/lib/avisos-tipos";

const EVENTO = "laucen-contadores";
const CADA_MS = 15_000;
const CADA_OCULTA_MS = 60_000;

export function ContadoresEstado({ inicial }: { inicial: Contador[] }) {
  const [contadores, setContadores] = useState(inicial);
  useEffect(() => {
    const cambio = (e: Event) => setContadores((e as CustomEvent<Contador[]>).detail);
    window.addEventListener(EVENTO, cambio);
    return () => window.removeEventListener(EVENTO, cambio);
  }, []);
  return (
    <span className="flex items-center gap-3">
      {contadores.map((c) => <UnContador key={c.clave} c={c} />)}
    </span>
  );
}

function UnContador({ c }: { c: Contador }) {
  if (c.n === null) return <span className="opacity-50" title="Próximamente">{c.texto}: —</span>;
  const marca = c.nuevo ? "bg-[#FFC94D] text-[#3A2A00] rounded px-1" : c.n > 0 ? "bg-white text-[#16577F] rounded px-1" : "";
  const cuerpo = <>{c.texto}: <b className={marca}>{c.n}</b></>;
  const ayuda = c.nuevo ? "Entró algo que todavía no viste" : undefined;
  return c.href ? <Link href={c.href} className="hover:underline" title={ayuda}>{cuerpo}</Link> : <span title={ayuda}>{cuerpo}</span>;
}

export function VigiaAvisos({ inicial }: { inicial: EstadoAvisos }) {
  const router = useRouter();
  const ruta = usePathname();
  const ver = useSearchParams().get("ver");
  const ultimos = useRef(inicial.contadores);
  const [ventana, setVentana] = useState<AvisoIa[]>([]);
  const abiertos = useRef<AvisoIa[]>([]);
  abiertos.current = ventana;
  const marcas = useRef(new Map(inicial.contadores.map((c) => [c.clave, c.marca])));
  const vistos = useRef(new Set<string>());
  const donde = useRef({ ruta, ver });
  donde.current = { ruta, ver };

  // Entrar a la pantalla de un contador = verlo (también si entra algo mientras se está ahí).
  const marcarVistos = useCallback((cs: Contador[]) => {
    const { ruta: r, ver: v } = donde.current;
    let cambio = false;
    const nuevos = cs.map((c) => {
      if (!c.nuevo || !esPantallaDe(c.clave, r, v)) return c;
      const llave = `${c.clave}:${c.marca}`;
      if (!vistos.current.has(llave)) {
        vistos.current.add(llave);
        fetch("/api/avisos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visto: c.clave }) }).catch(() => {});
      }
      cambio = true;
      return { ...c, nuevo: false };
    });
    return cambio ? nuevos : cs;
  }, []);

  const publicar = useCallback((cs: Contador[]) => {
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: cs }));
  }, []);

  const mirar = useCallback(async () => {
    let e: EstadoAvisos;
    try {
      const r = await fetch(`/api/avisos${document.hidden ? "" : "?vista=1"}`, { cache: "no-store" });
      if (!r.ok) return;
      e = await r.json() as EstadoAvisos;
    } catch { return; /* sin red: se reintenta */ }

    // ¿Entró algo desde la última vez?
    const entraron = e.contadores.filter((c) => {
      const antes = marcas.current.get(c.clave);
      return antes !== undefined && c.marca > antes && c.n !== null && c.n > 0;
    });
    marcas.current = new Map(e.contadores.map((c) => [c.clave, c.marca]));
    const contadores = marcarVistos(e.contadores);
    ultimos.current = contadores;
    publicar(contadores);

    // Si está en la pantalla de lo que entró, se actualiza sola (WhatsApp ya se actualiza por su cuenta).
    const { ruta: r, ver: v } = donde.current;
    if (entraron.some((c) => c.clave !== "whatsapp" && esPantallaDe(c.clave, r, v)) && !escribiendo()) router.refresh();

    // Lo que la IA no contestó: con la ventana apagada, queda como avisado sin mostrarse.
    if (e.ventana.length) {
      if (e.prefs.ventana) setVentana((actual) => [...actual, ...e.ventana.filter((a) => !actual.some((x) => x.tipo === a.tipo && x.id === a.id))]);
      else avisar(e.ventana);
    }
    if (e.prefs.sonido && (entraron.length || e.ventana.length)) sonarConLimite(e.prefs.cadaMin);
  }, [marcarVistos, publicar, router]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let vivo = true;
    const vuelta = async () => {
      await mirar();
      if (vivo) timer = setTimeout(vuelta, document.hidden ? CADA_OCULTA_MS : CADA_MS);
    };
    timer = setTimeout(vuelta, 2000);
    const alVolver = () => { if (!document.hidden) { clearTimeout(timer); vuelta(); } };
    document.addEventListener("visibilitychange", alVolver);
    // El navegador deja sonar sólo después de que la persona tocó algo en la página.
    const despertar = () => prepararSonido();
    window.addEventListener("pointerdown", despertar, { once: true });
    window.addEventListener("keydown", despertar, { once: true });
    return () => {
      vivo = false; clearTimeout(timer);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("pointerdown", despertar);
      window.removeEventListener("keydown", despertar);
    };
  }, [mirar]);

  // Al cambiar de pantalla: si es la de un contador con algo nuevo, queda visto.
  useEffect(() => {
    const contadores = marcarVistos(ultimos.current);
    if (contadores === ultimos.current) return;
    ultimos.current = contadores;
    publicar(contadores);
  }, [ruta, ver, marcarVistos, publicar]);

  const cerrar = useCallback(() => {
    avisar(abiertos.current);
    setVentana([]);
  }, []);

  useEffect(() => {
    if (!ventana.length) return;
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") cerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [ventana.length, cerrar]);

  if (!ventana.length) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 print:hidden" role="dialog" aria-modal="true" aria-labelledby="aviso-ia-titulo">
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-[#E3E9F0] px-4 py-3">
          <h2 id="aviso-ia-titulo" className="text-sm font-bold">
            {ventana.length === 1 ? "La IA no contestó esto: te necesita" : `La IA no contestó ${ventana.length} cosas: te necesitan`}
          </h2>
          <button type="button" onClick={cerrar} className={SUAVE}>Cerrar</button>
        </div>
        <div className="overflow-y-auto px-4 py-3 grid gap-3">
          {ventana.map((a) => (
            <div key={`${a.tipo}:${a.id}`} className="rounded-lg border border-[#E3E9F0] p-3 text-xs grid gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <b className="text-[13px]">{a.titulo}</b>
                  {a.detalle && <div className="text-[#5C6B76]">{a.detalle}</div>}
                </div>
                <Link href={a.href} onClick={cerrar} className={`${PRIMARIO} shrink-0`}>Ir a responder</Link>
              </div>
              {a.texto && <p className="whitespace-pre-wrap rounded-lg bg-[#F7F9FB] border border-[#E3E9F0] px-2 py-1.5 text-[13px]">{a.texto}</p>}
              {a.motivo && <p className="text-[#8a6100]">⚠ {a.motivo}</p>}
              {a.propuesta && <p className="text-[#5C6B76]"><b>La IA propone:</b> {a.propuesta}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Guarda que ya se mostró (o que no hacía falta mostrarlo): no se vuelve a abrir. */
function avisar(avisos: AvisoIa[]) {
  if (!avisos.length) return;
  const marcas: Record<string, number> = {};
  for (const a of avisos) marcas[a.tipo] = Math.max(marcas[a.tipo] ?? 0, a.marca);
  fetch("/api/avisos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ avisado: marcas }) }).catch(() => {});
}

/** ¿Está escribiendo en un campo? Entonces no se le actualiza la pantalla abajo de los dedos. */
function escribiendo(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

// ── El sonido: dos notas cortas (un tercio de segundo), sin archivo ──

const ULTIMO_SONIDO = "laucen-ultimo-sonido";

/** Suena como mucho una vez cada `cadaMin` minutos (también entre pestañas). */
function sonarConLimite(cadaMin: number) {
  let ultimo = 0;
  try { ultimo = Number(localStorage.getItem(ULTIMO_SONIDO)) || 0; } catch { /* sin almacenamiento */ }
  if (Date.now() - ultimo < Math.max(1, cadaMin) * 60_000 - 2000) return;
  try { localStorage.setItem(ULTIMO_SONIDO, String(Date.now())); } catch { /* sin almacenamiento */ }
  sonar();
}
let audio: AudioContext | null = null;

function prepararSonido() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch { /* sin audio */ }
}

export function sonar() {
  prepararSonido();
  if (!audio) return;
  const t = audio.currentTime;
  for (const [i, f] of [880, 1320].entries()) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.18);
    g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
    o.connect(g).connect(audio.destination);
    o.start(t + i * 0.18);
    o.stop(t + i * 0.18 + 0.18);
  }
}
