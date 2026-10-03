// Reglas comerciales de la tienda: condición → acción ("3 o más de Familia
// Placas → 10 % de descuento"). Las aplica cotizar() (lib/tienda/cotizar.ts)
// en el orden de prioridad (mayor primero).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { hoyAR } from "@/lib/moneda";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { Interruptor } from "@/app/radar/Piezas";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, url, patronBusqueda, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha } from "@/app/ventas/formato";
import { TIPOS_MEDIO } from "@/app/config/medios-pago/comun";
import { arbolFamilias } from "@/app/config/cuotas/familias";
import CamposRegla from "./CamposRegla";
import { enCriollo, formaDe, type Condicion, type Accion, type TipoAccion } from "./comun";
import { accionCrearRegla, accionGuardarRegla, accionActivarRegla, accionBorrarRegla } from "./acciones";

export const dynamic = "force-dynamic";

const BASE = "/config/reglas";
type SP = { editar?: string; q?: string; contiene?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };
type Regla = {
  id: number; nombre: string; activa: boolean; condicion: Condicion; accion: Accion; desde: string | null; hasta: string | null;
  acumulable: boolean; prioridad: number; producto_id: number | null; familia_id: number | null; producto: string | null; sku: string | null; familia: string | null; medio: string | null;
};

