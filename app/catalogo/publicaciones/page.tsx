// Publicaciones (orden 136, §4.5): cada variación en cada canal, con su id
// externo (ej. MLA…), categoría, tipo y estado. Es un espejo de lo publicado
// (decisión de Fer, 3/10): lo escribe la sincronización con Mercado Libre y acá
// no se crea, no se borra ni se cambia. Sólo se edita lo propio de Laucen: el
// umbral de pausa (lápiz de la fila) y el vínculo con la variación — el de ML,
// en "Vincular con Mercado Libre"; el de otros canales, en el lápiz.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { VERDE, SUAVE } from "@/app/botones";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import FotosProducto from "@/app/componentes/FotosProducto";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, CAMPO,
} from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_PUBLICACIONES, DISPONIBLE_PUBLICACION, textoEstadoMl } from "./lista";
import { accionGuardarPublicacion } from "./acciones";
import { verInactivos } from "@/app/componentes/Inactivos";

export const dynamic = "force-dynamic";

const BASE = "/catalogo/publicaciones";

type SP = { canal?: string; estado?: string; q?: string; contiene?: string; inactivos?: string; editar?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

type Fila = {
  id: number; variacion_id: number; producto_id: number; sku: string; titulo_var: string; fotos: string[] | null; canal_id: number; canal: string; canal_tipo: string;
  id_externo: string | null; titulo: string | null; categoria_externa: string | null; tipo_publicacion: string | null;
  estado: string; umbral_pausa: number | null; disponible: number; umbral_efectivo: number;
  sincronizada: string | null; stock_ml: number | null; estado_ml: string | null;
};

const TONO_ESTADO: Record<string, "verde" | "amarillo" | "gris"> = { activa: "verde", pausada: "amarillo", cerrada: "gris" };
const TEXTO_ESTADO: Record<string, string> = { activa: "Activa", pausada: "Pausada", cerrada: "Cerrada" };

export default async function Publicaciones({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("publicaciones_ver");
  const sp = await searchParams;
  const canalId = Number(sp.canal) || null;
  const estado = sp.estado && TEXTO_ESTADO[sp.estado] ? sp.estado : null;
  const q = sp.q?.trim() || "";
  const comienza = sp.contiene !== "1";
  const cont = comienza ? null : "1";
  const editar = Number(sp.editar) || 0;
  const inactivos = verInactivos(sp);
  const filtros = { canal: canalId, estado, q, contiene: cont, inactivos: inactivos ? "1" : null, p: sp.p, orden: sp.orden, dir: sp.dir };
  const aqui = url(BASE, filtros);

  const canales = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from canal where organizacion_id = $1 and estado <> 'archivado' order by nombre", [s.org.id]);
  // Lo caro de cada fila (título, disponible, umbral) se calcula sólo para la página.
  const DISPONIBLE = DISPONIBLE_PUBLICACION;
  const base = await LISTA_PUBLICACIONES.consulta!({ org: s.org.id, moneda: s.moneda }, sp);
  const { filas, total } = await consultaPaginada<Fila>({
    campos: `pu.id::int, v.id::int variacion_id, p.id::int producto_id, v.sku, titulo_variacion(v.id) titulo_var, c.id::int canal_id, c.nombre canal, c.tipo canal_tipo,
           pu.id_externo, pu.titulo, pu.categoria_externa, pu.tipo_publicacion, pu.estado, pu.umbral_pausa,
           ${DISPONIBLE} disponible, umbral_pausa_de($1, v.id, c.id) umbral_efectivo, mi.stock stock_ml, mi.estado estado_ml,
           to_char(pu.ultima_sincronizacion_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') sincronizada,
           (select array_agg(pf.url order by pf.orden, pf.id) from producto_foto pf where pf.producto_id = p.id) fotos`,
    desde: base.desde,
    donde: base.donde,
    orden: leerOrden(sp, {
      sku: "v.sku", titulo: "coalesce(pu.titulo, p.titulo)", canal: "c.nombre", externo: "pu.id_externo", categoria: "pu.categoria_externa",
      estado: "pu.estado", disponible: DISPONIBLE, umbral: "umbral_pausa_de($1, v.id, c.id)", stock_ml: "mi.stock",
    }, base.orden),
  }, base.valores, sp);

  const vincularMl = (f: Fila) => url("/catalogo/publicaciones/ml", { canal: f.canal_id, ver: "todas", q: f.id_externo, contiene: "1" });

  return (
    <Pantalla titulo="Publicaciones" subtitulo="Espejo de lo publicado en Mercado Libre; se actualiza solo. Los cambios hacia Mercado Libre salen de la ficha del producto y de las reglas."
      acciones={<><AccionesExcel lista={LISTA_PUBLICACIONES} org={s.org.id} /><Link href="/catalogo/publicaciones/ml" className={SUAVE}>Vincular con Mercado Libre</Link></>}>
      <Avisos sp={sp} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} inactivos={inactivos} placeholder="Buscar por SKU o id externo" limpiar={["editar"]} />
        <FiltroVivo parametro="canal" valor={canalId ? String(canalId) : ""} etiqueta="Canal" limpiar={["editar"]}>
          <option value="">Todos los canales</option>
          {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </FiltroVivo>
        <FiltroVivo parametro="estado" valor={estado ?? ""} etiqueta="Estado" limpiar={["editar"]}>
          <option value="">Todos los estados</option><option value="activa">Activa</option><option value="pausada">Pausada</option><option value="cerrada">Cerrada</option>
        </FiltroVivo>
      </div>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="sku">SKU</ThOrden><ThOrden col="titulo">Título</ThOrden><ThOrden col="canal" porDefecto>Canal</ThOrden><ThOrden col="externo">Id externo</ThOrden>
              <ThOrden col="categoria">Categoría · tipo</ThOrden><ThOrden col="estado">Estado</ThOrden><ThOrden col="disponible" n>Disponible</ThOrden><ThOrden col="stock_ml" n>Stock en ML</ThOrden><ThOrden col="umbral" n>Umbral</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>{canalId || estado || q ? "Nada coincide con el filtro." : "Todavía no hay publicaciones: se traen solas de Mercado Libre al vincular la cuenta."}</td></tr>}
            {filas.map((f) => (
              <tr key={f.id} className={`${TR} ${editar === f.id ? "bg-[#FAFBFC]" : ""}`}>
                <td className={`${TD} whitespace-nowrap`}>
                  {editar === f.id && f.canal_tipo !== "mercadolibre" ? (
                    <input name="sku" form={`pub-${f.id}`} defaultValue={f.sku} placeholder="SKU o código de barras" title="La variación de Laucen de esta publicación"
                      className={`${CAMPO} w-36`} autoFocus />
                  ) : (
                    <>
                      <Link href={`/catalogo/productos/${f.producto_id}`} className="font-semibold text-[#16577F] hover:underline">{f.sku}</Link>{" "}
                      <FotosProducto fotos={f.fotos} titulo={f.titulo ?? f.titulo_var} />
                    </>
                  )}
                </td>
                <td className={TD}><Link href={`/catalogo/productos/${f.producto_id}`} className="hover:underline">{f.titulo ?? <span className="text-[#5C6B76]">{f.titulo_var}</span>}</Link></td>
                <td className={TD}><Link href={url(BASE, { ...filtros, canal: f.canal_id, p: null })} className="hover:text-[#16577F] hover:underline">{f.canal}</Link></td>
                <td className={`${TD} whitespace-nowrap`}>{f.id_externo && /^MLA\d+$/.test(f.id_externo)
                  ? <a href={`https://articulo.mercadolibre.com.ar/MLA-${f.id_externo.slice(3)}`} target="_blank" rel="noopener" className="text-[#16577F] hover:underline" title="Ver en Mercado Libre">{f.id_externo}</a>
                  : f.id_externo ?? "—"}</td>
                <td className={TD}>{[f.categoria_externa, f.tipo_publicacion].filter(Boolean).join(" · ") || "—"}</td>
                <td className={TD}>
                  <Estado texto={TEXTO_ESTADO[f.estado] ?? f.estado} tono={TONO_ESTADO[f.estado] ?? "gris"} />
                  {f.estado_ml && <span className="block text-[10px] text-[#5C6B76]">En ML: {textoEstadoMl(f.estado_ml)}</span>}
                  {f.sincronizada && <span className="block text-[10px] text-[#5C6B76]">sinc. {f.sincronizada}</span>}
                </td>
                <td className={`${TDN} ${f.disponible <= f.umbral_efectivo ? "text-[#C03420] font-semibold" : ""}`}>
                  <Link href={url("/stock/consulta", { v: f.variacion_id })} className="hover:underline">{f.disponible}</Link>
                </td>
                <td className={TDN} title="Lo que Mercado Libre tiene cargado como disponible en la publicación (aunque esté pausada)">
                  {f.stock_ml != null ? f.stock_ml : <span className="text-[#5C6B76]">—</span>}
                </td>
                {editar === f.id ? (
                  <td className={TDN}>
                    <CampoNumero name="umbral" form={`pub-${f.id}`} valor={f.umbral_pausa} tipo="entero" placeholder={`hereda (${f.umbral_efectivo})`} className={`${CAMPO} w-24`} />
                  </td>
                ) : (
                  <td className={TDN} title={f.umbral_pausa == null ? "Hereda del producto, del canal o de la organización" : "Propio de esta publicación"}>
                    {f.umbral_efectivo}{f.umbral_pausa == null && <span className="text-[10px] text-[#5C6B76]"> (hereda)</span>}
                  </td>
                )}
                <td className={`${TD} text-right whitespace-nowrap`}>
                  {editar === f.id ? (
                    <form id={`pub-${f.id}`} action={accionGuardarPublicacion} className="inline-flex gap-1">
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="volver" value={aqui} />
                      <button className={VERDE}>Guardar</button>
                      <Link href={aqui} className={SUAVE} scroll={false}>Cancelar</Link>
                    </form>
                  ) : (
                    <span className="inline-flex gap-1">
                      {f.canal_tipo === "mercadolibre" && f.id_externo && (
                        <Link href={vincularMl(f)} className={SUAVE} title="Cambiar a qué variación de Laucen corresponde esta publicación">Re-vincular</Link>
                      )}
                      <Lapiz href={url(BASE, { ...filtros, editar: f.id })} etiqueta={f.canal_tipo === "mercadolibre" ? "Editar el umbral de pausa" : "Editar el umbral de pausa y la variación"} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />

      <section className="mt-2">
        <p className="text-[11px] text-[#5C6B76] mt-2">Disponible: lo que hay para vender en los depósitos del canal. Stock en ML: lo que la publicación tiene cargado en Mercado Libre (también si está pausada). Umbral: con ese disponible o menos, el canal pausa la publicación (vacío = hereda del producto, del canal o de la organización).</p>
      </section>
    </Pantalla>
  );
}
