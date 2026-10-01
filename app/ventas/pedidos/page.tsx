// Pedidos de todos los canales: listado con filtros. Sólo mirar: cambiar de
// estado lo hacen las sesiones siguientes (con cambiarEstado de lib/pedidos).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { enVista } from "@/lib/moneda";
import { ESTADOS_PEDIDO, ESTADOS_PAGO, esEstadoPedido, esEstadoPago } from "@/lib/pedidos";
import type { EstadoPedido, EstadoPago } from "@/lib/pedidos";
import { PRIMARIO, SUAVE } from "@/app/botones";
import {
  entrarErp, Pantalla, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha, TONO_ESTADO, TONO_PAGO, etiqueta } from "@/app/ventas/formato";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

type SP = { estado?: string; canal?: string; pago?: string; desde?: string; hasta?: string; q?: string; pagina?: string };

type Fila = {
  id: number; fecha: Date; canal: string; id_externo: string | null; cliente_id: number | null; cliente: string | null;
  estado: EstadoPedido; estado_pago: EstadoPago; total_ars: number; total_usd: number; unidades: number; total: number;
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
  const pagina = Math.max(1, Number(sp.pagina) || 1);

  const canales = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from canal where organizacion_id = $1 order by nombre", [s.org.id]);

  const valores: unknown[] = [s.org.id];
  const donde = ["p.organizacion_id = $1"];
  const agregar = (cond: (p: string) => string, v: unknown) => { valores.push(v); donde.push(cond(`$${valores.length}`)); };
  if (estado === "pendientes") donde.push("p.estado in ('nuevo', 'pagado')");
  else if (estado) agregar((p) => `p.estado = ${p}`, estado);
  if (pago) agregar((p) => `p.estado_pago = ${p}`, pago);
  if (canal) agregar((p) => `p.canal_id = ${p}`, canal);
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
  valores.push(POR_PAGINA, (pagina - 1) * POR_PAGINA);
  const filas = await consulta<Fila>(`
    select p.id::int, p.fecha, ca.nombre canal, p.id_externo, p.cliente_id::int, cl.nombre cliente, p.estado, p.estado_pago,
           p.total_ars::float, p.total_usd::float,
           coalesce((select sum(l.cantidad) from pedido_linea l where l.pedido_id = p.id), 0)::int unidades,
           count(*) over ()::int total
      from pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
     where ${donde.join(" and ")}
     order by p.fecha desc, p.id desc
     limit $${valores.length - 1} offset $${valores.length}`, valores);
  const total = filas[0]?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const filtros = { estado, canal: canal || null, pago, desde, hasta, q };
  const ir = (p: number) => url("/ventas/pedidos", { ...filtros, pagina: p > 1 ? p : null });
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
        <button className={PRIMARIO}>Filtrar</button>
        {hayFiltro && <Link href="/ventas/pedidos" className={SUAVE}>Limpiar</Link>}
      </form>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={THN}>Nº</th><th className={THN}>Fecha</th><th className={TH}>Canal</th><th className={TH}>Id externo</th>
              <th className={TH}>Cliente</th><th className={TH}>Estado</th><th className={TH}>Pago</th><th className={THN}>Total</th><th className={THN}>Unidades</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>{hayFiltro ? "No hay pedidos con esos filtros." : "Todavía no hay pedidos."}</td></tr>}
            {filas.map((p) => (
              <tr key={p.id} className={TR}>
                <td className={TDN}><Link href={`/ventas/pedidos/${p.id}`} className="font-semibold text-[#16577F] hover:underline">{p.id}</Link></td>
                <td className={TDN}>{fecha(p.fecha)}</td>
                <td className={TD}>{p.canal}</td>
                <td className={`${TD} font-mono`}>{p.id_externo ?? "—"}</td>
                <td className={TD}>{p.cliente_id ? <Link href={`/ventas/clientes/${p.cliente_id}`} className="text-[#16577F] hover:underline">{p.cliente}</Link> : "—"}</td>
                <td className={TD}><Estado texto={etiqueta(ESTADOS_PEDIDO, p.estado)} tono={TONO_ESTADO[p.estado] ?? "gris"} /></td>
                <td className={TD}><Estado texto={etiqueta(ESTADOS_PAGO, p.estado_pago)} tono={TONO_PAGO[p.estado_pago] ?? "gris"} /></td>
                <td className={TDN}>{enVista({ ars: p.total_ars, usd: p.total_usd }, s.moneda)}</td>
                <td className={TDN}>{p.unidades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 0 && (
        <nav className="flex items-center justify-end gap-2 mt-2 text-xs text-[#5C6B76]">
          <span>{total} pedido{total === 1 ? "" : "s"}{paginas > 1 ? ` · página ${pagina} de ${paginas}` : ""}</span>
          {pagina > 1 && <Link href={ir(pagina - 1)} className={SUAVE}>← Anterior</Link>}
          {pagina < paginas && <Link href={ir(pagina + 1)} className={SUAVE}>Siguiente →</Link>}
        </nav>
      )}
    </Pantalla>
  );
}
