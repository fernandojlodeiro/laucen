// Ventas › Preventas (Fer, 5/11): lo que se está vendiendo de las órdenes en camino y los pedidos de preventa, con lo
// que hay que resolver a mano: los que no se cubrieron (llegó menos), los saldos vencidos y los que esperan sin orden.
// Nada se cancela ni se pierde solo: cada caso lo decide un operador desde acá.

import Link from "next/link";
import { BotonConfirmar } from "@/app/radar/Cliente";
import Pestanas from "@/app/componentes/Pestanas";
import FotosProducto from "@/app/componentes/FotosProducto";
import CampoNumero from "@/app/componentes/CampoNumero";
import { BORRAR, PRIMARIO, SUAVE } from "@/app/botones";
import {
  entrarErp, Pantalla, Avisos, BotonesFicha, Dato, Estado, TituloSeccion, editandoFicha, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { diaAr } from "@/lib/compras/invoices";
import { configPreventa, pedidosEnPreventa, resumenPorProducto, sinCubrir, type PedidoEnPreventa } from "@/lib/preventa";
import { accionCancelarPreventa, accionDejarEnEspera, accionExtenderSaldo, accionGuardarConfigPreventa, accionPasarAOtraOrden } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string; ver?: string; orden?: string; editar?: string };
const pesos = (n: number) => `$ ${formatearNumero(Math.round(n), "pesos")}`;
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

