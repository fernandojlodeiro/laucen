// Envíos de los pedidos (hoy, los de Mercado Envíos): qué hay que despachar,
// qué está en camino y qué se entregó. Desde acá se imprimen, de los
// tildados, la etiqueta + hoja de preparación de cada pedido (el camino
// principal, /deposito/hojas: los pedidos entran en un lote de picking), o
// sólo las etiquetas en PDF o en ZPL para la impresora térmica.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { PRIMARIO, SUAVE } from "@/app/botones";
import {
  entrarErp, Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha, fechaHora } from "@/app/ventas/formato";
import { LOGISTICA, ESTADO_ENVIO, SUBESTADO_ENVIO, TONO_ENVIO, PESTANAS, esPestana, type Pestana } from "./formato";
import { AccionesExcel } from "@/app/listas/piezas";
import Pestanas from "@/app/componentes/Pestanas";
import { LISTA_ENVIOS, CONDICION_ENVIOS } from "./lista";
import { MarcaCarritoEspera } from "@/app/componentes/CarritoEspera";
import { SelectorTam, tamElegido } from "@/app/deposito/picking/Tamano";
import { sqlCarritoEnEspera } from "@/lib/pedidos";

export const dynamic = "force-dynamic";

const ZONA = "America/Argentina/Buenos_Aires";

