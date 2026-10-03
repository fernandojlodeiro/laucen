"use client";

// "Imputar a mano": una deuda pendiente contra un crédito pendiente. Cada
// pendiente se ve en su moneda, y debajo se va mostrando cuánto baja cada uno
// (si son de monedas distintas, con el tipo de cambio del día del crédito;
// misma cuenta que hace el servidor, lib/administracion/cc-imputacion.ts).

import { useState } from "react";
import CampoNumero from "@/app/componentes/CampoNumero";
import { leerNumero, formatearNumero } from "@/lib/numeros";
import { BotonEnviar } from "@/app/radar/Cliente";
import { VERDE } from "@/app/botones";
import { aplicar, type MonedaCc } from "@/lib/administracion/cc-imputacion";

const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";
const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";

/** Un renglón pendiente: `pendiente` en positivo y en su moneda; `cot` (los
 *  créditos) el tipo de cambio del día de `fecha`. */
export type RenglonImputar = { id: number; texto: string; moneda: MonedaCc; pendiente: number; cot: number | null; fecha: string };

const plata = (n: number, m: MonedaCc) => `${m === "USD" ? "US$" : "$"} ${formatearNumero(n, m === "USD" ? "usd" : "pesos")}`;
const dia = (f: string) => f.split("-").reverse().join("/");

export default function FormImputar({ accion, campos, debitos, creditos }: {
  accion: (fd: FormData) => Promise<void>;
  campos: Record<string, string>;
  debitos: RenglonImputar[];
  creditos: RenglonImputar[];
}) {
  const [debId, setDebId] = useState(debitos[0]?.id ?? 0);
  const [creId, setCreId] = useState(creditos[0]?.id ?? 0);
  const [importe, setImporte] = useState<number | null>(null);
  const d = debitos.find((x) => x.id === debId) ?? debitos[0];
  const c = creditos.find((x) => x.id === creId) ?? creditos[0];
  const distintas = d && c && d.moneda !== c.moneda;
  const a = d && c ? aplicar({ moneda: d.moneda, p: d.pendiente }, { moneda: c.moneda, p: c.pendiente }, c.cot, importe ?? undefined) : null;
  const maximo = d && c ? aplicar({ moneda: d.moneda, p: d.pendiente }, { moneda: c.moneda, p: c.pendiente }, c.cot) : null;
  const excede = importe != null && maximo != null && importe > maximo.debito + 0.004;

  return (
    <form action={accion} onInput={(e) => setImporte(leerNumero(new FormData(e.currentTarget).get("importe")))}
      className="bg-white border border-[#E3E9F0] rounded-xl p-3 mb-4 flex flex-wrap items-end gap-3">
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <p className="w-full text-xs font-bold">Imputar a mano</p>
      <label><span className={ETIQUETA}>Deuda pendiente</span>
        <select name="debito" value={d?.id} onChange={(e) => setDebId(Number(e.target.value))} className={`${CAMPO} w-72`}>
          {debitos.map((m) => <option key={m.id} value={m.id}>{dia(m.fecha)} · {m.texto} · {plata(m.pendiente, m.moneda)}</option>)}
        </select></label>
      <label><span className={ETIQUETA}>Crédito pendiente</span>
        <select name="credito" value={c?.id} onChange={(e) => setCreId(Number(e.target.value))} className={`${CAMPO} w-72`}>
          {creditos.map((m) => <option key={m.id} value={m.id}>{dia(m.fecha)} · {m.texto} · {plata(m.pendiente, m.moneda)}</option>)}
        </select></label>
      <label><span className={ETIQUETA}>A cancelar de la deuda ({d?.moneda === "USD" ? "US$" : "$"})</span>
        <CampoNumero key={d?.moneda} name="importe" valor={null} tipo={d?.moneda === "USD" ? "usd" : "pesos"} className={`${CAMPO} w-32`}
          placeholder={maximo ? formatearNumero(maximo.debito, d.moneda === "USD" ? "usd" : "pesos") : ""} /></label>
      <BotonEnviar clase={VERDE} corriendo="Imputando…">Imputar</BotonEnviar>
      <p className="w-full text-[11px] text-[#5C6B76]">
        {distintas && !c.cot
          ? <span className="text-[#C03420]">No hay tipo de cambio para el {dia(c.fecha)}: cargalo en Configuración → Tipo de cambio.</span>
          : excede
            ? <span className="text-[#C03420]">Pasa lo que se puede cancelar: hasta {plata(maximo!.debito, d.moneda)}.</span>
            : a
              ? <>La deuda baja <b className="tabular-nums">{plata(a.debito, d.moneda)}</b> y el crédito <b className="tabular-nums">{plata(a.credito, c.moneda)}</b>
                  {distintas && <> (dólar del {dia(c.fecha)}: $ {formatearNumero(c.cot!, "pesos")})</>}.
                  {importe == null && " Vacío, cancela lo máximo que alcanza."}</>
              : "No hay nada para imputar entre esos dos."}
      </p>
    </form>
  );
}
