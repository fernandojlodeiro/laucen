// Catálogo › Seguimientos (pedido de Fer, 13/10): el estado del precio de mercado de cada producto, para revisar lo
// que siguió sola la búsqueda de precio de mercado (lib/seguimiento/lista-seguimientos.ts). Se revisa en la pestaña
// Seguimiento de cada producto (el SKU lleva ahí). De entrada, ordenada por la plata en stock y sin notebooks (Fer, 22/10).

import Link from "next/link";
import { una } from "@/lib/erp/base";
import FotosProducto from "@/app/componentes/FotosProducto";
import MarcaMercado from "@/app/componentes/MarcaMercado";
import BuscadorVivo, { CasillaViva } from "@/app/componentes/BuscadorVivo";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { entrarErp, Pantalla, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, coincideBusqueda } from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import { listaSeguimientos } from "@/lib/seguimiento/lista-seguimientos";
import { ESTADOS_MERCADO, esEstadoMercado } from "@/lib/seguimiento/estado-mercado";
import { Desplegable } from "@/app/informes/Filtros";
import { SUAVE } from "@/app/botones";

export const dynamic = "force-dynamic";

const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);

export default async function Seguimientos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await entrarErp("productos_ver");
  const sp = await searchParams;
  // Sin elegir: todos los que siguen algo, de los productos a la venta, los que falta revisar (Fer, 23/10: «✓ Producto revisado»).
  const estado = esEstadoMercado(sp.estado) ? sp.estado : null;
  const soloVenta = sp.venta !== "todos";
  const rev = sp.rev === "revisado" || sp.rev === "todos" ? sp.rev : "pendiente";
  const q = sp.q?.trim() ?? "", comienza = sp.contiene !== "1";
  const [todas, propuestas] = await Promise.all([
    listaSeguimientos(s.org.id, { soloConSeguimiento: estado !== "sin_seguimiento" }),
    una<{ n: number }>("select count(distinct producto_id)::int n from seguimiento_ajuste where organizacion_id = $1 and estado = 'propuesto'", [s.org.id]).then((r) => r?.n ?? 0),
  ]);
  // Las notebooks, afuera de entrada (Fer, 22/10: con mucha plata en stock, irían todas primero).
  const sinNotebooks = sp.notebooks !== "0";
  const buscadasTodas = todas.filter((f) => coincideBusqueda([f.sku, f.titulo], q, comienza) && !(sinNotebooks && f.notebook));
  const aLaVenta = buscadasTodas.filter((f) => f.a_la_venta);
  const revisados = aLaVenta.filter((f) => f.revision === "revisado").length;
  const porVenta = soloVenta ? aLaVenta : buscadasTodas;
  const revisado = (f: (typeof todas)[number]) => f.revision === "revisado";
  const nRev = porVenta.filter(revisado).length;
  const buscadas = rev === "todos" ? porVenta : porVenta.filter((f) => (rev === "revisado") === revisado(f));
  const cuenta = (e: string) => buscadas.filter((f) => f.estado === e).length;
  const pendientes = buscadas.filter((f) => f.sin_revisar > 0).length;
  // Sin elegir columna, de la que tiene más plata en stock (disponible × Clásica) a la que menos (Fer, 22/10).
  const orden = sp.orden ? sp : { ...sp, orden: "valor", dir: "desc" };
  const filas = ordenarEnMemoria(estado ? buscadas.filter((f) => f.estado === estado || (estado === "sin_confirmar" && f.sin_revisar > 0)) : buscadas, orden, {
    sku: (f) => f.sku, titulo: (f) => f.titulo, clasica: (f) => f.clasica, seguidas: (f) => f.seguidas, sin_revisar: (f) => f.sin_revisar,
    revision: (f) => (f.revision === "revisado" ? 2 : f.revision === "cambios" ? 1 : 0), barata: (f) => f.barata, mercado: (f) => f.mercado, valor: (f) => f.valor_stock || null, disponible: (f) => f.disponible || null, dif: (f) => (f.mercado != null && f.clasica ? f.mercado / f.clasica : null),
  });

  return (
    <Pantalla titulo="Seguimientos"
      acciones={<>
        <Link href="/catalogo/seguimientos/propuestas" className={SUAVE} title="Lo que la regla de precio dejó esperando «Aplicar»">Propuestas pendientes ({propuestas})</Link>
        <Link href="/catalogo/seguimientos/importar" className={SUAVE}>Importar de Virtual Seller</Link>
        <Link href="/config/seguimiento" className={SUAVE} title="Cada cuánto se leen, tope de gasto, pausadas…">⚙ Configuración</Link>
      </>}
      subtitulo="El precio de mercado de cada producto según lo que sigue de la competencia: confirmado (una persona revisó lo que se sigue), monitoreado sin confirmar (lo siguió sola la búsqueda de precio de mercado) o sin seguimiento. Se revisa en la pestaña Seguimiento de cada producto.">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar SKU o título" />
        <Desplegable parametro="estado" etiqueta="Ver" valor={estado ?? "todos"} limpiar={["p"]}
          opciones={[
            { valor: "sin_confirmar", texto: `Con 🤖 automáticas sin revisar (${pendientes})` },
            { valor: "confirmado", texto: `${ESTADOS_MERCADO.confirmado.texto} (${cuenta("confirmado")})` },
            { valor: "sin_seguimiento", texto: `${ESTADOS_MERCADO.sin_seguimiento.texto}${estado === "sin_seguimiento" ? ` (${cuenta("sin_seguimiento")})` : ""}` },
            { valor: "todos", texto: "Todos los que siguen algo" },
          ]} />
        <Desplegable parametro="venta" etiqueta="Productos" valor={soloVenta ? "venta" : "todos"} limpiar={["p"]}
          opciones={[{ valor: "venta", texto: `A la venta (${aLaVenta.length})` }, { valor: "todos", texto: `Todos (${buscadasTodas.length})` }]} />
        <Desplegable parametro="rev" etiqueta="Revisión" valor={rev} limpiar={["p"]}
          opciones={[
            { valor: "pendiente", texto: `Por revisar (${porVenta.length - nRev})` },
            { valor: "revisado", texto: `Revisados (${nRev})` },
            { valor: "todos", texto: "Todos" },
          ]} />
        <CasillaViva parametro="notebooks" activo={sinNotebooks} tildadaDeEntrada etiqueta="Excluir notebooks" />
      </div>
      <p className="text-xs mb-2">
        <b>Avance de la revisión:</b> {revisados} de {aLaVenta.length} productos a la venta revisados
        {aLaVenta.length > 0 && <> ({Math.round((revisados / aLaVenta.length) * 100)} %)</>}.
        <span className="text-[#5C6B76]"> «A la venta»: con publicación activa en Mercado Libre y stock disponible. Se marca con «✓ Producto revisado» en la pestaña Seguimiento de cada producto.</span>
      </p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="sku">Producto</ThOrden>
              <ThOrden col="revision" title="✓ Revisado por una persona (pestaña Seguimiento del producto); ⚠ si después entraron publicaciones nuevas">Revisado</ThOrden>
              <ThOrden col="clasica" n title="La Clásica de hoy, con la marca del precio de mercado">Clásica</ThOrden>
              <ThOrden col="disponible" n title="Stock disponible (todos los depósitos activos)">Dispo.</ThOrden>
              <ThOrden col="valor" n title="Plata en stock: disponible × Clásica. Sin elegir columna, se ordena por ésta, de más a menos">Stock $</ThOrden>
              <ThOrden col="seguidas" n title="Publicaciones de la competencia que sigue (sin las excluidas)">Sigue</ThOrden>
              <ThOrden col="sin_revisar" n title="Las que siguió sola la búsqueda de precio de mercado y nadie revisó todavía">Sin revisar</ThOrden>
              <ThOrden col="barata" n title="La más barata de las que sigue (activa, en pesos, local)">Más barata seguida</ThOrden>
              <ThOrden col="mercado" n title="El cuarto más barato de las publicaciones que la IA juzgó iguales en la última búsqueda de precio de mercado">Mercado</ThOrden>
              <ThOrden col="dif" n title="Mercado contra la Clásica">Dif.</ThOrden>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>No hay productos en esta vista.</td></tr>}
            {paginarEnMemoria(filas, sp).map((f) => {
              const dif = f.mercado != null && f.clasica ? (f.mercado / f.clasica - 1) * 100 : null;
              return (
                <tr key={f.producto_id} className={TR}>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-2 align-middle">
                      <FotosProducto fotos={f.fotos} titulo={f.titulo} />
                      <Link href={`/catalogo/productos/${f.producto_id}?seccion=seguimiento`} className="font-mono text-[#16577F] hover:underline whitespace-nowrap">{f.sku}</Link>
                    </span>{" "}<span className="text-[#5C6B76]">{f.titulo}</span>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-[11px]`} title={f.revisado_por ? `Revisado por ${f.revisado_por}` : undefined}>
                    {f.revision === "revisado" ? <span className="text-[#1F6E4A] font-semibold">✓ {new Date(f.revisado_ts!).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" })}</span>
                      : f.revision === "cambios" ? <span className="text-[#7A5600] font-semibold">⚠ hay nuevas</span>
                      : <span className="text-[#5C6B76]">—</span>}
                  </td>
                  <td className={`${TDN} whitespace-nowrap`}><span className="inline-flex items-center gap-1.5">{pesos(f.clasica)}<MarcaMercado estado={f.estado} /></span></td>
                  <td className={TDN}>{f.disponible ? formatearNumero(f.disponible, "entero") : "—"}</td>
                  <td className={TDN}>{f.valor_stock ? pesos(f.valor_stock) : "—"}</td>
                  <td className={TDN}>{f.seguidas}</td>
                  <td className={`${TDN} ${f.sin_revisar ? "text-[#7A5600] font-semibold" : ""}`}>{f.sin_revisar || "—"}</td>
                  <td className={TDN}>
                    {pesos(f.barata)}
                    {f.barata_vendedor && <span className="block text-[10px] text-[#5C6B76]">{f.barata_vendedor}{f.barata_confirmada === false ? " · sin revisar" : ""}</span>}
                  </td>
                  <td className={TDN}>{pesos(f.mercado)}{f.mercado_n ? <span className="block text-[10px] text-[#5C6B76]">{f.mercado_n} comparables</span> : null}</td>
                  <td className={`${TDN} ${dif == null ? "" : dif > 0 ? "text-[#1F6E4A]" : "text-[#C03420]"}`}>
                    {dif == null ? "—" : `${dif > 0 ? "+" : ""}${dif.toLocaleString("es-AR", { maximumFractionDigits: 0 })} %`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginado total={filas.length} />
    </Pantalla>
  );
}
