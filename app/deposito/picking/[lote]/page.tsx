// La pantalla de un lote, con tres maneras de trabajar (pestañas; la de
// entrada es la que se eligió al armarlo):
//   - Hojas (la principal): imprimir/reimprimir etiqueta + hoja de cada
//     pedido, y cerrar cada pedido con "Preparado" o escaneando su hoja.
//   - Empacar escaneando (alternativo): en la mesa, cada producto escaneado
//     dice a qué pedido va; el pedido completo se cierra e imprime su etiqueta.
//   - Recorrido: el avance, el ítem que toca (por orden de recorrido) con su
//     ubicación bien grande, el lector, y la lista con corrección en la fila.
// Al terminar muestra qué pedidos quedaron preparados y sus etiquetas.

import Link from "next/link";
import { notFound } from "next/navigation";
import { una } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { itemsDelLote, pedidosDelLote, esModoLote, type ItemPicking, type PedidoDelLote, type ModoLote } from "@/lib/deposito/picking";
import { SUAVE, VERDE, APAGAR, PRIMARIO } from "@/app/botones";
import { BotonConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import { entrarErp, Pantalla, Avisos, Lapiz, Estado, CAJA, CAMPO, ETIQUETA, url } from "@/app/componentes/erp";
import { fechaHoraAR, GRANDE } from "../../formato";
import { accionCorregirItem, accionTerminarLote, accionCancelarLote, accionPreparado } from "../acciones";
import Trabajo from "./Trabajo";
import CerrarPorCodigo from "./CerrarPorCodigo";
import Empacar from "./Empacar";
import Pestanas from "@/app/componentes/Pestanas";
import { MarcaCarritoEspera } from "@/app/componentes/CarritoEspera";
import { SelectorTam, tamElegido } from "../Tamano";
import { tienePermiso } from "@/lib/permisos";

export const dynamic = "force-dynamic";

type SP = { editar?: string; ver?: string; ok?: string; error?: string };
type PedidoLote = PedidoDelLote;

export default async function LotePicking({ params, searchParams }: { params: Promise<{ lote: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("picking_ver");
  const loteId = Number((await params).lote);
  const sp = await searchParams;
  if (!Number.isInteger(loteId) || loteId <= 0) notFound();
  const lote = await una<{ id: number; estado: string; modo: string; deposito_id: number; deposito: string; creado_ts: Date; terminado_ts: Date | null }>(`
    select l.id::int, l.estado, l.modo, l.deposito_id::int, d.nombre deposito, l.creado_ts, l.terminado_ts
      from picking_lote l join deposito d on d.id = l.deposito_id where l.id = $1 and l.organizacion_id = $2`, [loteId, s.org.id]);
  if (!lote) notFound();

  const [items, pedidos, tam] = await Promise.all([itemsDelLote(s.org.id, loteId), pedidosDelLote(s.org.id, loteId), tamElegido()]);
  const pedidoDe = new Map(pedidos.map((p) => [p.id, p]));
  const total = items.reduce((a, i) => a + i.cantidad, 0);
  const hechas = items.reduce((a, i) => a + Math.min(i.escaneado, i.cantidad), 0);
  const faltantes = items.reduce((a, i) => a + i.faltante, 0);
  const pct = total ? Math.round((100 * hechas) / total) : 0;
  const volverLista = url("/deposito/picking", { d: lote.deposito_id });
  const titulo = `Lote #${lote.id}`;

  if (lote.estado !== "abierto") {
    return (
      <Pantalla titulo={titulo} subtitulo={`${lote.deposito} · ${lote.estado === "terminado" ? "terminado" : "cancelado"} ${fechaHoraAR(lote.terminado_ts)}`} ancho="max-w-2xl"
        camino={[{ texto: lote.deposito, href: volverLista }, { texto: `#${lote.id}` }]}>
        <Avisos sp={sp} />
        {lote.estado === "terminado" ? <Resultado loteId={loteId} items={items} pedidos={pedidos} tam={tam} /> : (
          <p className="text-sm text-[#5C6B76] mb-4">Este lote se canceló: sus pedidos volvieron a la lista para preparar.</p>
        )}
        <ListaItems items={items} pedidoDe={pedidoDe} loteId={loteId} editar={0} abierto={false} />
      </Pantalla>
    );
  }

  const actual = items.find((i) => i.escaneado + i.faltante < i.cantidad);
  const editar = Number(sp.editar) || 0;
  const ver: ModoLote = esModoLote(sp.ver) ? sp.ver : esModoLote(lote.modo) ? lote.modo : "recorrido";
  const preparados = pedidos.filter((p) => p.preparado_ts).length;
  // Cerrar un pedido sin escanear sus productos (provisorio, con permiso).
  const sinEscanear = tienePermiso(s.permisos, "picking_sin_escanear");
  // Los que al terminar no pasan a preparado (ni marcados ni con todo escaneado).
  const completo = new Map<number, boolean>();
  for (const i of items) completo.set(i.pedido_id, (completo.get(i.pedido_id) ?? true) && i.escaneado >= i.cantidad);
  const sinCerrar = pedidos.filter((p) => !(p.preparado_ts || completo.get(p.id))).map((p) => `#${p.id}`);
  const impresos = pedidos.filter((p) => p.impreso_ts).length;
  const pestanas: [ModoLote, string][] = [["hojas", "Etiquetas y hojas"], ["empacar", "Empacar escaneando (alternativo)"], ["recorrido", "Recorrer escaneando"]];

  return (
    <Pantalla titulo={titulo} subtitulo={`${lote.deposito} · ${pedidos.length} pedido${pedidos.length === 1 ? "" : "s"} · ${preparados} preparado${preparados === 1 ? "" : "s"}`} ancho="max-w-2xl"
      camino={[{ texto: lote.deposito, href: volverLista }, { texto: `#${lote.id}` }]}>
      <Avisos sp={sp} />

      <Pestanas className="mb-3" items={pestanas.map(([k, t]) => ({ clave: k, texto: t, activa: ver === k, href: url(`/deposito/picking/${loteId}`, { ver: k }) }))} />

      {ver === "hojas" && (
        <>
          {/* Imprimir (o reimprimir) etiqueta + hoja de todos los pedidos del lote. */}
          <form action="/deposito/hojas" method="get" target="_blank" className={`${CAJA} mb-3 flex flex-wrap items-center gap-2`}>
            <input type="hidden" name="lote" value={loteId} />
            <button className={`${impresos ? SUAVE : PRIMARIO} ${GRANDE}`}>🖨 {impresos ? "Reimprimir etiquetas y hojas" : "Imprimir etiquetas y hojas"}</button>
            <SelectorTam tam={tam} />
            {impresos > 0 && <span className="text-[11px] text-[#5C6B76]">Ya impresas: la hoja sale marcada «REIMPRESIÓN».</span>}
          </form>
          {sinEscanear ? (
            <>
              <div className="mb-2 text-sm font-bold">Cerrar un pedido escaneando su etiqueta (Mercado Libre u OCA; sin etiqueta, el N.º de la hoja)</div>
              <div className="mb-4"><CerrarPorCodigo lote={loteId} /></div>
            </>
          ) : (
            <p className={`${CAJA} mb-4 text-sm text-[#5C6B76]`}>
              Para cerrar un pedido, escaneá o escribí cada producto en la pestaña <Link href={url(`/deposito/picking/${loteId}`, { ver: "empacar" })} className="underline">Empacar escaneando</Link>.
              Darlo por preparado sin escanear pide el permiso «Preparar sin escanear».
            </p>
          )}
          <ListaPedidos pedidos={pedidos} loteId={loteId} ver={ver} tam={tam} sinEscanear={sinEscanear} />
        </>
      )}

      {ver === "empacar" && (
        <>
          <div className="mb-4"><Empacar lote={loteId} tam={tam} /></div>
          <ListaPedidos pedidos={pedidos} loteId={loteId} ver={ver} tam={tam} sinEscanear={sinEscanear} />
        </>
      )}

      {ver === "recorrido" && (
        <>
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
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {sinCerrar.length ? (
          // Avisa ahí mismo qué pedidos no van a quedar preparados.
          <div className="flex-1">
            <BotonConfirmar accion={accionTerminarLote} campos={{ lote: String(loteId) }} clase={`${SUAVE} ${GRANDE} w-full`} texto="Terminar lote" corriendo="Terminando…"
              pregunta={sinCerrar.length === 1
                ? `El ${sinCerrar[0]} no está preparado: queda en preparación y vuelve a la lista. ¿Terminar igual?`
                : `${sinCerrar.length} pedidos (${sinCerrar.join(", ")}) no están preparados: quedan en preparación y vuelven a la lista. ¿Terminar igual?`} />
          </div>
        ) : (
          <form action={accionTerminarLote} className="flex-1">
            <input type="hidden" name="lote" value={loteId} />
            <button className={`${VERDE} ${GRANDE} w-full`}>Terminar lote</button>
          </form>
        )}
        <BotonConfirmar accion={accionCancelarLote} campos={{ lote: String(loteId), d: String(lote.deposito_id) }}
          clase={`${APAGAR} ${GRANDE}`} texto="Cancelar lote" pregunta="¿Cancelar este lote?" corriendo="Cancelando…" />
      </div>
      {sinCerrar.length > 0 && <p className="text-[11px] text-[#5C6B76] -mt-3 mb-5">Si terminás el lote con pedidos sin cerrar, quedan en preparación y vuelven a la lista.</p>}

      <ListaItems items={items} pedidoDe={pedidoDe} loteId={loteId} editar={editar} abierto />
    </Pantalla>
  );
}

/** Los pedidos del lote: cada uno con su "Preparado" (o la marca de que ya
 *  está), cuántas veces se imprimió, y la espera del carrito si la tiene. */
function ListaPedidos({ pedidos, loteId, ver, tam, sinEscanear }: { pedidos: PedidoLote[]; loteId: number; ver: string; tam: string; sinEscanear: boolean }) {
  return (
    <section className="mb-5">
      <h2 className="text-sm font-bold mb-2">Pedidos del lote ({pedidos.length})</h2>
      <ul className="space-y-2">
        {pedidos.map((p) => (
          <li key={p.id} className={`${CAJA} flex flex-wrap items-center gap-3 ${p.preparado_ts ? "bg-[#F4FAF6] border-[#BFE0CD]" : ""}`}>
            <div className="flex-1 min-w-0 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/ventas/pedidos/${p.id}`} className="text-lg font-black text-[#16577F]">#{p.id}</Link>
                {p.id_externo && <span className="text-xs text-[#5C6B76]">{p.id_externo}</span>}
                {p.en_espera && <MarcaCarritoEspera ts={p.carrito_ultimo_evento_ts} texto="Carrito: esperando" />}
                {p.a_cobrar && <Estado texto={`A cobrar ${formatear(p.total_ars, "ARS")}`} tono="ambar" />}
                {p.impresiones > 1 && <Estado texto={`impreso ${p.impresiones} veces`} tono="gris" />}
                {p.impresiones === 1 && <Estado texto="impreso" tono="gris" />}
              </div>
              <div className="truncate">{p.cliente ?? "Sin cliente"}{p.apodo ? ` (${p.apodo})` : ""} · <span className="text-[#5C6B76]">{p.canal}</span></div>
              <div className="text-xs text-[#5C6B76]">
                {p.unidades} unidad{p.unidades === 1 ? "" : "es"}{ver === "empacar" && !p.preparado_ts ? ` · empacadas ${p.escaneadas}` : ""}
                {p.despachar_antes && <> · Despachar antes: {fechaHoraAR(p.despachar_antes)}</>}
              </div>
            </div>
            {p.preparado_ts ? (
              <span className="text-sm font-bold text-[#1F6E4A]">Preparado ✓ <span className="font-normal text-xs">{fechaHoraAR(p.preparado_ts)}</span></span>
            ) : p.en_espera ? (
              <button type="button" disabled className={`${SUAVE} ${GRANDE} opacity-50 cursor-not-allowed`} title="Un carrito de Mercado Libre se cierra 10 min después de su último ítem">Esperando</button>
            ) : !sinEscanear ? null : (
              <form action={accionPreparado}>
                <input type="hidden" name="lote" value={loteId} />
                <input type="hidden" name="pedido" value={p.id} />
                <input type="hidden" name="ver" value={ver} />
                <button className={`${VERDE} ${GRANDE}`}>Preparado</button>
              </form>
            )}
            {ver === "empacar" && p.preparado_ts && (
              <a href={`/deposito/hojas?lote=${loteId}&p=${p.id}&solo=etiqueta&tam=${encodeURIComponent(tam)}`} target="_blank" rel="noreferrer" className={SUAVE}>🖨 Etiqueta</a>
            )}
          </li>
        ))}
      </ul>
    </section>
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

/** Qué pedidos quedaron preparados y cuáles incompletos, con sus etiquetas
 *  (las de Mercado Libre y las nuestras) y la reimpresión de las hojas. */
function Resultado({ loteId, items, pedidos, tam }: { loteId: number; items: ItemPicking[]; pedidos: PedidoLote[]; tam: Awaited<ReturnType<typeof tamElegido>> }) {
  const completo = new Map<number, boolean>();
  for (const i of items) completo.set(i.pedido_id, (completo.get(i.pedido_id) ?? true) && i.escaneado >= i.cantidad);
  const preparados = pedidos.filter((p) => p.preparado_ts || completo.get(p.id));
  const incompletos = pedidos.filter((p) => !(p.preparado_ts || completo.get(p.id)));
  const nombre = (p: PedidoLote) => `#${p.id}${p.id_externo ? ` (${p.id_externo})` : ""}${p.cliente ? ` · ${p.cliente}` : ""}`;
  const t = encodeURIComponent(tam);

  return (
    <div className="space-y-3 mb-5">
      <div className={CAJA}>
        <h2 className="text-sm font-bold text-[#1F6E4A] mb-1">Preparados ({preparados.length})</h2>
        {preparados.length ? <ul className="text-sm space-y-0.5">{preparados.map((p) => <li key={p.id}>{nombre(p)}</li>)}</ul>
          : <p className="text-sm text-[#5C6B76]">Ninguno.</p>}
        {preparados.length > 0 && (
          <form action="/deposito/hojas" method="get" target="_blank" className="flex flex-wrap items-center gap-2 mt-2">
            <input type="hidden" name="lote" value={loteId} />
            <input type="hidden" name="p" value={preparados.map((p) => p.id).join(",")} />
            <button className={`${PRIMARIO} ${GRANDE}`}>🖨 Imprimir etiquetas y hojas</button>
            <SelectorTam tam={tam} />
            <a href={`/deposito/hojas?lote=${loteId}&p=${preparados.map((p) => p.id).join(",")}&solo=etiqueta&tam=${t}`} target="_blank" rel="noreferrer"
              className={`${SUAVE} ${GRANDE} inline-block`}>Sólo las etiquetas</a>
          </form>
        )}
      </div>
      {incompletos.length > 0 && (
        <div className={CAJA}>
          <h2 className="text-sm font-bold text-[#C03420] mb-1">Incompletos ({incompletos.length})</h2>
          <ul className="text-sm space-y-0.5">{incompletos.map((p) => <li key={p.id}>{nombre(p)}</li>)}</ul>
          <p className="text-[11px] text-[#5C6B76] mt-1">Quedan en preparación y vuelven a la lista para el próximo lote.</p>
        </div>
      )}
    </div>
  );
}
