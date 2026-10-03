// Familias: árbol (cada una con padre opcional). Portan lo que heredan sus
// productos y subfamilias si no lo sobreescriben: descuento y cucardas.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, CAMPO, ETIQUETA, coincideBusqueda,
} from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { familiasConDatos } from "./datos";
import { LISTA_FAMILIAS } from "./lista";
import { accionBorrarFamilia, accionCrearFamilia, accionGuardarFamilia } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { editar?: string; q?: string; contiene?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };
type CucardaFamilia = { familia_id: number; cucarda_id: number; desde: string | null; hasta: string | null };

const pct = (n: number) => `${formatearNumero(n, "pct")} %`;
const fechaCorta = (f: string | null) => (f ? f.split("-").reverse().slice(0, 2).join("/") : "");

export default async function Familias({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("familias_ver");
  const sp = await searchParams;
  const editar = Number(sp.editar) || 0;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const filtros = { q: q || null, contiene: comienza ? null : "1", p: sp.p, orden: sp.orden, dir: sp.dir };
  const [{ arbol, debajo }, cucardas, asignadas] = await Promise.all([
    familiasConDatos(s.org.id),
    consulta<{ id: number; nombre: string; color: string; estado: string }>(
      "select id::int, nombre, color, estado from cucarda where organizacion_id = $1 order by orden, nombre", [s.org.id]),
    consulta<CucardaFamilia>(`
      select familia_id::int, cucarda_id::int, to_char(desde, 'YYYY-MM-DD') desde, to_char(hasta, 'YYYY-MM-DD') hasta
        from familia_cucarda where organizacion_id = $1`, [s.org.id]),
  ]);
  // El buscador filtra las filas que se ven; el árbol entero sigue para elegir padre.
  const visibles = arbol.filter((f) => coincideBusqueda(f.nombre, q, comienza));
  // Una familia propia sólo cuelga de otra propia (nunca de una de Mercado Libre).
  const padresPosibles = arbol.filter((o) => o.propia);
  const cucardaDe = new Map(cucardas.map((c) => [c.id, c]));
  // Sin elegir columna se ve el árbol; ordenada por una columna, la lista plana.
  const ordenadas = ordenarEnMemoria(visibles, sp, {
    nombre: (f) => f.nombre, descuento: (f) => f.descuento_pct ?? f.heredado, productos: (f) => f.productos, origen: (f) => (f.deMl ? "Mercado Libre" : "Propia"),
  });
  const pagina = paginarEnMemoria(ordenadas, sp);
  const plana = ordenadas !== visibles;

  return (
    <Pantalla titulo="Familias" subtitulo="Agrupan productos. Lo que se carga en una familia (descuento, cucardas) lo heredan sus productos y subfamilias si no lo cambian"
      acciones={<><AccionesExcel lista={LISTA_FAMILIAS} org={s.org.id} /><BotonNuevo texto="Nueva familia" /></>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nueva familia" sinBoton>
        <form action={accionCrearFamilia} className="flex flex-wrap items-center gap-2">
          <input name="nombre" placeholder="Nombre (ej. Cocina)" className={`${CAMPO} flex-1 min-w-48`} autoFocus />
          <select name="padre_id" defaultValue="" className={CAMPO} aria-label="Familia padre">
            <option value="">Sin padre (arriba de todo)</option>
            {padresPosibles.map((o) => <option key={o.id} value={o.id}>Dentro de {o.etiqueta}</option>)}
          </select>
          <CampoNumero name="descuento_pct" valor={null} tipo="pct" placeholder="Desc. %" className={`${CAMPO} w-20`} />
          <button className={PRIMARIO}>Crear</button>
        </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar familia" limpiar={["editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="nombre">Familia</ThOrden><ThOrden col="origen">Origen</ThOrden><ThOrden col="descuento" n>Descuento</ThOrden><th className={TH}>Cucardas</th>
              <ThOrden col="productos" n title="Propios (con las subfamilias)">Productos</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>{q ? "Ninguna familia coincide." : "Todavía no hay familias."}</td></tr>}
            {pagina.map((f) => {
              const suyas = asignadas.filter((a) => a.familia_id === f.id);
              if (editar === f.id && !f.deMl) {
                const excluidas = debajo(f.id);
                return (
                  <tr key={f.id} className={`${TR} bg-[#FAFBFC]`}>
                    <td colSpan={6} className={TD}>
                      <form action={accionGuardarFamilia} className="space-y-2">
                        <input type="hidden" name="id" value={f.id} />
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-start">
                          <label className="col-span-2"><span className={ETIQUETA}>Nombre</span><input name="nombre" defaultValue={f.nombre} className={`${CAMPO} w-full`} autoFocus /></label>
                          <label className="col-span-2"><span className={ETIQUETA}>Familia padre</span>
                            <select name="padre_id" defaultValue={f.padre_id ?? ""} className={`${CAMPO} w-full`}>
                              <option value="">Ninguna (arriba de todo)</option>
                              {padresPosibles.filter((o) => !excluidas.has(o.id)).map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
                            </select>
                          </label>
                          <label><span className={ETIQUETA}>Descuento %</span>
                            <CampoNumero name="descuento_pct" valor={f.descuento_pct} tipo="pct" placeholder={formatearNumero(f.heredado, "pct")} className={`${CAMPO} w-full`} />
                            <span className="block text-[10px] text-[#5C6B76] mt-0.5">Vacío = hereda: {pct(f.heredado)}.</span>
                          </label>
                        </div>
                        {cucardas.length > 0 && (
                          <div>
                            <span className={ETIQUETA}>Cucardas de la familia (sin fechas, rigen siempre)</span>
                            <div className="flex flex-col gap-1">
                              {cucardas.filter((c) => c.estado === "activa" || suyas.some((a) => a.cucarda_id === c.id)).map((c) => {
                                const a = suyas.find((x) => x.cucarda_id === c.id);
                                return (
                                  <div key={c.id} className="flex flex-wrap items-center gap-2">
                                    <label className="flex items-center gap-2 w-44">
                                      <input type="checkbox" name={`c${c.id}`} defaultChecked={!!a} className="h-4 w-4 accent-[#16577F]" />
                                      <span className="inline-block rounded px-2 py-0.5 text-white text-[11px] font-bold" style={{ background: c.color }}>{c.nombre}</span>
                                    </label>
                                    <span className="text-[11px] text-[#5C6B76]">desde</span>
                                    <input type="date" name={`desde${c.id}`} defaultValue={a?.desde ?? ""} className={CAMPO} aria-label={`${c.nombre} desde`} />
                                    <span className="text-[11px] text-[#5C6B76]">hasta</span>
                                    <input type="date" name={`hasta${c.id}`} defaultValue={a?.hasta ?? ""} className={CAMPO} aria-label={`${c.nombre} hasta`} />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button className={VERDE}>Guardar</button>
                          <Link href={url("/catalogo/familias", filtros)} className={SUAVE} scroll={false}>Cancelar</Link>
                        </div>
                      </form>
                    </td>
                  </tr>
                );
              }
              const total = f.totalProductos;
              return (
                <tr key={f.id} className={TR}>
                  <td className={TD}>
                    <span style={{ paddingLeft: `${plana ? 0 : f.nivel * 1.25}rem` }} className="inline-block">
                      {f.nivel > 0 && !plana && <span className="text-[#9AA7B1] mr-1">└</span>}
                      <Link href={url("/catalogo/productos", { familia: f.id })} className={`text-[#16577F] hover:underline ${f.nivel === 0 ? "font-semibold" : ""}`}
                        title={plana ? f.etiqueta : "Ver sus productos"}>{f.nombre}</Link>
                    </span>
                  </td>
                  <td className={TD}>{f.deMl ? <Estado texto="Mercado Libre" tono="amarillo" /> : <Estado texto="Propia" tono="azul" />}</td>
                  <td className={TDN}>
                    {f.descuento_pct != null ? pct(f.descuento_pct) : <span className="text-[#5C6B76]" title="Heredado">{pct(f.heredado)}</span>}
                  </td>
                  <td className={TD}>
                    <span className="flex flex-wrap gap-1">
                      {suyas.map((a) => {
                        const c = cucardaDe.get(a.cucarda_id);
                        if (!c) return null;
                        const vigencia = a.desde || a.hasta ? ` (${fechaCorta(a.desde) || "…"}–${fechaCorta(a.hasta) || "…"})` : "";
                        return <span key={a.cucarda_id} className="inline-block rounded px-1.5 py-0.5 text-white text-[10px] font-bold whitespace-nowrap" style={{ background: c.color }}>{c.nombre}{vigencia}</span>;
                      })}
                    </span>
                  </td>
                  <td className={TDN}>
                    <Link href={url("/catalogo/productos", { familia: f.id })} className="text-[#16577F]">{f.productos}</Link>
                    {total !== f.productos && <span className="text-[#5C6B76]"> ({total})</span>}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    {f.deMl
                      ? <span className="text-[10px] text-[#5C6B76]" title="Viene de las categorías de Mercado Libre: no se cambia ni se borra">De ML</span>
                      : (
                        <span className="inline-flex gap-1">
                          <Lapiz href={url("/catalogo/familias", { ...filtros, editar: f.id })} />
                          <TachoConfirmar accion={accionBorrarFamilia} campos={{ id: String(f.id) }}
                            pregunta={f.productos ? `¿Borrar? (${f.productos} quedan sin familia)` : "¿Borrar?"} />
                        </span>
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginado total={visibles.length} />
    </Pantalla>
  );
}
