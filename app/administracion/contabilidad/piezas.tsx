"use client";

// Piezas de navegador de la contabilidad: el formulario del asiento manual
// (que va sumando el debe y el haber mientras se carga) y el interruptor que
// vive adentro de la fila editada del plan de cuentas.

import { useState } from "react";
import CampoNumero from "@/app/componentes/CampoNumero";
import { BotonEnviar } from "@/app/radar/Cliente";
import { leerNumero } from "@/lib/numeros";
import { VERDE } from "@/app/botones";

const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";
const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";
const RENGLONES = 10;

const pesos = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function FormAsiento({ accion, cuentas, hoy, razones = [], razonInicial = null }: {
  accion: (fd: FormData) => Promise<void>;
  cuentas: { id: number; codigo: string; nombre: string }[];
  hoy: string;
  /** Con más de una razón social, a cuál pertenece el asiento. */
  razones?: { id: number; nombre: string }[];
  razonInicial?: number | null;
}) {
  const [tot, setTot] = useState({ debe: 0, haber: 0 });
  // Suma en cada tecla lo que hay escrito en los campos debe_N / haber_N.
  const sumar = (f: HTMLFormElement) => {
    const fd = new FormData(f);
    let debe = 0, haber = 0;
    for (let i = 0; i < RENGLONES; i++) {
      debe += leerNumero(fd.get(`debe_${i}`)) ?? 0;
      haber += leerNumero(fd.get(`haber_${i}`)) ?? 0;
    }
    setTot({ debe: Math.round(debe * 100) / 100, haber: Math.round(haber * 100) / 100 });
  };
  const dif = Math.round((tot.debe - tot.haber) * 100) / 100;

  return (
    <form action={accion} onInput={(e) => sumar(e.currentTarget)} onBlur={(e) => sumar(e.currentTarget)}
      className="bg-white border border-[#E3E9F0] rounded-xl p-3 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label><span className={ETIQUETA}>Fecha</span><input type="date" name="fecha" defaultValue={hoy} className={CAMPO} /></label>
        {razones.length > 1 && (
          <label><span className={ETIQUETA}>Razón social</span>
            <select name="emisor" defaultValue={razonInicial ?? ""} className={CAMPO}>
              {razones.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select></label>
        )}
        <label className="flex-1 min-w-60"><span className={ETIQUETA}>Concepto</span><input name="concepto" className={`${CAMPO} w-full`} placeholder="Ej. Ajuste de saldo bancario" /></label>
        <label className="flex items-center gap-2 text-xs pb-1.5">
          <input type="checkbox" name="apertura" className="h-4 w-4" /> Es el asiento de apertura
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[#5C6B76]">
            <tr>
              <th className="py-1 px-1 text-left font-semibold">Cuenta</th>
              <th className="py-1 px-1 text-right font-semibold w-36">Debe</th>
              <th className="py-1 px-1 text-right font-semibold w-36">Haber</th>
              <th className="py-1 px-1 text-left font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: RENGLONES }, (_, i) => (
              <tr key={i}>
                <td className="py-0.5 px-1">
                  <select name={`cuenta_${i}`} defaultValue="" className={`${CAMPO} w-full min-w-56`}>
                    <option value="">—</option>
                    {cuentas.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                  </select>
                </td>
                <td className="py-0.5 px-1"><CampoNumero name={`debe_${i}`} valor={null} tipo="pesos" className={`${CAMPO} w-full`} /></td>
                <td className="py-0.5 px-1"><CampoNumero name={`haber_${i}`} valor={null} tipo="pesos" className={`${CAMPO} w-full`} /></td>
                <td className="py-0.5 px-1"><input name={`detalle_${i}`} className={`${CAMPO} w-full min-w-40`} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#E3E9F0] font-bold">
              <td className="py-1.5 px-1 text-right">Totales</td>
              <td className="py-1.5 px-1 text-right tabular-nums">{pesos(tot.debe)}</td>
              <td className="py-1.5 px-1 text-right tabular-nums">{pesos(tot.haber)}</td>
              <td className="py-1.5 px-1">
                {tot.debe === 0 && tot.haber === 0 ? <span className="font-normal text-[#5C6B76]">El debe y el haber tienen que dar lo mismo.</span>
                  : dif === 0 ? <span className="text-[#1F6E4A]">Balancea</span>
                  : <span className="text-[#C03420]">No balancea: diferencia {pesos(Math.abs(dif))}</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <BotonEnviar clase={VERDE} corriendo="Grabando…">Grabar asiento</BotonEnviar>
    </form>
  );
}

/** Interruptor que va adentro de un formulario: no manda nada al tocarlo,
 *  sólo cambia el valor del campo `name` ("1" / "0") que se manda al guardar. */
export function InterruptorCampo({ name, prendido, etiqueta }: { name: string; prendido: boolean; etiqueta: string }) {
  const [on, setOn] = useState(prendido);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <input type="hidden" name={name} value={on ? "1" : "0"} />
      <button type="button" role="switch" aria-checked={on} aria-label={etiqueta} onClick={() => setOn(!on)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${on ? "bg-[#167655]" : "bg-[#C9D3DD]"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
      {etiqueta}
    </span>
  );
}
