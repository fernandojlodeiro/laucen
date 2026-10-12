// Ventas › Historial de ventas (pedido de Fer, 12/10): TODAS las ventas de todos los canales. Mercado Libre trae
// también las de antes de que Laucen tomara los pedidos, y lo anterior viene del historial importado de Virtual Seller
// (marcadas «Sin pedido»: son sólo para consultar y estadística, nunca generan un pedido). Tocando una venta de ML se
// abre su detalle leído de Mercado Libre; una de otro canal, su pedido.

import Link from "next/link";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import RangoFechas from "@/app/componentes/RangoFechas";
import FotosProducto from "@/app/componentes/FotosProducto";
import { Paginado, ThOrden } from "@/app/componentes/Lista";
import { entrarErp, Pantalla, Avisos, Estado, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, url } from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { consulta, una } from "@/lib/erp/base";
import { consultaPaginada } from "@/lib/lista";
import { camposDe, ordenDe, seleccion, type Fila } from "@/lib/listas/tipos";
import { formatearNumero } from "@/lib/numeros";
import { fecha, fechaHora } from "@/app/ventas/formato";
import { BASE_HISTORIAL as BASE, ESTADOS_VENTA, LISTA_HISTORIAL, filtrosHistorial } from "./lista";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;
const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);

export default async function HistorialVentas({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("pedidos_ver");
  const sp = await searchParams;
  const f = filtrosHistorial(sp);
  const ctx = { org: s.org.id, moneda: s.moneda };
  const todos = await camposDe(LISTA_HISTORIAL, ctx);
  const base = await LISTA_HISTORIAL.consulta!(ctx, sp);
  const [{ filas, total }, canales, carga, resumen, producto, cliente] = await Promise.all([
    consultaPaginada<Fila>({ campos: seleccion(todos, todos, LISTA_HISTORIAL.siempre), desde: base.desde, donde: base.donde, orden: ordenDe(todos, sp, base.orden) }, base.valores, sp),
    consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 order by nombre", [s.org.id]),
    una<{ faltan: number; leidas: number }>("select count(*) filter (where terminada_ts is null)::int faltan, coalesce(sum(leidas), 0)::int leidas from ml_venta_carga where organizacion_id = $1", [s.org.id]),
    una<{ n: number; unidades: number; total: number }>(`select count(*)::int n, coalesce(sum(e.cantidad), 0)::int unidades, coalesce(sum(e.total), 0)::float8 total
      from ${base.desde} where ${base.donde} and e.estado not in ('cancelled', 'cancelado', 'invalid')`, base.valores),
    f.producto ? una<{ sku: string | null; titulo: string }>("select sku_base sku, titulo from producto where id = $1 and organizacion_id = $2", [f.producto, s.org.id]) : null,
    f.cliente ? una<{ nombre: string }>("select nombre from cliente where id = $1 and organizacion_id = $2", [f.cliente, s.org.id]) : null,
  ]);
  return (
    <Pantalla titulo="Historial de ventas"
      subtitulo="Todas las ventas de todos los canales. Las anteriores a que Laucen tomara los pedidos (de Mercado Libre o del historial de Virtual Seller) figuran «Sin pedido»: son sólo para consultar."
      acciones={<AccionesExcel lista={LISTA_HISTORIAL} org={s.org.id} />}>
      <Avisos sp={sp} />
      {carga && carga.faltan > 0 && (
        <p className="text-xs text-[#8a6100] bg-[#FFF8E5] rounded-lg px-3 py-2 mb-3">Se están trayendo las ventas del último año de Mercado Libre ({formatearNumero(carga.leidas, "entero")} hasta ahora; faltan {carga.faltan} cuenta{carga.faltan === 1 ? "" : "s"}). La lista se completa sola.</p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={f.q} comienza={sp.contiene !== "1"} placeholder="SKU, producto, comprador o n.º" limpiar={["p"]} />
        <RangoFechas desde={f.desde} hasta={f.hasta} vacio="Todas las fechas" limpiar={["p"]} />
        <FiltroVivo parametro="canal" valor={f.canal ? String(f.canal) : ""} etiqueta="Canal" limpiar={["p"]}>
          <option value="">Todos los canales</option>
          {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </FiltroVivo>
        <FiltroVivo parametro="origen" valor={f.origen} etiqueta="De dónde" limpiar={["p"]}>
          <option value="">Todas</option>
          <option value="ml">Mercado Libre</option>
          <option value="otros">Pedidos de otros canales</option>
          <option value="vs">Historial de Virtual Seller</option>
        </FiltroVivo>
        <FiltroVivo parametro="pedido" valor={f.pedido} etiqueta="Pedido" limpiar={["p"]}>
          <option value="">Con y sin pedido</option>
          <option value="con">Con pedido</option>
          <option value="sin">Sin pedido (anteriores)</option>
        </FiltroVivo>
        {producto && <Link href={url(BASE, { ...sp, producto: null, p: null })} className="text-xs rounded-full bg-[#EEF3F8] px-2 py-1 text-[#16577F]">Producto {producto.sku ?? ""} ✕</Link>}
        {f.comprador && <Link href={url(BASE, { ...sp, comprador: null, p: null })} className="text-xs rounded-full bg-[#EEF3F8] px-2 py-1 text-[#16577F]">Comprador de ML {f.comprador} ✕</Link>}
        {cliente && <Link href={url(BASE, { ...sp, cliente: null, p: null })} className="text-xs rounded-full bg-[#EEF3F8] px-2 py-1 text-[#16577F]">Cliente {cliente.nombre} ✕</Link>}
      </div>
      {resumen && <p className="text-[11px] text-[#5C6B76] mb-2">{formatearNumero(resumen.n, "entero")} ventas sin canceladas · {formatearNumero(resumen.unidades, "entero")} unidades · {pesos(resumen.total)}</p>}
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="fecha" n porDefecto>Fecha</ThOrden><ThOrden col="canal">Canal</ThOrden><ThOrden col="sku">Producto</ThOrden>
              <ThOrden col="cantidad" n>Cant.</ThOrden><ThOrden col="precio" n>Precio</ThOrden><ThOrden col="total" n>Total</ThOrden>
              <ThOrden col="comision" n>Comisión ML</ThOrden><ThOrden col="estado">Estado</ThOrden><th className={TH}>Pedido</th><ThOrden col="comprador">Comprador</ThOrden>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>No hay ventas con esos filtros.</td></tr>}
            {filas.map((v, i) => {
              const ver = v.ml_venta_id ? `${BASE}/${v.ml_venta_id}` : v.pedido ? `/ventas/pedidos/${v.pedido}` : null;
              const cancelada = ["cancelled", "cancelado", "invalid"].includes(v.estado);
              const deVs = v.origen === "vs";
              return (
                <tr key={`${v.ml_venta_id ?? "p"}-${v.pedido ?? ""}-${i}`} className={`${TR} ${cancelada ? "opacity-60" : ""}`} data-canal={v.canal_id}>
                  <td className={`${TDN} whitespace-nowrap`}>{ver ? <Link href={ver} className="text-[#16577F] hover:underline">{fechaHora(v.fecha)}</Link> : deVs ? fecha(v.fecha) : fechaHora(v.fecha)}</td>
                  <td className={TD}>{v.canal}</td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-2 align-middle">
                      <FotosProducto fotos={v.fotos} titulo={v.titulo ?? ""} />
                      {v.producto_id ? <Link href={`/catalogo/productos/${v.producto_id}`} className="font-mono text-[#16577F] hover:underline whitespace-nowrap">{v.sku}</Link> : <span className="font-mono">{v.sku ?? "—"}</span>}
                    </span>{" "}<span className="text-[#5C6B76]">{v.titulo}</span>
                  </td>
                  <td className={TDN}>{formatearNumero(v.cantidad, "entero")}</td>
                  <td className={TDN}>{pesos(v.precio)}</td>
                  <td className={TDN}>{pesos(v.total)}</td>
                  <td className={TDN}>{pesos(v.comision)}</td>
                  <td className={TD}>{ESTADOS_VENTA[v.estado] ?? v.estado}{v.reclamo ? <> <Estado texto="Reclamo" tono="rojo" /></> : null}</td>
                  <td className={TD}>{v.pedido ? <Link href={`/ventas/pedidos/${v.pedido}`} className="text-[#16577F] hover:underline">{v.pedido}</Link> : deVs ? <span title="Del historial de Virtual Seller: sin pedido en Laucen"><Estado texto="Sin pedido" tono="gris" /> <span className="text-[10px] text-[#5C6B76] whitespace-nowrap">VS {v.pedido_vs}</span></span> : <Estado texto="Sin pedido" tono="gris" />}</td>
                  <td className={TD}>{v.cliente_id ? <Link href={`/ventas/clientes/${v.cliente_id}`} className="text-[#16577F] hover:underline">{v.comprador}</Link> : v.comprador ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
    </Pantalla>
  );
}
