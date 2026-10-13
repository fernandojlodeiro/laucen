// Catálogo › Seguimientos (pedido de Fer, 13/10): el estado del precio de mercado de cada producto, para revisar lo
// que siguió sola la búsqueda de precio de mercado (lib/seguimiento/lista-seguimientos.ts). Se revisa en la pestaña
// Seguimiento de cada producto (el SKU lleva ahí).

import Link from "next/link";
import FotosProducto from "@/app/componentes/FotosProducto";
import MarcaMercado from "@/app/componentes/MarcaMercado";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { entrarErp, Pantalla, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, coincideBusqueda } from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import { listaSeguimientos } from "@/lib/seguimiento/lista-seguimientos";
import { ESTADOS_MERCADO, esEstadoMercado } from "@/lib/seguimiento/estado-mercado";
import { Desplegable } from "@/app/informes/Filtros";

export const dynamic = "force-dynamic";

const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);

export default async function Seguimientos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await entrarErp("productos_ver");
  const sp = await searchParams;
  // Sin elegir, los que falta revisar (Fer, 13/10: «una pantalla de seguimientos sin confirmar»).
  const estado = sp.estado === "todos" ? null : esEstadoMercado(sp.estado) ? sp.estado : "sin_confirmar";
  const q = sp.q?.trim() ?? "", comienza = sp.contiene !== "1";
  const todas = await listaSeguimientos(s.org.id, { soloConSeguimiento: estado !== "sin_seguimiento" && estado !== null });
  const buscadas = todas.filter((f) => coincideBusqueda([f.sku, f.titulo], q, comienza));
  const cuenta = (e: string) => buscadas.filter((f) => f.estado === e).length;
  const pendientes = buscadas.filter((f) => f.sin_revisar > 0).length;
  const filas = ordenarEnMemoria(estado ? buscadas.filter((f) => f.estado === estado || (estado === "sin_confirmar" && f.sin_revisar > 0)) : buscadas, sp, {
    sku: (f) => f.sku, titulo: (f) => f.titulo, clasica: (f) => f.clasica, seguidas: (f) => f.seguidas, sin_revisar: (f) => f.sin_revisar,
    barata: (f) => f.barata, mercado: (f) => f.mercado, dif: (f) => (f.mercado != null && f.clasica ? f.mercado / f.clasica : null),
  });

  return (
    <Pantalla titulo="Seguimientos"
      subtitulo="El precio de mercado de cada producto según lo que sigue de la competencia: confirmado (una persona revisó lo que se sigue), monitoreado sin confirmar (lo siguió sola la búsqueda de precio de mercado) o sin seguimiento. Se revisa en la pestaña Seguimiento de cada producto.">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar SKU o título" />
        <Desplegable parametro="estado" etiqueta="Ver" valor={estado ?? "todos"} limpiar={["p"]}
          opciones={[
            { valor: "sin_confirmar", texto: `Con publicaciones sin revisar (${pendientes})` },
            { valor: "confirmado", texto: `${ESTADOS_MERCADO.confirmado.texto} (${cuenta("confirmado")})` },
            { valor: "sin_seguimiento", texto: `${ESTADOS_MERCADO.sin_seguimiento.texto}${estado === "sin_seguimiento" ? ` (${cuenta("sin_seguimiento")})` : ""}` },
            { valor: "todos", texto: "Todos los que siguen algo" },
          ]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="sku">Producto</ThOrden>
              <ThOrden col="clasica" n title="La Clásica de hoy, con la marca del precio de mercado">Clásica</ThOrden>
              <ThOrden col="seguidas" n title="Publicaciones de la competencia que sigue (sin las excluidas)">Sigue</ThOrden>
              <ThOrden col="sin_revisar" n title="Las que siguió sola la búsqueda de precio de mercado y nadie revisó todavía">Sin revisar</ThOrden>
              <ThOrden col="barata" n title="La más barata de las que sigue (activa, en pesos, local)">Más barata seguida</ThOrden>
              <ThOrden col="mercado" n title="El cuarto más barato de las publicaciones que la IA juzgó iguales en la última búsqueda de precio de mercado">Mercado</ThOrden>
              <ThOrden col="dif" n title="Mercado contra la Clásica">Dif.</ThOrden>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>No hay productos en esta vista.</td></tr>}
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
                  <td className={`${TDN} whitespace-nowrap`}><span className="inline-flex items-center gap-1.5">{pesos(f.clasica)}<MarcaMercado estado={f.estado} /></span></td>
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
