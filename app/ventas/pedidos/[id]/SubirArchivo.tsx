"use client";

// Sube fotos o PDF de un pedido directo del navegador al bucket privado «comprobantes» y le pide al
// servidor que los anote: el comprobante de pago o el conforme de retiro (firma y DNI de quien retira). El conforme
// tiene además «📷 Sacar foto» (Fer, 29/10): en el celular abre la cámara directo.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { subirArchivo } from "@/lib/supabase-navegador";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { guardarComprobantePago, guardarConformeRetiro } from "./acciones";

const CLASES = {
  pago: { texto: "📎 Subir comprobante de pago", carpeta: "", guardar: guardarComprobantePago },
  retiro: { texto: "✍ Subir conforme de retiro", carpeta: "/retiro", guardar: guardarConformeRetiro },
};

export default function SubirArchivo({ orgId, pedidoId, clase, grande, alTerminar }: {
  orgId: string; pedidoId: number; clase: keyof typeof CLASES;
  /** Sólo el botón de la cámara, grande (Depósito › Entregas en el local, en el celular). */
  grande?: boolean;
  /** Lo que salió (el aviso de «listo» lo muestra quien lo llama, si la fila desaparece al entregarse). */
  alTerminar?: (mensaje: string, ok: boolean) => void;
}) {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const c = CLASES[clase];

  async function subir(lista: FileList | null) {
    const archivos = [...(lista ?? [])];
    if (!archivos.length) return;
    if (archivos.some((f) => !f.type.startsWith("image/") && f.type !== "application/pdf")) { setEstado("Tienen que ser fotos o PDF."); return; }
    setEstado(clase === "pago" ? "Subiendo y buscando el pago en Mercado Pago…" : "Subiendo…");
    let motivo: string | null = null, ok: string | null = null;
    for (const [i, f] of archivos.entries()) {
      const r = await subirArchivo("comprobantes", orgId, f, `pedidos/${pedidoId}${c.carpeta}`);
      if ("motivo" in r) { motivo = r.motivo ?? "No se pudo subir."; break; }
      const fd = new FormData();
      fd.set("pedido_id", String(pedidoId));
      fd.set("ruta", r.ruta);
      fd.set("nombre", f.name.slice(0, 120));
      fd.set("tipo", f.type);
      if (i === archivos.length - 1) fd.set("ultimo", "1");
      const g: { motivo?: string; ok?: string } = await c.guardar(fd);
      if (g.motivo) { motivo = g.motivo; break; }
      ok = g.ok ?? null;
    }
    setEstado(motivo ?? ok);
    alTerminar?.(motivo ?? ok ?? "", !motivo);
    if (archivo.current) archivo.current.value = "";
    if (camara.current) camara.current.value = "";
    router.refresh();
  }

  const subiendo = !!estado?.startsWith("Subiendo");
  const inputCamara = <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => subir(e.target.files)} />;
  if (grande) {
    return (
      <>
        {inputCamara}
        <button type="button" className={`${PRIMARIO} w-full text-base py-3`} disabled={subiendo} onClick={() => camara.current?.click()}>
          {subiendo ? "Subiendo…" : "📷 Sacar foto del conforme"}
        </button>
      </>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input ref={archivo} type="file" multiple={clase === "retiro"} accept="image/*,application/pdf" className="hidden" onChange={(e) => subir(e.target.files)} />
      <button type="button" className={SUAVE} disabled={subiendo} onClick={() => archivo.current?.click()}>{c.texto}</button>
      {clase === "retiro" && <>{inputCamara}<button type="button" className={SUAVE} disabled={subiendo} onClick={() => camara.current?.click()}>📷 Sacar foto</button></>}
      {estado && <span className="text-xs text-[#5C6B76]">{estado}</span>}
    </span>
  );
}