export default async function Preventas({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("pedidos_ver");
  const sp = await searchParams;
  const ver = ["pedidos", "sin_cubrir", "saldos", "espera", "config"].includes(sp.ver ?? "") ? sp.ver! : "productos";
  const ordenFiltro = Number(sp.orden) || null;
  const [productos, pedidos, faltan, ordenes, cfg] = await Promise.all([
    resumenPorProducto(s.org.id),
    pedidosEnPreventa(s.org.id, { ordenId: ordenFiltro }),
    sinCubrir(s.org.id),
    consulta<{ id: number; codigo: string; llegada: string | null }>("select id::int, codigo, llegada::text from orden_compra where organizacion_id = $1 and estado = 'en_camino' order by llegada nulls last, codigo", [s.org.id]),
    configPreventa(s.org.id),
  ]);
  const esperando = pedidos.filter((p) => !p.cubierto && !p.en_espera);
  const saldos = pedidos.filter((p) => p.saldo_hasta && p.estado_pago === "pendiente" && p.saldo_hasta < hoy());
  const enEspera = pedidos.filter((p) => p.en_espera);
  const sinCubrirIds = new Set(faltan.map((f) => f.pedido_id));
  const pedidosSinCubrir = pedidos.filter((p) => sinCubrirIds.has(p.id));
  const base = `/ventas/preventas${ordenFiltro ? `?orden=${ordenFiltro}&` : "?"}`;
  const volverA = `${base}ver=${ver}`;
  const editandoCfg = editandoFicha(sp, "config");

  return (
    <Pantalla titulo="Preventas" subtitulo="Lo que se vende de las órdenes en camino, y lo que hay que resolver a mano." ancho="max-w-6xl">
      <Avisos sp={sp} />
      {ordenFiltro && <p className="text-xs mb-2">Sólo la orden <b>{ordenes.find((o) => o.id === ordenFiltro)?.codigo ?? ordenFiltro}</b> · <Link href="/ventas/preventas" className="text-[#16577F] underline">ver todas</Link></p>}
      <Pestanas items={[
        { href: `${base}ver=productos`, texto: "Por producto", activa: ver === "productos", cuenta: productos.length },
        { href: `${base}ver=pedidos`, texto: "Esperando su orden", activa: ver === "pedidos", cuenta: esperando.length },
        { href: `${base}ver=sin_cubrir`, texto: "Sin cubrir", activa: ver === "sin_cubrir", cuenta: pedidosSinCubrir.length },
        { href: `${base}ver=saldos`, texto: "Saldos vencidos", activa: ver === "saldos", cuenta: saldos.length },
        { href: `${base}ver=espera`, texto: "En espera sin orden", activa: ver === "espera", cuenta: enEspera.length },
        { href: `${base}ver=config`, texto: "Configuración", activa: ver === "config" },
      ]} />

      {ver === "productos" && (
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Producto</th><th className={THN} title="Disponible físico hoy (todos los depósitos menos Full)">Dispo.</th>
                <th className={TH}>Orden</th><th className={TH}>Arribo</th><th className={THN} title="Lo que la orden todavía tiene que traer">Llegando</th>
                <th className={THN} title="Vendido en preventa">Prevend.</th><th className={THN} title="Llegando − prevendido">Saldo</th><th className={TH}>Se ofrece en</th>
              </tr>
            </thead>
            <tbody>
              {productos.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>No hay órdenes en camino. Se cargan en <Link href="/compras/ordenes" className="text-[#16577F] underline">Compras › Órdenes de compra al exterior</Link>.</td></tr>}
              {productos.filter((p) => !ordenFiltro || p.orden_id === ordenFiltro).map((p) => (
                <tr key={`${p.orden_id}-${p.variacion_id}`} className={TR}>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-2">
                      <FotosProducto fotos={p.fotos} titulo={p.titulo} />
                      <span><Link href={`/catalogo/productos/${p.producto_id}`} className="font-mono text-[#16577F] hover:underline">{p.sku}</Link>
                        <span className="block text-[10px] text-[#5C6B76] max-w-80 line-clamp-2" title={p.titulo}>{p.titulo}</span></span>
                    </span>
                  </td>
                  <td className={TDN}>{p.disp}</td>
                  <td className={TD}><Link href={`/compras/ordenes/${p.orden_id}`} className="font-mono text-[#16577F] hover:underline">{p.orden}</Link></td>
                  <td className={`${TD} whitespace-nowrap`}>{diaAr(p.llegada)}{p.llegada_ml && p.llegada_ml !== p.llegada && <span className="block text-[10px] text-[#5C6B76]">ML: {diaAr(p.llegada_ml)}</span>}</td>
                  <td className={TDN}>{p.llegando}</td><td className={TDN}>{p.vendido}</td><td className={TDN}>{p.llegando - p.vendido}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {p.disp > 0 ? <span className="text-[11px] text-[#5C6B76]">Hay stock: se vende normal</span>
                      : <>{p.publicar_web && <Estado texto="Web" tono="verde" />} {p.publicar_ml && <Estado texto="ML" tono="amarillo" />}{!p.publicar_web && !p.publicar_ml && <span className="text-[11px] text-[#5C6B76]">No publicada</span>}</>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-[#5C6B76]">
            Se ofrece en preventa sólo lo que no tiene stock físico, si el producto la admite en ese canal y la orden está publicada ahí. De cada producto se ofrece una orden por vez (la primera que se publicó), menos el margen de seguridad.
          </p>
        </div>
      )}

      {ver === "pedidos" && <TablaPedidos pedidos={esperando} ordenes={ordenes} volver={volverA} vacio="No hay pedidos de preventa esperando su orden." />}

      {ver === "sin_cubrir" && (
        <>
          <p className="text-xs mb-2 rounded-lg px-3 py-2 bg-[#FFF8E8] text-[#8a6100]">
            La orden llegó con menos de lo vendido: estos pedidos (los últimos en comprar) no se cubrieron. Resolvé cada uno: pasarlo a otra orden, dejarlo en espera o cancelarlo.
            {pedidosSinCubrir.some((p) => p.es_ml) && " Los de Mercado Libre: hablalo con el comprador por la mensajería de la venta antes de decidir (cancelar le pega a la reputación)."}
          </p>
          <TablaPedidos pedidos={pedidosSinCubrir} ordenes={ordenes} volver={volverA} vacio="No hay preventas sin cubrir." faltan={faltan} />
        </>
      )}

      {ver === "saldos" && <TablaPedidos pedidos={saldos} ordenes={ordenes} volver={volverA} vacio="No hay saldos vencidos." saldo />}

      {ver === "espera" && <TablaPedidos pedidos={enEspera} ordenes={ordenes} volver={volverA} vacio="No hay pedidos en espera sin orden." />}

      {ver === "config" && (
        <section>
          <TituloSeccion titulo="Configuración general de la preventa">
            <BotonesFicha editando={editandoCfg} ver="/ventas/preventas?ver=config" editar="/ventas/preventas?ver=config&editar=config" form="config" />
          </TituloSeccion>
          <form id="config" action={accionGuardarConfigPreventa} className={`${CAJA} grid grid-cols-2 sm:grid-cols-4 gap-3 items-start`}>
            <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" name="admite_web" defaultChecked={cfg.admiteWeb} disabled={!editandoCfg} className="h-4 w-4 accent-[#16577F]" />
              Los productos admiten preventa en la web (salvo que su ficha diga otra cosa)</label>
            <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" name="admite_ml" defaultChecked={cfg.admiteMl} disabled={!editandoCfg} className="h-4 w-4 accent-[#16577F]" />
              Los productos admiten preventa en Mercado Libre (salvo que su ficha diga otra cosa)</label>
            {editandoCfg ? (
              <>
                <label><span className={ETIQUETA}>Margen de seguridad (u.)</span><CampoNumero name="margen_unidades" valor={cfg.margenUnidades} tipo="entero" className={`${CAMPO} w-full`} /></label>
                <label><span className={ETIQUETA}>Margen de seguridad %</span><CampoNumero name="margen_pct" valor={cfg.margenPct} tipo="pct" className={`${CAMPO} w-full`} /></label>
                <label><span className={ETIQUETA}>Toma</span>
                  <select name="margen_modo" defaultValue={cfg.margenModo} className={`${CAMPO} w-full`}><option value="menor">El menor</option><option value="mayor">El mayor</option></select></label>
                <label><span className={ETIQUETA}>Descuento de preventa %</span><CampoNumero name="descuento_pct" valor={cfg.descuentoPct} tipo="pct" className={`${CAMPO} w-full`} /></label>
                <label><span className={ETIQUETA}>Seña en la web %</span><CampoNumero name="sena_pct" valor={cfg.senaPct} tipo="pct" className={`${CAMPO} w-full`} /></label>
                <label><span className={ETIQUETA}>Plazo para el saldo (días)</span><CampoNumero name="plazo_saldo" valor={cfg.plazoSaldoDias} tipo="entero" className={`${CAMPO} w-full`} /></label>
                <label><span className={ETIQUETA}>Tope de días en Mercado Libre</span><CampoNumero name="ml_max_dias" valor={cfg.mlMaxDias} tipo="entero" className={`${CAMPO} w-full`} /></label>
              </>
            ) : (
              <>
                <Dato etiqueta="Margen de seguridad (u.)" numero>{cfg.margenUnidades != null ? String(cfg.margenUnidades) : null}</Dato>
                <Dato etiqueta="Margen de seguridad %" numero>{cfg.margenPct != null ? formatearNumero(cfg.margenPct, "pct") : null}</Dato>
                <Dato etiqueta="Toma">{`El ${cfg.margenModo}`}</Dato>
                <Dato etiqueta="Descuento de preventa %" numero>{formatearNumero(cfg.descuentoPct, "pct")}</Dato>
                <Dato etiqueta="Seña en la web %" numero>{formatearNumero(cfg.senaPct, "pct")}</Dato>
                <Dato etiqueta="Plazo para el saldo (días)" numero>{String(cfg.plazoSaldoDias)}</Dato>
                <Dato etiqueta="Tope de días en Mercado Libre" numero>{String(cfg.mlMaxDias)}</Dato>
              </>
            )}
            <p className="col-span-2 sm:col-span-4 text-[11px] text-[#5C6B76]">
              Margen de seguridad: lo que no se ofrece de cada orden por si llega menos o roto. Con 5 u. / 10 % / el menor: si llegan 10, se guarda 1; si llegan 100, 5 (el % se redondea para arriba).
              La orden y la ficha del producto pueden tener los suyos: gana el más particular. El descuento se aplica sobre el precio normal de cada canal.
            </p>
          </form>
        </section>
      )}
    </Pantalla>
  );
}

function TablaPedidos({ pedidos, ordenes, volver, vacio, saldo, faltan }: {
  pedidos: PedidoEnPreventa[]; ordenes: { id: number; codigo: string; llegada: string | null }[]; volver: string; vacio: string; saldo?: boolean;
  faltan?: { pedido_id: number; sku: string; cantidad: number; orden: string }[];
}) {
  return (
    <div className={CAJA_TABLA}>
      <table className={TABLA}>
        <thead className={THEAD}>
          <tr>
            <th className={TH}>Pedido</th><th className={TH}>Cliente</th><th className={TH}>Productos</th><th className={TH}>Orden</th><th className={TH}>Prometido</th>
            <th className={THN}>Total</th><th className={THN}>Pagado</th>{saldo && <th className={TH}>Vencía</th>}<th className={TH}>Resolver</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>{vacio}</td></tr>}
          {pedidos.map((p) => (
            <tr key={p.id} className={TR} data-canal={p.canal_id}>
              <td className={TD}>
                <Link href={`/ventas/pedidos/${p.id}`} className="font-bold text-[#16577F] hover:underline">#{p.id}</Link>
                <span className="block text-[10px] text-[#5C6B76]">{p.canal} · {new Date(p.fecha).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</span>
              </td>
              <td className={TD}>{p.cliente_id ? <Link href={`/ventas/clientes/${p.cliente_id}`} className="text-[#16577F] hover:underline">{p.cliente}</Link> : "—"}</td>
              <td className={`${TD} max-w-64`}>
                {p.productos}
                {faltan?.filter((f) => f.pedido_id === p.id).map((f, i) => <span key={i} className="block text-[10px] text-[#C03420]">Sin cubrir: {f.cantidad} × {f.sku}</span>)}
              </td>
              <td className={TD}>{p.orden_id && !p.en_espera ? <Link href={`/compras/ordenes/${p.orden_id}`} className="font-mono text-[#16577F] hover:underline">{p.orden}</Link> : <Estado texto="Sin orden" tono="naranja" />}</td>
              <td className={`${TD} whitespace-nowrap`}>{diaAr(p.llegada)}</td>
              <td className={TDN}>{pesos(p.total_ars)}</td>
              <td className={TDN}>{pesos(p.pagado_ars)}</td>
              {saldo && <td className={`${TD} whitespace-nowrap text-[#C03420]`}>{diaAr(p.saldo_hasta)}</td>}
              <td className={TD}>
                <div className="flex flex-wrap items-center gap-1">
                  {!p.cubierto && ordenes.filter((o) => o.id !== p.orden_id || p.en_espera).length > 0 && (
                    <form action={accionPasarAOtraOrden} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={p.id} /><input type="hidden" name="volver" value={volver} />
                      <select name="orden" className={CAMPO} aria-label="Otra orden">
                        {ordenes.filter((o) => o.id !== p.orden_id || p.en_espera).map((o) => <option key={o.id} value={o.id}>{o.codigo} ({diaAr(o.llegada)})</option>)}
                      </select>
                      <button className={SUAVE}>Pasar</button>
                    </form>
                  )}
                  {!p.cubierto && !p.en_espera && (
                    <BotonConfirmar accion={accionDejarEnEspera} campos={{ id: String(p.id), volver }} clase={SUAVE} texto="Dejar en espera" pregunta="¿Dejarlo en espera sin orden?" corriendo="…" />
                  )}
                  {saldo && (
                    <form action={accionExtenderSaldo} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={p.id} /><input type="hidden" name="volver" value={volver} />
                      <input name="dias" defaultValue="7" inputMode="numeric" className={`${CAMPO} w-12 text-right`} aria-label="Días más" />
                      <button className={PRIMARIO}>Más plazo</button>
                    </form>
                  )}
                  <BotonConfirmar accion={accionCancelarPreventa} campos={{ id: String(p.id), volver }} clase={BORRAR} texto="Cancelar"
                    pregunta={p.es_ml ? "Es de Mercado Libre: cancelar le pega a la reputación. ¿Cancelar igual?" : "¿Cancelar el pedido? La seña se devuelve aparte."} corriendo="Cancelando…" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
