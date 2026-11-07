// Informes › Análisis diario (Fer, 7/11; bitácora #1130): lo que Laucen analizó a las 9 de la mañana —campañas de ML de
// las familias elegidas, ofertas relámpago y compartidas, publicidad y visitas de la tienda— con el resumen de la IA.
// Los datos: lib/analisis-diario/. Los botones de arriba hacen lo que se propone (siempre con el clic: AGENTS.md).

import Link from "next/link";
import { entrarErp, Pantalla, Avisos, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, TituloSeccion, BotonesFicha, Dato, Estado, editandoFicha, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import Pestanas from "@/app/componentes/Pestanas";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import FotosProducto from "@/app/componentes/FotosProducto";
import TituloCorto from "@/app/componentes/TituloCorto";
import ElegirFamilia from "@/app/componentes/ElegirFamilia";
import CampoNumero from "@/app/componentes/CampoNumero";
import { InterruptorCampo } from "@/app/administracion/contabilidad/piezas";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";
import { consulta } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { analisisDe, diasConAnalisis } from "@/lib/analisis-diario/correr";
import { configAnalisis, nombresFamilias } from "@/lib/analisis-diario/config";
import type { Analisis, EstadoCampana, FilaCampanaPub, FilaOferta } from "@/lib/analisis-diario/calcular";
import { accionAnalizar, accionEntrarOfertas, accionGuardarConfig, accionPrepararCampanas } from "./acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SP = { ver?: string; fecha?: string; editar?: string; ok?: string; error?: string };

const PANTALLA = "/informes/analisis-diario";
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const pesos = (n: number | null | undefined) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const entero = (n: number | null | undefined) => (n == null ? "—" : formatearNumero(n, "entero"));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${formatearNumero(Math.round(n * 10) / 10, "decimal")} %`);
const veces = (vendido: number, gasto: number | null) => (gasto ? `${formatearNumero(Math.round((vendido / gasto) * 10) / 10, "decimal")} x` : "—");
const diaLindo = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" });
const linkMl = (item: string) => `https://articulo.mercadolibre.com.ar/${item.replace(/^MLA/, "MLA-")}`;
/** Cuánto cambió contra los 7 días anteriores. */
const cambio = (ahora: number | null, antes: number | null) => {
  if (ahora == null || antes == null || antes === 0) return null;
  const v = Math.round(((ahora - antes) / antes) * 100);
  return <span className={`ml-1 text-[10px] ${v >= 0 ? "text-[#167655]" : "text-[#C03420]"}`} title="Contra los 7 días anteriores">{v >= 0 ? "▲" : "▼"} {Math.abs(v)} %</span>;
};

const ESTADOS: Record<EstadoCampana, { texto: string; tono: "verde" | "rojo" | "amarillo" | "azul" | "gris" }> = {
  oportunidad: { texto: "Puede entrar", tono: "verde" },
  sin_campana: { texto: "Sin campaña", tono: "rojo" },
  bajo_piso: { texto: "Muy abajo", tono: "amarillo" },
  pendiente: { texto: "Cambio sin salir", tono: "amarillo" },
  en_camino: { texto: "En camino", tono: "azul" },
};

const TIPO_OFERTA: Record<string, string> = { LIGHTNING: "Relámpago", SMART_LIGHTNING: "Relámpago compartida", SMART: "Compartida" };
const ESTADO_OFERTA: Record<string, string> = { candidate: "Propuesta", pending: "Programada", started: "En curso" };

export default async function AnalisisDiario({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("analisis_diario_ver");
  const sp = await searchParams;
  const ver = ["campanas", "ofertas", "publicidad", "visitas", "config"].includes(sp.ver ?? "") ? sp.ver! : "resumen";
  const [fila, dias] = await Promise.all([analisisDe(s.org.id, FECHA.test(sp.fecha ?? "") ? sp.fecha! : null), diasConAnalisis(s.org.id)]);
  const a = fila?.datos ?? null;
  const i = fila ? dias.indexOf(fila.fecha) : -1;
  const anterior = i >= 0 ? dias[i + 1] : undefined, siguiente = i > 0 ? dias[i - 1] : undefined;
  const ir = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const v = { ver: ver === "resumen" ? undefined : ver, fecha: sp.fecha, ...p };
    for (const [k, x] of Object.entries(v)) if (x) q.set(k, x);
    const t = q.toString();
    return t ? `${PANTALLA}?${t}` : PANTALLA;
  };
  const fotos = a ? await fotosDe([...new Set([...a.campanas.filas.map((f) => f.productoId), ...a.ofertas.map((f) => f.productoId)])]) : new Map<number, string[]>();
  const editando = ver === "config" && editandoFicha(sp);
  const oportunidades = a?.campanas.filas.filter((f) => f.estado === "oportunidad").length ?? 0;
  const entran = a?.ofertas.filter((f) => f.entra).length ?? 0;

  return (
    <Pantalla titulo="Análisis diario" ancho="max-w-[1600px]"
      subtitulo="Cada mañana a las 9: campañas de Mercado Libre, ofertas relámpago, publicidad y visitas de la tienda"
      acciones={ver === "config" ? (
        <BotonesFicha editando={editando} ver={`${PANTALLA}?ver=config`} editar={`${PANTALLA}?ver=config&editar=ficha`} />
      ) : (
        <div className="flex flex-wrap gap-2 justify-end">
          {entran > 0 && <BotonTarea accion={accionEntrarOfertas} tipo="analisis-ofertas" clase={PRIMARIO} texto="Entrar a las ofertas que cumplen"
            pregunta={`¿Entrar a las ofertas que cumplen (hoy a la mañana eran ${entran})?`} />}
          {oportunidades > 0 && <BotonTarea accion={accionPrepararCampanas} tipo="analisis-campanas" clase={PRIMARIO} texto="Preparar lote de campañas" />}
          <BotonTarea accion={accionAnalizar} tipo="analisis-diario" clase={SUAVE} texto="Volver a analizar" />
        </div>
      )}>
      <Avisos sp={sp} />
      {a && fila && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-[#5C6B76]">
          {anterior ? <Link href={ir({ fecha: anterior })} className={SUAVE} scroll={false}>◀ Día anterior</Link> : <span className={`${SUAVE} opacity-40`}>◀ Día anterior</span>}
          <span>Análisis del <b className="text-[#1F2D3A]">{diaLindo(fila.fecha)}</b>, hecho a las {new Date(fila.creado_ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })}</span>
          {siguiente ? <Link href={ir({ fecha: siguiente === dias[0] ? undefined : siguiente })} className={SUAVE} scroll={false}>Día siguiente ▶</Link> : <span className={`${SUAVE} opacity-40`}>Día siguiente ▶</span>}
          <span>· Familias: {a.config.familias.map((f) => f.nombre).join(", ") || "ninguna"} · tope de baja de una oferta: {pct(a.config.maxBajaPct)} sobre el precio del esquema</span>
        </div>
      )}
      <Pestanas items={[
        { href: ir({ ver: undefined }), texto: "Resumen", activa: ver === "resumen" },
        { href: ir({ ver: "campanas" }), texto: "Campañas de ML", activa: ver === "campanas", cuenta: a?.campanas.filas.length ?? 0 },
        { href: ir({ ver: "ofertas" }), texto: "Relámpago y compartidas", activa: ver === "ofertas", cuenta: a?.ofertas.length ?? 0 },
        { href: ir({ ver: "publicidad" }), texto: "Publicidad", activa: ver === "publicidad" },
        { href: ir({ ver: "visitas" }), texto: "Visitas de la tienda", activa: ver === "visitas" },
        { href: ir({ ver: "config" }), texto: "Configuración", activa: ver === "config" },
      ]} />
      {ver === "config" ? <Configuracion org={s.org.id} editando={editando} />
        : !a || !fila ? (
          <p className={`${CAJA} text-xs text-[#5C6B76]`}>Todavía no hay ningún análisis. Se hace solo todos los días a las 9; para tener el de hoy ya, apretá «Volver a analizar».</p>
        ) : ver === "campanas" ? <Campanas a={a} fotos={fotos} />
        : ver === "ofertas" ? <Ofertas a={a} fotos={fotos} />
        : ver === "publicidad" ? <Publicidad a={a} />
        : ver === "visitas" ? <Visitas a={a} />
        : <Resumen a={a} resumen={fila.resumen} error={fila.resumen_error} />}
    </Pantalla>
  );
}

