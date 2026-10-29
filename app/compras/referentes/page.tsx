// Compras › Vendedores referentes (pedido de Fer, 28/10; lib/compras/referentes.ts): lo que venden los vendedores de la
// competencia que leímos, cruzado con nuestro catálogo, para elegir qué pedirle cotizar al proveedor. Una fila por producto:
// la IA junta las publicaciones de los distintos vendedores que son lo mismo y lo compara con todos nuestros productos,
// activos y archivados (lib/compras/referentes-ia.ts, Fer 29/10).

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
import { ORDEN_REFERENTES, PRECIO_ALTO, VENDIDAS_MINIMO, VENDIDAS_PRECIO_ALTO, filtrarReferentes, publicacionesReferentes, textoBuscable, vendedoresLeidos } from "@/lib/compras/referentes";
import { TOPE_IA_USD, avanceIa } from "@/lib/compras/referentes-ia";
import { MAXIMO_POR_VENDEDOR, USD_POR_PUBLICACION } from "@/lib/compras/vendedor-referente";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import { formatearNumero } from "@/lib/numeros";
import { accionCotizar, accionCruce, accionDescartar, accionIa, accionLeerVendedor } from "./acciones";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;
const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const entero = (n: number | null) => (n == null ? "—" : formatearNumero(n, "entero"));
const fecha = (ts: string | null) => (ts ? new Date(ts).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "—");

