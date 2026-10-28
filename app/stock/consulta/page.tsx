// Consulta de stock (orden 136, §7): qué hay de cada variación en cada
// depósito y ubicación, y sus últimos movimientos. Disponible = cantidad −
// reservado (puede dar negativo si se vendió de más). Un kit no tiene stock
// propio: su disponible se calcula de los componentes (stock_disponible_deposito).

import Link from "next/link";
import { cookies } from "next/headers";
import { RecordarDeposito, ElegirDeposito, CantidadUbicaciones, ReservadoPedidos } from "./Deposito";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import { consulta, una } from "@/lib/erp/base";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { camposVariacionYProducto } from "@/app/catalogo/busqueda";
import { TIPOS_MOVIMIENTO, type TipoMovimiento } from "@/lib/stock";
import { SUAVE } from "@/app/botones";
import { InterruptorFiltro } from "@/app/radar/Piezas";
import { verInactivos } from "@/app/componentes/Inactivos";
import Pestanas from "@/app/componentes/Pestanas";
import FotosProducto from "@/app/componentes/FotosProducto";
import TituloCorto from "@/app/componentes/TituloCorto";
import { formatearNumero } from "@/lib/numeros";
import {
  entrarErp, Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, CAJA,
} from "@/app/componentes/erp";

export const dynamic = "force-dynamic";

const BASE = "/stock/consulta";
const LIMITE = 100;
/** Tope de movimientos del historial (todos, salvo un producto con muchísimos). */
const MOVIMIENTOS = 2000;

type SP = { q?: string; filtro?: string; v?: string; inactivos?: string; dep?: string; contiene?: string; kits?: string; disp?: string; hist?: string; ok?: string; error?: string };

type Variacion = {
  id: number; sku: string; codigo_barras: string | null; titulo: string; kit: boolean; stock_minimo: number | null;
  cantidad: number; reservado: number; disponible: number; producto_id: number;
  ubicaciones: { deposito: string; ubicacion: string; cantidad: number }[] | null;
  fotos: string[] | null; clasica: number | null;
};

const negativo = (n: number) => (n < 0 ? "text-[#C03420] font-semibold" : "");

type Mov = {
  id: number; fecha: string; tipo: TipoMovimiento; sku: string; origen: string | null; destino: string | null; cantidad: number;
  referencia_tipo: string | null; referencia_id: string | null; nota: string | null; usuario: string | null; venta_reservada: boolean;
};
/** Cuánto cambia la cantidad física (db/stock.sql, mover_stock): una transferencia no cambia el total. */
function efectoFisico(m: Mov): number {
  if (m.tipo === "ingreso" || m.tipo === "devolucion") return m.cantidad;
  if (m.tipo === "egreso" || m.tipo === "venta") return -m.cantidad;
  if (m.tipo === "ajuste") return m.destino ? m.cantidad : -m.cantidad;
  return 0;
}
/** Cuánto cambia el disponible (cantidad − reservado): además, la reserva lo baja y la liberación lo sube; la venta de
 *  algo reservado ya no lo cambia. */
function efectoDisponible(m: Mov): number {
  if (m.tipo === "reserva") return -m.cantidad;
  if (m.tipo === "liberacion") return m.cantidad;
  if (m.tipo === "venta") return m.venta_reservada ? 0 : -m.cantidad;
  return efectoFisico(m);
}

