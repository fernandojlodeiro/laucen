// Compras › Vendedores referentes (pedido de Fer, 28/10; lib/compras/referentes.ts): lo que venden los vendedores de la
// competencia que leímos, cruzado con nuestro catálogo, para elegir qué pedirle cotizar al proveedor.

import Link from "next/link";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import BuscadorVivo, { CasillaViva } from "@/app/componentes/BuscadorVivo";
import CasillaAccion from "@/app/componentes/CasillaAccion";
import FotosProducto from "@/app/componentes/FotosProducto";
import { Paginado, ThOrden } from "@/app/componentes/Lista";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import TituloCorto from "@/app/componentes/TituloCorto";
import { Avisos, CAJA_TABLA, CAMPO, ETIQUETA, Estado, Pantalla, TABLA, TD, TDN, TH, THEAD, TR, entrarErp, url } from "@/app/componentes/erp";
import { Desplegable } from "@/app/informes/Filtros";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { coincideBusqueda } from "@/lib/busqueda";
import { ORDEN_REFERENTES, PRECIO_ALTO, VENDIDAS_MINIMO, VENDIDAS_PRECIO_ALTO, filtrarReferentes, publicacionesReferentes, vendedoresLeidos } from "@/lib/compras/referentes";
import { MAXIMO_POR_VENDEDOR, USD_POR_PUBLICACION } from "@/lib/compras/vendedor-referente";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import { formatearNumero } from "@/lib/numeros";
import { accionCotizar, accionCruce, accionDescartar, accionLeerVendedor } from "./acciones";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;
const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const entero = (n: number | null) => (n == null ? "—" : formatearNumero(n, "entero"));
const fecha = (ts: string | null) => (ts ? new Date(ts).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "—");

