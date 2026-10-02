// Envíos de los pedidos (hoy, los de Mercado Envíos): qué hay que despachar,
// qué está en camino y qué se entregó. Desde acá se imprimen las etiquetas,
// de a varias, en PDF o en ZPL para la impresora térmica.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { PRIMARIO, SUAVE } from "@/app/botones";
import {
  entrarErp, Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha, fechaHora } from "@/app/ventas/formato";
import { LOGISTICA, ESTADO_ENVIO, SUBESTADO_ENVIO, TONO_ENVIO, PESTANAS, esPestana, type Pestana } from "./formato";

export const dynamic = "force-dynamic";

const POR_PAGINA = 100;
const ZONA = "America/Argentina/Buenos_Aires";

type SP = { ver?: string; canal?: string; q?: string; pagina?: string; ok?: string; error?: string };

type Fila = {
  id: number; pedido_id: number | null; pedido_fecha: Date | null; id_externo_pedido: string | null; cliente: string | null;
  canal: string | null; logistica: string | null; metodo: string | null; estado: string | null; subestado: string | null;
  despachar_antes: Date | null; vencido: boolean; tracking: string | null; etiqueta_impresa_ts: Date | null;
  imprimible: boolean; total: number;
};

/** La condición de cada pestaña (sobre la tabla envio, alias e). */
const CONDICION: Record<Pestana, string> = {
  despachar: "e.estado in ('ready_to_ship', 'handling') and coalesce(e.logistica, '') <> 'fulfillment'",
  camino: "e.estado = 'shipped'",
  entregados: "e.estado = 'delivered'",
  todos: "true",
};

