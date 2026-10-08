// Publicaciones (orden 136, §4.5): cada variación en cada canal, con su id
// externo (ej. MLA…), categoría, tipo y estado. Es un espejo de lo publicado
// (decisión de Fer, 3/10): lo escribe la sincronización con Mercado Libre y acá
// no se crea, no se borra ni se cambia. Sólo se edita lo propio de Laucen: el
// umbral de pausa (lápiz de la fila) y el vínculo con la variación — el de ML,
// en "Vincular con Mercado Libre"; el de otros canales, en el lápiz.

import { enlaceMl, historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import Link from "next/link";
import FotosProducto from "@/app/componentes/FotosProducto";
import PrecioPublicacion from "@/app/componentes/PrecioPublicacion";
import { consulta } from "@/lib/erp/base";
import { VERDE, SUAVE } from "@/app/botones";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo, { FiltroVivo, CasillaViva } from "@/app/componentes/BuscadorVivo";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { BotonConfirmar } from "@/app/radar/Cliente";
import { formatear, tcDelDia } from "@/lib/moneda";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, CAMPO,
} from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_PUBLICACIONES, DISPONIBLE_PUBLICACION, textoEstadoMl, PlanPublicacion, PLAN_PUBLICACION, CUOTAS_VISIBLES_PUBLICACION, ES_CATALOGO, PRECIO_PUBLICACION, TACHADO_PUBLICACION, CAMPANA_PUBLICACION, PRECIO_CAMPANA_PUBLICACION, ORDEN_PLAN_PUBLICACION, ORDEN_CANAL, MarcaCatalogo } from "./lista";
import { accionGuardarPublicacion, accionPausarPublicacion, accionSacarPausa, accionCorregirPrecio, accionLeerMotivos, accionEliminarPublicacion } from "./acciones";
import BotonEliminar from "./BotonEliminar";

/** Los botones de la fila, chicos (Fer, 8/10). */
const CHICO = "text-[11px] font-bold rounded-md px-1.5 py-0.5 bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F]";
import { verInactivos } from "@/app/componentes/Inactivos";

export const dynamic = "force-dynamic";
// Las tareas de fondo de sus botones corren hasta este tope.
export const maxDuration = 120;

const BASE = "/catalogo/publicaciones";

