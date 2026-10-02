"use client";

// Formulario del recibo (cobro a un cliente) o de la orden de pago (a un
// proveedor): hasta 4 medios y 3 retenciones, con el total que se va armando
// en pesos (un medio en dólares se suma al tipo de cambio del día).

import { useState } from "react";
import CampoNumero from "@/app/componentes/CampoNumero";
import { leerNumero, formatearNumero } from "@/lib/numeros";
import { BotonEnviar } from "@/app/radar/Cliente";
import { VERDE } from "@/app/botones";

const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";
const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";

type Cuenta = { id: number; nombre: string; moneda: "ARS" | "USD" };

export default function FormRecibo({ accion, campos, cuentas, tc, hoy, esCobro }: {
  accion: (fd: FormData) => Promise<void>;
  campos: Record<string, string>;
  cuentas: Cuenta[];
  tc: number | null;
  hoy: string;
  esCobro: boolean;
}) {
  const [total, setTotal] = useState(0);
  const [monedas, setMonedas] = useState<("ARS" | "USD" | null)[]>([null, null, null, null]);

  // Recalcula leyendo el formulario entero (los CampoNumero no avisan su valor).
  const recalcular = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    let t = 0;
    const m: ("ARS" | "USD" | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const cta = cuentas.find((c) => c.id === Number(fd.get(`medio_cuenta_${i}`)));
      m.push(cta?.moneda ?? null);
      const imp = leerNumero(fd.get(`medio_importe_${i}`)) ?? 0;
      t += cta?.moneda === "USD" ? imp * (tc ?? 0) : imp;
    }
    for (let i = 0; i < 3; i++) t += leerNumero(fd.get(`ret_importe_${i}`)) ?? 0;
    setTotal(Math.round(t * 100) / 100);
    setMonedas(m);
  };

  return (
    <form action={accion} onInput={(e) => recalcular(e.currentTarget)} onBlur={(e) => recalcular(e.currentTarget)}
      className="bg-white border border-[#E3E9F0] rounded-xl p-3 mb-4 space-y-3">
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="flex flex-wrap items-end gap-3">
        <label><span className={ETIQUETA}>Fecha</span>
          <input type="date" name="fecha" defaultValue={hoy} className={CAMPO} /></label>
        <label className="flex-1 min-w-48"><span className={ETIQUETA}>Notas</span>
          <input name="notas" className={`${CAMPO} w-full`} /></label>
      </div>

      <div>
        <p className={ETIQUETA}>{esCobro ? "Medios (a qué cuenta entra)" : "Medios (de qué cuenta sale)"}</p>
        <div className="space-y-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select name={`medio_cuenta_${i}`} defaultValue="" className={`${CAMPO} w-56`} aria-label={`Cuenta del medio ${i + 1}`}>
                <option value="">—</option>
                {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda === "USD" ? "US$" : "$"})</option>)}
              </select>
              <CampoNumero name={`medio_importe_${i}`} valor={null} tipo="pesos" className={`${CAMPO} w-32`} placeholder="Importe" />
              <span className="text-[11px] text-[#5C6B76] w-8">{monedas[i] === "USD" ? "US$" : monedas[i] ? "$" : ""}</span>
            </div>
          ))}
        </div>
        {!cuentas.length && <p className="text-[11px] text-[#C03420] mt-1">No hay cuentas de fondos activas: cargalas en Caja y bancos.</p>}
      </div>

      <div>
        <p className={ETIQUETA}>{esCobro ? "Retenciones que nos hicieron (en pesos)" : "Retenciones que practicamos (en pesos)"}</p>
        <div className="space-y-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input name={`ret_concepto_${i}`} placeholder="Concepto (ej. Ret. IIBB)" className={`${CAMPO} w-56`} />
              <CampoNumero name={`ret_importe_${i}`} valor={null} tipo="pesos" className={`${CAMPO} w-32`} placeholder="Importe" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E3E9F0] pt-2">
        <p className="text-xs">
          Total: <b className="tabular-nums">$ {formatearNumero(total, "pesos")}</b>
          {monedas.includes("USD") && !tc && <span className="text-[#C03420]"> · no hay tipo de cambio de hoy</span>}
        </p>
        <BotonEnviar clase={VERDE} corriendo="Emitiendo…">{esCobro ? "Emitir recibo" : "Emitir orden de pago"}</BotonEnviar>
      </div>
    </form>
  );
}
