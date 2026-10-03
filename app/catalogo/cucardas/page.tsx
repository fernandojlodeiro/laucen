// Cucardas: "nuevo", "novedad", "última unidad"… Se cuelgan de productos y
// familias (con vigencia) desde la ficha de cada uno.

import Link from "next/link";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, CAMPO, url,
} from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_CUCARDAS } from "./lista";
import { accionBorrarCucarda, accionCrearCucarda, accionGuardarCucarda } from "./acciones";

export const dynamic = "force-dynamic";

const USOS = "((select count(*) from producto_cucarda pc where pc.cucarda_id = c.id) + (select count(*) from familia_cucarda fc where fc.cucarda_id = c.id))";

type SP = { editar?: string; q?: string; contiene?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

export default async function Cucardas({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("cucardas_ver");
  const sp = await searchParams;
  const editar = Number(sp.editar) || 0;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const filtros = { q: q || null, contiene: comienza ? null : "1", p: sp.p, orden: sp.orden, dir: sp.dir };
  const c = await LISTA_CUCARDAS.consulta!({ org: s.org.id, moneda: s.moneda }, sp);
  const { filas, total } = await consultaPaginada<{ id: number; nombre: string; color: string; orden: number; estado: string; usos: number }>({
    campos: `c.id::int, c.nombre, c.color, c.orden, c.estado, ${USOS}::int usos`,
    desde: c.desde, donde: c.donde,
    orden: leerOrden(sp, { nombre: "c.nombre", color: "c.color", orden: "c.orden", estado: "c.estado", usos: USOS }, c.orden),
  }, c.valores, sp);

  return (
    <Pantalla titulo="Cucardas" subtitulo="Las etiquetas que se muestran sobre un producto (nuevo, novedad, última unidad…)" ancho="max-w-3xl"
      acciones={<><AccionesExcel lista={LISTA_CUCARDAS} org={s.org.id} /><BotonNuevo texto="Nueva cucarda" /></>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nueva cucarda" sinBoton>
        <form action={accionCrearCucarda} className="flex flex-wrap items-center gap-2">
          <input name="nombre" placeholder="Nombre (ej. Novedad)" className={`${CAMPO} flex-1 min-w-48`} autoFocus />
          <input type="color" name="color" defaultValue="#16577F" className="h-8 w-10 rounded border border-[#E3E9F0]" aria-label="Color" />
          <button className={PRIMARIO}>Crear</button>
        </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar cucarda" limpiar={["editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="nombre">Cucarda</ThOrden><ThOrden col="color">Color</ThOrden><ThOrden col="orden" n desc={false} porDefecto>Orden</ThOrden>
              <ThOrden col="estado">Estado</ThOrden><ThOrden col="usos" n>Usos</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>{q ? "Ninguna cucarda coincide." : "Todavía no hay cucardas."}</td></tr>}
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
                    <Link href={url("/catalogo/cucardas", filtros)} className={SUAVE}>Cancelar</Link>
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
                    <Lapiz href={url("/catalogo/cucardas", { ...filtros, editar: c.id })} />
                    <TachoConfirmar accion={accionBorrarCucarda} campos={{ id: String(c.id) }} pregunta="¿Borrar?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
    </Pantalla>
  );
}
