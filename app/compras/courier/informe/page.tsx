// Compras › Compras por courier › Informe de importaciones (pedido de Fer, 12/10; lib/compras/informe.ts): una o varias
// compras juntas. Resumen, qué convendría hacer en la próxima compra, los más y menos rentables, los más rápidos y lentos
// en venderse, y el detalle de cada producto.

import Link from "next/link";
import FotosProducto from "@/app/componentes/FotosProducto";
import { entrarErp, Pantalla, Estado, TituloSeccion, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { CasillasVivas } from "@/app/informes/Filtros";
import { formatearNumero } from "@/lib/numeros";
import { fecha } from "@/app/ventas/formato";
import {
  TIPOS_RECOMENDACION, UMBRALES, analizar, comprasParaInforme, dolarHoy, productosImportados, recomendar, resumir, type Analisis, type Recomendacion,
} from "@/lib/compras/informe";

export const dynamic = "force-dynamic";

const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const entero = (n: number | null) => (n == null ? "—" : formatearNumero(n, "entero"));
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
const rojo = (n: number | null) => (n != null && n < 0 ? "text-[#C03420] font-semibold" : "");

function Producto({ a }: { a: Analisis }) {
  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <FotosProducto fotos={a.fotos} titulo={a.descripcion} />
      {a.producto_id ? <Link href={`/catalogo/productos/${a.producto_id}`} className="font-mono text-[#16577F] hover:underline whitespace-nowrap">{a.sku}</Link> : <span className="font-mono">{a.sku}</span>}
      <span className="text-[#5C6B76]">{a.descripcion}</span>
    </span>
  );
}