export default async function Reglas({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("reglas_ver");
  const sp = await searchParams;
  const editar = Number(sp.editar) || 0;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const filtros = { q: q || null, contiene: comienza ? null : "1", p: sp.p, orden: sp.orden, dir: sp.dir };
  const [reglas, familias, mediosDb] = await Promise.all([
    consulta<Regla>(`
      select r.id::int, r.nombre, r.activa, r.condicion, r.accion, to_char(r.desde, 'YYYY-MM-DD') desde, to_char(r.hasta, 'YYYY-MM-DD') hasta,
             r.acumulable, r.prioridad, p.id::int producto_id, f.id::int familia_id, p.titulo producto, p.sku_base sku, f.nombre familia, m.nombre medio
        from regla_comercial r
        left join producto p on p.id = (r.condicion ->> 'producto_id')::bigint and p.organizacion_id = r.organizacion_id
        left join familia f on f.id = (r.condicion ->> 'familia_id')::bigint and f.organizacion_id = r.organizacion_id
        left join lateral (select nombre from medio_pago where organizacion_id = r.organizacion_id and canal_id is null and tipo = r.condicion ->> 'medio' limit 1) m on true
       where r.organizacion_id = $1 and r.canal_id is null and ($2::text is null or r.nombre ilike $2)
       order by r.prioridad desc, r.id`, [s.org.id, patronBusqueda(q, comienza)]),
    arbolFamilias(s.org.id),
    consulta<{ tipo: string; nombre: string }>("select tipo, nombre from medio_pago where organizacion_id = $1 and canal_id is null order by orden, id", [s.org.id]),
  ]);
  // Los cinco medios siempre (con el nombre que les puso la organización, si ya existen).
  const medios = Object.entries(TIPOS_MEDIO).map(([tipo, t]) => ({ tipo, nombre: mediosDb.find((m) => m.tipo === tipo)?.nombre ?? t.nombre }));
  const opcFamilias = familias.map((f) => ({ id: f.id, nombre: f.nombre, nivel: f.nivel }));
  const hoy = hoyAR();
  const vista = paginarEnMemoria(ordenarEnMemoria(reglas, sp, {
    nombre: (r) => r.nombre, activa: (r) => (r.activa ? 1 : 0), desde: (r) => r.desde, acumulable: (r) => (r.acumulable ? 1 : 0), prioridad: (r) => r.prioridad,
  }), sp);
  const vigencia = (r: Regla) =>
    !r.desde && !r.hasta ? "Siempre" : r.desde && r.hasta ? `${fecha(r.desde + "T12:00")} al ${fecha(r.hasta + "T12:00")}`
      : r.desde ? `Desde el ${fecha(r.desde + "T12:00")}` : `Hasta el ${fecha(r.hasta + "T12:00")}`;

  const Fechas = ({ r }: { r?: Regla }) => (
    <>
      <label><span className={ETIQUETA}>Vale desde</span><input type="date" name="desde" defaultValue={r?.desde ?? ""} className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Hasta</span><input type="date" name="hasta" defaultValue={r?.hasta ?? ""} className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Prioridad</span><CampoNumero name="prioridad" valor={r?.prioridad ?? 0} tipo="entero" className={`${CAMPO} w-full`} /></label>
      <label className="col-span-2 flex items-center gap-1.5 text-xs pt-4">
        <input type="checkbox" name="acumulable" defaultChecked={r?.acumulable ?? true} className="h-4 w-4" /> Acumulable: se suma con otras promociones
      </label>
    </>
  );

  return (
    <Pantalla acciones={<BotonNuevo texto="Nueva regla" />} titulo="Reglas comerciales" subtitulo="Promociones de la tienda web: descuentos por cantidad, por monto, por medio de pago y envío gratis" ancho="max-w-6xl">
      <Avisos sp={sp} />
      <AltaNueva texto="Nueva regla" sinBoton>
        <form action={accionCrearRegla} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-start">
          <label className="col-span-2"><span className={ETIQUETA}>Nombre</span>
            <input name="nombre" placeholder="Ej. 3 placas 10 % off" className={`${CAMPO} w-full`} autoFocus /></label>
          <CamposRegla familias={opcFamilias} medios={medios} />
          <Fechas />
          <div className="col-span-2 sm:col-span-6"><button className={PRIMARIO}>Crear</button></div>
        </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar regla" limpiar={["editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="nombre">Regla</ThOrden><th className={TH}>Qué hace</th><ThOrden col="activa">Activa</ThOrden><ThOrden col="desde">Vigencia</ThOrden>
              <ThOrden col="acumulable">Acumulable</ThOrden><ThOrden col="prioridad" n porDefecto>Prioridad</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {reglas.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>{q ? "Ninguna regla coincide." : "Todavía no hay reglas."}</td></tr>}
            {vista.map((r) => editar === r.id ? (
              <tr key={r.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={7} className={TD}>
                  <form action={accionGuardarRegla} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-start">
                    <input type="hidden" name="id" value={r.id} />
                    <label className="col-span-2"><span className={ETIQUETA}>Nombre</span>
                      <input name="nombre" defaultValue={r.nombre} className={`${CAMPO} w-full`} autoFocus /></label>
                    <CamposRegla forma={formaDe(r.condicion)} cantidad={r.condicion.cantidad} sku={r.sku} familiaId={r.condicion.familia_id}
                      monto={r.condicion.monto} medio={r.condicion.medio} accion={r.accion.tipo as TipoAccion} valor={r.accion.valor}
                      familias={opcFamilias} medios={medios} />
                    <Fechas r={r} />
                    <div className="col-span-2 sm:col-span-6 flex gap-2">
                      <button className={VERDE}>Guardar</button>
                      <Link href={url(BASE, filtros)} className={SUAVE} scroll={false}>Cancelar</Link>
                    </div>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={r.id} className={TR}>
                <td className={`${TD} font-semibold`}>{r.nombre}</td>
                <td className={TD}>{enCriollo(r.condicion, r.accion, { producto: r.producto && `${r.sku} (${r.producto})`, familia: r.familia, medio: r.medio })}
                  {r.producto_id && <Link href={`/catalogo/productos/${r.producto_id}`} className="ml-1.5 text-[#16577F] hover:underline">ver producto</Link>}
                  {r.familia_id && <Link href={url("/catalogo/productos", { familia: r.familia_id })} className="ml-1.5 text-[#16577F] hover:underline">ver familia</Link>}</td>
                <td className={TD}><Interruptor accion={accionActivarRegla} prendido={r.activa} campos={{ id: String(r.id) }} etiqueta={r.activa ? "Sí" : "No"} /></td>
                <td className={`${TD} whitespace-nowrap`}>{vigencia(r)}
                  {r.hasta && r.hasta < hoy && <> <Estado texto="Vencida" tono="gris" /></>}
                  {r.desde && r.desde > hoy && <> <Estado texto="Todavía no" tono="amarillo" /></>}</td>
                <td className={TD}>{r.acumulable ? "Se suma" : "No se suma"}</td>
                <td className={TDN}>{r.prioridad}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url(BASE, { ...filtros, editar: r.id })} />
                    <TachoConfirmar accion={accionBorrarRegla} campos={{ id: String(r.id) }} pregunta="¿Borrar?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={reglas.length} />
      <p className="text-[11px] text-[#5C6B76] mt-1">Mayor prioridad = se aplica primero. Una regla no acumulable que se cumple corta las demás de descuento.</p>
    </Pantalla>
  );
}
