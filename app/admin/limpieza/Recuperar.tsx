"use client";

import { useState } from "react";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { accionRecuperarPausadas } from "./actions";

type Cuenta = { id: number; nombre: string };
type Resultado = { recuperadas: number; omitidas: { sinProducto: number; notebooks: number; otroEstado: Record<string, number> }; quedan: number; completo: boolean };

const n = (x: number) => x.toLocaleString("es-AR");

/** Recupera en Laucen las pausadas de ML que no están: una cuenta, o todas una atrás de otra. */
export function Recuperar({ cuentas }: { cuentas: Cuenta[] }) {
  const [res, setRes] = useState<Record<number, Resultado | { error: string } | "corriendo">>({});
  const [todas, setTodas] = useState(false);

  /** Una cuenta: repite hasta que la lectura quede completa (cada vuelta suma lo recuperado). */
  async function una(c: Cuenta) {
    setRes((r) => ({ ...r, [c.id]: "corriendo" }));
    let recuperadas = 0, ultimo: Resultado | null = null;
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      let x;
      try { x = await accionRecuperarPausadas(c.id); } catch { x = { ok: false as const, error: "Se cortó la conexión con el servidor." }; }
      if (!x.ok) { setRes((r) => ({ ...r, [c.id]: { error: x.error } })); return; }
      recuperadas += x.recuperadas; ultimo = x;
      if (x.completo) break;
    }
    setRes((r) => ({ ...r, [c.id]: { ...ultimo!, recuperadas } }));
  }

  async function paraTodas() {
    setTodas(true);
    for (const c of cuentas) await una(c);
    setTodas(false);
  }

  const ocupado = todas || Object.values(res).includes("corriendo");
  return (
    <div className="space-y-3">
      <button type="button" disabled={ocupado} onClick={paraTodas} className={`${PRIMARIO} disabled:opacity-60`}>
        {todas ? "Recuperando en todas las cuentas… (no cierres la pantalla)" : "Recuperar en todas las cuentas"}
      </button>
      {cuentas.map((c) => {
        const r = res[c.id];
        return (
          <div key={c.id} className="border border-[#E3E9F0] rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm font-semibold text-[#16577F]">{c.nombre}</span>
              <button type="button" disabled={ocupado} onClick={() => una(c)} className={`${SUAVE} disabled:opacity-60`}>
                {r === "corriendo" ? "Leyendo Mercado Libre… (puede tardar unos minutos)" : "Recuperar pausadas"}
              </button>
            </div>
            {r && r !== "corriendo" && ("error" in r
              ? <p className="text-xs text-[#C03420]">{r.error}</p>
              : <p className="text-xs text-[#5C6B76]">
                  <b className="text-[#1F6E4A]">Recuperadas en Laucen: {n(r.recuperadas)}.</b>{" "}
                  No se recuperaron: {n(r.omitidas.sinProducto)} sin producto en Laucen, {n(r.omitidas.notebooks)} notebooks
                  {Object.entries(r.omitidas.otroEstado).map(([k, v]) => `, ${n(v)} ${k}`).join("")}.
                  {!r.completo && <span className="text-[#8a6100]"> No terminó: apretá de nuevo (quedan {n(r.quedan)} por revisar).</span>}
                </p>)}
          </div>
        );
      })}
    </div>
  );
}
