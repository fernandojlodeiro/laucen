"use client";

// Nueva orden de compra: se elige el proveedor, la vía (aéreo, marítimo o courier) y el Excel del proveedor. El archivo va
// directo del navegador a Storage y el servidor lo lee y crea la orden «a revisar».

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subirArchivo } from "@/lib/supabase-navegador";
import { PRIMARIO } from "@/app/botones";
import ElegirDeLista, { type Opcion } from "@/app/componentes/ElegirDeLista";
import { accionCrearOrden } from "./acciones";

const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";
const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";

export default function SubirOrden({ organizacionId, proveedores, proveedor }: { organizacionId: string; proveedores: Opcion[]; proveedor: number | null }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [trabajando, setTrabajando] = useState("");
  const [motivo, setMotivo] = useState("");

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMotivo("");
    const fd = new FormData(e.currentTarget);
    const proveedorId = Number(fd.get("proveedor_id")) || null;
    const via = String(fd.get("via") ?? "");
    if (!proveedorId) { setMotivo("Elegí el proveedor."); return; }
    if (!via) { setMotivo("Elegí si es aéreo, marítimo o courier."); return; }
    if (!archivo) { setMotivo("Elegí el Excel del proveedor."); return; }
    if (!/\.xlsx$/i.test(archivo.name)) { setMotivo("Tiene que ser un Excel .xlsx (si es un .xls viejo, abrilo y guardalo como .xlsx)."); return; }
    setTrabajando("Subiendo…");
    const sub = await subirArchivo("importaciones", organizacionId, archivo, "ordenes");
    if ("motivo" in sub && sub.motivo) { setMotivo(sub.motivo); setTrabajando(""); return; }
    setTrabajando("Leyendo…");
    const r = await accionCrearOrden({ ruta: sub.ruta!, archivo: archivo.name, proveedorId, via });
    setTrabajando("");
    if ("motivo" in r) { setMotivo(r.motivo); return; }
    router.push(`/compras/ordenes/${r.id}?ok=${encodeURIComponent(`Orden ${r.codigo} creada con ${r.renglones} renglones: revisala y confirmala.`)}`);
  }

  return (
    <form onSubmit={enviar} className="bg-white border border-[#E3E9F0] rounded-xl p-3 mb-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72"><span className={ETIQUETA}>Proveedor</span>
          <ElegirDeLista name="proveedor_id" opciones={proveedores} valor={proveedor} vacio="Elegí…" placeholder="Buscá el proveedor…" etiqueta="Proveedor" />
        </div>
        <label><span className={ETIQUETA}>Llega por</span>
          <select name="via" defaultValue="" className={CAMPO}>
            <option value="" disabled>Elegí…</option>
            <option value="aereo">Aéreo (A)</option>
            <option value="maritimo">Marítimo (M)</option>
            <option value="courier">Courier (C)</option>
          </select></label>
        <label><span className={ETIQUETA}>Excel del proveedor (.xlsx)</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!!trabajando}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-xs" /></label>
        <button disabled={!!trabajando} className={`${PRIMARIO} disabled:opacity-60`}>{trabajando || "Crear la orden"}</button>
      </div>
      {motivo && <p role="alert" className="mt-2 text-xs rounded-lg px-3 py-2 bg-[#FDF1EF] text-[#C03420]">{motivo}</p>}
    </form>
  );
}
