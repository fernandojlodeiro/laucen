// La pantalla de trabajo de una recepción: el lector con cantidad y
// ubicación, lo que se espera que vuelva (si es de un pedido), lo recibido
// con sus totales, y "Cerrar recepción".

import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { VERDE } from "@/app/botones";
import { BotonConfirmar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { fechaHoraAR, GRANDE, TIPO_RECEPCION } from "../../formato";
import { accionCerrarRecepcion } from "../acciones";
import Recibir from "./Recibir";
import RecibirCajas from "./RecibirCajas";
import { cajasOrden, lineasOrden } from "@/lib/compras/ordenes";
import { accionSacarDeCaja } from "../acciones";
import { CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { PRIMARIO } from "@/app/botones";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

export default async function RecepcionTrabajo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("recepcion_ver");
  const recId = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(recId) || recId <= 0) notFound();
  const rec = await una<{
    id: number; tipo: string; estado: string; deposito_id: number; deposito: string; proveedor: string | null; pedido_id: number | null;
    pedido_externo: string | null; venta_externa: string | null; pedido_estado: string | null; documento: string | null; nota: string | null; creado_ts: Date; cerrada_ts: Date | null;
    orden_compra_id: number | null; orden: string | null;
  }>(`
    select r.id::int, r.tipo, r.estado, r.deposito_id::int, d.nombre deposito, pr.nombre proveedor, r.pedido_id::int, r.orden_compra_id::int,
           (select codigo from orden_compra where id = r.orden_compra_id) orden,
           p.id_externo pedido_externo, r.venta_externa, p.estado pedido_estado, r.documento, r.nota, r.creado_ts, r.cerrada_ts
      from recepcion r join deposito d on d.id = r.deposito_id left join proveedor pr on pr.id = r.proveedor_id
      left join pedido p on p.id = r.pedido_id
     where r.id = $1 and r.organizacion_id = $2`, [recId, s.org.id]);
  if (!rec) notFound();

  const [lineas, ubicaciones, guia] = await Promise.all([
    consulta<{ id: number; sku: string; producto_id: number; titulo: string; ubicacion: string; deposito: string; cantidad: number; condicion: string; creado_ts: Date }>(`
      select l.id::int, v.sku, v.producto_id::int, titulo_variacion(v.id) titulo, u.codigo ubicacion, d.nombre deposito, l.cantidad, l.condicion, l.creado_ts
        from recepcion_linea l join variacion v on v.id = l.variacion_id join ubicacion u on u.id = l.ubicacion_id join deposito d on d.id = u.deposito_id
       where l.recepcion_id = $1 and l.organizacion_id = $2 order by l.id desc`, [recId, s.org.id]),
    consulta<{ codigo: string; descripcion: string | null }>(`
      select codigo, descripcion from ubicacion where organizacion_id = $1 and deposito_id = $2 and estado = 'activa' and not es_default
       order by orden_recorrido, codigo`, [s.org.id, rec.deposito_id]),
    // Si es de un pedido: sus líneas, como guía de lo que se espera que vuelva
    // (un kit vuelve por sus componentes: su línea no se va completando sola).
    rec.pedido_id ? consulta<{ sku: string | null; titulo: string; cantidad: number; recibido: number }>(`
      select pl.sku, pl.titulo, pl.cantidad,
             coalesce((select sum(rl.cantidad) from recepcion_linea rl where rl.recepcion_id = $3 and rl.variacion_id = pl.variacion_id), 0)::int recibido
        from pedido_linea pl where pl.pedido_id = $1 and pl.organizacion_id = $2 order by pl.orden, pl.id`, [rec.pedido_id, s.org.id, recId]) : [],
  ]);
  const unidades = lineas.reduce((a, l) => a + l.cantidad, 0);
  // Recepción de una orden de compra al exterior: sus cajas y lo que falta de cada renglón.
  const [cajas, renglones] = rec.orden_compra_id
    ? await Promise.all([cajasOrden(s.org.id, rec.orden_compra_id), lineasOrden(s.org.id, rec.orden_compra_id)]) : [[], []];
  const faltan = renglones.filter((l) => l.variacion_id && l.recibido < l.cantidad);
  const abierta = rec.estado === "abierta";
  const devolucion = rec.tipo === "devolucion";

  return (
    <Pantalla titulo={`Recepción #${rec.id}`} ancho="max-w-2xl"
      subtitulo={[TIPO_RECEPCION[rec.tipo], rec.deposito, rec.proveedor, rec.documento, abierta ? `desde ${fechaHoraAR(rec.creado_ts)}` : `cerrada ${fechaHoraAR(rec.cerrada_ts)}`].filter(Boolean).join(" · ")}
      camino={[{ texto: `#${rec.id}` }]}>
      <Avisos sp={sp} />
      {rec.nota && <p className="text-xs text-[#5C6B76] mb-3">{rec.nota}</p>}
      {rec.venta_externa && (
        <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#EEF3F8] text-[#16577F]">
          Devolución de una venta anterior a Laucen: <b>{rec.venta_externa}</b>. No hay pedido acá; lo que se recibe entra igual como devolución.
          La nota de crédito se hace en <Link href="/administracion/facturacion/nota-credito" className="font-bold underline">Facturación › Nueva nota de crédito</Link>.
        </p>
      )}

      {rec.pedido_id && (
        <section className="mb-4">
          <h2 className="text-sm font-bold mb-2">
            Se espera que vuelva — <Link href={`/ventas/pedidos/${rec.pedido_id}`} className="text-[#16577F]">pedido #{rec.pedido_id}</Link>
            {rec.pedido_externo ? ` (${rec.pedido_externo})` : ""}
          </h2>
          <ul className="bg-white border border-[#E3E9F0] rounded-xl divide-y divide-[#E3E9F0]">
            {guia.map((g, i) => (
              <li key={i} className={`flex items-center gap-2 px-3 py-2 text-sm ${g.recibido >= g.cantidad ? "bg-[#F4FAF6]" : ""}`}>
                <span className="flex-1 min-w-0"><b>{g.sku ?? "—"}</b> <span className="text-xs">{g.titulo}</span></span>
                <span className="tabular-nums text-right">{g.recibido}/{g.cantidad}</span>
              </li>
            ))}
            {guia.length === 0 && <li className="px-3 py-2 text-sm text-[#5C6B76]">El pedido no tiene líneas.</li>}
          </ul>
        </section>
      )}

      {rec.orden_compra_id && (
        <section className="mb-5">
          <h2 className="text-sm font-bold mb-2">
            Orden <Link href={`/compras/ordenes/${rec.orden_compra_id}`} className="text-[#16577F]">{rec.orden}</Link>: cajas recibidas {cajas.filter((k) => k.recibida_ts).length} de {cajas.length}
          </h2>
          {abierta && cajas.length > 0 && (
            <RecibirCajas recepcion={rec.id} cajas={cajas.map((k) => ({ id: k.id, codigo: k.codigo, recibida: !!k.recibida_ts, items: k.items.map((i) => ({ id: i.id, sku: i.sku, cantidad: i.cantidad, enSistema: !!i.variacion_id })) }))} />
          )}
          {cajas.length === 0 && <p className="text-xs text-[#5C6B76]">La orden no tiene packing list: se recibe producto por producto, abajo.</p>}
          {cajas.some((k) => k.recibida_ts && k.en_ubicacion > 0) && (
            <details className="mt-3 bg-white border border-[#E3E9F0] rounded-xl p-3">
              <summary className="text-sm font-bold cursor-pointer">Sacar productos de una caja</summary>
              <form action={accionSacarDeCaja} className="grid gap-2 mt-2">
                <input type="hidden" name="recepcion_id" value={rec.id} />
                <label><span className={ETIQUETA}>Caja</span>
                  <select name="caja_id" className={`${CAMPO} w-full text-base py-2.5`}>
                    {cajas.filter((k) => k.recibida_ts && k.en_ubicacion > 0).map((k) => <option key={k.id} value={k.id}>{k.codigo} ({k.en_ubicacion} u.)</option>)}
                  </select></label>
                <label><span className={ETIQUETA}>Producto</span>
                  <select name="variacion_id" className={`${CAMPO} w-full text-base py-2.5`}>
                    {[...new Map(cajas.filter((k) => k.recibida_ts).flatMap((k) => k.items).filter((i) => i.variacion_id).map((i) => [i.variacion_id, i])).values()]
                      .map((i) => <option key={i.variacion_id!} value={i.variacion_id!}>{i.sku}</option>)}
                  </select></label>
                <label><span className={ETIQUETA}>Cuántas</span><input name="cantidad" inputMode="numeric" className={`${CAMPO} w-full text-base py-2.5 text-right`} /></label>
                <label><span className={ETIQUETA}>A qué ubicación (código)</span>
                  <input name="destino" list="ubicaciones-destino" className={`${CAMPO} w-full text-base py-2.5`} placeholder="Ej. A1-01" />
                  <datalist id="ubicaciones-destino">{ubicaciones.map((u) => <option key={u.codigo} value={u.codigo}>{u.descripcion ?? ""}</option>)}</datalist></label>
                <button className={`${PRIMARIO} ${GRANDE}`}>Pasar</button>
              </form>
            </details>
          )}
          {faltan.length > 0 && (
            <p className="text-[11px] text-[#5C6B76] mt-2">Falta recibir: {faltan.map((l) => `${l.cantidad - l.recibido} × ${l.sku_sistema}`).join(", ")}.</p>
          )}
        </section>
      )}

      {abierta ? (
        <div className="mb-5">
          {rec.orden_compra_id && <h2 className="text-sm font-bold mb-2">Producto por producto (sueltos o sin packing list)</h2>}
          <Recibir recepcion={rec.id} devolucion={devolucion} ubicaciones={ubicaciones} />
        </div>
      ) : (
        <p className="mb-4"><Estado texto="Cerrada" tono="gris" /></p>
      )}

      <h2 className="text-sm font-bold mb-2">Recibido: {unidades} unidad{unidades === 1 ? "" : "es"} en {lineas.length} línea{lineas.length === 1 ? "" : "s"}</h2>
      <div className={`${CAJA_TABLA} mb-5`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Producto</th><th className={TH}>Ubicación</th><th className={THN}>Cant.</th><th className={TH}>Hora</th></tr>
          </thead>
          <tbody>
            {lineas.length === 0 && <tr><td colSpan={4} className={`${TD} text-[#5C6B76]`}>Todavía no se recibió nada.</td></tr>}
            {lineas.map((l) => (
              <tr key={l.id} className={TR}>
                <td className={TD}><Link href={`/catalogo/productos/${l.producto_id}`} className="font-bold text-[#16577F] hover:underline">{l.sku}</Link> <span className="text-[#5C6B76]">{l.titulo}</span></td>
                <td className={`${TD} whitespace-nowrap`}>
                  {l.ubicacion}{l.condicion === "caja_abierta" && <> <Estado texto={`caja abierta · ${l.deposito}`} tono="amarillo" /></>}
                </td>
                <td className={TDN}>{l.cantidad}</td>
                <td className={`${TD} whitespace-nowrap text-[#5C6B76]`}>{fechaHoraAR(l.creado_ts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {abierta && (
        <div>
          <BotonConfirmar accion={accionCerrarRecepcion} campos={{ id: String(rec.id) }} clase={`${VERDE} ${GRANDE} w-full`} texto="Cerrar recepción"
            pregunta={devolucion && rec.pedido_id ? `El pedido #${rec.pedido_id} queda "devuelto". ¿Cerrar?`
              : rec.orden_compra_id ? `La orden ${rec.orden} queda recibida${faltan.length ? ` (faltan ${faltan.reduce((t, l) => t + l.cantidad - l.recibido, 0)} u.)` : ""}. ¿Cerrar?` : "¿Cerrar la recepción?"} corriendo="Cerrando…" />
          {devolucion && rec.pedido_id && <p className="text-[11px] text-[#5C6B76] mt-1">Al cerrar, el pedido #{rec.pedido_id} pasa a "devuelto".</p>}
        </div>
      )}
    </Pantalla>
  );
}
