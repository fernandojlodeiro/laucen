"use client";

// La primera vez que alguien entra a Laucen en una computadora (pedido de Fer,
// 10/10): un cartel ofrece los avisos de Windows. «Sí, avisame» abre el
// permiso del navegador (el navegador lo deja pedir sólo desde un clic).
// Si el permiso ya estaba dado, quedan activados solos, sin preguntar.

import { useEffect, useState } from "react";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { activarPush, alEntrar, yaOfrecido } from "./push-cliente";

export default function OfrecerAvisos() {
  const [ver, setVer] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { void alEntrar().then((r) => setVer(r === "ofrecer")).catch(() => {}); }, 3000);
    return () => clearTimeout(t);
  }, []);

  if (!ver) return null;
  const cerrar = () => { yaOfrecido(); setVer(false); };
  return (
    <div role="dialog" aria-labelledby="ofrecer-avisos" className="fixed bottom-20 md:bottom-12 left-4 z-[65] w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[#E3E9F0] bg-white p-3 text-xs shadow-lg print:hidden">
      <p id="ofrecer-avisos" className="font-bold text-[13px] mb-1">🔔 ¿Te avisamos por Windows?</p>
      <p className="text-[#5C6B76] mb-2">
        Cuando la IA no pueda contestar una pregunta o un mensaje, te aparece un cartel abajo a la derecha, aunque tengas Laucen cerrado.
        Al apretar «Sí, avisame» el navegador te pide permiso: elegí «Permitir».
      </p>
      <div className="flex gap-2">
        <button type="button" disabled={trabajando} className={PRIMARIO}
          onClick={async () => { setTrabajando(true); await activarPush().catch(() => {}); cerrar(); }}>
          {trabajando ? "Trabajando…" : "Sí, avisame"}
        </button>
        <button type="button" onClick={cerrar} className={SUAVE}>Ahora no</button>
      </div>
      <p className="text-[10px] text-[#5C6B76] mt-2">Se cambia cuando quieras en Configuración › Mis avisos.</p>
    </div>
  );
}
