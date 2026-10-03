"use client";

// El lector de la pantalla de trabajo del picking: cada código va a la
// acción de escanear y, si salió, la pantalla se vuelve a dibujar con el
// avance nuevo (router.refresh, sin perder el foco del campo).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Escaner from "@/app/deposito/Escaner";
import { accionEscanear, type ResultadoEscaneo } from "../acciones";
import Cantidad, { cantidadDe } from "./Cantidad";

export default function Trabajo({ lote }: { lote: number }) {
  const router = useRouter();
  const [, transicion] = useTransition();
  const [ultimo, setUltimo] = useState<ResultadoEscaneo | null>(null);
  const [cantidad, setCantidad] = useState("1");

  async function alLeer(codigo: string) {
    const r = await accionEscanear(lote, codigo, cantidadDe(cantidad));
    setUltimo(r);
    if (r.ok) { setCantidad("1"); transicion(() => router.refresh()); }
    return r.ok;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <Cantidad valor={cantidad} cambiar={setCantidad} />
        <div className="flex-1 min-w-0"><Escaner alLeer={alLeer} placeholder="Escaneá o escribí el código o SKU" /></div>
      </div>
      {ultimo && (
        <p role={ultimo.ok ? "status" : "alert"}
          className={`text-sm font-semibold rounded-lg px-3 py-2 ${ultimo.ok ? "bg-[#EEF7F1] text-[#1F6E4A]" : "bg-[#FDF1EF] text-[#C03420]"}`}>
          {ultimo.ok ? "✓ " : "✗ "}{ultimo.mensaje}
        </p>
      )}
    </div>
  );
}
