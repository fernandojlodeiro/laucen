// Cucardas: "nuevo", "novedad", "última unidad"… Se cuelgan de productos y
// familias (con vigencia) desde la ficha de cada uno.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO,
} from "@/app/componentes/erp";
import { accionBorrarCucarda, accionCrearCucarda, accionGuardarCucarda } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { editar?: string; ok?: string; error?: string };

export default async function Cucardas({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("cucardas_ver");
  const sp = await searchParams;
  const editar = Number(sp.editar) || 0;
  const filas = await consulta<{ id: number; nombre: string; color: string; orden: number; estado: string; usos: number }>(`
    select c.id::int, c.nombre, c.color, c.orden, c.estado,
           ((select count(*) from producto_cucarda pc where pc.cucarda_id = c.id) + (select count(*) from familia_cucarda fc where fc.cucarda_id = c.id))::int usos
      from cucarda c where c.organizacion_id = $1 order by c.orden, c.nombre`, [s.org.id]);

  return (
    <Pantalla titulo="Cucardas" subtitulo="Las etiquetas que se muestran sobre un producto (nuevo, novedad, última unidad…)" ancho="max-w-3xl">
      <Avisos sp={sp} />
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Cucarda</th><th className={TH}>Color</th><th className={THN}>Orden</th><th className={TH}>Estado</th><th className={THN}>Usos</th><th /></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Todavía no hay cucardas.</td></tr>}
            {filas.map((c) => editar === c.id ? (
              <tr key={c.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={6} className={TD}>
                  <form action={accionGuardarCucarda} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="nombre" defaultValue={c.nombre} className={`${CAMPO} flex-1 min-w-40`} autoFocus />
                    <input type="color" name="color" defaultValue={c.color} className="h-8 w-10 rounded border border-[#E3E9F0]" aria-label="Color" />
                    <CampoNumero name="orden" valor={c.orden} tipo="entero" className={`${CAMPO} w-16`} />
                    <select name="estado" defaultValue={c.estado} className={CAMPO}>
                      <option value="activa">Activa</option><option value="archivada">Archivada</option>
                    </select>
                    <button className={VERDE}>Guardar</button>
                    <Link href="/catalogo/cucardas" className={SUAVE}>Cancelar</Link>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={c.id} className={TR}>
                <td className={TD}><span className="inline-block rounded px-2 py-0.5 text-white text-[11px] font-bold" style={{ background: c.color }}>{c.nombre}</span></td>
                <td className={`${TD} text-[#5C6B76]`}>{c.color}</td>
                <td className={TDN}>{c.orden}</td>
                <td className={TD}><Estado texto={c.estado === "activa" ? "Activa" : "Archivada"} tono={c.estado === "activa" ? "verde" : "gris"} /></td>
                <td className={TDN}>{c.usos}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={`/catalogo/cucardas?editar=${c.id}`} />
                    <TachoConfirmar accion={accionBorrarCucarda} campos={{ id: String(c.id) }} pregunta="¿Borrar?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={accionCrearCucarda} className="flex flex-wrap items-center gap-2 mt-3">
        <input name="nombre" placeholder="Cucarda nueva (ej. Novedad)" className={`${CAMPO} flex-1 min-w-48`} />
        <input type="color" name="color" defaultValue="#16577F" className="h-8 w-10 rounded border border-[#E3E9F0]" aria-label="Color" />
        <button className={PRIMARIO}>Agregar</button>
      </form>
    </Pantalla>
  );
}
