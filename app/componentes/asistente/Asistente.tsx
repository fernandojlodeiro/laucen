"use client";

// El asistente del panel (pedido de Fer, 3/10): la carita fija abajo a la
// derecha en todas las pantallas; al tocarla se abre el chat al costado. Se
// escribe o se dicta (micrófono del navegador) y contesta
// app/api/asistente, que va avisando qué está haciendo. La conversación
// sigue al cambiar de pantalla y se recupera al recargar (sessionStorage).
// Se le pueden mandar archivos (Fer, 4/11): el clip, arrastrarlos o pegar una
// captura; se suben a Storage y van con la pregunta (lib/asistente/adjuntos.ts).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Carita from "./Carita";
import Texto from "./Texto";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { subirArchivo } from "@/lib/supabase-navegador";
import { destinoDe } from "@/lib/asistente/destinos";

type Accion = { id: number; resumen: string; detalle: string[]; estado: string; resultado: string | null };
type Archivo = { id?: number; nombre: string; tipo: string };
type Mensaje = { id?: number; rol: "usuario" | "asistente"; texto: string; voto?: number | null; error?: boolean; acciones?: Accion[]; adjuntos?: Archivo[] };
/** Lo que se le puede mandar: fotos, PDF, Excel y CSV, hasta 20 por vez y 20 MB cada uno. */
const ACEPTA = "image/*,application/pdf,.pdf,.xlsx,.csv,.txt";
const MAX_ARCHIVOS = 20;
const MAX_MB = 20;
const icono = (tipo: string, nombre: string) => (tipo.startsWith("image/") ? "🖼" : /pdf/i.test(tipo) || /\.pdf$/i.test(nombre) ? "📄" : /\.(xlsx|csv|txt)$/i.test(nombre) ? "📊" : "📎");

const CLAVE = "asistente_conversacion";
/** Hasta dónde crece el cuadro de escribir (unos 10 renglones), en píxeles. */
const ALTO_MAXIMO = 180;

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

