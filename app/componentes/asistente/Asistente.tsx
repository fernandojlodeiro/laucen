"use client";

// El asistente del panel (pedido de Fer, 3/10): la carita fija abajo a la
// derecha en todas las pantallas; al tocarla se abre el chat al costado. Se
// escribe o se dicta (micrófono del navegador) y contesta
// app/api/asistente, que va avisando qué está haciendo. La conversación
// sigue al cambiar de pantalla y se recupera al recargar (sessionStorage).

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Carita from "./Carita";
import Texto from "./Texto";
import { PRIMARIO, SUAVE } from "@/app/botones";

type Mensaje = { id?: number; rol: "usuario" | "asistente"; texto: string; voto?: number | null; error?: boolean };

const CLAVE = "asistente_conversacion";

// El reconocimiento de voz del navegador (Chrome/Edge: webkitSpeechRecognition).
type Reconocedor = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void;
};
function crearReconocedor(): Reconocedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

export default function Asistente({ nombre, carita, usuario }: { nombre: string; carita: boolean; usuario: string }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [conversacion, setConversacion] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const [escuchando, setEscuchando] = useState(false);
  const [hayMicrofono, setHayMicrofono] = useState(false);
  const reconocedor = useRef<Reconocedor | null>(null);
  const baseDictado = useRef("");
  const fondo = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const pathname = usePathname();
  const params = useSearchParams();
  const ruta = `${pathname}${params.size ? `?${params.toString()}` : ""}`;

  // Recuperar la conversación de esta pestaña.
  useEffect(() => {
    setHayMicrofono(!!crearReconocedor());
    let id: number | null = null;
    try { id = Number(sessionStorage.getItem(CLAVE)) || null; } catch { /* sin almacenamiento */ }
    if (!id) return;
    fetch(`/api/asistente?conversacion=${id}`).then((r) => r.json()).then((d: { mensajes?: Mensaje[] }) => {
      if (d.mensajes?.length) { setMensajes(d.mensajes); setConversacion(id); }
    }).catch(() => {});
  }, []);

  useEffect(() => { fondo.current?.scrollIntoView({ block: "end" }); }, [mensajes, estado, abierto]);
  useEffect(() => { if (abierto) campo.current?.focus(); }, [abierto]);

  function nueva() {
    setMensajes([]); setConversacion(null); setTexto("");
    try { sessionStorage.removeItem(CLAVE); } catch { /* nada */ }
    campo.current?.focus();
  }

  async function enviar() {
    const pregunta = texto.trim();
    if (!pregunta || estado) return;
    reconocedor.current?.stop();
    setTexto("");
    setMensajes((m) => [...m, { rol: "usuario", texto: pregunta }]);
    setEstado("Pensando…");
    try {
      const r = await fetch("/api/asistente", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacion, pregunta, ruta }),
      });
      if (!r.ok || !r.body) throw new Error(String(r.status));
      const lector = r.body.getReader();
      const dec = new TextDecoder();
      let resto = "";
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        const renglones = resto.split("\n");
        resto = renglones.pop() ?? "";
        for (const renglon of renglones) {
          if (!renglon.trim()) continue;
          const ev = JSON.parse(renglon) as { tipo: string; texto?: string; id?: number; conversacion?: number };
          if (ev.tipo === "conversacion" && ev.conversacion) {
            setConversacion(ev.conversacion);
            try { sessionStorage.setItem(CLAVE, String(ev.conversacion)); } catch { /* nada */ }
          } else if (ev.tipo === "estado") setEstado(ev.texto ?? "Pensando…");
          else if (ev.tipo === "respuesta" || ev.tipo === "error") {
            setMensajes((m) => [...m, { id: ev.id, rol: "asistente", texto: ev.texto ?? "", error: ev.tipo === "error" }]);
          }
        }
      }
    } catch {
      setMensajes((m) => [...m, { rol: "asistente", texto: "No me pude conectar. Probá de nuevo en un momento.", error: true }]);
    } finally {
      setEstado(null);
    }
  }

  async function votar(i: number, voto: number) {
    const m = mensajes[i];
    if (!m.id) return;
    const nuevo = m.voto === voto ? null : voto;
    setMensajes((ms) => ms.map((x, j) => (j === i ? { ...x, voto: nuevo } : x)));
    fetch("/api/asistente/voto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, voto: nuevo }) }).catch(() => {});
  }

  function microfono() {
    if (escuchando) { reconocedor.current?.stop(); return; }
    const r = crearReconocedor();
    if (!r) return;
    r.lang = "es-AR"; r.interimResults = true; r.continuous = true;
    baseDictado.current = texto ? `${texto.trim()} ` : "";
    r.onresult = (e) => {
      let final = "", provisorio = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else provisorio += t;
      }
      setTexto(baseDictado.current + final + provisorio);
    };
    r.onend = () => { setEscuchando(false); reconocedor.current = null; campo.current?.focus(); };
    r.onerror = () => { setEscuchando(false); reconocedor.current = null; };
    reconocedor.current = r;
    setEscuchando(true);
    r.start();
  }

  const primerNombre = usuario.split(/[\s@]/)[0];

  return (
    <>
      {!abierto && (
        <button type="button" onClick={() => setAbierto(true)} title={`Preguntale a ${nombre}`} aria-label={`Abrir ${nombre}, el asistente`}
          className="fixed z-40 right-3 bottom-20 md:bottom-11 rounded-full shadow-lg ring-2 ring-white bg-white hover:scale-105 transition-transform">
          <Carita tamano={56} carita={carita} mecer />
        </button>
      )}
      {abierto && (
        <section aria-label={nombre}
          className="fixed z-40 inset-x-2 top-14 bottom-20 md:inset-x-auto md:right-3 md:top-auto md:bottom-11 md:w-[400px] md:h-[min(640px,calc(100vh-7rem))] flex flex-col bg-white border border-[#E3E9F0] rounded-2xl shadow-2xl overflow-hidden">
          <header className="flex items-center gap-2 px-3 py-2 border-b border-[#E3E9F0] bg-[#F7F9FB]">
            <Carita tamano={36} carita={carita} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#16577F] leading-tight">{nombre}</p>
              <p className="text-[10px] text-[#5C6B76] leading-tight">Te explico dónde está y cómo se hace cada cosa</p>
            </div>
            {mensajes.length > 0 && <button type="button" onClick={nueva} className={`${SUAVE} !px-2 !py-1`}>Nueva</button>}
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className={`${SUAVE} !px-2 !py-1`}>✕</button>
          </header>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-xs leading-relaxed">
            <div className="flex gap-2">
              <Carita tamano={24} carita={carita} />
              <div className="rounded-2xl rounded-tl-sm bg-[#EEF3F8] px-3 py-2 max-w-[85%]">
                ¡Hola{primerNombre ? `, ${primerNombre}` : ""}! Soy {nombre}. ¿En qué te puedo ayudar?
                <span className="block text-[10px] text-[#5C6B76] mt-1">Preguntame cómo se hace algo, dónde está una opción o un dato del sistema.</span>
              </div>
            </div>
            {mensajes.map((m, i) => m.rol === "usuario" ? (
              <div key={i} className="flex justify-end">
                <div className="rounded-2xl rounded-tr-sm bg-[#16577F] text-white px-3 py-2 max-w-[85%] whitespace-pre-wrap break-words">{m.texto}</div>
              </div>
            ) : (
              <div key={i} className="flex gap-2">
                <Carita tamano={24} carita={carita} />
                <div className="max-w-[85%]">
                  <div className={`rounded-2xl rounded-tl-sm px-3 py-2 ${m.error ? "bg-[#FDF0EE] text-[#8A2A1C]" : "bg-[#EEF3F8]"}`}><Texto texto={m.texto} /></div>
                  {m.id && !m.error && (
                    <div className="flex gap-1 mt-1">
                      <button type="button" onClick={() => votar(i, 1)} aria-label="Me sirvió" title="Me sirvió"
                        className={`rounded-md border px-1.5 py-0.5 text-[11px] ${m.voto === 1 ? "bg-[#E6F4EC] border-[#167655]" : "bg-white border-[#E3E9F0]"}`}>👍</button>
                      <button type="button" onClick={() => votar(i, -1)} aria-label="No me sirvió" title="No me sirvió"
                        className={`rounded-md border px-1.5 py-0.5 text-[11px] ${m.voto === -1 ? "bg-[#FDF0EE] border-[#C03420]" : "bg-white border-[#E3E9F0]"}`}>👎</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {estado && (
              <div className="flex gap-2 items-center text-[#5C6B76]">
                <Carita tamano={24} carita={carita} mecer />
                <span className="italic">{estado}</span>
              </div>
            )}
            <div ref={fondo} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); enviar(); }} className="border-t border-[#E3E9F0] p-2">
            <div className="flex items-end gap-1.5">
              <textarea ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={4000}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                placeholder={escuchando ? "Te escucho…" : "Escribí tu pregunta…"} aria-label="Tu pregunta"
                className="flex-1 resize-none border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white max-h-32" />
              {hayMicrofono && (
                <button type="button" onClick={microfono} aria-label={escuchando ? "Dejar de escuchar" : "Dictar la pregunta"} title={escuchando ? "Dejar de escuchar" : "Dictar la pregunta"}
                  className={`text-sm leading-none rounded-lg px-2 py-2 border ${escuchando ? "bg-[#FDF0EE] border-[#C03420] animate-pulse" : "bg-[#EEF3F8] border-[#E3E9F0]"}`}>🎤</button>
              )}
              <button type="submit" disabled={!texto.trim() || !!estado} className={`${PRIMARIO} disabled:opacity-50`}>Enviar</button>
            </div>
            <p className="text-[10px] text-[#5C6B76] mt-1">Las preguntas quedan guardadas. {nombre} no cambia nada: te explica cómo hacerlo.</p>
          </form>
        </section>
      )}
    </>
  );
}