export default async function ConsultaStock({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("stock_ver");
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const filtro = sp.filtro === "bajo_minimo" || sp.filtro === "negativo" ? sp.filtro : null;
  const vId = Number(sp.v) || 0;
  const cajaInactivos = verInactivos(sp);
  // "Comienza por" (tildado salvo ?contiene=1): la búsqueda coincide al principio del texto.
  const comienza = sp.contiene !== "1";
  const cont = comienza ? null : "1";
  const ina = cajaInactivos ? "1" : null;
  // Fer (28/10): los kits, apagado de entrada (?kits=1 los muestra); sólo con disponible, prendido de entrada (?disp=0 muestra todo).
  const conKits = sp.kits === "1";
  const soloDisp = sp.disp !== "0";
  const kits = conKits ? "1" : null, disp = soloDisp ? null : "0";
  const patrones = parametroBusqueda(q, comienza);
  // Lo escrito (regla común, lib/busqueda.ts: todos los datos de la variación y de su producto) o el código de barras exacto.
  const coincide = `(v.codigo_barras = $3 or p.codigo_barras = $3 or ${sqlBusqueda("$2", camposVariacionYProducto("v", "p"))})`;
  // Regla de inactivos (Fer): con algo escrito y la caja apagada, si ningún activo
  // coincide pero sí alguno inactivo, se muestran los inactivos igual.
  const inactivos = cajaInactivos || (!!q && !(await una<{ hay: boolean }>(`
    select exists (select 1 from variacion v join producto p on p.id = v.producto_id
                    where v.organizacion_id = $1 and v.estado <> 'archivada' and p.estado <> 'archivado' and ${coincide}) hay`,
    [s.org.id, patrones, q]))?.hay);

  // Depósito: "todos" o uno. Si la dirección no lo dice, el último elegido
  // (cookie que guarda RecordarDeposito); si nunca se eligió, todos.
  const depositos = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from deposito where organizacion_id = $1 and estado = 'activo' order by nombre", [s.org.id]);
  const pedido = sp.dep ?? decodeURIComponent((await cookies()).get("stock_deposito")?.value ?? "todos");
  const elegidoDep = pedido === "todos" ? null : depositos.find((d) => d.id === Number(pedido)) ?? depositos[0] ?? null;
  const todos = !elegidoDep;
  const dep = todos ? "todos" : String(elegidoDep.id);
  const depId = elegidoDep?.id ?? null;

  // Totales por variación en los depósitos activos. El disponible sale de
  // stock_disponible_deposito (así un kit se calcula de sus componentes).
  // Fer (28/10): la pantalla quedaba «Cargando…». Primero se filtra y se cortan las filas (stock sumado de una vez; sólo
  // un kit pasa por stock_disponible_deposito) y recién a esas se les buscan título, fotos, precio y ubicaciones.
  const variaciones = await consulta<Variacion>(`
    with v as (
      select v.id, v.sku, v.codigo_barras, es_kit(v.id) kit, p.stock_minimo, p.id producto_id
        from variacion v join producto p on p.id = v.producto_id
       where v.organizacion_id = $1 and v.estado <> 'archivada' and ($5 or p.estado <> 'archivado')
         and ${coincide}
    ), s as (
      select st.variacion_id, sum(st.cantidad)::int cantidad, sum(st.reservado)::int reservado
        from stock st join ubicacion u on u.id = st.ubicacion_id join deposito d on d.id = u.deposito_id
       where st.organizacion_id = $1 and d.estado = 'activo' and ($6::bigint is null or d.id = $6)
       group by 1
    ), t as (
      select v.*, coalesce(s.cantidad, 0) cantidad, coalesce(s.reservado, 0) reservado,
             case when v.kit then coalesce((select sum(stock_disponible_deposito($1, v.id, d.id)) from deposito d
                                             where d.organizacion_id = $1 and d.estado = 'activo' and ($6::bigint is null or d.id = $6)), 0)::int
                  else coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) end disponible
        from v left join s on s.variacion_id = v.id
       where ($7 or not v.kit)
    ), f as (
      select * from t
       where (not $8 or disponible > 0 or $4 = 'negativo') and ($4::text is null
              or ($4 = 'bajo_minimo' and stock_minimo is not null and disponible < stock_minimo)
              or ($4 = 'negativo' and disponible < 0))
       order by sku limit ${LIMITE}
    )
    select f.id::int, f.sku, f.codigo_barras, titulo_variacion(f.id) titulo, f.kit, f.stock_minimo, f.cantidad, f.reservado, f.disponible, f.producto_id::int,
           (select json_agg(json_build_object('deposito', d.nombre, 'ubicacion', case when u.es_default then 'General' else u.codigo end, 'cantidad', st.cantidad)
                            order by d.nombre, u.es_default desc, u.orden_recorrido, u.codigo)
              from stock st join ubicacion u on u.id = st.ubicacion_id join deposito d on d.id = u.deposito_id
             where st.variacion_id = f.id and d.estado = 'activo' and st.cantidad <> 0 and ($6::bigint is null or d.id = $6)) ubicaciones,
           coalesce((select array_agg(x.url order by x.orden) from variacion_foto x where x.variacion_id = f.id),
                    (select array_agg(x.url order by x.orden) from producto_foto x where x.producto_id = f.producto_id),
                    -- Sin fotos cargadas en Laucen, las de su publicación de Mercado Libre (por la clave canal + item: con
                    -- meli_item.publicacion_id recorría la tabla entera por fila y la pantalla tardaba un minuto).
                    (select array(select coalesce(x ->> 'secure_url', x ->> 'url') from jsonb_array_elements(mm.p) x)
                       from (select m.datos_externos -> 'ml' -> 'pictures' p
                               from publicacion pu join meli_item m on m.canal_id = pu.canal_id and m.item_id = pu.id_externo
                              where pu.variacion_id = f.id and pu.id_externo is not null
                                and jsonb_typeof(m.datos_externos -> 'ml' -> 'pictures') = 'array' and jsonb_array_length(m.datos_externos -> 'ml' -> 'pictures') > 0
                              order by (m.estado = 'active') desc limit 1) mm)) fotos,
           -- El precio de la lista Clásicas (la de referencia de la organización).
           (select venta_ars from precio_de($1, f.id, (select l.id from lista_precios l where l.organizacion_id = $1
              and lower(l.nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') order by l.id limit 1)))::float8 clasica
      from f order by f.sku`, [s.org.id, patrones, q, filtro, inactivos, depId, conKits, soloDisp]);

  // Una variación abierta: detalle por depósito y ubicación + movimientos.
  const elegida = vId ? await una<Variacion>(`
    select v.id::int, v.sku, v.codigo_barras, titulo_variacion(v.id) titulo, es_kit(v.id) kit, p.stock_minimo, p.id::int producto_id,
           0 cantidad, 0 reservado, 0 disponible
      from variacion v join producto p on p.id = v.producto_id where v.id = $2 and v.organizacion_id = $1`, [s.org.id, vId]) : null;

  const detalle = elegida && !elegida.kit ? await consulta<{
    deposito: string; deposito_estado: string; codigo: string; es_default: boolean; cantidad: number; reservado: number;
  }>(`
    select d.nombre deposito, d.estado deposito_estado, u.codigo, u.es_default, st.cantidad, st.reservado
      from stock st join ubicacion u on u.id = st.ubicacion_id join deposito d on d.id = u.deposito_id
     where st.variacion_id = $2 and st.organizacion_id = $1 and (st.cantidad <> 0 or st.reservado <> 0)
     order by d.estado, d.nombre, u.es_default desc, u.orden_recorrido, u.codigo`, [s.org.id, elegida.id]) : [];

  const porDeposito = elegida ? await consulta<{ id: number; nombre: string; disponible: number }>(`
    select d.id::int, d.nombre, stock_disponible_deposito($1, $2, d.id) disponible
      from deposito d where d.organizacion_id = $1 and d.estado = 'activo' order by d.nombre`, [s.org.id, elegida.id]) : [];

  const componentes = elegida?.kit ? await consulta<{ id: number; sku: string; titulo: string; cantidad: number; sobrante: boolean }>(`
    select v.id::int, v.sku, titulo_variacion(v.id) titulo, k.cantidad, k.sobrante
      from kit_componente k join variacion v on v.id = k.variacion_componente_id
     where k.variacion_kit_id = $2 and k.organizacion_id = $1 order by k.sobrante, v.sku`, [s.org.id, elegida.id]) : [];

  // Movimientos: los de la variación y, si es un kit, los que hicieron sus
  // componentes al venderlo o reservarlo.
  const movimientos = elegida ? await consulta<Mov>(`
    select m.id::int, to_char(m.fecha at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YY HH24:MI') fecha, m.tipo, v.sku,
           (select d.nombre || ' · ' || case when u.es_default then 'General' else u.codigo end from ubicacion u join deposito d on d.id = u.deposito_id where u.id = m.ubicacion_origen_id) origen,
           (select d.nombre || ' · ' || case when u.es_default then 'General' else u.codigo end from ubicacion u join deposito d on d.id = u.deposito_id where u.id = m.ubicacion_destino_id) destino,
           m.cantidad, m.referencia_tipo, m.referencia_id, m.nota,
           case when m.usuario_id = 'sistema' then 'Sistema' else coalesce(us.nombre, us.email) end usuario,
           -- Una venta que viene de una reserva del mismo pedido no cambia el disponible (lo baja la reserva).
           (m.tipo = 'venta' and exists (select 1 from movimiento_stock r where r.variacion_id = m.variacion_id and r.tipo = 'reserva'
              and r.referencia_tipo = m.referencia_tipo and r.referencia_id = m.referencia_id and r.id < m.id)) venta_reservada
      from movimiento_stock m
      join variacion v on v.id = m.variacion_id
      left join usuarios us on us.id = m.usuario_id
     where m.organizacion_id = $1 and (m.variacion_id = $2 or m.kit_variacion_id = $2)
     order by m.fecha desc, m.id desc limit ${MOVIMIENTOS}`, [s.org.id, elegida.id]) : [];
  // Historial (Fer, 28/10): «Físico» (lo que cambia la cantidad: el saldo termina en el stock que hay) o «Disponible»
  // (además las reservas y liberaciones: termina en el disponible). El saldo se arma desde el stock de hoy hacia atrás;
  // lo que había antes del primer movimiento registrado (una carga inicial sin movimiento) va como «Saldo anterior».
  const hist = sp.hist === "disponible" ? "disponible" : "fisico";
  const efecto = (m: Mov) => hist === "fisico" ? efectoFisico(m) : efectoDisponible(m);
  const actual = elegida ? (await una<{ cantidad: number; reservado: number }>(
    "select coalesce(sum(cantidad), 0)::int cantidad, coalesce(sum(reservado), 0)::int reservado from stock where variacion_id = $1 and organizacion_id = $2",
    [elegida.id, s.org.id])) ?? { cantidad: 0, reservado: 0 } : { cantidad: 0, reservado: 0 };
  const lista = movimientos.filter((m) => hist === "disponible" || (m.tipo !== "reserva" && m.tipo !== "liberacion"));
  let saldo = hist === "fisico" ? actual.cantidad : actual.cantidad - actual.reservado;
  const historial = lista.map((m) => { const e = efecto(m); const fila = { ...m, efecto: e, saldo }; saldo -= e; return fila; });
  const saldoAnterior = saldo;

  const totDet = detalle.reduce((a, d) => ({ cantidad: a.cantidad + d.cantidad, reservado: a.reservado + d.reservado }), { cantidad: 0, reservado: 0 });
  const totDisp = porDeposito.reduce((a, d) => a + d.disponible, 0);

  return (
    <Pantalla titulo="Consulta de stock" subtitulo="Qué hay de cada producto en cada depósito y ubicación. Disponible = cantidad − reservado." ancho="max-w-[99rem]"
      acciones={<>
        <InterruptorFiltro href={url(BASE, { dep, contiene: cont, q, filtro, inactivos: ina, disp, kits: conKits ? null : "1" })} prendido={conKits} etiqueta="Muestra kits" />
        <InterruptorFiltro href={url(BASE, { dep, contiene: cont, q, filtro, inactivos: ina, kits, disp: soloDisp ? "0" : null })} prendido={soloDisp} etiqueta="Sólo con disponible" />
      </>}>
      <Avisos sp={sp} />
      <RecordarDeposito valor={sp.dep ?? null} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} inactivos={cajaInactivos} comienza={comienza} autoFocus={!vId} placeholder="SKU, título o código de barras" limpiar={["v"]} />
        <InterruptorFiltro href={url(BASE, { q, contiene: cont, filtro, inactivos: ina, kits, disp, v: vId || null, dep: todos ? String(depositos[0]?.id ?? "todos") : "todos" })}
          prendido={todos} etiqueta="Todos los depósitos" />
        {!todos && <ElegirDeposito depositos={depositos} elegido={elegidoDep.id} />}
        <InterruptorFiltro href={url(BASE, { dep, contiene: cont, q, inactivos: ina, kits, disp, filtro: filtro === "bajo_minimo" ? null : "bajo_minimo" })} prendido={filtro === "bajo_minimo"} etiqueta="Sólo bajo el mínimo" />
        <InterruptorFiltro href={url(BASE, { dep, contiene: cont, q, inactivos: ina, kits, disp, filtro: filtro === "negativo" ? null : "negativo" })} prendido={filtro === "negativo"} etiqueta="Sólo con disponible negativo" />
      </div>

      {elegida && (
        <section className={`${CAJA} mb-4`}>
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <div>
              <h2 className="text-sm font-bold">{elegida.sku} · {elegida.titulo} {elegida.kit && <Estado texto="Kit" tono="azul" />}</h2>
              <p className="text-[11px] text-[#5C6B76]">
                {elegida.codigo_barras && `Código de barras ${elegida.codigo_barras} · `}
                {elegida.stock_minimo != null ? `Stock mínimo ${elegida.stock_minimo}` : "Sin stock mínimo cargado"}
                {" · "}<Link href={`/catalogo/productos/${elegida.producto_id}`} className="text-[#16577F] underline">ver producto</Link>
              </p>
            </div>
            <span className="flex gap-2">
              {!elegida.kit && <Link href={url("/stock/ajustes", { sku: elegida.sku })} className={SUAVE}>Ajustar</Link>}
              <Link href={url(BASE, { dep, contiene: cont, q, filtro, inactivos: ina, kits, disp })} className={SUAVE}>Cerrar</Link>
            </span>
          </div>

          {elegida.kit ? (
            <>
              <p className="text-[11px] text-[#5C6B76] mb-2">
                Un kit no tiene stock propio: el disponible se calcula de sus componentes (cuántos kits se pueden armar en cada depósito) y, al venderlo, se mueve el stock de cada componente.
                Componentes: {componentes.map((c, i) => <span key={c.id}>{i > 0 && ", "}<Link href={url(BASE, { dep, contiene: cont, kits, disp, v: c.id })} className="text-[#16577F] underline">{c.cantidad} × {c.sku}</Link>{c.sobrante && " (sobra: entra al vender)"}</span>)}.
              </p>
              <div className={CAJA_TABLA}>
                <table className={TABLA}>
                  <thead className={THEAD}><tr><th className={TH}>Depósito</th><th className={THN}>Kits disponibles</th></tr></thead>
                  <tbody>
                    {porDeposito.map((d) => <tr key={d.id} className={TR}><td className={TD}>{d.nombre}</td><td className={`${TDN} ${negativo(d.disponible)}`}>{d.disponible}</td></tr>)}
                    <tr className={`${TR} font-bold`}><td className={TD}>Total</td><td className={TDN}>{totDisp}</td></tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className={CAJA_TABLA}>
              <table className={TABLA}>
                <thead className={THEAD}>
                  <tr><th className={TH}>Depósito</th><th className={TH}>Ubicación</th><th className={THN}>Cantidad</th><th className={THN}>Reservado</th><th className={THN}>Disponible</th></tr>
                </thead>
                <tbody>
                  {detalle.length === 0 && <tr><td colSpan={5} className={`${TD} text-[#5C6B76]`}>No hay stock en ningún depósito.</td></tr>}
                  {detalle.map((d, i) => (
                    <tr key={i} className={TR}>
                      <td className={TD}>{d.deposito}{d.deposito_estado !== "activo" && <span className="ml-1"><Estado texto="Archivado" /></span>}</td>
                      <td className={TD}>{d.es_default ? "General" : d.codigo}</td>
                      <td className={TDN}>{d.cantidad}</td>
                      <td className={TDN}>{d.reservado}</td>
                      <td className={`${TDN} ${negativo(d.cantidad - d.reservado)}`}>{d.cantidad - d.reservado}</td>
                    </tr>
                  ))}
                  {detalle.length > 1 && (
                    <tr className={`${TR} font-bold`}>
                      <td className={TD} colSpan={2}>Total</td>
                      <td className={TDN}>{totDet.cantidad}</td><td className={TDN}>{totDet.reservado}</td>
                      <td className={`${TDN} ${negativo(totDet.cantidad - totDet.reservado)}`}>{totDet.cantidad - totDet.reservado}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 mt-4 mb-1">
            <h3 className="text-xs font-bold">Historial</h3>
            <span className="flex flex-wrap items-center gap-2">
              <Pestanas className="mb-0" items={[
                { href: url(BASE, { dep, contiene: cont, q, filtro, inactivos: ina, kits, disp, v: elegida.id }), activa: hist === "fisico", clave: "fisico",
                  texto: "Físico", cuenta: movimientos.filter((m) => m.tipo !== "reserva" && m.tipo !== "liberacion").length },
                { href: url(BASE, { dep, contiene: cont, q, filtro, inactivos: ina, kits, disp, v: elegida.id, hist: "disponible" }), activa: hist === "disponible", clave: "disponible",
                  texto: "Disponible (con reservas)", cuenta: movimientos.length },
              ]} />
              <Link href={url("/stock/movimientos", { v: elegida.id })} className={SUAVE}>Movimientos con filtros</Link>
            </span>
          </div>
          <p className="text-[11px] text-[#5C6B76] mb-1">
            {hist === "fisico"
              ? "Lo que cambia la cantidad que hay: ingresos, ajustes, ventas, egresos y devoluciones (las transferencias entre ubicaciones no cambian el total). El saldo termina en la cantidad de hoy."
              : "Además, las reservas (bajan el disponible) y las liberaciones (lo suben); una venta de algo reservado ya no lo cambia. El saldo termina en el disponible de hoy."}
            {elegida.kit && " En un kit se ven los movimientos de sus componentes."}
          </p>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Fecha</th><th className={TH}>Tipo</th>{elegida.kit && <th className={TH}>Componente</th>}
                  <th className={TH}>Origen</th><th className={TH}>Destino</th><th className={TH}>Referencia</th>
                  <th className={THN} title="Entrada">Entra</th><th className={THN} title="Salida">Sale</th>{!elegida.kit && <th className={THN}>Saldo</th>}
                  <th className={TH}>Nota</th><th className={TH}>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {historial.length === 0 && <tr><td colSpan={11} className={`${TD} text-[#5C6B76]`}>Sin movimientos.</td></tr>}
                {historial.map((m) => (
                  <tr key={m.id} className={TR}>
                    <td className={`${TD} whitespace-nowrap`}>{m.fecha}</td>
                    <td className={TD}>{TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo}</td>
                    {elegida.kit && <td className={TD}>{m.sku}</td>}
                    <td className={TD}>{m.origen ?? "—"}</td>
                    <td className={TD}>{m.destino ?? "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{m.referencia_tipo === "pedido" && m.referencia_id
                      ? <Link href={`/ventas/pedidos/${m.referencia_id}`} className="text-[#16577F] hover:underline">pedido {m.referencia_id}</Link>
                      : m.referencia_tipo ? `${m.referencia_tipo.replace(/_/g, " ")}${m.referencia_id ? ` #${m.referencia_id}` : ""}` : "—"}</td>
                    <td className={`${TDN} text-[#167655]`}>{m.efecto > 0 ? m.efecto : ""}</td>
                    <td className={`${TDN} text-[#C03420]`}>{m.efecto < 0 ? -m.efecto : m.efecto === 0 && m.tipo === "transferencia" ? <span className="text-[#5C6B76]">{m.cantidad} ↔</span> : ""}</td>
                    {!elegida.kit && <td className={`${TDN} font-semibold ${negativo(m.saldo)}`}>{m.saldo}</td>}
                    <td className={TD}>{m.nota ?? "—"}</td>
                    <td className={TD}>{m.usuario ?? "—"}</td>
                  </tr>
                ))}
                {!elegida.kit && historial.length > 0 && saldoAnterior !== 0 && (
                  <tr className={`${TR} bg-[#FAFBFC]`}>
                    <td className={`${TD} text-[#5C6B76]`} colSpan={7}>Saldo anterior (lo que había antes del primer movimiento registrado, por ejemplo una carga inicial)</td>
                    <td className={TDN} /><td className={`${TDN} font-semibold`}>{saldoAnterior}</td><td className={TD} colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {movimientos.length === MOVIMIENTOS && <p className="text-[11px] text-[#5C6B76] mt-1">Se ven los últimos {MOVIMIENTOS} movimientos.</p>}
        </section>
      )}

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH} /><th className={`${TH} w-px`}>SKU</th><th className={TH}>Variación</th><th className={THN} title="Cantidad">Cant.</th><th className={THN} title="Reservado (tocalo para ver los pedidos)">Res.</th>
              <th className={THN} title="Disponible (tocalo para ver las ubicaciones)">Dispo.</th><th className={`${TH} w-px`} title="Ubicación principal: donde más unidades hay">Ubic.</th>
              <th className={THN} title="Precio de la lista Clásicas">Clásica</th>
            </tr>
          </thead>
          <tbody>
            {variaciones.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>{q || filtro ? "Nada coincide." : "Todavía no hay productos."}</td></tr>}
            {variaciones.map((v) => (
              <tr key={v.id} className={`${TR} ${v.id === elegida?.id ? "bg-[#EEF3F8]" : ""}`}>
                <td className={`${TD} w-px`}><FotosProducto fotos={v.fotos} titulo={v.titulo} /></td>
                <td className={`${TD} w-px whitespace-nowrap`}><Link href={url(BASE, { dep, contiene: cont, q, filtro, inactivos: ina, kits, disp, v: v.id })} className="font-semibold text-[#16577F] hover:underline">{v.sku}</Link></td>
                <td className={`${TD} max-w-80`}><TituloCorto titulo={v.titulo} className="text-[12px] text-inherit" />{v.kit && <Estado texto="Kit" tono="azul" />}</td>
                <td className={TDN}>{v.kit ? "—" : v.cantidad}</td>
                <td className={TDN}>{v.kit ? "—" : <ReservadoPedidos variacionId={v.id} reservado={v.reservado} />}</td>
                <td className={`${TDN} ${negativo(v.disponible)} ${v.stock_minimo != null && v.disponible < v.stock_minimo ? "text-[#8a6100] font-semibold" : ""}`}>
                  {v.kit ? v.disponible : <CantidadUbicaciones cantidad={v.disponible} ubicaciones={v.ubicaciones ?? []} />}</td>
                <td className={`${TD} w-px whitespace-nowrap`}>{(() => {
                  // La ubicación donde más hay; al pasar el mouse, el depósito, la ubicación y cuántas hay.
                  const u = (v.ubicaciones ?? []).reduce<NonNullable<Variacion["ubicaciones"]>[number] | null>((a, x) => (!a || x.cantidad > a.cantidad ? x : a), null);
                  return u ? <span title={`${u.deposito} · ${u.ubicacion} (${u.cantidad})`}>{u.ubicacion}</span> : "—";
                })()}</td>
                <td className={`${TDN} whitespace-nowrap`}>{v.clasica != null ? `$ ${formatearNumero(v.clasica, "entero")}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {variaciones.length === LIMITE && <p className="text-[11px] text-[#5C6B76] mt-1">Se muestran las primeras {LIMITE}: buscá para afinar.</p>}
      <p className="text-[11px] text-[#5C6B76] mt-2">{todos ? "Los totales cuentan sólo los depósitos activos." : `Cantidades del depósito ${elegidoDep.nombre}.`} Tocá el disponible para ver en qué ubicaciones está y el reservado para ver los pedidos; «Ubic.» es donde más hay. Un kit muestra cuántos se pueden armar con sus componentes.</p>
    </Pantalla>
  );
}

