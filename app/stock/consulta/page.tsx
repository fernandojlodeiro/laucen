// Consulta de stock (orden 136, §7): qué hay de cada variación en cada
// depósito y ubicación, y sus últimos movimientos. Disponible = cantidad −
// reservado (puede dar negativo si se vendió de más). Un kit no tiene stock
// propio: su disponible se calcula de los componentes (stock_disponible_deposito).

import Link from "next/link";
import { consulta, una } from "@/lib/erp/base";
import { TIPOS_MOVIMIENTO, type TipoMovimiento } from "@/lib/stock";
import { SUAVE } from "@/app/botones";
import { InterruptorFiltro } from "@/app/radar/Piezas";
import {
  entrarErp, Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, CAJA,
} from "@/app/componentes/erp";

export const dynamic = "force-dynamic";

const BASE = "/stock/consulta";
const LIMITE = 100;

type SP = { q?: string; filtro?: string; v?: string; ok?: string; error?: string };

type Variacion = {
  id: number; sku: string; codigo_barras: string | null; titulo: string; kit: boolean; stock_minimo: number | null;
  cantidad: number; reservado: number; disponible: number; producto_id: number;
};

const negativo = (n: number) => (n < 0 ? "text-[#C03420] font-semibold" : "");

export default async function ConsultaStock({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("stock_ver");
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const filtro = sp.filtro === "bajo_minimo" || sp.filtro === "negativo" ? sp.filtro : null;
  const vId = Number(sp.v) || 0;

  // Totales por variación en los depósitos activos. El disponible sale de
  // stock_disponible_deposito (así un kit se calcula de sus componentes).
  const variaciones = await consulta<Variacion>(`
    with v as (
      select v.id, v.sku, v.codigo_barras, titulo_variacion(v.id) titulo, es_kit(v.id) kit, p.stock_minimo, p.id producto_id
        from variacion v join producto p on p.id = v.producto_id
       where v.organizacion_id = $1 and v.estado <> 'archivada' and p.estado <> 'archivado'
         and ($2::text is null or v.sku ilike $2 or p.titulo ilike $2 or v.titulo ilike $2 or v.codigo_barras = $3 or p.codigo_barras = $3)
    ), t as (
      select v.*,
             coalesce((select sum(st.cantidad) from stock st join ubicacion u on u.id = st.ubicacion_id join deposito d on d.id = u.deposito_id
                        where st.variacion_id = v.id and d.estado = 'activo'), 0)::int cantidad,
             coalesce((select sum(st.reservado) from stock st join ubicacion u on u.id = st.ubicacion_id join deposito d on d.id = u.deposito_id
                        where st.variacion_id = v.id and d.estado = 'activo'), 0)::int reservado,
             coalesce((select sum(stock_disponible_deposito($1, v.id, d.id)) from deposito d
                        where d.organizacion_id = $1 and d.estado = 'activo'), 0)::int disponible
        from v
    )
    select id::int, sku, codigo_barras, titulo, kit, stock_minimo, cantidad, reservado, disponible, producto_id::int from t
     where ($4::text is null
            or ($4 = 'bajo_minimo' and stock_minimo is not null and disponible < stock_minimo)
            or ($4 = 'negativo' and disponible < 0))
     order by sku limit ${LIMITE}`, [s.org.id, q ? `%${q}%` : null, q, filtro]);

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

  const componentes = elegida?.kit ? await consulta<{ id: number; sku: string; titulo: string; cantidad: number }>(`
    select v.id::int, v.sku, titulo_variacion(v.id) titulo, k.cantidad
      from kit_componente k join variacion v on v.id = k.variacion_componente_id
     where k.variacion_kit_id = $2 and k.organizacion_id = $1 order by v.sku`, [s.org.id, elegida.id]) : [];

  // Movimientos: los de la variación y, si es un kit, los que hicieron sus
  // componentes al venderlo o reservarlo.
  const movimientos = elegida ? await consulta<{
    id: number; fecha: string; tipo: TipoMovimiento; sku: string; origen: string | null; destino: string | null; cantidad: number;
    referencia_tipo: string | null; referencia_id: string | null; nota: string | null; usuario: string | null;
  }>(`
    select m.id::int, to_char(m.fecha at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YY HH24:MI') fecha, m.tipo, v.sku,
           (select d.nombre || ' · ' || u.codigo from ubicacion u join deposito d on d.id = u.deposito_id where u.id = m.ubicacion_origen_id) origen,
           (select d.nombre || ' · ' || u.codigo from ubicacion u join deposito d on d.id = u.deposito_id where u.id = m.ubicacion_destino_id) destino,
           m.cantidad, m.referencia_tipo, m.referencia_id, m.nota,
           case when m.usuario_id = 'sistema' then 'Sistema' else coalesce(us.nombre, us.email) end usuario
      from movimiento_stock m
      join variacion v on v.id = m.variacion_id
      left join usuarios us on us.id = m.usuario_id
     where m.organizacion_id = $1 and (m.variacion_id = $2 or m.kit_variacion_id = $2)
     order by m.fecha desc, m.id desc limit 50`, [s.org.id, elegida.id]) : [];

  const totDet = detalle.reduce((a, d) => ({ cantidad: a.cantidad + d.cantidad, reservado: a.reservado + d.reservado }), { cantidad: 0, reservado: 0 });
  const totDisp = porDeposito.reduce((a, d) => a + d.disponible, 0);

  return (
    <Pantalla titulo="Consulta de stock" subtitulo="Qué hay de cada producto en cada depósito y ubicación. Disponible = cantidad − reservado.">
      <Avisos sp={sp} />
      <div className="flex flex-wrap items-center gap-4 mb-3">
        <form action={BASE} className="flex gap-2">
          {filtro && <input type="hidden" name="filtro" value={filtro} />}
          <input name="q" defaultValue={q} placeholder="SKU, título o código de barras" className={`${CAMPO} w-72`} autoFocus={!vId} />
          <button className={SUAVE}>Buscar</button>
          {q && <Link href={url(BASE, { filtro })} className={SUAVE}>Limpiar</Link>}
        </form>
        <InterruptorFiltro href={url(BASE, { q, filtro: filtro === "bajo_minimo" ? null : "bajo_minimo" })} prendido={filtro === "bajo_minimo"} etiqueta="Sólo bajo el mínimo" />
        <InterruptorFiltro href={url(BASE, { q, filtro: filtro === "negativo" ? null : "negativo" })} prendido={filtro === "negativo"} etiqueta="Sólo con disponible negativo" />
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
              <Link href={url(BASE, { q, filtro })} className={SUAVE}>Cerrar</Link>
            </span>
          </div>

          {elegida.kit ? (
            <>
              <p className="text-[11px] text-[#5C6B76] mb-2">
                Un kit no tiene stock propio: el disponible se calcula de sus componentes (cuántos kits se pueden armar en cada depósito) y, al venderlo, se mueve el stock de cada componente.
                Componentes: {componentes.map((c, i) => <span key={c.id}>{i > 0 && ", "}<Link href={url(BASE, { v: c.id })} className="text-[#16577F] underline">{c.cantidad} × {c.sku}</Link></span>)}.
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

          <h3 className="text-xs font-bold mt-4 mb-1">Últimos movimientos</h3>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Fecha</th><th className={TH}>Tipo</th>{elegida.kit && <th className={TH}>Componente</th>}
                  <th className={TH}>Origen</th><th className={TH}>Destino</th><th className={THN}>Cantidad</th>
                  <th className={TH}>Referencia</th><th className={TH}>Nota</th><th className={TH}>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>Sin movimientos.</td></tr>}
                {movimientos.map((m) => (
                  <tr key={m.id} className={TR}>
                    <td className={`${TD} whitespace-nowrap`}>{m.fecha}</td>
                    <td className={TD}>{TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo}</td>
                    {elegida.kit && <td className={TD}>{m.sku}</td>}
                    <td className={TD}>{m.origen ?? "—"}</td>
                    <td className={TD}>{m.destino ?? "—"}</td>
                    <td className={TDN}>{m.cantidad}</td>
                    <td className={TD}>{m.referencia_tipo ? `${m.referencia_tipo.replace(/_/g, " ")}${m.referencia_id ? ` #${m.referencia_id}` : ""}` : "—"}</td>
                    <td className={TD}>{m.nota ?? "—"}</td>
                    <td className={TD}>{m.usuario ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>SKU</th><th className={TH}>Variación</th><th className={THN}>Cantidad</th><th className={THN}>Reservado</th>
              <th className={THN}>Disponible</th><th className={THN}>Mínimo</th>
            </tr>
          </thead>
          <tbody>
            {variaciones.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>{q || filtro ? "Nada coincide." : "Todavía no hay productos."}</td></tr>}
            {variaciones.map((v) => (
              <tr key={v.id} className={`${TR} ${v.id === elegida?.id ? "bg-[#EEF3F8]" : ""}`}>
                <td className={`${TD} whitespace-nowrap`}><Link href={url(BASE, { q, filtro, v: v.id })} className="font-semibold text-[#16577F] hover:underline">{v.sku}</Link></td>
                <td className={TD}>{v.titulo} {v.kit && <Estado texto="Kit" tono="azul" />}</td>
                <td className={TDN}>{v.kit ? "—" : v.cantidad}</td>
                <td className={TDN}>{v.kit ? "—" : v.reservado}</td>
                <td className={`${TDN} ${negativo(v.disponible)} ${v.stock_minimo != null && v.disponible < v.stock_minimo ? "text-[#8a6100] font-semibold" : ""}`}>{v.disponible}</td>
                <td className={TDN}>{v.stock_minimo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {variaciones.length === LIMITE && <p className="text-[11px] text-[#5C6B76] mt-1">Se muestran las primeras {LIMITE}: buscá para afinar.</p>}
      <p className="text-[11px] text-[#5C6B76] mt-2">Los totales cuentan sólo los depósitos activos. Un kit muestra cuántos se pueden armar con sus componentes.</p>
    </Pantalla>
  );
}
