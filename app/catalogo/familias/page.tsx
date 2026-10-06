// Familias: árbol (cada una con padre opcional). Portan lo que heredan sus
// productos y subfamilias si no lo sobreescriben: descuento y cucardas.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import ElegirFamilia from "@/app/componentes/ElegirFamilia";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, CAMPO, ETIQUETA, coincideBusqueda, editandoFicha,
} from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { familiasConDatos } from "./datos";
import { LISTA_FAMILIAS } from "./lista";
import { accionBorrarFamilia, accionCrearFamilia, accionGuardarFamilia, accionGuardarCostoFamilia } from "./acciones";
import { generalDe, resolver, TODOS_PCT, VIAS, PCT_CREDITO, type Valores } from "@/lib/costo-importacion";
import { CamposCosto, CajaCostoGeneral, pctTexto } from "../costo-piezas";

export const dynamic = "force-dynamic";

type SP = { editar?: string; costo?: string; q?: string; contiene?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };
type CucardaFamilia = { familia_id: number; cucarda_id: number; desde: string | null; hasta: string | null };

const pct = (n: number) => `${formatearNumero(n, "pct")} %`;
const fechaCorta = (f: string | null) => (f ? f.split("-").reverse().slice(0, 2).join("/") : "");

export default async function Familias({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("familias_ver");
  const sp = await searchParams;
  const editar = Number(sp.editar) || 0;
  const editarCosto = Number(sp.costo) || 0;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const filtros = { q: q || null, contiene: comienza ? null : "1", p: sp.p, orden: sp.orden, dir: sp.dir };
  const [{ arbol }, cucardas, asignadas, costos, general] = await Promise.all([
    familiasConDatos(s.org.id),
    consulta<{ id: number; nombre: string; color: string; estado: string }>(
      "select id::int, nombre, color, estado from cucarda where organizacion_id = $1 order by orden, nombre", [s.org.id]),
    consulta<CucardaFamilia>(`
      select familia_id::int, cucarda_id::int, to_char(desde, 'YYYY-MM-DD') desde, to_char(hasta, 'YYYY-MM-DD') hasta
        from familia_cucarda where organizacion_id = $1`, [s.org.id]),
    consulta<{ familia_id: number } & Valores>(`
      select familia_id::int, ncm, via, ${TODOS_PCT.map(([k]) => `${k}::float8`).join(", ")}
        from familia_costo where organizacion_id = $1`, [s.org.id]),
    generalDe(s.org.id),
  ]);
  // Costos de importación de cada familia: los suyos y lo que hereda de las de arriba y de lo general.
  const costoDe = new Map(costos.map(({ familia_id, ...v }) => [familia_id, v as Valores]));
  const nombreDe = new Map(arbol.map((f) => [f.id, f.nombre]));
  const cadenaDe = (ids: number[]) => ids.map((i) => ({ nombre: nombreDe.get(i) ?? "", valores: costoDe.get(i) ?? {} }));
  const resumenCosto = (v: Valores | undefined) => {
    if (!v) return [];
    const partes: string[] = [];
    if (v.flete_pct != null) partes.push(`Flete ${pctTexto(v.flete_pct)}`);
    if (v.via) partes.push(VIAS[v.via]);
    if (v.ncm) partes.push(`NCM ${v.ncm}`);
    const otros = TODOS_PCT.filter(([k]) => k !== "flete_pct" && v[k] != null).length;
    if (otros) partes.push(`${otros} alícuota${otros === 1 ? "" : "s"}`);
    return partes;
  };
  // El buscador filtra las filas que se ven; el árbol entero sigue para elegir padre.
  const visibles = arbol.filter((f) => coincideBusqueda([String(f.id), f.nombre, f.descripcion, f.ml_categoria], q, comienza));
  // Una familia propia sólo cuelga de otra propia (nunca de una de Mercado Libre): ElegirFamilia con `propias`.
  const etiquetaDe = new Map(arbol.map((o) => [o.id, o.etiqueta]));
  const nombrePadre = (id: number) => etiquetaDe.get(id) ?? null;
  const cucardaDe = new Map(cucardas.map((c) => [c.id, c]));
  // Sin elegir columna se ve el árbol; ordenada por una columna, la lista plana.
  const ordenadas = ordenarEnMemoria(visibles, sp, {
    nombre: (f) => f.nombre, descuento: (f) => f.descuento_pct ?? f.heredado, productos: (f) => f.productos, origen: (f) => (f.deMl ? "Mercado Libre" : "Propia"),
  });
  const pagina = paginarEnMemoria(ordenadas, sp);
  const plana = ordenadas !== visibles;

  return (
    <Pantalla titulo="Familias" subtitulo="Agrupan productos. Lo que se carga en una familia (descuento, cucardas, costo de importación) lo heredan sus productos y subfamilias si no lo cambian"
      acciones={<><AccionesExcel lista={LISTA_FAMILIAS} org={s.org.id} /><BotonNuevo texto="Nueva familia" /></>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nueva familia" sinBoton>
        <form action={accionCrearFamilia} className="flex flex-wrap items-center gap-2">
          <input name="nombre" placeholder="Nombre (ej. Cocina)" className={`${CAMPO} flex-1 min-w-48`} autoFocus />
          <ElegirFamilia name="padre_id" propias vacio="Sin padre (arriba de todo)" placeholder="Dentro de… (buscá la familia padre)" className="w-72" />
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
              <th className={TH} title="Flete, vía, NCM y alícuotas que heredan sus productos">Costo de importación</th>
              <ThOrden col="productos" n title="Propios (con las subfamilias)">Productos</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>{q ? "Ninguna familia coincide." : "Todavía no hay familias."}</td></tr>}
            {pagina.map((f) => {
              const suyas = asignadas.filter((a) => a.familia_id === f.id);
              const propiosCosto = costoDe.get(f.id) ?? null;
              if (editarCosto === f.id) {
                const heredadoCosto = resolver(null, cadenaDe(f.ancestros), general);
                return (
                  <tr key={f.id} className={`${TR} bg-[#FAFBFC]`}>
                    <td colSpan={7} className={TD}>
                      <form action={accionGuardarCostoFamilia} className="space-y-2">
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="volver" value={url("/catalogo/familias", filtros)} />
                        <p className="text-xs font-bold">Costo de importación de {f.nombre}
                          <span className="font-normal text-[#5C6B76]"> — lo heredan sus productos y subfamilias si no tienen el suyo. Vacío = hereda.</span></p>
                        <CamposCosto editando propios={propiosCosto} heredado={heredadoCosto} credito={PCT_CREDITO} autoFocus />
                        <div className="flex gap-2 justify-end">
                          <button className={VERDE}>Guardar</button>
                          <Link href={url("/catalogo/familias", filtros)} className={SUAVE} scroll={false}>Cancelar</Link>
                        </div>
                      </form>
                    </td>
                  </tr>
                );
              }
              if (editar === f.id && !f.deMl) {
                return (
                  <tr key={f.id} className={`${TR} bg-[#FAFBFC]`}>
                    <td colSpan={7} className={TD}>
                      <form action={accionGuardarFamilia} className="space-y-2">
                        <input type="hidden" name="id" value={f.id} />
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-start">
                          <label className="col-span-2"><span className={ETIQUETA}>Nombre</span><input name="nombre" defaultValue={f.nombre} className={`${CAMPO} w-full`} autoFocus /></label>
                          <label className="col-span-2"><span className={ETIQUETA}>Familia padre</span>
                            <ElegirFamilia name="padre_id" propias excluir={f.id} valor={f.padre_id} etiqueta={f.padre_id ? nombrePadre(f.padre_id) : null}
                              vacio="Ninguna (arriba de todo)" />
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
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1.5">
                      {(() => {
                        const partes = resumenCosto(propiosCosto ?? undefined);
                        if (partes.length) return <span>{partes.join(" · ")}</span>;
                        const h = resolver(null, cadenaDe(f.ancestros), general);
                        return <span className="text-[#5C6B76]">hereda{h.flete_pct.valor != null ? ` (flete ${pctTexto(h.flete_pct.valor)})` : ""}</span>;
                      })()}
                      <Lapiz href={url("/catalogo/familias", { ...filtros, costo: f.id })} etiqueta="Editar el costo de importación" />
                    </span>
                  </td>
                  <td className={TDN}>
                    {/* El filtro de Productos por familia incluye sus subfamilias: el número es el total. */}
                    <Link href={url("/catalogo/productos", { familia: f.id })} className="text-[#16577F]">{total}</Link>
                    {total !== f.productos && <span className="text-[#5C6B76]" title="Los que están en esta familia, sin contar las de abajo"> ({f.productos} propios)</span>}
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
      <div className="mt-4">
        <CajaCostoGeneral general={general} editando={editandoFicha(sp, "general")}
          ver={url("/catalogo/familias", filtros)} editar={url("/catalogo/familias", { ...filtros, editar: "general" })} />
      </div>
    </Pantalla>
  );
}
