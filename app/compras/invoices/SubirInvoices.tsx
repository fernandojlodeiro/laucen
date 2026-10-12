"use client";

// Subir invoices: se eligen varios Excel juntos y el proveedor. Cada archivo va directo del navegador a Storage
// (como en Importar datos) y el servidor lo lee y lo deja «a revisar». Se informa archivo por archivo.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subirArchivo } from "@/lib/supabase-navegador";
import { PRIMARIO } from "@/app/botones";
import ElegirDeLista, { type Opcion } from "@/app/componentes/ElegirDeLista";
import { accionLeerInvoice } from "./acciones";

const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";

type Resultado = { archivo: string; texto: string; ok: boolean };

export default function SubirInvoices({ organizacionId, proveedores, proveedor }: { organizacionId: string; proveedores: Opcion[]; proveedor: number | null }) {
  const router = useRouter();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [trabajando, setTrabajando] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [motivo, setMotivo] = useState("");

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMotivo(""); setResultados([]);
    const proveedorId = Number(new FormData(e.currentTarget).get("proveedor_id")) || null;
    if (!proveedorId) { setMotivo("Elegí el proveedor."); return; }
    if (!archivos.length) { setMotivo("Elegí los archivos."); return; }
    const salida: Resultado[] = [];
    for (const [k, a] of archivos.entries()) {
      setTrabajando(`Leyendo ${k + 1} de ${archivos.length}…`);
      if (!/\.(xlsx|pdf)$/i.test(a.name)) {
        salida.push({ archivo: a.name, ok: false, texto: "Tiene que ser un Excel .xlsx o un PDF (si es un .xls viejo, abrilo y guardalo como .xlsx)." });
        continue;
      }
      const sub = await subirArchivo("importaciones", organizacionId, a, "invoices");
      if ("motivo" in sub && sub.motivo) { salida.push({ archivo: a.name, ok: false, texto: sub.motivo }); continue; }
      const r = await accionLeerInvoice({ ruta: sub.ruta!, archivo: a.name, proveedorId });
      salida.push("id" in r ? { archivo: a.name, ok: true, texto: /\.pdf$/i.test(a.name) ? "PDF guardado: la fecha y los renglones se cargan a mano en su ficha." : `${r.renglones} renglones, a revisar.` } : { archivo: a.name, ok: false, texto: r.motivo });
      setResultados([...salida]);
    }
    setResultados(salida);
    setTrabajando(""); setArchivos([]);
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="bg-white border border-[#E3E9F0] rounded-xl p-3 mb-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72"><span className={ETIQUETA}>Proveedor</span>
          <ElegirDeLista name="proveedor_id" opciones={proveedores} valor={proveedor} vacio="Elegí…" placeholder="Buscá el proveedor…" etiqueta="Proveedor" />
        </div>
        <label><span className={ETIQUETA}>Invoices en Excel (.xlsx) o PDF, uno o varios</span>
          <input type="file" multiple accept=".xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!!trabajando}
            onChange={(e) => setArchivos([...(e.target.files ?? [])])} className="text-xs" /></label>
        <button disabled={!!trabajando} className={`${PRIMARIO} disabled:opacity-60`}>{trabajando || (archivos.length > 1 ? `Subir y leer los ${archivos.length}` : "Subir y leer")}</button>
      </div>
      {motivo && <p role="alert" className="mt-2 text-xs rounded-lg px-3 py-2 bg-[#FDF1EF] text-[#C03420]">{motivo}</p>}
      {resultados.length > 0 && (
        <ul className="mt-2 text-xs space-y-0.5">
          {resultados.map((r, i) => (
            <li key={i} className={r.ok ? "text-[#1F7A3A]" : "text-[#C03420]"}><b>{r.archivo}</b>: {r.texto}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
