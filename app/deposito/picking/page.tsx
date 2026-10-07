// Picking: elegir depósito, ver los pedidos para preparar (lo más urgente
// primero) y, el camino principal, tildarlos e "Imprimir etiquetas y hojas":
// un PDF con la etiqueta y la hoja de preparación de cada pedido; los
// impresos entran en un lote abierto, donde cada pedido se cierra con
// "Preparado" o escaneando su hoja. Alternativos: empacar escaneando cada
// producto en la mesa, o recorrer el depósito escaneando. Debajo, los lotes
// abiertos y los últimos terminados. Pensada para el celular.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { hoyAR, formatear } from "@/lib/moneda";
import { pedidosParaPreparar, envioDe, GRUPOS_ENVIO } from "@/lib/deposito/picking";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, Estado, CAJA, CAMPO, url } from "@/app/componentes/erp";
import { diaAR, fechaHoraAR, GRANDE } from "../formato";
import { accionCrearLote } from "./acciones";
import { MarcaCarritoEspera } from "@/app/componentes/CarritoEspera";
import { BotonImprimirHojas } from "./Imprimir";
import TildarTodos from "./TildarTodos";
import RecordarEnvio from "./RecordarEnvio";
import { COOKIE_ENVIO } from "@/lib/deposito/picking-envio";
import Pestanas from "@/app/componentes/Pestanas";
import { FiltroVivo, CasillaViva } from "@/app/componentes/BuscadorVivo";
import { cookies } from "next/headers";
import { SelectorTam, tamElegido } from "./Tamano";
import PreparadoRapido from "./PreparadoRapido";
import { tienePermiso } from "@/lib/permisos";

export const dynamic = "force-dynamic";

type SP = { d?: string; ok?: string; error?: string; envio?: string; orden?: string; carritos?: string };

type Lote = { id: number; creado_ts: Date; terminado_ts: Date | null; estado: string; modo: string; pedidos: number; preparados: number; total: number; hechas: number; faltantes: number };

const MODO: Record<string, string> = { hojas: "con hojas", empacar: "empacar escaneando", recorrido: "recorrido escaneando" };