export default async function Envios({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("envios_ver");
  const sp = await searchParams;
  const ver: Pestana = esPestana(sp.ver) ? sp.ver : "despachar";
  const canal = Number(sp.canal) || 0;
  const q = sp.q?.trim() ?? "";
  const pagina = Math.max(1, Number(sp.pagina) || 1);

  const canales = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from canal where organizacion_id = $1 and id in (select canal_id from envio where organizacion_id = $1) order by nombre", [s.org.id]);
  const cuenta = await consulta<{ despachar: number }>(
    `select count(*)::int despachar from envio e where e.organizacion_id = $1 and ${CONDICION.despachar}`, [s.org.id]);

  const valores: unknown[] = [s.org.id];
  const donde = ["e.organizacion_id = $1", CONDICION[ver]];
  if (canal) { valores.push(canal); donde.push(`e.canal_id = $${valores.length}`); }
  if (q) {
    valores.push(`%${q}%`);
    const p = `$${valores.length}`;
    let porId = "";
    if (/^\d{1,15}$/.test(q)) { valores.push(Number(q)); porId = ` or p.id = $${valores.length}`; }
    donde.push(`(e.tracking ilike ${p} or e.id_externo ilike ${p} or p.id_externo ilike ${p} or cl.nombre ilike ${p} or e.receptor ilike ${p}${porId})`);
  }
  // Para despachar: lo más urgente primero. El resto: lo más nuevo primero.
  const orden = ver === "despachar" ? "e.despachar_antes asc nulls last, e.id" : "coalesce(p.fecha, e.creado_ts) desc, e.id desc";
  valores.push(POR_PAGINA, (pagina - 1) * POR_PAGINA);
  const filas = await consulta<Fila>(`
    select e.id::int, e.pedido_id::int, p.fecha pedido_fecha, p.id_externo id_externo_pedido, coalesce(cl.nombre, e.receptor) cliente,
           ca.nombre canal, e.logistica, e.metodo, e.estado, e.subestado, e.despachar_antes,
           (e.estado in ('ready_to_ship', 'handling', 'pending') and e.despachar_antes is not null
             and (e.despachar_antes at time zone '${ZONA}')::date <= (now() at time zone '${ZONA}')::date) vencido,
           e.tracking, e.etiqueta_impresa_ts,
           (coalesce(e.logistica, '') <> 'fulfillment' and e.id_externo is not null) imprimible,
           count(*) over ()::int total
      from envio e
      left join pedido p on p.id = e.pedido_id
      left join cliente cl on cl.id = p.cliente_id
      left join canal ca on ca.id = e.canal_id
     where ${donde.join(" and ")}
     order by ${orden}
     limit $${valores.length - 1} offset $${valores.length}`, valores);

  const total = filas[0]?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const filtros = { ver: ver === "despachar" ? null : ver, canal: canal || null, q };
  const ir = (p: number) => url("/ventas/envios", { ...filtros, pagina: p > 1 ? p : null });
  const hayImprimibles = filas.some((f) => f.imprimible);

  return (
    <Pantalla titulo="Envíos" subtitulo="Los envíos de los pedidos y sus etiquetas">
      <Avisos sp={sp} />
      <nav className="flex gap-1 border-b border-[#E3E9F0] mb-3">
        {PESTANAS.map(([k, texto]) => (
          <Link key={k} href={url("/ventas/envios", { ver: k === "despachar" ? null : k, canal: canal || null, q })}
            className={`px-3 py-2 text-xs font-bold -mb-px border-b-2 rounded-t-lg ${ver === k ? "border-[#16577F] text-[#16577F] bg-white" : "border-transparent text-[#5C6B76] hover:text-[#16577F]"}`}>
            {texto}{k === "despachar" && cuenta[0]?.despachar ? ` (${cuenta[0].despachar})` : ""}
          </Link>
        ))}
      </nav>

      <form className="flex flex-wrap items-end gap-2 mb-3">
        {ver !== "despachar" && <input type="hidden" name="ver" value={ver} />}
        <label><span className={ETIQUETA}>Buscar</span>
          <input name="q" defaultValue={q} placeholder="Nº de pedido, tracking o cliente" className={`${CAMPO} w-60`} /></label>
        <label><span className={ETIQUETA}>Canal</span>
          <select name="canal" defaultValue={canal || ""} className={CAMPO}>
            <option value="">Todos</option>
            {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></label>
        <button className={PRIMARIO}>Filtrar</button>
        {(canal || q) ? <Link href={url("/ventas/envios", { ver: filtros.ver })} className={SUAVE}>Limpiar</Link> : null}
      </form>

      {/* Las etiquetas se bajan en otra pestaña: el formulario va por GET al route handler. */}
      <form action="/ventas/envios/etiquetas" method="get" target="_blank">
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr>
                <th className={TH}><span className="sr-only">Elegir</span></th>
                <th className={THN}>Pedido</th><th className={THN}>Fecha</th><th className={TH}>Cliente</th><th className={TH}>Canal</th>
                <th className={TH}>Logística</th><th className={TH}>Método</th><th className={TH}>Estado</th>
                <th className={THN}>Despachar antes de</th><th className={TH}>Tracking</th><th className={THN}>Etiqueta impresa</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={11} className={`${TD} text-[#5C6B76]`}>
                  {q || canal ? "No hay envíos con esos filtros." : ver === "despachar" ? "No hay nada para despachar." : "No hay envíos acá."}
                </td></tr>
              )}
              {filas.map((e) => (
                <tr key={e.id} className={TR}>
                  <td className={TD}>
                    {e.imprimible && <input type="checkbox" name="ids" value={e.id} aria-label={`Elegir el envío del pedido ${e.pedido_id ?? e.id}`} className="h-4 w-4 align-middle" />}
                  </td>
                  <td className={TDN}>
                    {e.pedido_id
                      ? <Link href={`/ventas/pedidos/${e.pedido_id}`} className="font-semibold text-[#16577F] hover:underline">{e.pedido_id}</Link>
                      : "—"}
                    {e.id_externo_pedido && <div className="text-[10px] text-[#5C6B76] font-mono">{e.id_externo_pedido}</div>}
                  </td>
                  <td className={TDN}>{fecha(e.pedido_fecha)}</td>
                  <td className={TD}>{e.cliente ?? "—"}</td>
                  <td className={TD}>{e.canal ?? "—"}</td>
                  <td className={TD}>{e.logistica ? (LOGISTICA[e.logistica] ?? e.logistica) : "—"}</td>
                  <td className={TD}>{e.metodo ?? "—"}</td>
                  <td className={TD}>
                    {e.estado ? <Estado texto={ESTADO_ENVIO[e.estado] ?? e.estado} tono={TONO_ENVIO[e.estado] ?? "gris"} /> : "—"}
                    {e.subestado && <div className="text-[10px] text-[#5C6B76] mt-0.5">{SUBESTADO_ENVIO[e.subestado] ?? e.subestado}</div>}
                  </td>
                  <td className={`${TDN} ${e.vencido ? "font-bold text-[#C03420]" : ""}`}>
                    {e.despachar_antes ? fechaHora(e.despachar_antes) : "—"}
                  </td>
                  <td className={`${TD} font-mono`}>{e.tracking ?? "—"}</td>
                  <td className={TDN}>{e.etiqueta_impresa_ts ? fechaHora(e.etiqueta_impresa_ts) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button name="formato" value="pdf" className={PRIMARIO} disabled={!hayImprimibles}>Imprimir etiquetas (PDF)</button>
          <button name="formato" value="zpl2" className={SUAVE} disabled={!hayImprimibles}>Etiquetas térmicas (ZPL)</button>
          <span className="text-[11px] text-[#5C6B76]">Tildá los envíos (de una misma cuenta). Los de Full no llevan etiqueta.</span>
        </div>
      </form>

      {total > 0 && (
        <nav className="flex items-center justify-end gap-2 mt-2 text-xs text-[#5C6B76]">
          <span>{total} envío{total === 1 ? "" : "s"}{paginas > 1 ? ` · página ${pagina} de ${paginas}` : ""}</span>
          {pagina > 1 && <Link href={ir(pagina - 1)} className={SUAVE}>← Anterior</Link>}
          {pagina < paginas && <Link href={ir(pagina + 1)} className={SUAVE}>Siguiente →</Link>}
        </nav>
      )}
    </Pantalla>
  );
}
