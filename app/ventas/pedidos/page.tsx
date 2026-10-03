// Pedidos de todos los canales: listado con filtros. Sólo mirar: cambiar de
// estado lo hacen las sesiones siguientes (con cambiarEstado de lib/pedidos).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { enVista } from "@/lib/moneda";
import { ESTADOS_PEDIDO, ESTADOS_PAGO, esEstadoPedido, esEstadoPago } from "@/lib/pedidos";
import type { EstadoPedido, EstadoPago } from "@/lib/pedidos";
import { PRIMARIO, SUAVE } from "@/app/botones";
import {
  entrarErp, Pantalla, Estado, url, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha, TONO_ESTADO, TONO_PAGO, etiqueta } from "@/app/ventas/formato";

export const dynamic = "force-dynamic";

type SP = { estado?: string; canal?: string; pago?: string; desde?: string; hasta?: string; q?: string; cliente?: string; p?: string; orden?: string; dir?: string };

type Fila = {
  id: number; fecha: Date; canal_id: number; canal: string; id_externo: string | null; cliente_id: number | null; cliente: string | null;
  estado: EstadoPedido; estado_pago: EstadoPago; total_ars: number; total_usd: number; unidades: number;
};

const esFecha = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : "");

export default async function Pedidos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("pedidos_ver");
  const sp = await searchParams;
  const estado = sp.estado === "pendientes" || esEstadoPedido(sp.estado) ? sp.estado : "";
  const pago = esEstadoPago(sp.pago) ? sp.pago : "";
  const canal = Number(sp.canal) || 0;
  const desde = esFecha(sp.desde);
  const hasta = esFecha(sp.hasta);
  const q = sp.q?.trim() ?? "";
  const cliente = Number(sp.cliente) || 0;

  const canales = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from canal where organizacion_id = $1 order by nombre", [s.org.id]);

  const valores: unknown[] = [s.org.id];
  const donde = ["p.organizacion_id = $1"];
  const agregar = (cond: (p: string) => string, v: unknown) => { valores.push(v); donde.push(cond(`$${valores.length}`)); };
  if (estado === "pendientes") donde.push("p.estado in ('nuevo', 'pagado')");
  else if (estado) agregar((p) => `p.estado = ${p}`, estado);
  if (pago) agregar((p) => `p.estado_pago = ${p}`, pago);
  if (canal) agregar((p) => `p.canal_id = ${p}`, canal);
  if (cliente) agregar((p) => `p.cliente_id = ${p}`, cliente);
  // Las fechas se cortan en el día argentino.
  if (desde) agregar((p) => `p.fecha >= (${p}::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'`, desde);
  if (hasta) agregar((p) => `p.fecha < (${p}::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'`, hasta);
  if (q) {
    valores.push(`%${q}%`);
    const p = `$${valores.length}`;
    const n = /^\d+$/.test(q) && q.length <= 15 ? Number(q) : null;
    let porId = "";
    if (n) { valores.push(n); porId = ` or p.id = $${valores.length}`; }
    donde.push(`(p.id_externo ilike ${p} or cl.nombre ilike ${p} or cl.email ilike ${p} or cl.documento_numero ilike ${p}${porId})`);
  }
  const UNIDADES = "coalesce((select sum(l.cantidad) from pedido_linea l where l.pedido_id = p.id), 0)";
  const { filas, total } = await consultaPaginada<Fila>({
    campos: `p.id::int, p.fecha, p.canal_id::int, ca.nombre canal, p.id_externo, p.cliente_id::int, cl.nombre cliente, p.estado, p.estado_pago,
             p.total_ars::float, p.total_usd::float, ${UNIDADES}::int unidades`,
    desde: "pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id",
    donde: donde.join(" and "),
    orden: leerOrden(sp, {
      id: "p.id", fecha: "p.fecha", canal: "ca.nombre", externo: "p.id_externo", cliente: "cl.nombre", estado: "p.estado",
      pago: "p.estado_pago", total: "p.total_ars", unidades: UNIDADES,
    }, "p.fecha desc, p.id desc"),
  }, valores, sp);
  const filtros = { estado, canal: canal || null, pago, desde, hasta, q, cliente: cliente || null };
  const hayFiltro = Object.values(filtros).some(Boolean);

  return (
    <Pantalla titulo="Pedidos" subtitulo="Los pedidos de todos los canales">
      <form className="flex flex-wrap items-end gap-2 mb-3">
        <label><span className={ETIQUETA}>Buscar</span>
          <input name="q" defaultValue={q} placeholder="Nº, id externo o cliente" className={`${CAMPO} w-52`} /></label>
        <label><span className={ETIQUETA}>Estado</span>
          <select name="estado" defaultValue={estado} className={CAMPO}>
            <option value="">Todos</option>
            <option value="pendientes">Pendientes (nuevo + pagado)</option>
            {Object.entries(ESTADOS_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label><span className={ETIQUETA}>Canal</span>
          <select name="canal" defaultValue={canal || ""} className={CAMPO}>
            <option value="">Todos</option>
            {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></label>
        <label><span className={ETIQUETA}>Pago</span>
          <select name="pago" defaultValue={pago} className={CAMPO}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label><span className={ETIQUETA}>Desde</span><input type="date" name="desde" defaultValue={desde} className={CAMPO} /></label>
        <label><span className={ETIQUETA}>Hasta</span><input type="date" name="hasta" defaultValue={hasta} className={CAMPO} /></label>
        {cliente > 0 && <input type="hidden" name="cliente" value={cliente} />}
        <button className={PRIMARIO}>Filtrar</button>
        {hayFiltro && <Link href="/ventas/pedidos" className={SUAVE}>Limpiar</Link>}
      </form>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="id" n>Nº</ThOrden><ThOrden col="fecha" n porDefecto>Fecha</ThOrden><ThOrden col="canal">Canal</ThOrden><ThOrden col="externo">Id externo</ThOrden>
              <ThOrden col="cliente">Cliente</ThOrden><ThOrden col="estado">Estado</ThOrden><ThOrden col="pago">Pago</ThOrden><ThOrden col="total" n>Total</ThOrden><ThOrden col="unidades" n>Unidades</ThOrden>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>{hayFiltro ? "No hay pedidos con esos filtros." : "Todavía no hay pedidos."}</td></tr>}
            {filas.map((p) => (
              <tr key={p.id} className={TR}>
                <td className={TDN}><Link href={`/ventas/pedidos/${p.id}`} className="font-semibold text-[#16577F] hover:underline">{p.id}</Link></td>
                <td className={TDN}><Link href={`/ventas/pedidos/${p.id}`} className="hover:underline">{fecha(p.fecha)}</Link></td>
                <td className={TD}><Link href={url("/ventas/pedidos", { ...filtros, canal: p.canal_id })} className="hover:text-[#16577F] hover:underline">{p.canal}</Link></td>
                <td className={`${TD} font-mono`}>{p.id_externo ? <Link href={`/ventas/pedidos/${p.id}`} className="hover:underline">{p.id_externo}</Link> : "—"}</td>
                <td className={TD}>{p.cliente_id ? <Link href={`/ventas/clientes/${p.cliente_id}`} className="text-[#16577F] hover:underline">{p.cliente}</Link> : "—"}</td>
                <td className={TD}><Estado texto={etiqueta(ESTADOS_PEDIDO, p.estado)} tono={TONO_ESTADO[p.estado] ?? "gris"} /></td>
                <td className={TD}><Estado texto={etiqueta(ESTADOS_PAGO, p.estado_pago)} tono={TONO_PAGO[p.estado_pago] ?? "gris"} /></td>
                <td className={TDN}>{enVista({ ars: p.total_ars, usd: p.total_usd }, s.moneda)}</td>
                <td className={TDN}><Link href={`/ventas/pedidos/${p.id}`} className="hover:underline">{p.unidades}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
    </Pantalla>
  );
}
