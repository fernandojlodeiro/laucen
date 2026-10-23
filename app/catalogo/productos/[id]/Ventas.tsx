// La pestaña «Ventas» de la ficha del producto (pedido de Fer, 22/10): cómo se viene vendiendo, de un golpe de vista
// (7 días, último mes, 3 meses, último año y toda la historia) y, con «Ver detalle», venta por venta de la más nueva a
// la más vieja. Sale de venta_estadistica: Mercado Libre, los pedidos de los otros canales y el historial importado de
// Virtual Seller, sin las canceladas (lo mismo que usa Compras › Sugerencia de compra).

import Link from "next/link";
import { consulta, una } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { leerPagina, POR_PAGINA } from "@/lib/lista";
import { Paginado } from "@/app/componentes/Lista";
import { CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, TituloSeccion } from "@/app/componentes/erp";
import { SUAVE } from "@/app/botones";
import { fechaHora } from "@/app/ventas/formato";

/** Las ventas del producto (por sus variaciones; con el arreglo, la vista usa los índices de cada origen). */
export const SQL_VENTAS_PRODUCTO = `from venta_estadistica e
  where e.organizacion_id = $1 and e.variacion_id = any(array(select v.id from variacion v where v.producto_id = $2))
    and e.estado not in ('cancelled', 'cancelado', 'invalid')`;

const PERIODOS = [
  { k: "d7", t: "Últimos 7 días", dias: 7 },
  { k: "d30", t: "Último mes", dias: 30 },
  { k: "d90", t: "Últimos 3 meses", dias: 90 },
  { k: "d365", t: "Último año", dias: 365 },
  { k: "todo", t: "Toda la historia", dias: null },
] as const;

const COMPRA = "coalesce(e.pedido_vs, 'p' || e.pedido_id, 'm' || e.order_id, 'v' || e.ml_venta_id::text, 'h' || e.venta_historica_id::text)";
const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const ent = (n: number) => n.toLocaleString("es-AR");

type Fila = { fecha: Date; pedido_id: number | null; order_id: string | null; pedido_vs: string | null; canal: string | null; canal_id: number | null;
  cliente_id: number | null; cliente: string | null; cantidad: number; precio_unit: number | null; total: number | null };