export default async function VendedoresReferentes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const [todas, vendedores, ia] = await Promise.all([publicacionesReferentes(s.org.id), vendedoresLeidos(s.org.id), avanceIa(s.org.id)]);
  const q = sp.q?.trim() ?? "";
  const coincide = (x: (typeof todas)[number]) => !q || coincideBusqueda(textoBuscable(x), q, sp.contiene !== "1");
  const filas = ordenarEnMemoria(filtrarReferentes(todas, sp, coincide), sp, ORDEN_REFERENTES);
  const vista = paginarEnMemoria(filas, sp);
  const cuenta = (ver: string) => filtrarReferentes(todas, { ...sp, ver }, coincide).length;
  const paraCotizar = todas.filter((x) => x.decision === "cotizar").length;
  const params = { q: q || null, contiene: sp.contiene ?? null, ver: sp.ver ?? null, vendedor: sp.vendedor ?? null, criterio: sp.criterio ?? null, marcas: sp.marcas ?? null, orden: sp.orden ?? null, dir: sp.dir ?? null };
  const aqui = url("/compras/referentes", { ...params, p: sp.p ?? null });
  const nombres = [...new Set(todas.flatMap((x) => x.pubs.map((p) => p.vendedor)).filter((x): x is string => !!x))].sort();
  const sinIa = todas.filter((x) => x.comparado === "palabras").length;
  const textoIa = !ia ? "La IA todavía no ordenó la lista: «Ordenar con IA» junta lo que es el mismo producto y lo compara con tu catálogo."
    : ia.estado === "corriendo" ? `IA trabajando${ia.atascada ? " (frenada: tocá «Ordenar con IA» para seguir)" : ""}: ${ia.sin_grupo ? `agrupando, faltan ${entero(ia.sin_grupo)} de ${entero(ia.publicaciones)} publicaciones` : `comparando con tu catálogo, faltan ${entero(ia.sin_comparar)} de ${entero(ia.grupos)} productos`} · US$ ${ia.gastado.toFixed(2)} de ${ia.tope.toFixed(0)}`
    : ia.estado === "error" ? `La IA se cortó: ${ia.error ?? "error"}. «Ordenar con IA» sigue desde donde quedó.`
    : `Ordenado con IA el ${fecha(ia.ts)} (US$ ${ia.gastado.toFixed(2)})${ia.error ? `. ${ia.error}` : ""}${sinIa ? ` · ${entero(sinIa)} sin ordenar todavía` : ""}`;

  return (
    <Pantalla titulo="Vendedores referentes" ancho="max-w-7xl"
      subtitulo={`${entero(todas.length)} productos de ${vendedores.filter((v) => v.estado === "terminada").length} vendedores de la competencia; ${entero(todas.filter((x) => x.producto_id).length)} ya los tenés. ${textoIa}`}
      acciones={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <BotonTarea accion={accionCruce} tipo="referentes-cruce" clase={SUAVE} texto="Rearmar el cruce" />
          <BotonTarea accion={accionIa} tipo="referentes-ia" clase={SUAVE} texto="Ordenar con IA"
            pregunta={`¿Ordenar con IA? Agrupa lo que falta y lo compara con tu catálogo (hasta US$ ${TOPE_IA_USD} de Claude; lo ya ordenado no se repite)`} />
          <BotonTarea accion={accionIa} tipo="referentes-ia-todo" clase={SUAVE} campos={{ recomparar: "1" }} texto="Volver a comparar con mi catálogo"
            pregunta={`¿Volver a comparar todos los productos con tu catálogo? Sirve después de cargar productos nuevos (hasta US$ ${TOPE_IA_USD} de Claude)`} />
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
        <BuscadorVivo q={q} comienza={sp.contiene !== "1"} placeholder="Título, vendedor, número o tu SKU" limpiar={["p"]} />
        <Desplegable parametro="ver" etiqueta="Ver" valor={sp.ver ?? ""} limpiar={["p"]} opciones={[
          { valor: "", texto: `Nuevos para vos (${cuenta("nuevos")})` }, { valor: "cotizar", texto: `Para cotizar (${cuenta("cotizar")})` },
          { valor: "activos", texto: `Los tenés activos (${cuenta("activos")})` }, { valor: "archivados", texto: `Los tenés archivados (${cuenta("archivados")})` }, { valor: "descartados", texto: `Descartados (${cuenta("descartados")})` }, { valor: "todos", texto: `Todos (${cuenta("todos")})` }]} />
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
              <ThOrden col="titulo">Producto</ThOrden>
              <ThOrden col="precio" n desc title="El más barato de los que lo venden (al lado, el más caro)">Precio</ThOrden>
              <ThOrden col="vendidos" n desc porDefecto title="Vendidas, sumando todas sus publicaciones (según Mercado Libre)">Vendidas</ThOrden>
              <ThOrden col="lo_venden" n desc title="Cuántos de los vendedores referentes lo venden; tocá para ver cada publicación">Lo venden</ThOrden>
              <th className={TH} title="Tu producto que es el mismo, según la IA (compara con todos, activos y archivados). «Sin IA»: todavía es el parecido del título">Tu producto</th>
              <th className={TH}>Cotizar</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {vista.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>No hay productos con estos filtros.</td></tr>}
            {vista.map((x) => {
              const items = x.pubs.map((p) => p.item_id).join(",");
              return (
                <tr key={x.clave} className={`${TR} align-top ${x.decision === "cotizar" ? "bg-[#EEF7F1]" : ""}`}>
                  <td className={`${TD} max-w-80`}>
                    <span className="flex items-center gap-2">
                      <FotosProducto fotos={x.foto ? [x.foto] : null} titulo={x.titulo} />
                      <span className="min-w-0">
                        <TituloCorto titulo={x.titulo} className="!text-[#1E2A32]" />
                        {x.url && <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#16577F] hover:underline">{x.item_id} ↗</a>}
                      </span>
                    </span>
                  </td>
                  <td className={`${TDN} whitespace-nowrap`}>{pesos(x.precio_min)}{x.precio_max != null && x.precio_min != null && x.precio_max > x.precio_min && <span className="block text-[10px] text-[#5C6B76]">a {pesos(x.precio_max)}</span>}</td>
                  <td className={TDN}>{entero(x.vendidos)}</td>
                  <td className={`${TD} min-w-28`}>
                    <details>
                      <summary className="cursor-pointer text-[#16577F] whitespace-nowrap">{x.lo_venden} {x.lo_venden === 1 ? "vendedor" : "vendedores"}{x.pubs.length > x.lo_venden ? ` · ${x.pubs.length} publ.` : ""}</summary>
                      <ul className="mt-1 space-y-0.5">
                        {x.pubs.map((p) => (
                          <li key={p.item_id} className="whitespace-nowrap" title={p.titulo}>
                            <span className="font-semibold">{p.vendedor ?? "—"}</span> · {pesos(p.precio)} · {entero(p.vendidos)} vend.
                            {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-[#16577F] hover:underline">↗</a>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td className={`${TD} max-w-64`}>
                    {x.producto_id ? (
                      <span className="flex items-center gap-2">
                        <FotosProducto fotos={x.nuestra_foto ? [x.nuestra_foto] : null} titulo={x.nuestro_titulo ?? ""} />
                        <span className="min-w-0" title={x.motivo ?? undefined}><Link href={`/catalogo/productos/${x.producto_id}`} className="font-mono text-[#16577F] hover:underline">{x.nuestro_sku ?? x.producto_id}</Link>
                          {x.nuestro_estado === "archivado" && <span className="ml-1"><Estado texto="Archivado" tono="ambar" /></span>}
                          {x.comparado === "palabras" && <span className="text-[10px] text-[#8a6100]"> · sin IA, {Math.round((x.parecido ?? 0) * 100)} %</span>}
                          <TituloCorto titulo={x.nuestro_titulo} /></span>
                      </span>
                    ) : <span className="text-[#5C6B76]" title={x.motivo ?? undefined}>{x.comparado === "ia" ? "No lo tenés" : "—"}</span>}
                  </td>
                  <td className={TD}>
                    {x.decision !== "descartado" && <CasillaAccion accion={accionCotizar} campos={{ items }} activa={x.decision === "cotizar"} etiqueta="Cotizar" />}
                  </td>
                  <td className={TD}>
                    {x.decision === "descartado"
                      ? <form action={accionDescartar}><input type="hidden" name="items" value={items} /><input type="hidden" name="deshacer" value="1" /><input type="hidden" name="volver" value={aqui} /><button className={SUAVE}>Volver a la lista</button></form>
                      : <TachoConfirmar accion={accionDescartar} campos={{ items, volver: aqui }} pregunta="¿Descartar?" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginado total={filas.length} />
      <p className="text-[11px] text-[#5C6B76] mt-2">
        De cada vendedor se usa su última lectura. Una fila es un producto: la IA junta las publicaciones de los distintos vendedores que son lo mismo (mismo modelo y especificaciones, la misma cantidad) y lo compara con todos tus productos, activos y archivados (título, marca, modelo, variaciones y los títulos de tus publicaciones). Al pasar el mouse por «Tu producto», por qué. Lo que la IA todavía no ordenó se ve por publicación y con el parecido del título («sin IA»). Tildá «Cotizar» en lo que quieras pedirle al proveedor y bajá el «Excel para cotizar».
      </p>
    </Pantalla>
  );
}
