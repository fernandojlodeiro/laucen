"use client";

// Pieza del piloto que necesita el navegador: el botón "Procesar", que
// repite las tandas hasta terminar.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PRIMARIO, SUAVE } from "@/app/botones";

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