export default async function SeccionVentas({ org, productoId, sp, aqui }: {
  org: string; productoId: number; sp: { detalle?: string; p?: string }; aqui: (extra?: Record<string, string | number>) => string;
}) {
  const conDetalle = sp.detalle === "1";
  const campos = PERIODOS.map((x) => {
    const f = x.dias ? `filter (where e.fecha >= now() - interval '${x.dias} days')` : "";
    return `count(distinct ${COMPRA}) ${f} ${x.k}_v, coalesce(sum(e.cantidad) ${f}, 0)::int ${x.k}_u, coalesce(sum(e.total) ${f}, 0)::float8 ${x.k}_m`;
  }).join(", ");
  const { desde } = leerPagina(sp);
  const [r, filas] = await Promise.all([
    una<Record<string, number> & { ultima: Date | null; primera: Date | null; renglones: number }>(
      `select ${campos}, max(e.fecha) ultima, min(e.fecha) primera, count(*)::int renglones ${SQL_VENTAS_PRODUCTO}`, [org, productoId]),
    conDetalle ? consulta<Fila>(`
      select e.fecha, coalesce(e.pedido_id, mv.pedido_id)::int pedido_id, e.order_id::text, e.pedido_vs, coalesce(ca.nombre, e.canal_nombre) canal, e.canal_id::int,
             cl.id::int cliente_id, coalesce(cl.nombre, mv.comprador, vh.cliente_nombre) cliente, e.cantidad::int, e.precio_unit::float8, e.total::float8
        from venta_estadistica e
        left join canal ca on ca.id = e.canal_id
        left join ml_venta mv on mv.id = e.ml_venta_id
        left join venta_historica vh on vh.id = e.venta_historica_id
        left join pedido pe on pe.id = coalesce(e.pedido_id, mv.pedido_id)
        left join cliente cl on cl.id = coalesce(e.cliente_id, pe.cliente_id)
       where e.organizacion_id = $1 and e.variacion_id = any(array(select v.id from variacion v where v.producto_id = $2))
         and e.estado not in ('cancelled', 'cancelado', 'invalid')
       order by e.fecha desc limit ${POR_PAGINA} offset ${desde}`, [org, productoId]) : Promise.resolve([] as Fila[]),
  ]);
  const n = (k: string) => Number(r?.[k] ?? 0);

  return (
    <div className="grid gap-4">
      <section className={CAJA}>
        <TituloSeccion titulo="Cómo se viene vendiendo">
          <Link href={conDetalle ? aqui() : aqui({ detalle: 1 })} scroll={false} className={SUAVE}>{conDetalle ? "Ocultar detalle" : "Ver detalle"}</Link>
        </TituloSeccion>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr><th className={TH}>Período</th><th className={THN} title="Compras distintas (un pedido o una venta de Mercado Libre)">Ventas</th>
                <th className={THN}>Unidades</th><th className={THN} title="Lo que pagaron los compradores">Monto</th>
                <th className={THN} title="Unidades por día en el período">Unid./día</th></tr>
            </thead>
            <tbody>
              {PERIODOS.map((x) => {
                const dias = x.dias ?? (r?.primera ? Math.max(1, Math.ceil((Date.now() - new Date(r.primera).getTime()) / 86_400_000)) : null);
                return (
                  <tr key={x.k} className={TR}>
                    <td className={`${TD} font-semibold`}>{x.t}</td>
                    <td className={TDN}>{ent(n(`${x.k}_v`))}</td>
                    <td className={`${TDN} font-semibold`}>{ent(n(`${x.k}_u`))}</td>
                    <td className={TDN}>{pesos(n(`${x.k}_m`))}</td>
                    <td className={TDN}>{dias ? (n(`${x.k}_u`) / dias).toLocaleString("es-AR", { maximumFractionDigits: 1 }) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#5C6B76] mt-2">
          {r?.ultima ? <>Última venta: {fechaHora(r.ultima)}. </> : "Todavía no tiene ventas. "}
          Todos los canales (Mercado Libre, la tienda web, el local y el historial anterior), sin las canceladas.
        </p>
      </section>

      {conDetalle && (
        <section className={CAJA}>
          <TituloSeccion titulo={`Venta por venta (${ent(r?.renglones ?? 0)})`} />
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr><th className={THN}>Fecha</th><th className={TH}>Venta</th><th className={TH}>Canal</th><th className={TH}>Cliente</th>
                  <th className={THN} title="Cantidad">Cant.</th><th className={THN}>Precio unit.</th><th className={THN}>Total</th></tr>
              </thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>Sin ventas.</td></tr>}
                {filas.map((f, i) => (
                  <tr key={i} className={TR} data-canal={f.canal_id ?? undefined}>
                    <td className={`${TDN} whitespace-nowrap`}>{fechaHora(f.fecha)}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {f.pedido_id ? <Link href={`/ventas/pedidos/${f.pedido_id}`} className="text-[#16577F] hover:underline">Pedido {f.pedido_id}</Link>
                        : f.order_id ? <a href={`https://www.mercadolibre.com.ar/ventas/${f.order_id}/detalle`} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline">ML {f.order_id} ↗</a>
                        : f.pedido_vs ?? "—"}
                    </td>
                    <td className={TD}>{f.canal ?? "—"}</td>
                    <td className={`${TD} max-w-56`}>
                      {f.cliente_id ? <Link href={`/ventas/clientes/${f.cliente_id}`} className="text-[#16577F] hover:underline">{f.cliente ?? `Cliente ${f.cliente_id}`}</Link> : f.cliente ?? "—"}
                    </td>
                    <td className={TDN}>{ent(f.cantidad)}</td>
                    <td className={TDN}>{pesos(f.precio_unit)}</td>
                    <td className={TDN}>{pesos(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginado total={r?.renglones ?? 0} />
        </section>
      )}
    </div>
  );
}