async function fotosDe(productos: number[]): Promise<Map<number, string[]>> {
  if (!productos.length) return new Map();
  return new Map((await consulta<{ producto_id: number; fotos: string[] }>(
    "select producto_id::int, array_agg(url order by orden) fotos from producto_foto where producto_id = any($1::bigint[]) group by producto_id", [productos]).catch(() => []))
    .map((f) => [f.producto_id, f.fotos]));
}

function Producto({ id, sku, titulo, fotos }: { id: number; sku: string; titulo: string; fotos: Map<number, string[]> }) {
  return (
    <div className="flex items-start gap-2">
      <FotosProducto fotos={fotos.get(id)} titulo={titulo} />
      <div className="min-w-0 max-w-80">
        <Link href={`/catalogo/productos/${id}`} className="font-semibold text-[#16577F] hover:underline">{sku}</Link>
        <TituloCorto titulo={titulo} />
      </div>
    </div>
  );
}

function Publicacion({ item }: { item: string }) {
  return (
    <span className="whitespace-nowrap">
      <Link href={historialPublicacion(item)} className="text-[#16577F] hover:underline">{item}</Link>
      <a href={linkMl(item)} target="_blank" rel="noopener noreferrer" className="ml-1 text-[#5C6B76]" title="Abrir en Mercado Libre">↗</a>
    </span>
  );
}

