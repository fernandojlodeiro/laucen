"use client";

// Piezas del piloto que necesitan el navegador: el buscador de categorías del
// formulario y el botón "Procesar", que repite las tandas hasta terminar.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PRIMARIO, SUAVE, BORRAR } from "@/app/botones";

type Cat = { id: string; ruta: string; nivel?: number };

export function ElegirCategorias({ buscar, iniciales = [] }: { buscar: (t: string) => Promise<Cat[]>; iniciales?: Cat[] }) {
  const [elegidas, setElegidas] = useState<Cat[]>(iniciales);
  const [resultados, setResultados] = useState<Cat[]>([]);
  const [buscando, setBuscando] = useState(false);
  const texto = useRef<HTMLInputElement>(null);

  async function correr() {
    const t = texto.current?.value ?? "";
    setBuscando(true);
    setResultados(await buscar(t));
    setBuscando(false);
  }

  return (
    <div className="grid gap-2 text-xs">
      <input type="hidden" name="cats" value={JSON.stringify(elegidas.map(({ id, ruta }) => ({ id, ruta })))} />
      <div className="flex gap-2">
        <input ref={texto} placeholder="Buscar categoría (ej: macetas, camping, iluminación)"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); correr(); } }}
          className="border border-[#E3E9F0] rounded-lg px-3 py-2 text-sm flex-1" />
        <button type="button" onClick={correr} disabled={buscando} className={`${SUAVE} disabled:opacity-60`}>{buscando ? "Buscando…" : "Buscar"}</button>
      </div>
      {resultados.length > 0 && (
        <ul className="border border-[#E3E9F0] rounded-lg bg-white max-h-64 overflow-y-auto">
          {resultados.map((c) => {
            const ya = elegidas.some((e) => e.id === c.id);
            return (
              <li key={c.id} className="flex items-center gap-2 px-3 py-1.5 border-b last:border-0 border-[#E3E9F0]">
                <span className="flex-1">{c.ruta} <span className="text-[#9AA7B3]">(nivel {c.nivel})</span></span>
                <button type="button" disabled={ya} onClick={() => setElegidas([...elegidas, c])} className={`${SUAVE} disabled:opacity-40`}>
                  {ya ? "Elegida" : "Agregar"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <p className="mb-1 font-bold">Categorías elegidas ({elegidas.length})</p>
        {elegidas.length === 0 && <p className="text-[#9AA7B3]">Ninguna todavía.</p>}
        <ul className="grid gap-1">
          {elegidas.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="flex-1">{c.ruta}</span>
              <button type="button" onClick={() => setElegidas(elegidas.filter((e) => e.id !== c.id))} className={BORRAR} aria-label="Quitar">✕</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type Resultado = { terminado: boolean; ocupado?: boolean; hecho: string; fallo?: boolean };

export function Procesar({ id, avanzar, terminado: yaTerminado }: { id: number; avanzar: (id: number) => Promise<Resultado>; terminado: boolean }) {
  const router = useRouter();
  const [corriendo, setCorriendo] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const seguir = useRef(false);

  async function arrancar() {
    seguir.current = true;
    setCorriendo(true);
    let fallos = 0;
    while (seguir.current) {
      const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      let r: Resultado;
      try {
        r = await avanzar(id);
      } catch {
        r = { terminado: false, hecho: "Se cortó la conexión con el servidor; reintento.", fallo: true };
      }
      setLog((l) => [`${hora} · ${r.hecho}`, ...l].slice(0, 30));
      router.refresh();
      if (r.terminado) break;
      fallos = r.fallo ? fallos + 1 : 0;
      if (fallos >= 3) { setLog((l) => ["Tres tandas seguidas con problemas: frené. Avisale a Code.", ...l]); break; }
      if (r.ocupado || r.fallo) await new Promise((ok) => setTimeout(ok, 20_000));
    }
    seguir.current = false;
    setCorriendo(false);
  }

  return (
    <div className="mb-4">
      {yaTerminado ? (
        <p className="text-xs text-[#1F6E4A]">Piloto terminado.</p>
      ) : corriendo ? (
        <button type="button" onClick={() => { seguir.current = false; }} className={SUAVE}>Detener (termina la tanda en curso)</button>
      ) : (
        <button type="button" onClick={arrancar} className={PRIMARIO}>Procesar</button>
      )}
      {!yaTerminado && (
        <p className="text-[11px] text-[#5C6B76] mt-1">
          Trabaja por tandas de hasta 5 minutos mientras esta página esté abierta. Si la cerrás, retoma donde quedó cuando vuelvas a apretar Procesar.
        </p>
      )}
      {log.length > 0 && (
        <ul className="mt-2 text-[11px] text-[#5C6B76] bg-white border border-[#E3E9F0] rounded-lg px-3 py-2 max-h-40 overflow-y-auto">
          {log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
    </div>
  );
}
