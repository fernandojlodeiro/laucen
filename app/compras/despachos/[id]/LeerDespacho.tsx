"use client";

// «Leer el despacho (PDF)» (Fer, 23/10): el PDF va del navegador a Storage y el servidor se lo da a la IA, que carga
// la cabecera, los gastos y los impuestos del borrador. Tarda: mientras, el botón dice «Leyendo con la IA…».

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subirArchivo } from "@/lib/supabase-navegador";
import { PRIMARIO } from "@/app/botones";
import { accionLeerDespachoPdf } from "../acciones";

export default function LeerDespacho({ organizacionId, despachoId, leido }: { organizacionId: string; despachoId: number; leido: string | null }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [trabajando, setTrabajando] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  async function leer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAviso(null);
    if (!archivo || !/\.pdf$/i.test(archivo.name)) { setAviso({ ok: false, texto: "Elegí el PDF del despacho." }); return; }
    setTrabajando("Subiendo…");
    const sub = await subirArchivo("importaciones", organizacionId, archivo, "despachos");
    if ("motivo" in sub && sub.motivo) { setTrabajando(""); setAviso({ ok: false, texto: sub.motivo }); return; }
    setTrabajando("Leyendo con la IA… (tarda un minuto)");
    const r = await accionLeerDespachoPdf({ despachoId, ruta: sub.ruta!, archivo: archivo.name });
    setTrabajando("");
    setAviso("ok" in r ? { ok: true, texto: r.ok } : { ok: false, texto: r.motivo });
    router.refresh();
  }

  return (
    <form onSubmit={leer} className="bg-white border border-[#E3E9F0] rounded-xl p-3 mb-4">
      <div className="flex flex-wrap items-end gap-3">
        <label><span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Leer el despacho (PDF): la IA carga la cabecera, los gastos y los impuestos</span>
          <input type="file" accept=".pdf,application/pdf" disabled={!!trabajando} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-xs" /></label>
        <button disabled={!!trabajando} className={`${PRIMARIO} disabled:opacity-60`}>{trabajando || "Leer el despacho"}</button>
        {leido && !trabajando && <span className="text-[11px] text-[#5C6B76]">Ya se leyó un PDF; leer otro vuelve a cargar lo que diga.</span>}
      </div>
      {aviso && <p role={aviso.ok ? undefined : "alert"} className={`mt-2 text-xs rounded-lg px-3 py-2 ${aviso.ok ? "bg-[#EEF7F1] text-[#1F6E4A]" : "bg-[#FDF1EF] text-[#C03420]"}`}>{aviso.texto}</p>}
    </form>
  );
}