function Resumen({ a, resumen, error }: { a: Analisis; resumen: string | null; error: string | null }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className={CAJA}>
        <TituloSeccion titulo="Lo que dice el análisis" />
        {resumen ? <div className="text-xs leading-relaxed whitespace-pre-wrap">{resumen}</div>
          : error === "escribiendo" ? <p className="text-xs text-[#5C6B76]">La IA está escribiendo el resumen; los datos ya están en las otras pestañas.</p>
          : <p className="text-xs text-[#5C6B76]">No se pudo escribir el resumen{error ? ` (${error.startsWith("Falta") ? error : "la IA no contestó"})` : ""}. Los datos están en las otras pestañas.</p>}
      </div>
      <div className="space-y-4">
        <div className={CAJA}>
          <TituloSeccion titulo={`Para hacer (${a.urgentes.length})`} />
          {a.urgentes.length ? <ul className="text-xs space-y-1 list-disc pl-4">{a.urgentes.map((u) => <li key={u}>{u}</li>)}</ul>
            : <p className="text-xs text-[#5C6B76]">Nada urgente.</p>}
        </div>
        <div className={CAJA}>
          <TituloSeccion titulo="En números" />
          <div className="grid grid-cols-2 gap-2">
            <Dato etiqueta="Publicaciones activas mirada" numero>{entero(a.campanas.publicaciones)}</Dato>
            <Dato etiqueta="En campaña" numero>{entero(a.campanas.enCampana)}</Dato>
            <Dato etiqueta="Invertido en 7 días" numero>{pesos(a.publicidad.canales.reduce((t, c) => t + (c.gasto ?? 0), 0))}</Dato>
            <Dato etiqueta="Vendido con publicidad" numero>{pesos(a.publicidad.canales.filter((c) => c.gasto != null).reduce((t, c) => t + c.vendido, 0))}</Dato>
            <Dato etiqueta="Visitantes en 7 días" numero>{entero(a.visitas.total.visitantes)}</Dato>
            <Dato etiqueta="Compras en la tienda" numero>{entero(a.visitas.total.compra)}</Dato>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campanas({ a, fotos }: { a: Analisis; fotos: Map<number, string[]> }) {
  const filas = a.campanas.filas;
  return (
    <>
      <p className="text-xs text-[#5C6B76] mb-2">
        De {entero(a.campanas.publicaciones)} publicaciones activas de las familias elegidas, {entero(a.campanas.enCampana)} están en una campaña y {entero(a.campanas.sinNecesidad)} no la necesitan (están a su precio, sin tachado).
        Acá van sólo las que piden algo. «Preparar lote de campañas» arma un lote con las que dicen «Puede entrar»; se manda desde
        la <Link href="/config/canales/cola?ver=lotes" className="underline">Cola de Mercado Libre</Link>.
      </p>
      {filas.length === 0 ? <p className={`${CAJA} text-xs text-[#5C6B76]`}>Todas las publicaciones están donde tienen que estar.</p> : (
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Producto</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Cuenta</th>
                <th className={TH}>Publicación</th>
                <th className={TH}>Plan</th>
                <th className={THN} title="Lo que paga hoy el comprador">Paga hoy</th>
                <th className={THN} title="Lo que tendría que pagar el comprador según el esquema de precios">Esquema</th>
                <th className={TH}>Qué pasa</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f: FilaCampanaPub) => (
                <tr key={`${f.canalId}:${f.itemId}`} className={TR} data-canal={f.canalId}>
                  <td className={TD}><Producto id={f.productoId} sku={f.sku} titulo={f.titulo} fotos={fotos} /></td>
                  <td className={TD}><Estado texto={ESTADOS[f.estado].texto} tono={ESTADOS[f.estado].tono} /></td>
                  <td className={`${TD} whitespace-nowrap`}>{f.cuenta}</td>
                  <td className={TD}><Publicacion item={f.itemId} /></td>
                  <td className={TD}>{f.plan ?? "—"}</td>
                  <td className={TDN}>{pesos(f.pagaHoy)}</td>
                  <td className={TDN}>{pesos(f.venta)}</td>
                  <td className={`${TD} min-w-72`}>{f.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Ofertas({ a, fotos }: { a: Analisis; fotos: Map<number, string[]> }) {
  return (
    <>
      <p className="text-xs text-[#5C6B76] mb-2">
        Las ofertas relámpago y compartidas que Mercado Libre propone a las publicaciones de las familias elegidas, y las que ya están programadas o en curso.
        «Entra» = baja hasta el {pct(a.config.maxBajaPct)} sobre el precio del esquema (en una compartida, lo que ponés vos), llega al piso del producto y hay el stock que pide.
        El detalle de cada una, en <Link href="/catalogo/precios-ml" className="underline">Precios en ML</Link>, pestaña Relámpago.
      </p>
      {a.ofertas.length === 0 ? <p className={`${CAJA} text-xs text-[#5C6B76]`}>Mercado Libre no propone ninguna oferta a estos productos.</p> : (
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Producto</th>
                <th className={TH}>¿Entra?</th>
                <th className={TH}>Oferta</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Cuenta</th>
                <th className={TH}>Publicación</th>
                <th className={THN} title="Lo que paga el comprador en la oferta">Precio</th>
                <th className={THN} title="Cuánto baja lo que pone el vendedor sobre el precio del esquema">Baja</th>
                <th className={THN} title="Lo que queda de cada venta hoy (precio − comisión − envío)">Recibís hoy</th>
                <th className={THN} title="Lo que queda de cada venta en la oferta">En la oferta</th>
                <th className={THN} title="Stock disponible / el que pide la oferta">Stock</th>
                <th className={TH}>Cuándo</th>
                <th className={TH}>Por qué</th>
              </tr>
            </thead>
            <tbody>
              {a.ofertas.map((f: FilaOferta) => (
                <tr key={`${f.canalId}:${f.itemId}:${f.tipo}:${f.nombre}`} className={TR} data-canal={f.canalId}>
                  <td className={TD}><Producto id={f.productoId} sku={f.sku} titulo={f.titulo} fotos={fotos} /></td>
                  <td className={TD}>{f.estado !== "candidate" ? "—" : f.entra ? <Estado texto="Entra" tono="verde" /> : <Estado texto="No" tono="gris" />}</td>
                  <td className={TD}>{TIPO_OFERTA[f.tipo] ?? f.tipo}{f.nombre ? <span className="block text-[10px] text-[#5C6B76]">{f.nombre}</span> : null}</td>
                  <td className={TD}>{ESTADO_OFERTA[f.estado] ?? f.estado}</td>
                  <td className={`${TD} whitespace-nowrap`}>{f.cuenta}</td>
                  <td className={TD}><Publicacion item={f.itemId} /></td>
                  <td className={TDN}>{pesos(f.precio)}</td>
                  <td className={TDN}>{pct(f.bajaPct)}</td>
                  <td className={TDN}>{pesos(f.recibisHoy)}</td>
                  <td className={TDN}>{pesos(f.recibisOferta)}</td>
                  <td className={TDN}>{entero(f.stock)}{f.stockPide != null ? ` / ${entero(f.stockPide)}` : ""}</td>
                  <td className={`${TD} whitespace-nowrap`}>{f.desde || f.hasta ? `${f.desde ? new Date(f.desde).toLocaleString("es-AR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }) : "?"} a ${f.hasta ? new Date(f.hasta).toLocaleString("es-AR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }) : "?"}` : "—"}</td>
                  <td className={`${TD} min-w-56`}>{f.motivo ?? (f.entra ? "Cumple todo." : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Publicidad({ a }: { a: Analisis }) {
  const p = a.publicidad;
  const dia = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "numeric", timeZone: "UTC" });
  return (
    <>
      <p className="text-xs text-[#5C6B76] mb-2">Del {dia(p.desde)} al {dia(p.hasta)}, con el cambio contra el {dia(p.desdeAntes)} al {dia(p.hastaAntes)}. El detalle día por día, en el <Link href="/informes/embudo" className="underline">Embudo de publicidad</Link>.</p>
      <TituloSeccion titulo={`Por canal (${p.canales.length})`} />
      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Canal</th>
              <th className={THN}>Invertido</th>
              <th className={THN} title="Clics en los anuncios">Clics</th>
              <th className={THN} title="Chats que empezaron desde un anuncio">Escrib.</th>
              <th className={THN} title="Mercado Libre: unidades vendidas por la publicidad; los demás: pedidos de la tienda que llegaron desde un anuncio">Ventas</th>
              <th className={THN}>Vendido</th>
              <th className={THN} title="Invertido dividido ventas">Costo/venta</th>
              <th className={THN} title="Vendido dividido invertido: cuántas veces volvió lo invertido">Retorno</th>
            </tr>
          </thead>
          <tbody>
            {p.canales.map((c) => (
              <tr key={c.clave} className={TR} data-canal={c.clave.startsWith("ml:") ? c.clave.slice(3) : undefined}>
                <td className={TD}><b>{c.canal}</b>{c.detalle ? <span className="block text-[10px] text-[#5C6B76]">{c.detalle}</span> : null}</td>
                <td className={TDN}>{c.gasto == null ? <span className="text-[#5C6B76]">sin conectar</span> : <>{pesos(c.gasto)}{cambio(c.gasto, c.antes.gasto)}</>}</td>
                <td className={TDN}>{entero(c.clics)}</td>
                <td className={TDN}>{entero(c.escribieron)}</td>
                <td className={TDN}>{entero(c.ventas)}{cambio(c.ventas, c.antes.ventas)}</td>
                <td className={TDN}>{pesos(c.vendido)}{cambio(c.vendido, c.antes.vendido)}</td>
                <td className={TDN}>{c.gasto != null && c.ventas ? pesos(c.gasto / c.ventas) : "—"}</td>
                <td className={TDN}>{veces(c.vendido, c.gasto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TituloSeccion titulo={`Campañas de Google y Meta (${p.campanas.length})`} />
      {p.campanas.length === 0 ? <p className={`${CAJA} text-xs text-[#5C6B76] mb-4`}>Ninguna campaña de Google ni de Meta gastó en estas dos semanas.</p> : (
        <div className={`${CAJA_TABLA} mb-4`}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr><th className={TH}>Campaña</th><th className={THN}>Invertido</th><th className={THN} title="Lo invertido en los 7 días anteriores">Antes</th><th className={THN}>Vieron</th><th className={THN}>Clics</th><th className={THN} title="Invertido dividido clics">Costo/clic</th></tr>
            </thead>
            <tbody>
              {p.campanas.map((c) => (
                <tr key={`${c.plataforma}:${c.campana}`} className={TR}>
                  <td className={TD}><span className="text-[10px] text-[#5C6B76] mr-1">{c.plataforma === "meta" ? "Meta" : c.plataforma === "google" ? "Google" : c.plataforma}</span>{c.campana}</td>
                  <td className={TDN}>{pesos(c.gasto)}{cambio(c.gasto, c.gastoAntes)}</td>
                  <td className={TDN}>{pesos(c.gastoAntes)}</td>
                  <td className={TDN}>{entero(c.vieron)}</td>
                  <td className={TDN}>{entero(c.clics)}</td>
                  <td className={TDN}>{c.clics ? pesos(c.gasto / c.clics) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TituloSeccion titulo={`Publicidad de Mercado Libre: para cortar, bajar o subir (${p.mlAds.length})`} />
      {p.mlAds.length === 0 ? <p className={`${CAJA} text-xs text-[#5C6B76] mb-4`}>Ningún producto pide cortar, bajar ni subir la publicidad.</p> : (
        <div className={`${CAJA_TABLA} mb-4`}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Producto</th><th className={TH}>Veredicto</th><th className={THN}>Gastó</th><th className={THN}>Ventas</th><th className={THN}>Vendido</th><th className={TH}>Por qué</th></tr></thead>
            <tbody>
              {p.mlAds.map((x) => (
                <tr key={x.clave} className={TR}>
                  <td className={`${TD} max-w-80`}><Link href={`/ventas/campanas-ml?q=${encodeURIComponent(x.clave)}`} className="font-semibold text-[#16577F] hover:underline">{x.sku ?? x.clave}</Link><TituloCorto titulo={x.titulo} /></td>
                  <td className={TD}><Estado texto={x.veredicto.toUpperCase()} tono={x.veredicto === "cortar" ? "rojo" : x.veredicto === "bajar" ? "amarillo" : "verde"} /></td>
                  <td className={TDN}>{pesos(x.costo)}</td>
                  <td className={TDN}>{entero(x.ventas)}</td>
                  <td className={TDN}>{pesos(x.vendido)}</td>
                  <td className={`${TD} min-w-72`}>{x.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TituloSeccion titulo={`De dónde salen los datos (${p.fuentes.length})`} />
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Fuente</th><th className={TH}>Última lectura</th><th className={TH}>Estado</th><th className={TH}>Nota</th></tr></thead>
          <tbody>
            {p.fuentes.map((f) => (
              <tr key={f.nombre} className={TR}>
                <td className={TD}>{f.nombre}</td>
                <td className={`${TD} whitespace-nowrap`}>{f.ultima ? new Date(f.ultima).toLocaleString("es-AR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }) : "nunca"}</td>
                <td className={TD}>{f.vieja ? <Estado texto="Vieja" tono="rojo" /> : <Estado texto="Al día" tono="verde" />}</td>
                <td className={TD}>{f.nota ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Visitas({ a }: { a: Analisis }) {
  const v = a.visitas;
  const conv = (x: number, de: number) => (de ? `${formatearNumero(Math.round((x / de) * 1000) / 10, "decimal")} %` : "—");
  const dia = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <Dato etiqueta="Visitantes" numero>{entero(v.total.visitantes)}{cambio(v.total.visitantes, v.antes.visitantes)}</Dato>
        <Dato etiqueta="Productos vistos" numero>{entero(v.total.productos)}{cambio(v.total.productos, v.antes.productos)}</Dato>
        <Dato etiqueta="Llegaron al carrito" numero>{entero(v.total.carrito)}</Dato>
        <Dato etiqueta="Llegaron a pagar" numero>{entero(v.total.checkout)}</Dato>
        <Dato etiqueta="Compraron" numero>{entero(v.total.compra)}{cambio(v.total.compra, v.antes.compra)}</Dato>
        <Dato etiqueta="Compras sobre visitantes" numero ayuda="Compras ÷ visitantes de los 7 días">{conv(v.total.compra, v.total.visitantes)}</Dato>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <TituloSeccion titulo={`Por día (${v.dias.length})`} />
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Día</th><th className={THN}>Visitantes</th><th className={THN} title="Productos vistos">Prod.</th><th className={THN}>Carrito</th><th className={THN} title="Llegaron a pagar">Pagar</th><th className={THN}>Compras</th><th className={THN} title="Clics en el botón de WhatsApp">WhatsApp</th></tr></thead>
              <tbody>
                {v.dias.map((d) => (
                  <tr key={d.fecha} className={TR}>
                    <td className={TD}>{dia(d.fecha)}</td>
                    <td className={TDN}>{entero(d.visitantes)}</td><td className={TDN}>{entero(d.productos)}</td><td className={TDN}>{entero(d.carrito)}</td>
                    <td className={TDN}>{entero(d.checkout)}</td><td className={TDN}>{entero(d.compra)}</td><td className={TDN}>{entero(d.whatsapp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <TituloSeccion titulo={`De dónde llegaron (${v.origenes.length})`} />
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Origen</th><th className={THN}>Visitantes</th><th className={THN} title="Los 7 días anteriores">Antes</th></tr></thead>
              <tbody>
                {v.origenes.map((o) => (
                  <tr key={o.origen} className={TR}><td className={TD}>{o.origen}</td><td className={TDN}>{entero(o.visitantes)}{cambio(o.visitantes, o.antes)}</td><td className={TDN}>{entero(o.antes)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

async function Configuracion({ org, editando }: { org: string; editando: boolean }) {
  const cfg = await configAnalisis(org);
  const familias = await nombresFamilias(org, cfg.familias);
  if (!editando) {
    return (
      <div className={`${CAJA} grid gap-3 md:grid-cols-3`}>
        <Dato etiqueta="Familias que se miran en Mercado Libre" ayuda="Con todas sus subfamilias.">{familias.map((f) => f.nombre).join(" · ")}</Dato>
        <Dato etiqueta="Lo más que puede bajar una oferta" numero ayuda="Sobre el precio del esquema de cada publicación. Más que esto, no se propone.">{pct(cfg.maxBajaPct)}</Dato>
        <div>
          <span className={ETIQUETA}>Avisar al celular y en Para hacer</span>
          <input type="checkbox" checked={cfg.avisar} disabled readOnly className="mt-2" aria-label="Avisar" />
        </div>
      </div>
    );
  }
  return (
    <form id="ficha" action={accionGuardarConfig} className={`${CAJA} grid gap-3 md:grid-cols-3`}>
      <div>
        <span className={ETIQUETA}>Familias que se miran en Mercado Libre</span>
        <div className="space-y-1 mb-2">
          {familias.map((f) => (
            <label key={f.id} className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="familia" value={f.id} defaultChecked /> {f.nombre}</label>
          ))}
          {familias.length === 0 && <p className="text-xs text-[#5C6B76]">Ninguna todavía.</p>}
        </div>
        <span className={ETIQUETA}>Sumar una familia</span>
        <ElegirFamilia name="familia_nueva" vacio="Ninguna" className={CAMPO} />
        <span className="block text-[10px] text-[#5C6B76] mt-0.5">Destildá una para dejar de mirarla.</span>
      </div>
      <div>
        <span className={ETIQUETA}>Lo más que puede bajar una oferta (%)</span>
        <CampoNumero name="max_baja" valor={cfg.maxBajaPct} tipo="pct" />
        <span className="block text-[10px] text-[#5C6B76] mt-0.5">Sobre el precio del esquema de cada publicación.</span>
      </div>
      <div>
        <span className={ETIQUETA}>Avisar al celular y en Para hacer</span>
        <InterruptorCampo name="avisar" prendido={cfg.avisar} etiqueta="Avisar" />
      </div>
    </form>
  );
}
