"use client";

// "Imprimir etiquetas y hojas": junta los pedidos tildados del formulario y
// el tamaño elegido, abre el PDF en otra pestaña (/deposito/hojas) y, al
// rato, vuelve a dibujar esta pantalla: los impresos pasan a un lote abierto.

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BotonImprimirHojas({ clase, children, campo = "p", base = "/deposito/hojas", extra = "" }: {
  clase: string; children: React.ReactNode;
  /** El nombre de las casillas a juntar. */
  campo?: string; base?: string; extra?: string;
}) {
  const router = useRouter();
  const [problema, setProblema] = useState<string | null>(null);

  function imprimir(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form;
    if (!form) return;
    const ids = [...form.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${campo}"]:checked`)].map((c) => c.value);
    if (!ids.length) { setProblema("Tildá al menos un pedido."); return; }
    setProblema(null);
    const tam = (form.querySelector<HTMLSelectElement>('select[name="tam"]')?.value) || "10x15";
    window.open(`${base}?${campo}=${ids.join(",")}&tam=${encodeURIComponent(tam)}${extra}`, "_blank");
    setTimeout(() => router.refresh(), 2500);
    setTimeout(() => router.refresh(), 8000);
  }

  return (
    <>
      <button type="button" onClick={imprimir} className={clase}>{children}</button>
      {problema && <p role="alert" className="text-sm font-semibold text-[#C03420] mt-1">{problema}</p>}
    </>
  );
}