export default function Asistente({ nombre, carita, usuario, organizacionId }: { nombre: string; carita: boolean; usuario: string; organizacionId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [conversacion, setConversacion] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const [escuchando, setEscuchando] = useState(false);
  const [hayMicrofono, setHayMicrofono] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [avisoArchivo, setAvisoArchivo] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const elegir = useRef<HTMLInputElement>(null);
  const reconocedor = useRef<Reconocedor | null>(null);
  const baseDictado = useRef("");
  const fondo = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const pathname = usePathname();
  const params = useSearchParams();
  const ruta = `${pathname}${params.size ? `?${params.toString()}` : ""}`;
  // En una pantalla con informe, cada respuesta se puede guardar en él (lib/asistente/destinos.ts).
  const destino = destinoDe(pathname, new URLSearchParams(params.toString()));
  const [agregados, setAgregados] = useState<Record<string, "guardando" | "ok" | "error">>({});

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
  // El cuadro de escribir crece hacia arriba con el texto (hasta unos 10
  // renglones; recién ahí aparece la barra de desplazamiento) y vuelve a su
  // tamaño al enviar. Se mide antes de dibujar (useLayoutEffect) y con la
  // barra escondida: si la barra aparecía al medir, achicaba el ancho, el
  // texto se reacomodaba y el cuadro titilaba.
  useLayoutEffect(() => {
    const c = campo.current;
    if (!c) return;
    c.style.overflowY = "hidden";
    c.style.height = "auto";
    const alto = c.scrollHeight + (c.offsetHeight - c.clientHeight);
    c.style.height = `${Math.min(alto, ALTO_MAXIMO)}px`;
    c.style.overflowY = alto > ALTO_MAXIMO ? "auto" : "hidden";
  }, [texto, abierto]);

  function nueva() {
    setMensajes([]); setConversacion(null); setTexto("");
    try { sessionStorage.removeItem(CLAVE); } catch { /* nada */ }
    campo.current?.focus();
  }

  /** Suma archivos a los que van con la próxima pregunta (con sus topes). */
  function sumarArchivos(lista: FileList | File[] | null) {
    const nuevos = Array.from(lista ?? []);
    if (!nuevos.length) return;
    const grandes = nuevos.filter((f) => f.size > MAX_MB * 1024 * 1024);
    const buenos = nuevos.filter((f) => f.size <= MAX_MB * 1024 * 1024);
    const todos = [...archivos, ...buenos];
    setAvisoArchivo(grandes.length ? `«${grandes[0].name}» pesa más de ${MAX_MB} MB: no se puede mandar.`
      : todos.length > MAX_ARCHIVOS ? `Van hasta ${MAX_ARCHIVOS} archivos por vez.` : null);
    setArchivos(todos.slice(0, MAX_ARCHIVOS));
    campo.current?.focus();
  }

  async function enviar() {
    const escrito = texto.trim();
    if ((!escrito && !archivos.length) || estado) return;
    reconocedor.current?.stop();
    const van = archivos;
    const pregunta = escrito || "Mirá lo que te mando.";
    setTexto(""); setArchivos([]); setAvisoArchivo(null);
    setMensajes((m) => [...m, { rol: "usuario", texto: escrito, adjuntos: van.map((f) => ({ nombre: f.name, tipo: f.type })) }]);
    setEstado(van.length ? "Subiendo los archivos…" : "Pensando…");
    try {
      const adjuntos: { ruta: string; nombre: string; tipo: string; tamano: number }[] = [];
      for (const f of van) {
        const sub = await subirArchivo("importaciones", organizacionId, f, "asistente");
        if ("motivo" in sub) throw new Error(`No se pudo subir «${f.name}». Probá de nuevo.`);
        adjuntos.push({ ruta: sub.ruta, nombre: f.name, tipo: f.type, tamano: f.size });
      }
      setEstado("Pensando…");
      const r = await fetch("/api/asistente", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacion, pregunta, ruta, adjuntos }),
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
          const ev = JSON.parse(renglon) as { tipo: string; texto?: string; id?: number; conversacion?: number; acciones?: Accion[] };
          if (ev.tipo === "conversacion" && ev.conversacion) {
            setConversacion(ev.conversacion);
            try { sessionStorage.setItem(CLAVE, String(ev.conversacion)); } catch { /* nada */ }
          } else if (ev.tipo === "estado") setEstado(ev.texto ?? "Pensando…");
          else if (ev.tipo === "respuesta" || ev.tipo === "error") {
            setMensajes((m) => [...m, { id: ev.id, rol: "asistente", texto: ev.texto ?? "", error: ev.tipo === "error", acciones: ev.acciones }]);
          }
        }
      }
    } catch (e) {
      const motivo = e instanceof Error && e.message.startsWith("No se pudo subir") ? e.message : "No me pude conectar. Probá de nuevo en un momento.";
      setMensajes((m) => [...m, { rol: "asistente", texto: motivo, error: true }]);
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

  async function agregarAlInforme(id: number) {
    if (!destino) return;
    const k = `${destino.clave}:${id}`;
    setAgregados((a) => ({ ...a, [k]: "guardando" }));
    const r = await fetch("/api/asistente/agregar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, destino: destino.clave }) }).catch(() => null);
    setAgregados((a) => ({ ...a, [k]: r?.ok ? "ok" : "error" }));
    if (r?.ok) window.dispatchEvent(new Event("informe-agregado"));
  }

  /** Confirmar o cancelar una acción preparada: la tarjeta queda con el resultado. */
  async function resolver(accionId: number, decision: "confirmar" | "cancelar") {
    const marcar = (cambio: Partial<Accion>) => setMensajes((ms) => ms.map((m) => (m.acciones?.some((a) => a.id === accionId)
      ? { ...m, acciones: m.acciones.map((a) => (a.id === accionId ? { ...a, ...cambio } : a)) } : m)));
    marcar({ estado: decision === "confirmar" ? "haciendo" : "cancelando" });
    try {
      const r = await fetch("/api/asistente/accion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: accionId, decision }) });
      const d = await r.json() as { estado?: string; texto?: string };
      marcar({ estado: d.estado ?? "error", resultado: d.texto ?? "No se pudo." });
    } catch {
      marcar({ estado: "propuesta", resultado: "No me pude conectar: probá de nuevo." });
    }
  }

  function microfono() {
    if (escuchando) { reconocedor.current?.stop(); return; }
    const r = crearReconocedor();
    if (!r) return;
    r.lang = "es-AR"; r.interimResults = true; r.continuous = true;
    baseDictado.current = texto ? `${texto.trim()} ` : "";
    r.onresult = (e) => {
      // En Chrome de celular cada resultado trae TODO lo dicho hasta ahí (no
      // sólo el pedazo nuevo): si un resultado empieza con lo ya juntado, lo
      // reemplaza; si no, se agrega. Así no sale "HolaHola EstelaHola…".
      let texto = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim();
        if (!t) continue;
        const previo = texto.trim().toLowerCase();
        texto = previo && t.toLowerCase().startsWith(previo) ? t : texto ? `${texto} ${t}` : t;
      }
      setTexto(baseDictado.current + texto);
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
          className="print:hidden fixed z-40 right-3 bottom-20 md:bottom-11 rounded-full shadow-lg ring-2 ring-white bg-white hover:scale-105 transition-transform">
          <Carita tamano={56} carita={carita} mecer />
        </button>
      )}
      {abierto && (
        <section aria-label={nombre}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setArrastrando(true); } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastrando(false); }}
          onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setArrastrando(false); sumarArchivos(e.dataTransfer.files); } }}
          className="print:hidden fixed z-40 inset-x-2 top-14 bottom-20 md:inset-x-auto md:right-3 md:top-auto md:bottom-11 md:w-[400px] md:h-[min(640px,calc(100vh-7rem))] flex flex-col bg-white border border-[#E3E9F0] rounded-2xl shadow-2xl overflow-hidden">
          <header className="flex items-center gap-2 px-3 py-2 border-b border-[#E3E9F0] bg-[#F7F9FB]">
            <Carita tamano={36} carita={carita} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#16577F] leading-tight">{nombre}</p>
              <p className="text-[10px] text-[#5C6B76] leading-tight">Te explico dónde está y cómo se hace cada cosa</p>
            </div>
            {conversacion && mensajes.length > 0 && (
              <a href={`/config/asistente/conversacion/${conversacion}`} target="_blank" rel="noopener" title="Ver la conversación para imprimir o guardar en PDF"
                className={`${SUAVE} !px-2 !py-1`}>PDF</a>
            )}
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
              <div key={i} className="flex flex-col items-end gap-1">
                {!!m.adjuntos?.length && (
                  <div className="flex flex-wrap justify-end gap-1 max-w-[85%]">
                    {m.adjuntos.map((a, j) => (
                      <span key={j} className="inline-flex items-center gap-1 rounded-lg border border-[#C9D6E2] bg-white px-2 py-1 text-[11px] text-[#16577F] max-w-full">
                        <span aria-hidden>{icono(a.tipo, a.nombre)}</span><span className="truncate">{a.nombre}</span>
                      </span>
                    ))}
                  </div>
                )}
                {m.texto && <div className="rounded-2xl rounded-tr-sm bg-[#16577F] text-white px-3 py-2 max-w-[85%] whitespace-pre-wrap break-words">{m.texto}</div>}
              </div>
            ) : (
              <div key={i} className="flex gap-2">
                <Carita tamano={24} carita={carita} />
                <div className="max-w-[85%]">
                  <div className={`rounded-2xl rounded-tl-sm px-3 py-2 ${m.error ? "bg-[#FDF0EE] text-[#8A2A1C]" : "bg-[#EEF3F8]"}`}><Texto texto={m.texto} /></div>
                  {m.acciones?.map((a) => <TarjetaAccion key={a.id} a={a} resolver={resolver} />)}
                  {m.id && !m.error && (
                    <div className="flex gap-1 mt-1">
                      <button type="button" onClick={() => votar(i, 1)} aria-label="Me sirvió" title="Me sirvió"
                        className={`rounded-md border px-1.5 py-0.5 text-[11px] ${m.voto === 1 ? "bg-[#E6F4EC] border-[#167655]" : "bg-white border-[#E3E9F0]"}`}>👍</button>
                      <button type="button" onClick={() => votar(i, -1)} aria-label="No me sirvió" title="No me sirvió"
                        className={`rounded-md border px-1.5 py-0.5 text-[11px] ${m.voto === -1 ? "bg-[#FDF0EE] border-[#C03420]" : "bg-white border-[#E3E9F0]"}`}>👎</button>
                      {destino && (() => {
                        const e = agregados[`${destino.clave}:${m.id}`];
                        return (
                          <button type="button" onClick={() => agregarAlInforme(m.id!)} disabled={e === "guardando" || e === "ok"}
                            title="Guardar esta respuesta como una sección más del informe de la pantalla"
                            className={`rounded-md border px-2 py-0.5 text-[11px] ${e === "ok" ? "bg-[#E6F4EC] border-[#167655] text-[#167655]" : e === "error" ? "bg-[#FDF0EE] border-[#C03420] text-[#8A2A1C]" : "bg-white border-[#C9D6E2] text-[#16577F]"}`}>
                            {e === "ok" ? "✓ Agregado al informe" : e === "guardando" ? "Guardando…" : e === "error" ? "No se pudo: probá de nuevo" : `＋ ${destino.etiqueta}`}
                          </button>
                        );
                      })()}
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

          <form onSubmit={(e) => { e.preventDefault(); enviar(); }} className={`border-t border-[#E3E9F0] p-2 ${arrastrando ? "bg-[#EEF3F8]" : ""}`}>
            {arrastrando && <p className="text-[11px] text-[#16577F] font-semibold mb-1">Soltalos acá para mandárselos a {nombre}</p>}
            {archivos.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {archivos.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-[#E3E9F0] bg-[#F7F9FB] pl-2 pr-1 py-0.5 text-[11px] max-w-full">
                    <span aria-hidden>{icono(f.type, f.name)}</span><span className="truncate max-w-48">{f.name}</span>
                    <button type="button" onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))} aria-label={`Sacar ${f.name}`}
                      className="rounded px-1 text-[#5C6B76] hover:bg-[#E3E9F0]">✕</button>
                  </span>
                ))}
              </div>
            )}
            {avisoArchivo && <p role="alert" className="text-[11px] text-[#C03420] mb-1">{avisoArchivo}</p>}
            <div className="flex items-end gap-1.5">
              <input ref={elegir} type="file" multiple accept={ACEPTA} className="hidden" onChange={(e) => { sumarArchivos(e.target.files); e.target.value = ""; }} />
              <button type="button" onClick={() => elegir.current?.click()} aria-label="Adjuntar archivos" title="Adjuntar fotos, PDF, Excel o CSV (también los podés arrastrar o pegar)"
                className="text-sm leading-none rounded-lg px-2 py-2 border bg-[#EEF3F8] border-[#E3E9F0]">📎</button>
              <textarea ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={4000}
                onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); sumarArchivos(e.clipboardData.files); } }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                placeholder={escuchando ? "Te escucho…" : "Escribí tu pregunta…"} aria-label="Tu pregunta"
                className="flex-1 resize-none border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white" />
              {hayMicrofono && (
                <button type="button" onClick={microfono} aria-label={escuchando ? "Dejar de escuchar" : "Dictar la pregunta"} title={escuchando ? "Dejar de escuchar" : "Dictar la pregunta"}
                  className={`text-sm leading-none rounded-lg px-2 py-2 border ${escuchando ? "bg-[#FDF0EE] border-[#C03420] animate-pulse" : "bg-[#EEF3F8] border-[#E3E9F0]"}`}>🎤</button>
              )}
              <button type="submit" disabled={(!texto.trim() && !archivos.length) || !!estado} className={`${PRIMARIO} disabled:opacity-50`}>Enviar</button>
            </div>
            <p className="text-[10px] text-[#5C6B76] mt-1">Las preguntas quedan guardadas. {nombre} no cambia nada: te explica cómo hacerlo.</p>
          </form>
        </section>
      )}
    </>
  );
}

