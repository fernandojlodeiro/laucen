// Informe: rentabilidad por venta o por producto (lib/informes/rentabilidad.ts).
// Venta, cargos del canal (de la facturación de Mercado Libre, o la comisión
// de la orden si todavía no se leyó), costo y margen. Filtros arriba;
// "Descargar Excel" baja lo mismo.

import Link from "next/link";
import { VERDE } from "@/app/botones";
import RangoFechas from "@/app/componentes/RangoFechas";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { entrarErp, Pantalla, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { enMoneda, tcParaVista, type Moneda } from "@/lib/moneda";
import { hoyArgentina } from "@/lib/rango-fechas";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import { AGRUPAR, BASES_COSTO, leerFiltroRentabilidad, rentabilidad, totalesRentabilidad, type FilaRentabilidad } from "@/lib/informes/rentabilidad";
import { Desplegable } from "../Filtros";

export const dynamic = "force-dynamic";

const BASE = "/informes/rentabilidad";
type SP = Record<string, string | undefined>;
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);

const ORDEN: Record<string, (f: FilaRentabilidad) => string | number | null> = {
  fecha: (f) => f.fecha, venta: (f) => f.venta, cargos: (f) => f.cargos, costo: (f) => f.costo, margen: (f) => f.margen, margen_pct: (f) => f.margen_pct,
  unidades: (f) => f.unidades, sku: (f) => f.sku, titulo: (f) => f.titulo, canal: (f) => f.canal, ventas: (f) => f.ventas,
};