type SP = { ver?: string; canal?: string; q?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

type Fila = {
  id: number; pedido_id: number | null; pedido_fecha: Date | null; id_externo_pedido: string | null; cliente: string | null;
  canal: string | null; logistica: string | null; metodo: string | null; estado: string | null; subestado: string | null;
  despachar_antes: Date | null; vencido: boolean; tracking: string | null; etiqueta_impresa_ts: Date | null;
  imprimible: boolean; cliente_id: number | null; canal_id: number | null;
  carrito_ultimo_evento_ts: Date | null; en_espera: boolean;
};

export default async function Envios({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("envios_ver");
  const sp = await searchParams;
  const ver: Pestana = esPestana(sp.ver) ? sp.ver : "despachar";
  const canal = Number(sp.canal) || 0;
  const q = sp.q?.trim() ?? "";

  const canales = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from canal where organizacion_id = $1 and id in (select canal_id from envio where organizacion_id = $1) order by nombre", [s.org.id]);
  const [cuenta] = await consulta<Record<Pestana, number>>(
    `select ${PESTANAS.map(([k]) => `count(*) filter (where ${CONDICION_ENVIOS[k]})::int ${k}`).join(", ")}
       from envio e where e.organizacion_id = $1`, [s.org.id]);

  const base = await LISTA_ENVIOS.consulta!({ org: s.org.id, moneda: s.moneda }, sp);
  const { filas, total } = await consultaPaginada<Fila>({
    campos: `e.id::int, e.pedido_id::int, p.fecha pedido_fecha, p.id_externo id_externo_pedido, coalesce(cl.nombre, e.receptor) cliente,
           p.cliente_id::int, e.canal_id::int, ca.nombre canal, e.logistica, e.metodo, e.estado, e.subestado, e.despachar_antes,
           (e.estado in ('ready_to_ship', 'handling', 'pending') and e.despachar_antes is not null
             and (e.despachar_antes at time zone '${ZONA}')::date <= (now() at time zone '${ZONA}')::date) vencido,
           e.tracking, e.etiqueta_impresa_ts,
           (coalesce(e.logistica, '') <> 'fulfillment' and e.id_externo is not null) imprimible,
           p.carrito_ultimo_evento_ts, coalesce(${sqlCarritoEnEspera("p")}, false) en_espera`,
    desde: base.desde,
    donde: base.donde,
    orden: leerOrden(sp, {
      pedido: "e.pedido_id", fecha: "coalesce(p.fecha, e.creado_ts)", cliente: "coalesce(cl.nombre, e.receptor)", canal: "ca.nombre",
      logistica: "e.logistica", metodo: "e.metodo", estado: "e.estado", despachar: "e.despachar_antes", tracking: "e.tracking", impresa: "e.etiqueta_impresa_ts",
    }, base.orden),
  }, base.valores, sp);

  const filtros = { ver: ver === "despachar" ? null : ver, canal: canal || null, q };
  const hayImprimibles = filas.some((f) => f.imprimible && !f.en_espera);
  const tam = await tamElegido();

  return (
    <Pantalla titulo="Envíos" subtitulo="Los envíos de los pedidos y sus etiquetas"
      acciones={<AccionesExcel lista={LISTA_ENVIOS} org={s.org.id} />}>
      <Avisos sp={sp} />
      <Pestanas className="mb-3" items={PESTANAS.map(([k, texto]) => ({
        clave: k, texto, activa: ver === k, cuenta: cuenta?.[k] ?? 0,
        href: url("/ventas/envios", { ver: k === "despachar" ? null : k, canal: canal || null, q }),
      }))} />

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
                <ThOrden col="pedido" n>Pedido</ThOrden><ThOrden col="fecha" n porDefecto={ver !== "despachar"}>Fecha</ThOrden><ThOrden col="cliente">Cliente</ThOrden><ThOrden col="canal">Canal</ThOrden>
                <ThOrden col="logistica">Logística</ThOrden><ThOrden col="metodo">Método</ThOrden><ThOrden col="estado">Estado</ThOrden>
                <ThOrden col="despachar" n desc={false} porDefecto={ver === "despachar"}>Despachar antes de</ThOrden><ThOrden col="tracking">Tracking</ThOrden><ThOrden col="impresa" n>Etiqueta impresa</ThOrden>
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
                    {e.imprimible && <input type="checkbox" name="ids" value={e.id} disabled={e.en_espera} aria-label={`Elegir el envío del pedido ${e.pedido_id ?? e.id}`} className="h-4 w-4 align-middle disabled:opacity-40" />}
                  </td>
                  <td className={TDN}>
                    {e.pedido_id
                      ? <Link href={`/ventas/pedidos/${e.pedido_id}`} className="font-semibold text-[#16577F] hover:underline">{e.pedido_id}</Link>
                      : "—"}
                    {e.id_externo_pedido && <div className="text-[10px] text-[#5C6B76] font-mono">{e.id_externo_pedido}</div>}
                    {e.en_espera && <div className="mt-0.5"><MarcaCarritoEspera ts={e.carrito_ultimo_evento_ts} texto="Carrito: esperando" /></div>}
                  </td>
                  <td className={TDN}>{e.pedido_id ? <Link href={`/ventas/pedidos/${e.pedido_id}`} className="hover:underline">{fecha(e.pedido_fecha)}</Link> : fecha(e.pedido_fecha)}</td>
                  <td className={TD}>{e.cliente_id ? <Link href={`/ventas/clientes/${e.cliente_id}`} className="text-[#16577F] hover:underline">{e.cliente}</Link> : e.cliente ?? "—"}</td>
                  <td className={TD}>{e.canal_id ? <Link href={url("/ventas/envios", { ...filtros, canal: e.canal_id })} className="hover:text-[#16577F] hover:underline">{e.canal}</Link> : "—"}</td>
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
          <button formAction="/deposito/hojas" name="desde" value="envios" className={PRIMARIO} disabled={!hayImprimibles}>🖨 Imprimir etiquetas y hojas</button>
          <SelectorTam tam={tam} />
          <button name="formato" value="pdf" className={SUAVE} disabled={!hayImprimibles}>Sólo etiquetas (PDF)</button>
          <button name="formato" value="zpl2" className={SUAVE} disabled={!hayImprimibles}>Etiquetas térmicas (ZPL)</button>
          <span className="text-[11px] text-[#5C6B76]">Etiqueta + hoja de preparación de cada pedido; los que faltaba preparar entran en un lote de Picking. «Sólo etiquetas»: de una misma cuenta. Los de Full no llevan etiqueta.</span>
        </div>
      </form>

      <Paginado total={total} />
    </Pantalla>
  );
}
