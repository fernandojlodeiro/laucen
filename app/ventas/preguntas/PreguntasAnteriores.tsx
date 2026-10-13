"use client";

// «Ver preguntas anteriores» (Fer, 13/10): lo que ya preguntó antes ese comprador (en cualquiera de las cuentas) y lo que
// le respondimos, se despliega ahí mismo, debajo de la pregunta.

import { useState } from "react";
import { accionPreguntasAnteriores, type PreguntaAnterior } from "./acciones";

const fechaCorta = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function PreguntasAnteriores({ preguntaId, cantidad }: { preguntaId: string; cantidad: number }) {
  const [lista, setLista] = useState<PreguntaAnterior[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function alternar() {
    if (abierto) { setAbierto(false); return; }
    setAbierto(true);
    if (lista) return;
    setCargando(true); setError("");
    const r = await accionPreguntasAnteriores(preguntaId).catch(() => null);
    setCargando(false);
    if (!r) setError("No se pudieron traer las preguntas anteriores. Probá de nuevo."); else setLista(r);
  }

  return (
    <div className="mt-2 text-xs">
      <button type="button" onClick={alternar} className="text-[#16577F] hover:underline">
        {abierto ? "Ocultar preguntas anteriores" : `Ver preguntas anteriores (${cantidad})`}
      </button>
      {abierto && (
        <div className="mt-1 space-y-2 rounded-lg border border-[#E3E9F0] bg-[#FAFBFC] p-2">
          {cargando && <p className="text-[#5C6B76]">Buscando…</p>}
          {error && <p className="text-[#C03420]">{error}</p>}
          {lista?.map((a) => (
            <div key={a.id} className="border-t first:border-t-0 border-[#E3E9F0] pt-2 first:pt-0">
              <p className="text-[11px] text-[#5C6B76]">{fechaCorta(a.fecha)}{a.canal ? ` · ${a.canal}` : ""}{a.titulo ? ` · ${a.titulo}` : ""}</p>
              <p><span className="text-[#5C6B76]">Preguntó: </span>{a.texto}</p>
              {a.respuesta
                ? <p className="mt-0.5 rounded bg-[#EEF7F1] px-2 py-1"><span className="text-[#5C6B76]">Le respondimos{a.respondida_ts ? ` (${fechaCorta(a.respondida_ts)})` : ""}: </span>{a.respuesta}</p>
                : <p className="mt-0.5 text-[#8a6100]">{a.estado === "UNANSWERED" ? "Todavía sin responder." : "Sin respuesta."}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