/** Lo que el asistente preparó para hacer: qué va a pasar, y Confirmar / Cancelar. */
function TarjetaAccion({ a, resolver }: { a: Accion; resolver: (id: number, d: "confirmar" | "cancelar") => void }) {
  const ESTADO: Record<string, [string, string]> = {
    hecha: ["Hecho", "text-[#167655]"], cancelada: ["Cancelado", "text-[#5C6B76]"], error: ["No se pudo", "text-[#C03420]"],
    haciendo: ["Haciendo…", "text-[#16577F]"], cancelando: ["Cancelando…", "text-[#5C6B76]"],
  };
  const [texto, tono] = ESTADO[a.estado] ?? ["", ""];
  return (
    <div className="mt-2 rounded-xl border border-[#16577F] bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#16577F]">Para confirmar</p>
      <p className="font-semibold">{a.resumen}</p>
      {a.detalle.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-y-auto list-disc pl-4 text-[11px] text-[#334155] space-y-0.5">
          {a.detalle.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      )}
      {a.estado === "propuesta" ? (
        <div className="flex gap-2 mt-2">
          <button type="button" onClick={() => resolver(a.id, "confirmar")} className={PRIMARIO}>Confirmar</button>
          <button type="button" onClick={() => resolver(a.id, "cancelar")} className={SUAVE}>Cancelar</button>
        </div>
      ) : <p className={`mt-1 text-[11px] font-semibold ${tono}`}>{texto}</p>}
      {a.resultado && <div className="mt-1 text-[11px]"><Texto texto={a.resultado} /></div>}
    </div>
  );
}