type SP = { canal?: string; estado?: string; revision?: string; catalogo?: string; comunes?: string; precio?: string; q?: string; contiene?: string; inactivos?: string; editar?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

type Fila = {
  id: number; variacion_id: number; producto_id: number; sku: string; titulo_var: string; foto: string | null; canal_id: number; canal: string; canal_tipo: string;
  id_externo: string | null; titulo: string | null; categoria_externa: string | null; tipo_publicacion: string | null;
  estado: string; umbral_pausa: number | null; disponible: number; umbral_efectivo: number;
  sincronizada: string | null; stock_ml: number | null; estado_ml: string | null;
  precio: number | null; tachado: number | null; campana: string | null; precio_campana: number | null; plan: string | null; cuotas_visibles: number | null; catalogo: boolean; pausada_manual: boolean;
  motivo: string | null; solucion: string | null; por_precio: boolean | null; corregido: string | null; prohibida: boolean; motivo_leido: boolean;
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
  // En revisión en ML: filtro y la fila donde se está corrigiendo el precio (?precio=<id>).
  const revision = sp.revision === "todas" || sp.revision === "precio" || sp.revision === "otro" ? sp.revision : null;
  const corrigiendo = Number(sp.precio) || 0;
  const inactivos = verInactivos(sp);
  const catalogo = sp.catalogo === "1", comunes = sp.comunes === "1";
  const filtros = { canal: canalId, estado, revision, catalogo: catalogo ? "1" : null, comunes: comunes ? "1" : null, q, contiene: cont, inactivos: inactivos ? "1" : null, p: sp.p, orden: sp.orden, dir: sp.dir };
  const aqui = url(BASE, filtros);

  const canales = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from canal where organizacion_id = $1 and estado <> 'archivado' order by nombre", [s.org.id]);
  // Lo caro de cada fila (título, disponible, umbral) se calcula sólo para la página.
  const DISPONIBLE = DISPONIBLE_PUBLICACION;
  const base = await LISTA_PUBLICACIONES.consulta!({ org: s.org.id, moneda: s.moneda }, sp);
  const { filas, total } = await consultaPaginada<Fila>({
    campos: `pu.id::int, v.id::int variacion_id, p.id::int producto_id, v.sku, titulo_variacion(v.id) titulo_var, c.id::int canal_id, c.nombre canal, c.tipo canal_tipo,
           pu.id_externo, pu.titulo, pu.categoria_externa, pu.tipo_publicacion, pu.estado, pu.umbral_pausa,
           ${DISPONIBLE} disponible, umbral_pausa_de($1, v.id, c.id) umbral_efectivo, mi.stock stock_ml, mi.estado estado_ml, pu.pausada_manual,
           ${PRECIO_PUBLICACION} precio, ${TACHADO_PUBLICACION} tachado, ${CAMPANA_PUBLICACION} campana, ${PRECIO_CAMPANA_PUBLICACION} precio_campana, ${PLAN_PUBLICACION} plan, ${CUOTAS_VISIBLES_PUBLICACION}::int cuotas_visibles, ${ES_CATALOGO} catalogo,
           to_char(pu.ultima_sincronizacion_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') sincronizada,
           coalesce((select pf.url from producto_foto pf where pf.producto_id = p.id order by pf.orden, pf.id limit 1), mi.foto) foto,
           mm.motivo, mm.solucion, mm.por_precio, mm.item_id is not null motivo_leido,
           to_char(mm.precio_corregido_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') corregido,
           coalesce((mi.datos_externos -> 'ml' -> 'sub_status') ? 'forbidden', false) prohibida`,
    desde: base.desde,
    donde: base.donde,
    orden: leerOrden(sp, {
      sku: "v.sku", titulo: "coalesce(pu.titulo, p.titulo)", canal: ORDEN_CANAL, externo: "pu.id_externo", categoria: "pu.categoria_externa",
      estado: "pu.estado", plan: ORDEN_PLAN_PUBLICACION, precio: PRECIO_PUBLICACION, disponible: DISPONIBLE, umbral: "umbral_pausa_de($1, v.id, c.id)", stock_ml: "mi.stock",
    }, base.orden),
  }, base.valores, sp);

  // Los precios de las publicaciones son en pesos; si se mira en dólares, al tipo de cambio de hoy (igual que en Vincular con Mercado Libre).
  const tc = s.moneda === "USD" ? (await tcDelDia(s.org.id))?.venta ?? null : null;
  const plata = (x: number) => (tc ? formatear(x / tc, "USD") : formatear(x, "ARS"));
  const vincularMl = (f: Fila) => url("/catalogo/publicaciones/ml", { canal: f.canal_id, ver: "todas", q: f.id_externo, contiene: "1" });

  return (
    <Pantalla titulo="Publicaciones" subtitulo="Espejo de lo publicado en Mercado Libre; se actualiza solo. Los cambios hacia Mercado Libre salen de la ficha del producto y de las reglas."
      acciones={<>
        {/* Sólo lectura: por qué está en revisión cada publicación (también lo hace solo, de fondo, una vez por día). */}
        <BotonTarea accion={accionLeerMotivos} tipo="motivos-revision" clase={SUAVE} texto="Leer motivos de revisión" />
        <AccionesExcel lista={LISTA_PUBLICACIONES} org={s.org.id} /><Link href="/catalogo/publicaciones/ml" className={SUAVE}>Vincular con Mercado Libre</Link></>}>
      <Avisos sp={sp} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} inactivos={inactivos} placeholder="Buscar por título, SKU o id externo" limpiar={["editar"]} />
        <FiltroVivo parametro="canal" valor={canalId ? String(canalId) : ""} etiqueta="Canal" limpiar={["editar"]}>
          <option value="">Todos los canales</option>
          {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </FiltroVivo>
        <FiltroVivo parametro="estado" valor={estado ?? ""} etiqueta="Estado" limpiar={["editar"]}>
          <option value="">Todos los estados</option><option value="activa">Activa</option><option value="pausada">Pausada</option><option value="cerrada">Cerrada</option>
        </FiltroVivo>
        <FiltroVivo parametro="revision" valor={revision ?? ""} etiqueta="En revisión en ML" limpiar={["editar", "precio"]}>
          <option value="">En revisión o no</option><option value="todas">En revisión en ML</option>
          <option value="precio">En revisión por precio</option><option value="otro">En revisión por otro motivo</option>
        </FiltroVivo>
        {/* De catálogo o no (Fer, 7/10): con una sola tildada filtra; con las dos (o ninguna), todas. */}
        <CasillaViva parametro="catalogo" activo={catalogo} etiqueta="De catálogo" ayuda="Las publicaciones que compiten en la página del producto de Mercado Libre" />
        <CasillaViva parametro="comunes" activo={comunes} etiqueta="Clásicas (no catálogo)" ayuda="Las publicaciones propias, fuera del catálogo de Mercado Libre" />
      </div>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH} /><ThOrden col="sku">SKU</ThOrden><ThOrden col="titulo">Título</ThOrden><ThOrden col="canal" porDefecto>Canal</ThOrden><ThOrden col="externo">Id externo</ThOrden>
              <ThOrden col="plan">Plan</ThOrden><ThOrden col="precio" n>Precio</ThOrden><ThOrden col="estado">Estado</ThOrden><ThOrden col="stock_ml" n>Stock</ThOrden><ThOrden col="umbral" n>Umbral pausa</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={11} className={`${TD} text-[#5C6B76]`}>{canalId || estado || revision || catalogo || comunes || q ? "Nada coincide con el filtro." : "Todavía no hay publicaciones: se traen solas de Mercado Libre al vincular la cuenta."}</td></tr>}
            {filas.map((f) => (
              <tr key={f.id} data-canal={f.canal_id} className={`${TR} ${editar === f.id ? "outline outline-2 -outline-offset-2 outline-[#16577F]" : ""}`}>
                {/* La foto: 30 % más chica y al tocarla se agranda, como en todas las listas (Fer, 8/10). */}
                <td className={`${TD} w-[40px]`}><FotosProducto fotos={f.foto ? [f.foto] : null} titulo={f.titulo_var} /></td>
                {/* SKU, MLA y título siempre a la vista (Fer, 7/10). */}
                <td className={`${TD} font-mono whitespace-nowrap`}><Link href={`/catalogo/productos/${f.producto_id}`} className="text-[#16577F] hover:underline">{f.sku}</Link></td>
                {/* El título es lo más importante: columna ancha (Fer, 8/10). */}
                <td className={`${TD} min-w-[300px]`}>
                  <Link href={`/catalogo/productos/${f.producto_id}`} className="hover:underline">{f.titulo ?? <span className="text-[#5C6B76]">{f.titulo_var}</span>}</Link>
                  {editar === f.id && f.canal_tipo !== "mercadolibre" && (
                    <input name="sku" form={`pub-${f.id}`} defaultValue={f.sku} placeholder="SKU o código de barras" title="La variación de Laucen de esta publicación"
                      className={`${CAMPO} mt-1 block w-44`} autoFocus />
                  )}
                </td>
                <td className={TD}><Link href={url(BASE, { ...filtros, canal: f.canal_id, p: null })} className="hover:text-[#16577F] hover:underline">{f.canal}</Link></td>
                <td className={`${TD} whitespace-nowrap`}>{f.id_externo && /^MLA\d+$/.test(f.id_externo)
                  ? <><Link href={historialPublicacion(f.id_externo)} className="text-[#16577F] hover:underline" title="Historial de esta publicación">{f.id_externo}</Link> <a href={enlaceMl(f.id_externo)} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline" title="Ver en Mercado Libre">↗</a></>
                  : f.id_externo ?? "—"}</td>
                <td className={`${TD} whitespace-nowrap`}><PlanPublicacion plan={f.plan} cuotas={f.cuotas_visibles} />{f.catalogo && <span className="block mt-0.5"><MarcaCatalogo /></span>}</td>
                <td className={TDN}>
                  {corrigiendo === f.id ? (
                    // Corregir el precio de una en revisión: sale a ML con este clic (por la cola).
                    <form action={accionCorregirPrecio} className="inline-flex flex-col items-end gap-1">
                      <input type="hidden" name="id" value={f.id} /><input type="hidden" name="volver" value={url(BASE, { ...filtros, precio: null })} />
                      <CampoNumero name="precio" valor={f.precio} tipo="pesos" className={`${CAMPO} w-28`} />
                      <span className="inline-flex gap-1">
                        <button className={VERDE}>Mandar a ML</button>
                        <Link href={url(BASE, { ...filtros, precio: null })} className={SUAVE} scroll={false}>Cancelar</Link>
                      </span>
                    </form>
                  ) : f.precio != null ? (
                    // Como en ML (Fer, 8/10): grande lo que paga (la campaña en curso, si baja el precio), el de lista chico y tachado, % OFF y la campaña chiquita.
                    f.precio_campana != null && f.precio_campana < f.precio
                      ? <PrecioPublicacion paga={f.precio_campana} lista={Math.max(f.precio, f.tachado ?? 0)} campana={f.campana} texto={plata} />
                      : <PrecioPublicacion paga={f.precio} lista={f.tachado} campana={f.campana} texto={plata} />
                  ) : <span className="text-[#5C6B76]">—</span>}
                </td>
                <td className={TD} title={f.sincronizada ? `Última sincronización: ${f.sincronizada}` : undefined}>
                  {f.pausada_manual && <span className="mb-0.5 block"><Estado texto={f.estado === "pausada" ? "Pausada por vos" : "Pausa pedida"} tono="amarillo" /></span>}
                  {!(f.pausada_manual && f.estado === "pausada") && <Estado texto={TEXTO_ESTADO[f.estado] ?? f.estado} tono={TONO_ESTADO[f.estado] ?? "gris"} />}
                  {f.estado_ml && <span className="block text-[10px] text-[#5C6B76]">En ML: {textoEstadoMl(f.estado_ml)}{f.estado_ml === "under_review" && (f.prohibida ? " (prohibida)" : " (esperando corrección)")}</span>}
                  {/* El motivo de la revisión (Fer, 5/10), leído de las infracciones de ML. */}
                  {f.estado_ml === "under_review" && (
                    <span className="mt-0.5 block max-w-64 whitespace-normal text-[10px] leading-3" title={[f.motivo, f.solucion && `Solución: ${f.solucion}`].filter(Boolean).join("\n\n")}>
                      {f.por_precio && <span className="mr-1"><Estado texto="Por precio" tono="rojo" /></span>}
                      {f.motivo ? <span className="text-[#8a6100]">{f.motivo.length > 140 ? `${f.motivo.slice(0, 140)}…` : f.motivo}</span>
                        : <span className="text-[#5C6B76]">{f.motivo_leido ? "ML no informa el motivo" : "Motivo todavía no leído"}</span>}
                      {f.corregido && <span className="block text-[#1F6E4A]">Precio corregido el {f.corregido}: esperando que ML la revise.</span>}
                    </span>
                  )}
                </td>
                {/* Un solo «Stock» (Fer, 8/10): el que tiene la publicación en ML (en la web, el disponible); el de Laucen, al pasar el mouse. En rojo si quedó en el umbral o abajo. */}
                <td className={`${TDN} ${f.disponible <= f.umbral_efectivo ? "text-[#C03420] font-semibold" : ""}`}
                  title={`Disponible en Laucen para este canal: ${f.disponible}${f.stock_ml != null && f.stock_ml !== f.disponible ? " (distinto de lo que tiene ML: revisar la sincronización de stock)" : ""}`}>
                  <Link href={url("/stock/consulta", { v: f.variacion_id })} className="hover:underline">{f.stock_ml ?? f.disponible}</Link>
                  {f.stock_ml != null && f.stock_ml !== f.disponible && <span className="block text-[10px] text-[#8a6100]">Laucen: {f.disponible}</span>}
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
                    <span className="inline-flex items-center gap-1">
                      {f.canal_tipo === "mercadolibre" && f.id_externo && f.estado === "activa" && !f.pausada_manual && (
                        <BotonConfirmar accion={accionPausarPublicacion} campos={{ id: String(f.id), volver: aqui }} clase={CHICO}
                          texto="⏸" pregunta="¿Pausar en Mercado Libre?" corriendo="Pausando…" />
                      )}
                      {f.canal_tipo === "mercadolibre" && f.pausada_manual && (
                        <BotonConfirmar accion={accionSacarPausa} campos={{ id: String(f.id), volver: aqui }} clase={CHICO}
                          texto="▶" pregunta="¿Sacar la pausa?" corriendo="Activando…" />
                      )}
                      {f.canal_tipo === "mercadolibre" && f.id_externo && f.estado_ml === "under_review" && !f.prohibida && (
                        <Link href={url(BASE, { ...filtros, precio: f.id })} className={CHICO} scroll={false} title="Cambiar el precio en Mercado Libre para que la vuelva a revisar">Corregir precio</Link>
                      )}
                      {f.canal_tipo === "mercadolibre" && f.id_externo && (
                        <Link href={vincularMl(f)} className={CHICO} title="Cambiar a qué variación de Laucen corresponde esta publicación">Re-vincular</Link>
                      )}
                      {/* Eliminar en ML (Fer, 8/10): nunca una activa; pausada con stock, doble aviso. */}
                      {f.canal_tipo === "mercadolibre" && f.id_externo && f.estado_ml !== "active" && !(f.estado === "activa" && !f.estado_ml) && (
                        <BotonEliminar accion={accionEliminarPublicacion} campos={{ id: String(f.id), volver: aqui }} disponible={f.disponible} />
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
        <p className="text-[11px] text-[#5C6B76] mt-2">Stock: lo que la publicación tiene cargado en Mercado Libre (también si está pausada); al pasar el mouse, lo disponible en Laucen para ese canal (si difieren, se avisa abajo del número). Umbral pausa: con ese disponible o menos, el canal pausa la publicación (vacío = hereda del producto, del canal o de la organización). ⏸ pausa, ▶ saca la pausa y ✕ elimina en Mercado Libre (sólo si no está activa).</p>
      </section>
    </Pantalla>
  );
}
