"use client";

// Lector de códigos del depósito: un campo grande con foco donde se escribe
// el código o lo "tipea" una pistola lectora (USB/Bluetooth: escriben el
// código y mandan Enter), y un botón "Cámara" que lee con la cámara trasera
// del teléfono usando BarcodeDetector del navegador (Chrome/Android; Safari
// de iPhone no lo tiene). Al leer llama a `alLeer(codigo)`: si devuelve
// false suena el pitido de error; si no, el de OK.

import { useEffect, useRef, useState } from "react";
import { SUAVE } from "@/app/botones";

// BarcodeDetector todavía no está en los tipos de TypeScript.
type Detectado = { rawValue: string };
type Detector = { detect: (v: HTMLVideoElement) => Promise<Detectado[]> };
type ConstructorDetector = new (o: { formats: string[] }) => Detector;

const FORMATOS = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"];

let audio: AudioContext | null = null;
/** Pitido corto sin archivos: agudo y breve si salió bien, grave y doble si no. */
export function pitido(ok: boolean) {
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctx = W.AudioContext ?? W.webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const tonos = ok ? [{ f: 1500, t: 0, d: 0.09 }] : [{ f: 220, t: 0, d: 0.15 }, { f: 220, t: 0.2, d: 0.15 }];
    for (const { f, t, d } of tonos) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = ok ? "sine" : "square";
      o.frequency.value = f;
      g.gain.value = 0.15;
      o.connect(g).connect(audio.destination);
      const ahora = audio.currentTime + t;
      o.start(ahora);
      o.stop(ahora + d);
    }
  } catch { /* sin sonido no pasa nada */ }
}

export default function Escaner({ alLeer, placeholder = "Escaneá o escribí el código", autoFoco = true, devolverFoco = true, campoRef, chico }: {
  alLeer: (codigo: string) => Promise<boolean | void> | boolean | void;
  placeholder?: string;
  autoFoco?: boolean;
  /** false: después de leer no se queda con el foco (la pantalla lo mueve a otro campo). */
  devolverFoco?: boolean;
  /** Para que la pantalla mueva el foco a este campo cuando quiera. */
  campoRef?: React.RefObject<HTMLInputElement | null>;
  /** Versión más baja (para un segundo lector, ej. la ubicación). */
  chico?: boolean;
}) {
  const propio = useRef<HTMLInputElement>(null);
  const campo = campoRef ?? propio;
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const ultimo = useRef<{ codigo: string; ts: number }>({ codigo: "", ts: 0 });
  const ocupado = useRef(false);
  // La cámara corre en un bucle armado una vez: siempre llama a la última alLeer.
  const alLeerActual = useRef(alLeer);
  alLeerActual.current = alLeer;
  const [valor, setValor] = useState("");
  const [hayDetector, setHayDetector] = useState<boolean | null>(null);
  const [camara, setCamara] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => {
    setHayDetector("BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
    return () => apagar();
  }, []);

  async function leer(codigo: string) {
    const c = codigo.trim();
    if (!c || ocupado.current) return;
    ocupado.current = true;
    try {
      const r = await alLeerActual.current(c);
      pitido(r !== false);
    } catch {
      pitido(false);
    } finally {
      ocupado.current = false;
      setValor("");
      if (devolverFoco) campo.current?.focus();
    }
  }

  function apagar() {
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
    setCamara(false);
  }

  async function prender() {
    setProblema(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      flujo.current = s;
      setCamara(true);
      // El <video> aparece en el próximo dibujo.
      requestAnimationFrame(() => buscar(s));
    } catch {
      setProblema("No se pudo abrir la cámara (¿le diste permiso al navegador?).");
      apagar();
    }
  }

  async function buscar(s: MediaStream) {
    const v = video.current;
    if (!v) return;
    v.srcObject = s;
    await v.play().catch(() => {});
    const D = (window as unknown as { BarcodeDetector: ConstructorDetector }).BarcodeDetector;
    let detector: Detector;
    try { detector = new D({ formats: FORMATOS }); } catch { detector = new D({ formats: ["ean_13", "code_128", "qr_code"] }); }
    const vuelta = async () => {
      if (flujo.current !== s) return;
      try {
        if (v.readyState >= 2 && !ocupado.current) {
          const hallados = await detector.detect(v);
          const c = hallados[0]?.rawValue?.trim();
          // El mismo código dos veces seguidas en menos de 1,5 s es la misma lectura.
          if (c && !(c === ultimo.current.codigo && Date.now() - ultimo.current.ts < 1500)) {
            ultimo.current = { codigo: c, ts: Date.now() };
            await leer(c);
          } else if (c) ultimo.current.ts = Date.now();
        }
      } catch { /* un cuadro que no se pudo leer: sigue */ }
      setTimeout(vuelta, 200);
    };
    vuelta();
  }

  return (
    <div className="space-y-2">
      <form onSubmit={(e) => { e.preventDefault(); leer(valor); }} className="flex gap-2">
        <input ref={campo} value={valor} onChange={(e) => setValor(e.target.value)} autoFocus={autoFoco}
          placeholder={placeholder} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
          className={`flex-1 min-w-0 border-2 border-[#16577F] rounded-xl px-3 bg-white ${chico ? "py-2 text-base" : "py-3 text-lg"}`} />
        <button type="button" disabled={!hayDetector} onClick={() => (camara ? apagar() : prender())}
          className={`${SUAVE} ${chico ? "px-3" : "px-4 text-sm"} disabled:opacity-50`}>
          {camara ? "Cerrar" : "📷 Cámara"}
        </button>
      </form>
      {hayDetector === false && (
        <p className="text-[11px] text-[#5C6B76]">Este navegador no lee códigos con la cámara: usá el campo o una pistola lectora.</p>
      )}
      {problema && <p className="text-[11px] text-[#C03420]">{problema}</p>}
      {camara && (
        <video ref={video} muted playsInline className="w-full max-h-64 object-cover rounded-xl bg-black" />
      )}
    </div>
  );
}