export default async function Rentabilidad({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("informes_ventas_ver");
  const sp = await searchParams;
  // El informe está calculado en pesos: en dólares, al tipo de cambio de hoy.
  const tc = await tcParaVista(s.org.id, s.moneda);
  const pesos = (n: number | null) => (n == null ? "—" : enMoneda(n, s.moneda, tc));
  const f = leerFiltroRentabilidad(sp, hoyArgentina());
  const [canales, filas] = await Promise.all([
    consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 order by nombre", [s.org.id]),
    rentabilidad(s.org.id, f),
  ]);
  const t = totalesRentabilidad(filas);
  const porVenta = f.agrupar === "venta";
  const vista = paginarEnMemoria(ordenarEnMemoria(filas, sp, ORDEN), sp);
  const params = { desde: f.desde, hasta: f.hasta, canal: f.canal || null, costo: f.costo === "promedio" ? null : f.costo, agrupar: porVenta ? null : "producto" };
  const sinCargosMl = filas.filter((r) => !r.cargos_ml).length;

  return (
    <Pantalla titulo="Rentabilidad por venta"
      subtitulo="Lo vendido, lo que cobró el canal (cargos de la facturación de Mercado Libre: comisión, envío, cargo fijo; sin impuestos), el costo de la mercadería al tipo de cambio del día de la venta y el margen."
      acciones={<a href={url(`${BASE}/excel`, params)} className={VERDE}>Descargar Excel</a>}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <RangoFechas desde={f.desde} hasta={f.hasta} limpiar={["p"]} />
        <Desplegable parametro="canal" etiqueta="Canal" valor={String(f.canal || "")} limpiar={["p"]}
          opciones={[{ valor: "", texto: "Todos" }, ...canales.map((c) => ({ valor: String(c.id), texto: c.nombre }))]} />
        <Desplegable parametro="agrupar" etiqueta="Ver" valor={porVenta ? "" : "producto"} limpiar={["p", "orden", "dir"]}
          opciones={Object.entries(AGRUPAR).map(([k, v]) => ({ valor: k === "venta" ? "" : k, texto: v }))} />
        <Desplegable parametro="costo" etiqueta="Costo" valor={f.costo === "promedio" ? "" : f.costo}
          opciones={Object.entries(BASES_COSTO).map(([k, v]) => ({ valor: k === "promedio" ? "" : k, texto: v }))} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3 text-xs">
        {[["Venta", pesos(t.venta)], ["Cargos del canal", pesos(t.cargos)], ["Costo", pesos(t.costo)], ["Margen", pesos(t.margen)], ["Margen %", pct(t.margenPct)]].map(([k, v]) => (
          <div key={k} className="bg-white border border-[#E3E9F0] rounded-xl p-2"><span className="block text-[11px] text-[#5C6B76]">{k}</span><b className="tabular-nums">{v}</b></div>
        ))}
      </div>
      {(t.sinCosto > 0 || sinCargosMl > 0) && (
        <p className="text-[11px] text-[#8a6100] mb-2">
          {t.sinCosto > 0 && <>{t.sinCosto.toLocaleString("es-AR")} {porVenta ? "venta(s)" : "producto(s)"} con algún producto sin costo: su margen no se calcula y su costo no suma entero. </>}
          {sinCargosMl > 0 && <>{sinCargosMl.toLocaleString("es-AR")} sin cargos de la facturación de ML (todavía no se leyó, o no es de ML): se usa la comisión de la orden.</>}
        </p>
      )}

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              {porVenta ? <>
                <ThOrden col="fecha" porDefecto desc>Fecha</ThOrden><th className={TH}>Venta</th><ThOrden col="canal">Canal</ThOrden><th className={TH}>Productos</th>
              </> : <>
                <ThOrden col="sku">Código</ThOrden><ThOrden col="titulo">Producto</ThOrden><ThOrden col="ventas" n>Ventas</ThOrden>
              </>}
              <ThOrden col="unidades" n>Unidades</ThOrden><ThOrden col="venta" n porDefecto={!porVenta}>Venta</ThOrden><ThOrden col="cargos" n>Cargos</ThOrden>
              <ThOrden col="costo" n>Costo</ThOrden><ThOrden col="margen" n>Margen</ThOrden><ThOrden col="margen_pct" n>Margen %</ThOrden>
            </tr>
          </thead>
          <tbody>
            {vista.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>No hay ventas en esas fechas.</td></tr>}
            {vista.map((r) => (
              <tr key={r.clave} className={TR}>
                {porVenta ? <>
                  <td className={`${TD} whitespace-nowrap`}><Link href={`/ventas/pedidos/${r.pedido_id}`} className="hover:underline">{r.fecha?.slice(0, 10).split("-").reverse().join("/")} {r.fecha?.slice(11)}</Link></td>
                  <td className={`${TD} whitespace-nowrap`}><Link href={`/ventas/pedidos/${r.pedido_id}`} className="font-semibold text-[#16577F] hover:underline">{r.pedido_id}</Link>{r.externo && <span className="block font-mono text-[10px] text-[#5C6B76]">{r.externo}</span>}</td>
                  <td className={TD}>{r.canal}</td>
                  <td className={`${TD} max-w-[22rem] truncate`} title={r.titulo ?? ""}>{r.titulo}</td>
                </> : <>
                  <td className={`${TD} font-mono whitespace-nowrap`}>{r.producto_id ? <Link href={`/catalogo/productos/${r.producto_id}`} className="text-[#16577F] hover:underline">{r.sku ?? "—"}</Link> : r.sku ?? "—"}</td>
                  <td className={TD}>{r.titulo}</td>
                  <td className={TDN}>{r.ventas.toLocaleString("es-AR")}</td>
                </>}
                <td className={TDN}>{r.unidades.toLocaleString("es-AR")}</td>
                <td className={TDN}>{pesos(r.venta)}</td>
                <td className={TDN} title={r.cargos_ml ? "De la facturación de Mercado Libre" : "Comisión de la orden (falta la facturación de ML)"}>{pesos(r.cargos)}{!r.cargos_ml && r.cargos > 0 && <span className="text-[#8a6100]">*</span>}</td>
                <td className={TDN}>{r.sin_costo > 0 ? <span className="text-[#8a6100]">sin costo</span> : pesos(r.costo)}</td>
                <td className={`${TDN} font-semibold ${r.margen != null && r.margen < 0 ? "text-[#C03420]" : ""}`}>{pesos(r.margen)}</td>
                <td className={`${TDN} ${r.margen_pct != null && r.margen_pct < 0 ? "text-[#C03420]" : ""}`}>{pct(r.margen_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={filas.length} />
      <p className="text-[10px] text-[#5C6B76] mt-1">* Comisión de la orden: todavía no hay cargos de la facturación de ML para esa venta. Los cargos de ML van tal como los factura (con IVA).</p>
    </Pantalla>
  );
}