export default async function VendedoresReferentes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const [todas, vendedores] = await Promise.all([publicacionesReferentes(s.org.id), vendedoresLeidos(s.org.id)]);
  const q = sp.q?.trim() ?? "";
  const coincide = (x: (typeof todas)[number]) => !q || coincideBusqueda([x.titulo, x.vendedor ?? "", x.item_id, x.nuestro_sku ?? ""], q, sp.contiene !== "1");
  const filas = ordenarEnMemoria(filtrarReferentes(todas, sp, coincide), sp, ORDEN_REFERENTES);
  const vista = paginarEnMemoria(filas, sp);
  const cuenta = (ver: string) => filtrarReferentes(todas, { ...sp, ver }, coincide).length;
  const paraCotizar = todas.filter((x) => x.decision === "cotizar").length;
  const params = { q: q || null, contiene: sp.contiene ?? null, ver: sp.ver ?? null, vendedor: sp.vendedor ?? null, criterio: sp.criterio ?? null, marcas: sp.marcas ?? null, orden: sp.orden ?? null, dir: sp.dir ?? null };
  const aqui = url("/compras/referentes", { ...params, p: sp.p ?? null });
  const nombres = [...new Set(todas.map((x) => x.vendedor).filter((x): x is string => !!x))].sort();

  return (
    <Pantalla titulo="Vendedores referentes" ancho="max-w-7xl"
      subtitulo={`${entero(todas.length)} publicaciones de ${vendedores.filter((v) => v.estado === "terminada").length} vendedores de la competencia; ${entero(todas.filter((x) => x.producto_id).length)} ya las tenés.`}
      acciones={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <BotonTarea accion={accionCruce} tipo="referentes-cruce" clase={SUAVE} texto="Rearmar el cruce" />
          <a href={url("/compras/referentes/excel", params)} className={VERDE}>Descargar Excel</a>
          <a href={url("/compras/referentes/excel", { cotizar: "1" })} className={VERDE}
            title="Sólo las marcadas «Cotizar»: foto, título, link a la publicación de referencia y columnas vacías para el precio, el peso y las medidas">Excel para cotizar ({paraCotizar})</a>
          <BotonNuevo texto="Nuevo vendedor" />
        </div>
      }>
      <Avisos sp={sp} />
      <AltaNueva texto="Nuevo vendedor" sinBoton>
        <form action={accionLeerVendedor} className="flex flex-wrap items-end gap-3">
          <label className="w-96"><span className={ETIQUETA}>Link del listado o de la tienda del vendedor en Mercado Libre, o su número</span>
            <input name="link" required className={`${CAMPO} w-full`} placeholder="https://listado.mercadolibre.com.ar/_CustId_123456" /></label>
          <label className="w-56"><span className={ETIQUETA}>Nombre</span><input name="nombre" className={`${CAMPO} w-full`} /></label>
          <button className={PRIMARIO}>Leer</button>
          <p className="basis-full text-[11px] text-[#5C6B76]">Lee hasta {entero(MAXIMO_POR_VENDEDOR)} publicaciones del vendedor (hasta US$ {(MAXIMO_POR_VENDEDOR * USD_POR_PUBLICACION).toFixed(2)} de Apify, del tope del mes de Seguimiento de publicaciones). Tarda unos minutos; al terminar se suma a la lista y se rearma el cruce.</p>
        </form>
      </AltaNueva>

      <details className="mb-3 text-xs">
        <summary className="cursor-pointer text-[#16577F]">Vendedores leídos ({vendedores.length})</summary>
        <div className={`${CAJA_TABLA} mt-2`}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Vendedor</th><th className={TH}>Estado</th><th className={TH}>Publicaciones</th><th className={TH}>Leído</th><th className={TH}>Costo</th></tr></thead>
            <tbody>
              {vendedores.map((v) => (
                <tr key={v.id} className={TR}>
                  <td className={TD}>{v.nombre ?? v.vendedor_id ?? "—"}{v.url && <a href={v.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-[#16577F]">↗</a>}</td>
                  <td className={TD} title={v.error ?? undefined}><Estado texto={v.estado === "terminada" ? "Leído" : v.estado === "error" ? "Con error" : v.estado === "corriendo" ? "Leyendo…" : "Pendiente"} tono={v.estado === "terminada" ? "verde" : v.estado === "error" ? "rojo" : "ambar"} /></td>
                  <td className={TDN}>{entero(v.publicaciones)}</td>
                  <td className={TD}>{fecha(v.ts)}</td>
                  <td className={TDN}>{v.costo != null ? `US$ ${v.costo.toFixed(2)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
        <BuscadorVivo q={q} comienza={sp.contiene !== "1"} placeholder="Título, vendedor o número" limpiar={["p"]} />
        <Desplegable parametro="ver" etiqueta="Ver" valor={sp.ver ?? ""} limpiar={["p"]} opciones={[
          { valor: "", texto: `Nuevos para vos (${cuenta("nuevos")})` }, { valor: "cotizar", texto: `Para cotizar (${cuenta("cotizar")})` },
          { valor: "tenemos", texto: `Ya los tenés (${cuenta("tenemos")})` }, { valor: "descartados", texto: `Descartados (${cuenta("descartados")})` }, { valor: "todos", texto: `Todos (${cuenta("todos")})` }]} />
        <Desplegable parametro="vendedor" etiqueta="Vendedor" valor={sp.vendedor ?? ""} limpiar={["p"]}
          opciones={[{ valor: "", texto: "Todos" }, ...nombres.map((n) => ({ valor: n, texto: n }))]} />
        <CasillaViva parametro="criterio" activo={sp.criterio !== "0"} tildadaDeEntrada etiqueta={`Sólo los que venden (+${VENDIDAS_MINIMO}, o desde ${pesos(PRECIO_ALTO)} con +${VENDIDAS_PRECIO_ALTO})`}
          ayuda="Más de 500 vendidas, o desde $ 50.000 con más de 25 vendidas (las vendidas son las que informa Mercado Libre)" />
        <CasillaViva parametro="marcas" activo={sp.marcas === "1"} etiqueta="Incluye marcas con derechos" ayuda="Lego, Apple, Dewalt, Disney, Marvel, Nintendo, PlayStation…: de entrada no se muestran" />
      </div>

      <div className={`${CAJA_TABLA} max-h-[calc(100vh-14rem)] overflow-y-auto`}>
        <table className={`${TABLA} text-[11px]`}>
          <thead className={`${THEAD} sticky top-0 z-10`}>
            <tr>
              <ThOrden col="titulo">Publicación</ThOrden>
              <ThOrden col="precio" n desc>Precio</ThOrden>
              <ThOrden col="vendidos" n desc porDefecto title="Vendidas, según Mercado Libre">Vendidas</ThOrden>
              <ThOrden col="lo_venden" n desc title="Cuántos de los vendedores referentes venden lo mismo">Lo venden</ThOrden>
              <ThOrden col="vendedor">Vendedor</ThOrden>
              <th className={TH} title="Nuestro producto más parecido (por el título, sin IA): de un 60 % de palabras en común para arriba se toma como que ya lo tenés">Tu producto</th>
              <th className={TH}>Cotizar</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {vista.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>No hay publicaciones con estos filtros.</td></tr>}
            {vista.map((x) => (
              <tr key={x.item_id} className={`${TR} ${x.decision === "cotizar" ? "bg-[#EEF7F1]" : ""}`}>
                <td className={`${TD} max-w-80`}>
                  <span className="flex items-center gap-2">
                    <FotosProducto fotos={x.foto ? [x.foto] : null} titulo={x.titulo} />
                    <span className="min-w-0">
                      <TituloCorto titulo={x.titulo} className="!text-[#1E2A32]" />
                      {x.url && <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#16577F] hover:underline">{x.item_id} ↗</a>}
                    </span>
                  </span>
                </td>
                <td className={TDN}>{pesos(x.precio)}</td>
                <td className={TDN}>{entero(x.vendidos)}</td>
                <td className={TDN}>{x.lo_venden}</td>
                <td className={TD}>{x.vendedor ?? "—"}</td>
                <td className={`${TD} max-w-64`}>
                  {x.producto_id ? (
                    <span className="flex items-center gap-2">
                      <FotosProducto fotos={x.nuestra_foto ? [x.nuestra_foto] : null} titulo={x.nuestro_titulo ?? ""} />
                      <span className="min-w-0"><Link href={`/catalogo/productos/${x.producto_id}`} className="font-mono text-[#16577F] hover:underline">{x.nuestro_sku}</Link>
                        <span className="text-[10px] text-[#5C6B76]"> · {Math.round((x.parecido ?? 0) * 100)} %</span><TituloCorto titulo={x.nuestro_titulo} /></span>
                    </span>
                  ) : <span className="text-[#5C6B76]">—</span>}
                </td>
                <td className={TD}>
                  {x.decision !== "descartado" && <CasillaAccion accion={accionCotizar} campos={{ item: x.item_id }} activa={x.decision === "cotizar"} etiqueta="Cotizar" />}
                </td>
                <td className={TD}>
                  {x.decision === "descartado"
                    ? <form action={accionDescartar}><input type="hidden" name="item" value={x.item_id} /><input type="hidden" name="deshacer" value="1" /><input type="hidden" name="volver" value={aqui} /><button className={SUAVE}>Volver a la lista</button></form>
                    : <TachoConfirmar accion={accionDescartar} campos={{ item: x.item_id, volver: aqui }} pregunta="¿Descartar?" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={filas.length} />
      <p className="text-[11px] text-[#5C6B76] mt-2">
        De cada vendedor se usa su última lectura. Una publicación que aparece en varios vendedores se muestra una vez; «Lo venden» dice cuántos la tienen (mismo producto de catálogo de Mercado Libre o mismo título). «Tu producto» compara los títulos: si comparten al menos el 60 % de las palabras se toma como que ya lo tenés (revisalo). Tildá «Cotizar» en lo que quieras pedirle al proveedor y bajá el «Excel para cotizar».
      </p>
    </Pantalla>
  );
}
