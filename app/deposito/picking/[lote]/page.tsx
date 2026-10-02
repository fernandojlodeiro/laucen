// La pantalla de trabajo de un picking: el avance, el ítem que toca (por
// orden de recorrido) con su ubicación bien grande, el lector, y la lista
// completa con corrección en la fila. Al terminar muestra qué pedidos
// quedaron preparados y el link a sus etiquetas de Mercado Libre.

import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { itemsDelLote, type ItemPicking } from "@/lib/deposito/picking";
import { SUAVE, VERDE, APAGAR, PRIMARIO } from "@/app/botones";
import { BotonConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import { entrarErp, Pantalla, Avisos, Lapiz, Estado, CAJA, CAMPO, ETIQUETA, url } from "@/app/componentes/erp";
import { fechaHoraAR, GRANDE } from "../../formato";
import { accionCorregirItem, accionTerminarLote, accionCancelarLote } from "../acciones";
import Trabajo from "./Trabajo";

export const dynamic = "force-dynamic";

type SP = { editar?: string; ok?: string; error?: string };
type PedidoLote = { id: number; id_externo: string | null; cliente: string | null; estado: string };

export default async function LotePicking({ params, searchParams }: { params: Promise<{ lote: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("picking_ver");
  const loteId = Number((await params).lote);
  const sp = await searchParams;
  if (!Number.isInteger(loteId) || loteId <= 0) notFound();
  const lote = await una<{ id: number; estado: string; deposito_id: number; deposito: string; creado_ts: Date; terminado_ts: Date | null }>(`
    select l.id::int, l.estado, l.deposito_id::int, d.nombre deposito, l.creado_ts, l.terminado_ts
      from picking_lote l join deposito d on d.id = l.deposito_id where l.id = $1 and l.organizacion_id = $2`, [loteId, s.org.id]);
  if (!lote) notFound();

  const [items, pedidos] = await Promise.all([
    itemsDelLote(s.org.id, loteId),
    consulta<PedidoLote>(`
      select p.id::int, p.id_externo, cl.nombre cliente, p.estado
        from picking_pedido pp join pedido p on p.id = pp.pedido_id left join cliente cl on cl.id = p.cliente_id
       where pp.lote_id = $1 and pp.organizacion_id = $2 order by p.id`, [loteId, s.org.id]),
  ]);
  const pedidoDe = new Map(pedidos.map((p) => [p.id, p]));
  const total = items.reduce((a, i) => a + i.cantidad, 0);
  const hechas = items.reduce((a, i) => a + Math.min(i.escaneado, i.cantidad), 0);
  const faltantes = items.reduce((a, i) => a + i.faltante, 0);
  const pct = total ? Math.round((100 * hechas) / total) : 0;
  const volverLista = url("/deposito/picking", { d: lote.deposito_id });
  const titulo = `Picking #${lote.id}`;

  if (lote.estado !== "abierto") {
    return (
      <Pantalla titulo={titulo} subtitulo={`${lote.deposito} · ${lote.estado === "terminado" ? "terminado" : "cancelado"} ${fechaHoraAR(lote.terminado_ts)}`} ancho="max-w-2xl"
        acciones={<Link href={volverLista} className={SUAVE}>Volver a picking</Link>}>
        <Avisos sp={sp} />
        {lote.estado === "terminado" ? <Resultado org={s.org.id} items={items} pedidos={pedidos} /> : (
          <p className="text-sm text-[#5C6B76] mb-4">Este picking se canceló: sus pedidos volvieron a la lista para preparar.</p>
        )}
        <ListaItems items={items} pedidoDe={pedidoDe} loteId={loteId} editar={0} abierto={false} />
      </Pantalla>
    );
  }

  const actual = items.find((i) => i.escaneado + i.faltante < i.cantidad);
  const editar = Number(sp.editar) || 0;

  return (
    <Pantalla titulo={titulo} subtitulo={`${lote.deposito} · ${pedidos.length} pedido${pedidos.length === 1 ? "" : "s"}`} ancho="max-w-2xl"
      acciones={<Link href={volverLista} className={SUAVE}>Volver</Link>}>
      <Avisos sp={sp} />

      {/* Avance */}
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span><b className="text-lg">{hechas}</b> de {total} unidades</span>
          <span className="text-[#5C6B76]">{faltantes ? `${faltantes} faltante(s) · ` : ""}{pct}%</span>
        </div>
        <div className="h-3 rounded-full bg-[#EEF1F4] overflow-hidden">
          <div className="h-full bg-[#167655] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* El ítem que toca */}
      {actual ? <ItemActual i={actual} pedido={pedidoDe.get(actual.pedido_id)} /> : (
        <div className={`${CAJA} mb-3 text-center bg-[#EEF7F1] border-[#BFE0CD]`}>
          <p className="text-lg font-bold text-[#1F6E4A]">Todo escaneado ✓</p>
          <p className="text-sm text-[#5C6B76]">Apretá "Terminar" para dejar los pedidos preparados.</p>
        </div>
      )}

      <div className="mb-4"><Trabajo lote={loteId} /></div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <form action={accionTerminarLote} className="flex-1">
          <input type="hidden" name="lote" value={loteId} />
          <button className={`${actual ? PRIMARIO : VERDE} ${GRANDE} w-full`}>Terminar</button>
        </form>
        <BotonConfirmar accion={accionCancelarLote} campos={{ lote: String(loteId), d: String(lote.deposito_id) }}
          clase={`${APAGAR} ${GRANDE}`} texto="Cancelar picking" pregunta="¿Cancelar este picking?" corriendo="Cancelando…" />
      </div>
      {actual && <p className="text-[11px] text-[#5C6B76] -mt-3 mb-5">Si terminás con cosas sin escanear, esos pedidos quedan incompletos (en preparación) para el próximo picking.</p>}

      <ListaItems items={items} pedidoDe={pedidoDe} loteId={loteId} editar={editar} abierto />
    </Pantalla>
  );
}

function ItemActual({ i, pedido }: { i: ItemPicking; pedido?: PedidoLote }) {
  const faltan = i.cantidad - i.escaneado - i.faltante;
  return (
    <div className={`${CAJA} mb-3 border-2 border-[#16577F]`}>
      <div className="text-[11px] font-semibold text-[#5C6B76] uppercase tracking-wide">Ubicación</div>
      <div className="text-4xl font-black text-[#16577F] leading-tight mb-2 break-all">{i.ubicacion}</div>
      <div className="flex gap-3">
        {i.foto
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={i.foto} alt="" className="w-24 h-24 object-contain rounded-lg border border-[#E3E9F0] bg-white shrink-0" />
          : <div className="w-24 h-24 rounded-lg border border-[#E3E9F0] bg-[#FAFBFC] shrink-0 flex items-center justify-center text-[11px] text-[#9AA7B3]">sin foto</div>}
        <div className="min-w-0">
          <div className="text-base font-bold break-all">{i.sku}</div>
          <div className="text-sm leading-snug">{i.titulo}</div>
          <div className="text-lg font-bold mt-1">Faltan {faltan} de {i.cantidad}</div>
          {i.kit && <div className="text-xs text-[#8a6100]">Es parte del kit {i.kit}</div>}
          <div className="text-xs text-[#5C6B76]">Pedido #{i.pedido_id}{pedido?.cliente ? ` · ${pedido.cliente}` : ""}</div>
        </div>
      </div>
    </div>
  );
}

function ListaItems({ items, pedidoDe, loteId, editar, abierto }: {
  items: ItemPicking[]; pedidoDe: Map<number, PedidoLote>; loteId: number; editar: number; abierto: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-bold mb-2">Recorrido ({items.length} ítems)</h2>
      <ul className="bg-white border border-[#E3E9F0] rounded-xl divide-y divide-[#E3E9F0]">
        {items.map((i) => {
          const hecho = i.escaneado >= i.cantidad;
          if (abierto && editar === i.id) {
            return (
              <li key={i.id} className="p-3 bg-[#FAFBFC]">
                <div className="text-sm mb-2"><b>{i.ubicacion}</b> · {i.sku} · pide {i.cantidad}</div>
                <form action={accionCorregirItem} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="lote" value={loteId} />
                  <label><span className={ETIQUETA}>Escaneadas</span>
                    <CampoNumero name="escaneado" valor={i.escaneado} tipo="entero" className={`${CAMPO} w-20 text-base`} /></label>
                  <label><span className={ETIQUETA}>Faltantes</span>
                    <CampoNumero name="faltante" valor={i.faltante} tipo="entero" className={`${CAMPO} w-20 text-base`} /></label>
                  <button className={VERDE}>Guardar</button>
                  <Link href={`/deposito/picking/${loteId}`} className={SUAVE} scroll={false}>Cancelar</Link>
                </form>
              </li>
            );
          }
          return (
            <li key={i.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${hecho ? "bg-[#F4FAF6]" : ""}`}>
              <span className={`w-20 shrink-0 font-bold break-all ${hecho ? "text-[#1F6E4A]" : "text-[#16577F]"}`}>{i.ubicacion}</span>
              <span className={`flex-1 min-w-0 ${hecho ? "line-through text-[#5C6B76]" : ""}`}>
                <span className="font-semibold">{i.sku}</span> <span className="text-xs">{i.titulo}</span>
                <span className="block text-[11px] text-[#5C6B76] no-underline">
                  #{i.pedido_id}{pedidoDe.get(i.pedido_id)?.cliente ? ` · ${pedidoDe.get(i.pedido_id)!.cliente}` : ""}{i.kit ? ` · kit ${i.kit}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                {i.escaneado}/{i.cantidad}
                {i.faltante > 0 && <span className="block"><Estado texto={`faltan ${i.faltante}`} tono="rojo" /></span>}
              </span>
              {abierto && <Lapiz href={`/deposito/picking/${loteId}?editar=${i.id}`} etiqueta="Corregir" />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Qué pedidos quedaron preparados (todo escaneado) y cuáles incompletos, con
 *  el link a las etiquetas de Mercado Libre de los preparados (sin Full). */
async function Resultado({ org, items, pedidos }: { org: string; items: ItemPicking[]; pedidos: PedidoLote[] }) {
  const completo = new Map<number, boolean>();
  for (const i of items) completo.set(i.pedido_id, (completo.get(i.pedido_id) ?? true) && i.escaneado >= i.cantidad);
  const preparados = pedidos.filter((p) => completo.get(p.id));
  const incompletos = pedidos.filter((p) => !completo.get(p.id));
  // La ruta de etiquetas imprime de a una cuenta de Mercado Libre: un link por canal.
  const envios = preparados.length ? await consulta<{ canal: string | null; ids: string }>(`
    select ca.nombre canal, string_agg(e.id::text, ',' order by e.id) ids
      from envio e left join canal ca on ca.id = e.canal_id
     where e.organizacion_id = $1 and e.pedido_id = any($2::bigint[]) and e.id_externo is not null
       and coalesce(e.logistica, '') <> 'fulfillment'
     group by ca.nombre order by ca.nombre`, [org, preparados.map((p) => p.id)]) : [];
  const nombre = (p: PedidoLote) => `#${p.id}${p.id_externo ? ` (${p.id_externo})` : ""}${p.cliente ? ` · ${p.cliente}` : ""}`;

  return (
    <div className="space-y-3 mb-5">
      <div className={CAJA}>
        <h2 className="text-sm font-bold text-[#1F6E4A] mb-1">Preparados ({preparados.length})</h2>
        {preparados.length ? <ul className="text-sm space-y-0.5">{preparados.map((p) => <li key={p.id}>{nombre(p)}</li>)}</ul>
          : <p className="text-sm text-[#5C6B76]">Ninguno.</p>}
        {envios.map((e) => (
          <a key={e.canal ?? "-"} href={`/ventas/envios/etiquetas?ids=${e.ids}&formato=pdf`} target="_blank" rel="noreferrer"
            className={`${PRIMARIO} ${GRANDE} inline-block mt-2 mr-2`}>
            🖨 Imprimir etiquetas{envios.length > 1 && e.canal ? ` de ${e.canal}` : ""}
          </a>
        ))}
      </div>
      {incompletos.length > 0 && (
        <div className={CAJA}>
          <h2 className="text-sm font-bold text-[#C03420] mb-1">Incompletos ({incompletos.length})</h2>
          <ul className="text-sm space-y-0.5">{incompletos.map((p) => <li key={p.id}>{nombre(p)}</li>)}</ul>
          <p className="text-[11px] text-[#5C6B76] mt-1">Quedan en preparación y vuelven a la lista para el próximo picking.</p>
        </div>
      )}
    </div>
  );
}