/** Una tabla corta de un ranking (los 10 primeros). */
function Ranking({ titulo, filas, dato }: { titulo: string; filas: Analisis[]; dato: (a: Analisis) => React.ReactNode }) {
  return (
    <section className="min-w-0">
      <TituloSeccion titulo={titulo} />
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <tbody>
            {filas.length === 0 && <tr><td className={`${TD} text-[#5C6B76]`}>—</td></tr>}
            {filas.map((a) => <tr key={a.linea_id} className={TR}><td className={TD}><Producto a={a} /></td><td className={`${TDN} whitespace-nowrap`}>{dato(a)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function InformeImportaciones({ searchParams }: { searchParams: Promise<{ compras?: string }> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const todas = await comprasParaInforme(s.org.id);
  const elegidas = sp.compras === "ninguna" ? [] : sp.compras ? sp.compras.split(",").map(Number).filter((id) => todas.some((c) => c.id === id)) : todas.map((c) => c.id);
  const [crudos, tc] = await Promise.all([productosImportados(s.org.id, elegidas), dolarHoy(s.org.id)]);
  const filas = crudos.map(analizar);
  const porCompra = todas.filter((c) => elegidas.includes(c.id)).map((c) => resumir(c.nombre, filas.filter((a) => a.compra_id === c.id)));
  const total = resumir("Total", filas);
  const conVentas = filas.filter((a) => a.ganancia != null);
  const recos = filas.flatMap((a) => recomendar(a).map((r) => ({ a, r })));
  const grupos = (Object.keys(TIPOS_RECOMENDACION) as Recomendacion["tipo"][]).map((t) => ({ t, xs: recos.filter((x) => x.r.tipo === t) })).filter((g) => g.xs.length);
  const lentos = filas.filter((a) => a.disponible > 0).sort((x, y) => (y.dias_para_agotar ?? 1e9) - (x.dias_para_agotar ?? 1e9) || x.pct_vendido - y.pct_vendido);
  const rapidos = filas.filter((a) => a.vendido > 0).sort((x, y) => y.por_dia - x.por_dia);
  const columnasResumen: [string, (r: ReturnType<typeof resumir>) => React.ReactNode][] = [
    ["Cargado", (r) => entero(r.cargado)], ["Vendido", (r) => `${entero(r.vendido)} (${pct(r.cargado ? (r.vendido / r.cargado) * 100 : 0)})`],
    ["Ventas", (r) => pesos(r.ventas)], ["Comisión y cargo fijo ML", (r) => pesos(r.comision)], ["Costo de lo vendido", (r) => pesos(r.costo_vendido)],
    ["Ganancia", (r) => <b>{pesos(r.ganancia)}</b>], ["Margen", (r) => pct(r.ventas ? (r.ganancia / r.ventas) * 100 : null)],
    ["Disponible hoy", (r) => entero(r.disponible)], ["Diferencia de stock", (r) => <span className={rojo(r.diferencia)}>{entero(r.diferencia)}</span>],
    ["Faltante a precio Clásica", (r) => <span className={rojo(r.faltante_pvp)}>{pesos(r.faltante_pvp)}</span>],
    ["Stock que queda, al costo", (r) => pesos(r.stock_costo)], ["Stock que queda, a precio Clásica", (r) => pesos(r.stock_pvp)],
  ];

  return (
    <Pantalla titulo="Informe de importaciones" camino={[{ texto: "Informe" }]}
      subtitulo={`Lo que vendió cada compra desde que entró al stock, lo que dejó, cuánto tardó en venderse y qué convendría hacer en la próxima. Costo al dólar de hoy${tc ? ` ($ ${formatearNumero(tc, "pesos")})` : ""}: costo de reposición.`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <CasillasVivas parametro="compras" etiqueta="Compras" elegidas={elegidas.map(String)} defecto={todas.map((c) => String(c.id))} vacio="ninguna"
          opciones={todas.map((c) => ({ valor: String(c.id), texto: `${c.nombre}${c.ingreso_ts ? ` (${fecha(c.ingreso_ts)})` : ""}` }))} />
      </div>
      {filas.length === 0 ? <p className="text-xs text-[#5C6B76]">Elegí al menos una compra.</p> : <>
        <TituloSeccion titulo="Resumen" />
        <div className={`${CAJA_TABLA} mb-4`}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH} />{[...porCompra, ...(porCompra.length > 1 ? [total] : [])].map((r) => <th key={r.compra} className={THN}>{r.compra}</th>)}</tr></thead>
            <tbody>
              {columnasResumen.map(([k, f]) => (
                <tr key={k} className={TR}><td className={TD}>{k}</td>{[...porCompra, ...(porCompra.length > 1 ? [total] : [])].map((r) => <td key={r.compra} className={TDN}>{f(r)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>

        <TituloSeccion titulo={`Para la próxima importación (${recos.length})`} />
        <div className="grid gap-3 mb-4">
          {grupos.map(({ t, xs }) => (
            <section key={t} className={CAJA}>
              <div className="mb-1.5"><Estado texto={`${TIPOS_RECOMENDACION[t].titulo} (${xs.length})`} tono={TIPOS_RECOMENDACION[t].tono} /></div>
              <ul className="grid gap-1 text-xs">
                {xs.map(({ a, r }) => <li key={`${a.linea_id}-${t}`}><Producto a={a} /> <span className="block pl-9">{r.texto}</span></li>)}
              </ul>
            </section>
          ))}
          <p className="text-[11px] text-[#5C6B76]">
            Criterios: rápido = vendió el {UMBRALES.casiTodoPct} % o más en {UMBRALES.rapidoDias} días o menos; buen margen = {UMBRALES.margenBuenoPct} % o más sobre la venta;
            margen bajo = menos de {UMBRALES.margenBajoPct} %; lento = menos del {UMBRALES.lentoPct} % vendido después de {UMBRALES.lentoDias} días. La cantidad sugerida es la venta por día × {UMBRALES.coberturaDias} días.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Ranking titulo="Los que más ganancia dejaron" filas={[...conVentas].sort((x, y) => y.ganancia! - x.ganancia!).slice(0, 10)} dato={(a) => <>{pesos(a.ganancia)} <span className="text-[#5C6B76]">({pct(a.margen_pct)})</span></>} />
          <Ranking titulo="Los que menos margen dejaron" filas={conVentas.filter((a) => a.ventas > 0).sort((x, y) => x.margen_pct! - y.margen_pct!).slice(0, 10)} dato={(a) => <span className={rojo(a.margen_pct)}>{pct(a.margen_pct)} <span className="text-[#5C6B76]">({pesos(a.ganancia)})</span></span>} />
          <Ranking titulo="Los que más rápido se venden" filas={rapidos.slice(0, 10)} dato={(a) => <>{a.por_dia.toLocaleString("es-AR")} por día{a.agotado_ts ? <span className="text-[#5C6B76]"> · agotado en {a.dias} días</span> : null}</>} />
          <Ranking titulo="Los que más tardan en venderse" filas={lentos.slice(0, 10)} dato={(a) => <>{a.dias_para_agotar == null ? "no se vende" : `${entero(a.dias_para_agotar)} días más`} <span className="text-[#5C6B76]">({pct(a.pct_vendido)} vendido)</span></>} />
        </div>

        <TituloSeccion titulo={`Detalle por producto (${filas.length})`} />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Compra</th><th className={TH}>Producto</th><th className={THN}>Cargado</th><th className={THN}>Vendido</th><th className={THN}>% vendido</th>
                <th className={THN}>Días</th><th className={THN}>Por día</th><th className={THN}>Ventas</th><th className={THN}>Ganancia</th><th className={THN}>Margen</th>
                <th className={THN}>Disponible</th><th className={THN}>Días para agotar</th><th className={THN}>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {[...filas].sort((x, y) => (y.ganancia ?? -1e12) - (x.ganancia ?? -1e12)).map((a) => (
                <tr key={a.linea_id} className={TR}>
                  <td className={TD}><Link href={`/compras/courier/${a.compra_id}`} className="text-[#16577F] hover:underline">{a.compra}</Link></td>
                  <td className={TD}><Producto a={a} /></td>
                  <td className={TDN}>{entero(a.cargado)}</td>
                  <td className={TDN}>{entero(a.vendido)}</td>
                  <td className={TDN}>{pct(a.pct_vendido)}</td>
                  <td className={TDN} title={a.agotado_ts ? `Se agotó el ${fecha(a.agotado_ts)}` : "Desde que entró hasta hoy"}>{entero(a.dias)}{a.agotado_ts ? " ✓" : ""}</td>
                  <td className={TDN}>{a.por_dia.toLocaleString("es-AR")}</td>
                  <td className={TDN}>{pesos(a.ventas)}</td>
                  <td className={`${TDN} font-semibold ${rojo(a.ganancia)}`}>{pesos(a.ganancia)}</td>
                  <td className={`${TDN} ${rojo(a.margen_pct)}`}>{pct(a.margen_pct)}</td>
                  <td className={TDN}>{entero(a.disponible)}</td>
                  <td className={TDN}>{a.dias_para_agotar == null ? "no se vende" : entero(a.dias_para_agotar)}</td>
                  <td className={`${TDN} ${rojo(a.diferencia)}`}>{entero(a.diferencia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#5C6B76] mt-2">
          Ventas: todos los canales desde la fecha y hora de ingreso de la compra, sin canceladas; un kit vendido cuenta sus componentes. Ganancia = ventas − comisión y cargo fijo de ML − costo de lo vendido
          (no incluye el envío gratis ni la publicidad). Días: desde que entró hasta que se agotó (✓) o hasta hoy. Si el producto tenía stock de antes, sus ventas también cuentan.
        </p>
      </>}
    </Pantalla>
  );
}
