"use client";

// Condición y acción de una regla: según lo que se elige en el selector se
// muestran sólo los campos que hacen falta (los demás no se mandan).

import { useState } from "react";
import CampoNumero from "@/app/componentes/CampoNumero";
import { CONDICIONES, ACCIONES, type FormaCondicion, type TipoAccion } from "./comun";

const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";
const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";

export default function CamposRegla({ forma, cantidad, sku, familiaId, monto, medio, accion, valor, familias, medios }: {
  forma?: FormaCondicion; cantidad?: number | null; sku?: string | null; familiaId?: number | null; monto?: number | null; medio?: string | null;
  accion?: TipoAccion; valor?: number | null;
  familias: { id: number; nombre: string; nivel: number }[]; medios: { tipo: string; nombre: string }[];
}) {
  const [f, setF] = useState<FormaCondicion>(forma ?? "cantidad_familia");
  const [a, setA] = useState<TipoAccion>(accion ?? "descuento_pct");
  const porCantidad = f.startsWith("cantidad_");
  return (
    <>
      <label className="col-span-2"><span className={ETIQUETA}>Condición</span>
        <select name="forma" value={f} onChange={(e) => setF(e.target.value as FormaCondicion)} className={`${CAMPO} w-full`}>
          {Object.entries(CONDICIONES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select></label>
      {porCantidad && (
        <label><span className={ETIQUETA}>Unidades (N)</span>
          <CampoNumero name="cantidad" valor={cantidad ?? 3} tipo="entero" className={`${CAMPO} w-full`} /></label>
      )}
      {f === "cantidad_producto" && (
        <label><span className={ETIQUETA}>SKU del producto</span>
          <input name="sku" defaultValue={sku ?? ""} placeholder="Ej. PL-001" className={`${CAMPO} w-full font-mono`} /></label>
      )}
      {f === "cantidad_familia" && (
        <label><span className={ETIQUETA}>Familia</span>
          <select name="familia_id" defaultValue={familiaId ?? ""} className={`${CAMPO} w-full`}>
            <option value="">Elegí…</option>
            {familias.map((x) => <option key={x.id} value={x.id}>{"  ".repeat(x.nivel)}{x.nombre}</option>)}
          </select></label>
      )}
      {f === "monto_minimo" && (
        <label><span className={ETIQUETA}>Desde $</span>
          <CampoNumero name="monto" valor={monto ?? null} tipo="pesos" className={`${CAMPO} w-full`} /></label>
      )}
      {f === "medio_pago" && (
        <label><span className={ETIQUETA}>Medio de pago</span>
          <select name="medio" defaultValue={medio ?? "transferencia"} className={`${CAMPO} w-full`}>
            {medios.map((m) => <option key={m.tipo} value={m.tipo}>{m.nombre}</option>)}
          </select></label>
      )}
      <label><span className={ETIQUETA}>Acción</span>
        <select name="accion" value={a} onChange={(e) => setA(e.target.value as TipoAccion)} className={`${CAMPO} w-full`}>
          {Object.entries(ACCIONES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select></label>
      {a !== "envio_bonificado" && (
        <label><span className={ETIQUETA}>{a === "descuento_pct" ? "Descuento %" : "Descuento $"}</span>
          <CampoNumero key={a} name="valor" valor={valor ?? null} tipo={a === "descuento_pct" ? "pct" : "pesos"} className={`${CAMPO} w-full`} /></label>
      )}
    </>
  );
}
