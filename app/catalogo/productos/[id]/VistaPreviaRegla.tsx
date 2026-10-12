"use client";

// Mientras se edita la regla de precio (pedido de Fer, 12/10): a medida que se cambian los campos del
// formulario «regla», muestra al lado qué haría el sistema, sin grabar nada.

import { useEffect, useState } from "react";
import { leerNumero } from "@/lib/numeros";
import { simular, type Candidata, type ComoRegla, type Parametros } from "@/lib/seguimiento/regla-calculo";
import ResultadoRegla from "./ResultadoRegla";

function leerForm(f: HTMLFormElement): { prendida: boolean; p: Parametros } {
  const fd = new FormData(f);
  const contra = String(fd.get("contra") ?? "mas_barato");
  const como = String(fd.get("como") ?? "pesos");
  return {
    prendida: String(fd.get("modo") ?? "apagada") !== "apagada",
    p: {
      contra: contra === "mas_barato" ? "mas_barato" : "una", seguimientoId: contra === "mas_barato" ? null : Number(contra) || null,
      como: (["igual", "pesos", "pct"].includes(como) ? como : "pesos") as ComoRegla,
      diferencia: leerNumero(fd.get("diferencia")) ?? 0, piso: leerNumero(fd.get("piso")),
      subir: fd.get("subir") === "1", techo: leerNumero(fd.get("techo")),
    },
  };
}

export default function VistaPreviaRegla({ form, clasicas, candidatas }: { form: string; clasicas: { sku: string; ars: number | null }[]; candidatas: Candidata[] }) {
  const [v, setV] = useState<ReturnType<typeof leerForm> | null>(null);
  useEffect(() => {
    const f = document.getElementById(form) as HTMLFormElement | null;
    if (!f) return;
    const leer = () => setV(leerForm(f));
    leer();
    // «input» mientras se escribe; «change» para los desplegables y las casillas; «focusout» porque el campo de número se reescribe al salir.
    f.addEventListener("input", leer); f.addEventListener("change", leer); f.addEventListener("focusout", leer);
    return () => { f.removeEventListener("input", leer); f.removeEventListener("change", leer); f.removeEventListener("focusout", leer); };
  }, [form]);
  if (!v) return null;
  return (
    <div className="rounded-lg border-2 border-[#BFD3E6] bg-[#F4F8FC] p-3">
      <ResultadoRegla s={simular(clasicas, candidatas, v.p)} prendida={v.prendida}
        titulo={v.prendida ? "Si la grabás así, la Clásica quedaría:" : "Apagada: no cambiaría nada. Hoy estás:"} />
    </div>
  );
}
