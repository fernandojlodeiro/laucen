// La pantalla de trabajo de una recepción: el lector con cantidad y
// ubicación, lo que se espera que vuelva (si es de un pedido), lo recibido
// con sus totales, y "Cerrar recepción".

import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { SUAVE, VERDE } from "@/app/botones";
import { BotonConfirmar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { fechaHoraAR, GRANDE, TIPO_RECEPCION } from "../../formato";
import { accionCerrarRecepcion } from "../acciones";
import Recibir from "./Recibir";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

export default async function RecepcionTrabajo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("recepcion_ver");
  const recId = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(recId) || recId <= 0) notFound();
  const rec = await una<{
    id: number; tipo: string; estado: string; deposito_id: number; deposito: string; proveedor: string | null; pedido_id: number | null;
    pedido_externo: string | null; pedido_estado: string | null; documento: string | null; nota: string | null; creado_ts: Date; cerrada_ts: Date | null;
  }>(`
    select r.id::int, r.tipo, r.estado, r.deposito_id::int, d.nombre deposito, pr.nombre proveedor, r.pedido_id::int,
           p.id_externo pedido_externo, p.estado pedido_estado, r.documento, r.nota, r.creado_ts, r.cerrada_ts
      from recepcion r join deposito d on d.id = r.deposito_id left join proveedor pr on pr.id = r.proveedor_id
      left join pedido p on p.id = r.pedido_id
     where r.id = $1 and r.organizacion_id = $2`, [recId, s.org.id]);
  if (!rec) notFound();

  const [lineas, ubicaciones, guia] = await Promise.all([
    consulta<{ id: number; sku: string; titulo: string; ubicacion: string; deposito: string; cantidad: number; condicion: string; creado_ts: Date }>(`
      select l.id::int, v.sku, titulo_variacion(v.id) titulo, u.codigo ubicacion, d.nombre deposito, l.cantidad, l.condicion, l.creado_ts
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
  const abierta = rec.estado === "abierta";
  const devolucion = rec.tipo === "devolucion";

  return (
    <Pantalla titulo={`Recepción #${rec.id}`} ancho="max-w-2xl"
      subtitulo={[TIPO_RECEPCION[rec.tipo], rec.deposito, rec.proveedor, rec.documento, abierta ? `desde ${fechaHoraAR(rec.creado_ts)}` : `cerrada ${fechaHoraAR(rec.cerrada_ts)}`].filter(Boolean).join(" · ")}
      acciones={<Link href="/deposito/recepcion" className={SUAVE}>Volver</Link>}>
      <Avisos sp={sp} />
      {rec.nota && <p className="text-xs text-[#5C6B76] mb-3">{rec.nota}</p>}

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

      {abierta ? (
        <div className="mb-5"><Recibir recepcion={rec.id} devolucion={devolucion} ubicaciones={ubicaciones} /></div>
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
                <td className={TD}><b>{l.sku}</b> <span className="text-[#5C6B76]">{l.titulo}</span></td>
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
            pregunta={devolucion && rec.pedido_id ? `El pedido #${rec.pedido_id} queda "devuelto". ¿Cerrar?` : "¿Cerrar la recepción?"} corriendo="Cerrando…" />
          {devolucion && rec.pedido_id && <p className="text-[11px] text-[#5C6B76] mt-1">Al cerrar, el pedido #{rec.pedido_id} pasa a "devuelto".</p>}
        </div>
      )}
    </Pantalla>
  );
}