export default async function Picking({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("picking_ver");
  const sp = await searchParams;
  const depositos = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from deposito where organizacion_id = $1 and estado = 'activo' and tipo <> 'full_ml' order by id", [s.org.id]);
  const dep = depositos.find((d) => d.id === Number(sp.d)) ?? depositos[0];

  if (!dep) {
    return (
      <Pantalla titulo="Picking" ancho="max-w-2xl">
        <p className="text-sm text-[#5C6B76]">No hay depósitos activos. Crealos en <Link href="/stock/depositos" className="underline">Stock → Depósitos</Link>.</p>
      </Pantalla>
    );
  }

  const tam = await tamElegido();
  const [pedidos, lotes] = await Promise.all([
    pedidosParaPreparar(s.org.id, dep.id),
    consulta<Lote>(`
      select l.id::int, l.creado_ts, l.terminado_ts, l.estado, l.modo,
             (select count(*)::int from picking_pedido where lote_id = l.id) pedidos,
             (select count(*)::int from picking_pedido where lote_id = l.id and preparado_ts is not null) preparados,
             coalesce(sum(i.cantidad), 0)::int total, coalesce(sum(least(i.escaneado, i.cantidad)), 0)::int hechas,
             coalesce(sum(i.faltante), 0)::int faltantes
        from picking_lote l left join picking_item i on i.lote_id = l.id
       where l.organizacion_id = $1 and l.deposito_id = $2
         and (l.estado = 'abierto' or l.id in (select id from picking_lote where organizacion_id = $1 and deposito_id = $2
                                                 and estado = 'terminado'
                                                 -- Un lote terminado sin nada propio (todos sus pedidos se volvieron a
                                                 -- armar en un lote posterior) no se lista: no dejó nada.
                                                 and exists (select 1 from picking_pedido pp where pp.lote_id = picking_lote.id
                                                               and not exists (select 1 from picking_pedido p2 where p2.pedido_id = pp.pedido_id and p2.lote_id > pp.lote_id))
                                               order by terminado_ts desc limit 10))
       group by l.id order by l.estado = 'abierto' desc, coalesce(l.terminado_ts, l.creado_ts) desc`, [s.org.id, dep.id]),
  ]);
  const hoy = hoyAR();
  // Filtro por tipo de envío (Fer, 6/10): pestañas cortas (se usa en el celular); la última queda recordada.
  const guardado = (await cookies()).get(COOKIE_ENVIO)?.value;
  const envio = [sp.envio, guardado].find((x) => x === "todos" || GRUPOS_ENVIO.some((g) => g.clave === x)) ?? "todos";
  const conEnvio = pedidos.map((p) => ({ ...p, ...envioDe(p) }));
  const cuenta = (g: string) => conEnvio.filter((p) => p.grupo === g).length;
  // Orden: "Despachar antes" (lo que vence primero; como venía) o "Más viejos primero" (por fecha de compra).
  const porFecha = sp.orden === "fecha";
  // "Carritos" (Fer, 6/10): sólo los pedidos que llevan más de un producto.
  const soloCarritos = sp.carritos === "1";
  const visibles = conEnvio.filter((p) => (envio === "todos" || p.grupo === envio) && (!soloCarritos || p.lineas > 1))
    .sort((a, b) => porFecha ? +new Date(a.fecha) - +new Date(b.fecha)
      : (a.despachar_antes ? +new Date(a.despachar_antes) : Infinity) - (b.despachar_antes ? +new Date(b.despachar_antes) : Infinity) || +new Date(a.fecha) - +new Date(b.fecha));
  const conParam = (x: Record<string, string | null>) => url("/deposito/picking", { d: depositos.length > 1 ? String(dep.id) : null, envio: envio === "todos" ? null : envio, orden: porFecha ? "fecha" : null, carritos: soloCarritos ? "1" : null, ...x });
  const abiertos = lotes.filter((l) => l.estado === "abierto");
  const terminados = lotes.filter((l) => l.estado !== "abierto");

  return (
    <Pantalla titulo="Picking" subtitulo="Imprimir etiqueta y hoja de cada pedido, prepararlo y cerrarlo" ancho="max-w-2xl">
      <Avisos sp={sp} />

      {depositos.length > 1 && (
        <form className="flex gap-2 mb-4">
          <select name="d" defaultValue={dep.id} className={`${CAMPO} flex-1 text-base py-2.5`} aria-label="Depósito">
            {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
          <button className={`${SUAVE} ${GRANDE}`}>Ver</button>
        </form>
      )}

      {tienePermiso(s.permisos, "picking_sin_escanear") && (
        <section className={`${CAJA} mb-5`}>
          <h2 className="text-sm font-bold">Preparado rápido</h2>
          <p className="text-[11px] text-[#5C6B76] mb-2">Escribí o escaneá el número de pedido: queda preparado con todo tildado, sin escanear cada producto.</p>
          <PreparadoRapido />
        </section>
      )}

      {abiertos.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold mb-2">Lotes abiertos ({abiertos.length})</h2>
          <div className="space-y-2">
            {abiertos.map((l) => <TarjetaLote key={l.id} l={l} />)}
          </div>
        </section>
      )}

      <h2 className="text-sm font-bold mb-2">Para preparar en {dep.nombre} ({pedidos.length})</h2>
      <RecordarEnvio valor={envio} />
      {pedidos.length > 0 && (
        <>
          <Pestanas chica className="mb-2" items={[
            { href: conParam({ envio: "todos" }), texto: "Todos", cuenta: pedidos.length, activa: envio === "todos", clave: "todos" },
            ...GRUPOS_ENVIO.map((g) => ({ href: conParam({ envio: g.clave }), texto: g.texto, cuenta: cuenta(g.clave), activa: envio === g.clave, clave: g.clave })),
          ]} />
          <div className="mb-1 flex flex-wrap items-center gap-x-4">
            <FiltroVivo parametro="orden" valor={porFecha ? "fecha" : ""} etiqueta="Orden">
              <option value="">Despachar antes</option>
              <option value="fecha">Más viejos primero</option>
            </FiltroVivo>
            <CasillaViva parametro="carritos" activo={soloCarritos} etiqueta={`Sólo carritos (${conEnvio.filter((p) => (envio === "todos" || p.grupo === envio) && p.lineas > 1).length})`}
              ayuda="Sólo los pedidos que llevan más de un producto." />
          </div>
        </>
      )}
      {visibles.length === 0 ? (
        <p className="text-sm text-[#5C6B76] mb-5">{pedidos.length ? (soloCarritos ? "No hay carritos (pedidos de más de un producto) para preparar acá." : "No hay pedidos de este tipo de envío para preparar.") : "No hay pedidos para preparar."}</p>
      ) : (
        <form action={accionCrearLote} className="mb-5">
          <input type="hidden" name="d" value={dep.id} />
          <TildarTodos total={visibles.filter((p) => !p.en_espera).length} />
          <div className="space-y-2">
            {visibles.map((p) => {
              const dia = diaAR(p.despachar_antes);
              const urgente = dia !== null && dia <= hoy;
              return (
                <div key={p.id} className={`${CAJA} flex items-start gap-3 ${urgente ? "border-[#E8B4AA] bg-[#FFF9F7]" : ""}`}>
                  <input type="checkbox" name="p" value={p.id} disabled={p.en_espera} className="mt-1 h-6 w-6 shrink-0 accent-[#16577F] disabled:opacity-40" aria-label={`Tildar pedido ${p.id}`} />
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/ventas/pedidos/${p.id}`} className="font-bold text-[#16577F]">#{p.id}</Link>
                      {p.id_externo && <span className="text-xs text-[#5C6B76]">{p.id_externo}</span>}
                      <Estado texto={p.marca} tono={p.grupo === "meli" ? "amarillo" : p.grupo === "oca" ? "azul" : p.grupo === "retiro" ? "verde" : "gris"} />
                      {p.estado === "en_preparacion" && <Estado texto="Ya empezado" tono="amarillo" />}
                      {p.a_cobrar && <Estado texto={`A cobrar ${formatear(p.total_ars, "ARS")}`} tono="ambar" />}
                      {p.en_espera && <MarcaCarritoEspera ts={p.carrito_ultimo_evento_ts} texto="Carrito: esperando" />}
                    </div>
                    <div className="truncate">{p.cliente ?? "Sin cliente"} · <span className="text-[#5C6B76]">{p.canal}</span></div>
                    <div className="text-xs text-[#5C6B76]">
                      {p.unidades} unidad{p.unidades === 1 ? "" : "es"} en {p.lineas} línea{p.lineas === 1 ? "" : "s"}
                      {p.despachar_antes && (
                        <> · <span className={urgente ? "font-bold text-[#C03420]" : ""}>Despachar antes: {fechaHoraAR(p.despachar_antes)}</span></>
                      )}
                    </div>
                    {/* Golpe de vista de lo que lleva (Fer, 6/10): hasta 5 productos en letra chica y "y N más". */}
                    {p.productos.length > 0 && (
                      <ul className="mt-1 text-[10px] leading-tight text-[#5C6B76]">
                        {p.productos.map((x, k) => <li key={k} className="truncate"><b className="text-[#1C2B36]">{x.cantidad}×</b> {x.texto}</li>)}
                        {p.lineas > p.productos.length && <li className="font-semibold text-[#1C2B36]">y {p.lineas - p.productos.length} más</li>}
                      </ul>
                    )}
                  </div>
                  {p.en_espera
                    ? <button type="button" disabled className={`${SUAVE} shrink-0 opacity-50 cursor-not-allowed`} title="Un carrito de Mercado Libre se prepara 10 min después de su último ítem">Esperando</button>
                    : <button name="solo" value={p.id} className={`${SUAVE} shrink-0`}>Preparar este</button>}
                </div>
              );
            })}
          </div>
          <div className="sticky bottom-20 md:bottom-10 mt-3 bg-[#F5F7FA]/95 rounded-xl p-2 shadow space-y-2">
            <div className="flex items-center justify-between gap-2">
              <SelectorTam tam={tam} />
              <span className="text-[11px] text-[#5C6B76]">Los impresos pasan a un lote abierto.</span>
            </div>
            <BotonImprimirHojas clase={`${PRIMARIO} ${GRANDE} w-full`}>🖨 Imprimir etiquetas y hojas</BotonImprimirHojas>
            <div className="flex flex-wrap gap-2">
              <BotonEnviar clase={`${SUAVE} flex-1`} corriendo="Armando…" nombre="modo" valor="empacar">Empacar escaneando (alternativo)</BotonEnviar>
              <BotonEnviar clase={`${SUAVE} flex-1`} corriendo="Armando…" nombre="modo" valor="recorrido">Recorrer escaneando</BotonEnviar>
            </div>
          </div>
        </form>
      )}

      {terminados.length > 0 && (
        <section>
          <h2 className="text-sm font-bold mb-2">Últimos terminados</h2>
          <div className="space-y-2">
            {terminados.map((l) => <TarjetaLote key={l.id} l={l} />)}
          </div>
        </section>
      )}
    </Pantalla>
  );
}

function TarjetaLote({ l }: { l: Lote }) {
  const pct = l.total ? Math.round((100 * l.hechas) / l.total) : 0;
  return (
    <Link href={`/deposito/picking/${l.id}`} className={`${CAJA} block hover:border-[#16577F]`}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-bold text-[#16577F]">Lote #{l.id} <span className="font-normal text-xs text-[#5C6B76]">· {MODO[l.modo] ?? l.modo}</span></span>
        <span className="text-xs text-[#5C6B76]">
          {l.estado === "abierto" ? `desde ${fechaHoraAR(l.creado_ts)}` : `terminado ${fechaHoraAR(l.terminado_ts)}`}
        </span>
      </div>
      <div className="text-xs text-[#5C6B76] mb-1">
        {l.pedidos} pedido{l.pedidos === 1 ? "" : "s"}{l.preparados ? ` (${l.preparados} preparado${l.preparados === 1 ? "" : "s"})` : ""} · {l.hechas} de {l.total} unidades{l.faltantes ? ` · ${l.faltantes} faltante(s)` : ""}
      </div>
      <div className="h-2 rounded-full bg-[#EEF1F4] overflow-hidden">
        <div className="h-full bg-[#167655]" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}
