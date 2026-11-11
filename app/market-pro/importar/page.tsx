// Sourcing › Market Pro › Importar (Fer, 10/11): se pega la lista de precios de un proveedor y el monto a importar; la IA
// la lee y cruza cada modelo con Market Pro, y Laucen calcula el costo nacionalizado (Configuración › Costos de
// importación), la ganancia vendiendo en Mercado Libre al mejor precio del catálogo y cuántas conviene traer de cada uno
// (lib/marketpro/costeo.ts).

import Link from "next/link";
import { CAJA, CAMPO, ETIQUETA, Pantalla, Avisos, TABLA, TD, TDN, TH, THEAD, THN, TR, entrarErp } from "@/app/componentes/erp";
import { PRIMARIO, SUAVE } from "@/app/botones";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import CampoNumero from "@/app/componentes/CampoNumero";
import FotosProducto from "@/app/componentes/FotosProducto";
import TituloCorto from "@/app/componentes/TituloCorto";
import { consulta, una } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { dolarOficial, type ResultadoCosteo } from "@/lib/marketpro/costeo";
import { BarraMarketPro, VerEnMl, entero, linkProducto, pct, pesos } from "../piezas";
import { accionNuevoCosteo, accionRecalcular } from "./acciones";
import { Refrescar, TachoCosteo } from "./Piezas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
type SP = Record<string, string | undefined>;

const usd = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `US$ ${formatearNumero(n, "usd")}`);
const CONFIANZA: Record<string, string> = { alta: "Seguro", media: "Probable", baja: "Dudoso" };

type Costeo = { id: number; titulo: string | null; monto_usd: number | null; dolar: number | null; estado: string; error: string | null;
  resultado: ResultadoCosteo | null; costo_ia_usd: number | null; creado: string; modelos: number | null; cruzados: number | null };

export default async function Importar({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("market_pro_ver");
  const sp = await searchParams;
  const id = Number(sp.id) || 0;
  const [lista, sel, dolarHoy] = await Promise.all([
    consulta<Costeo>(`
      select id::int, titulo, monto_usd::float8, dolar::float8, estado, error, null resultado, costo_ia_usd::float8,
             to_char(creado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') creado,
             jsonb_array_length(items) modelos, (select count(*) from jsonb_array_elements(items) e where e ->> 'producto' is not null)::int cruzados
        from mpro_costeo where organizacion_id = $1 order by id desc limit 50`, [s.org.id]),
    id ? una<Costeo>(`
      select id::int, titulo, monto_usd::float8, dolar::float8, estado, error, resultado, costo_ia_usd::float8,
             to_char(creado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') creado, null modelos, null cruzados
        from mpro_costeo where organizacion_id = $1 and id = $2`, [s.org.id, id]) : Promise.resolve(null),
    dolarOficial(),
  ]);

  return (
    <Pantalla titulo="Market Pro" ancho="max-w-[1500px]" acciones={<><Link href="/config/importacion" className={SUAVE}>Costos de importación</Link><BotonNuevo texto="Nuevo costeo" /></>}
      subtitulo="Pegá la lista de precios de un proveedor y el monto a importar: el costo nacionalizado de cada modelo, cuánto ganás vendiéndolo en Mercado Libre y cuántas conviene traer.">
      <BarraMarketPro activa="importar" sp={{}} />
      <Avisos sp={sp} />
      <AltaNueva texto="Nuevo costeo" sinBoton>
        <form action={accionNuevoCosteo} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
          <label className="col-span-2 sm:col-span-6"><span className={ETIQUETA}>Lista de precios (pegala como venga: Excel, mail, PDF)</span>
            <textarea name="lista" rows={10} autoFocus placeholder={"HP 15-fd0012la  i5-1335U 8GB 512GB 15.6\"   US$ 389\nLenovo IdeaPad Slim 3 82XB0012US  R5 7520U 8/256   US$ 349"} className={`${CAMPO} w-full font-mono text-xs`} /></label>
          <label className="col-span-2"><span className={ETIQUETA}>Nombre (opcional)</span><input name="titulo" placeholder="Ej. Lista de Miami, 10/11" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>Monto a importar (US$ FOB)</span><CampoNumero name="monto" valor={null} tipo="usd" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>Dólar ($)</span><CampoNumero name="dolar" valor={null} tipo="pesos" placeholder={formatearNumero(dolarHoy, "pesos")} className={`${CAMPO} w-full`} /></label>
          <div className="col-span-2"><button className={PRIMARIO}>Calcular</button>
            <span className="block text-[11px] text-[#5C6B76] mt-1">La IA lee la lista y busca cada modelo en Market Pro: tarda unos minutos y se actualiza sola. Sin dólar, el oficial de hoy.</span></div>
        </form>
      </AltaNueva>

      {sel ? <Detalle c={sel} /> : (
        <div className={`${CAJA} !p-0 overflow-x-auto`}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Fecha</th><th className={TH}>Nombre</th><th className={THN}>Modelos</th><th className={THN} title="Modelos encontrados en Market Pro">Encontr.</th><th className={THN}>Monto</th><th className={TH}>Estado</th><th className={TH}></th></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className={TR}>
                  <td className={TD}><Link href={`/market-pro/importar?id=${c.id}`} className="text-[#16577F]">{c.creado}</Link></td>
                  <td className={TD}><Link href={`/market-pro/importar?id=${c.id}`} className="text-[#16577F]">{c.titulo ?? `Costeo ${c.id}`}</Link></td>
                  <td className={TDN}>{entero(c.modelos)}</td><td className={TDN}>{entero(c.cruzados)}</td><td className={TDN}>{usd(c.monto_usd)}</td>
                  <td className={TD}>{c.estado === "trabajando" ? "Leyendo la lista…" : c.estado === "error" ? <span className="text-[#C03420]">{c.error}</span> : "Listo"}</td>
                  <td className={TD}><TachoCosteo id={c.id} /></td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>Todavía no hay costeos. Tocá «Nuevo costeo» arriba a la derecha.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Pantalla>
  );
}

function Detalle({ c }: { c: Costeo }) {
  const r = c.resultado;
  const e = r?.envio;
  const filas = r ? [...r.filas].sort((a, b) => (b.cantidad - a.cantidad) || ((b.sobre_costo ?? -9) - (a.sobre_costo ?? -9))) : [];
  const propuestas = filas.filter((f) => f.cantidad > 0);
  const gananciaMes = propuestas.reduce((s, f) => s + (f.ganancia ?? 0) * Math.min(f.cantidad, f.mercado?.lider_mes ?? 0), 0);
  return (
    <>
      <Refrescar trabajando={c.estado === "trabajando"} />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-sm font-bold text-[#16577F]">{c.titulo ?? `Costeo ${c.id}`} <span className="font-normal text-xs text-[#5C6B76]">· {c.creado}{c.costo_ia_usd ? ` · IA US$ ${formatearNumero(c.costo_ia_usd, "usd")}` : ""}</span></p>
        <span className="flex items-center gap-2"><Link href="/market-pro/importar" className={SUAVE}>Todos los costeos</Link><TachoCosteo id={c.id} /></span>
      </div>
      {c.estado === "trabajando" && <p className={`${CAJA} text-xs mb-3`}>La IA está leyendo la lista y buscando cada modelo en Market Pro. Tarda unos minutos; la pantalla se actualiza sola.</p>}
      {c.estado === "error" && <p className="text-xs mb-3 rounded-lg px-3 py-2 bg-[#FDF1EF] text-[#C03420]">No se pudo: {c.error}</p>}
      {r && (
        <>
          <form action={accionRecalcular} className={`${CAJA} flex flex-wrap items-end gap-3 mb-3`}>
            <input type="hidden" name="id" value={c.id} />
            <label><span className={ETIQUETA}>Monto a importar (US$ FOB)</span><CampoNumero name="monto" valor={c.monto_usd} tipo="usd" className={`${CAMPO} w-40`} /></label>
            <label><span className={ETIQUETA}>Dólar ($)</span><CampoNumero name="dolar" valor={r.dolar} tipo="pesos" className={`${CAMPO} w-32`} /></label>
            <button className={SUAVE}>Recalcular</button>
            <span className="text-[11px] text-[#5C6B76]">Recalcula con el monto, el dólar y los costos de importación de ahora, sin volver a leer la lista.</span>
          </form>
          <div className="grid gap-3 sm:grid-cols-5 mb-4">
            {[
              ["Propuesta (FOB)", usd(e?.fob), `${entero(e?.unidades)} notebooks en ${entero(e?.cajas)} ${e?.cajas === 1 ? "caja" : "cajas"}`],
              ["Costo nacionalizado sin IVA", usd(e?.costo), e ? `${formatearNumero(e.coef, "decimal")} × el FOB` : ""],
              ["En pesos", pesos(e ? e.costo * r.dolar : null), `dólar $ ${formatearNumero(r.dolar, "pesos")}`],
              ["IVA de importación (crédito)", usd(e?.iva), "se paga, pero no es costo"],
              ["Ganancia por mes", pesos(gananciaMes), "vendiendo lo que vende el que gana el catálogo"],
            ].map(([t, v, a]) => (
              <div key={t} className={CAJA}><p className="text-[11px] text-[#5C6B76]">{t}</p><p className="text-lg font-bold tabular-nums">{v}</p><p className="text-[11px] text-[#5C6B76]">{a}</p></div>
            ))}
          </div>

          <div className={`${CAJA} !p-0 overflow-x-auto mb-4`}>
            <table className={TABLA}>
              <thead className={THEAD}><tr>
                <th className={TH}>Modelo</th>
                <th className={THN} title="Cantidad propuesta">Traer</th>
                <th className={THN} title="Precio FOB por unidad">FOB</th>
                <th className={THN} title="Costo nacionalizado sin IVA por unidad">Costo US$</th>
                <th className={THN} title="Costo nacionalizado en pesos">Costo $</th>
                <th className={THN} title="Precio más bajo del último mes cerrado en Mercado Libre">Mejor precio</th>
                <th className={THN} title="Ganancia por unidad al mejor precio">Ganancia</th>
                <th className={THN} title="Ganancia ÷ precio sin IVA">s/venta</th>
                <th className={THN} title="Ganancia ÷ costo">s/costo</th>
                <th className={THN} title="Unidades por mes del vendedor que más vende ese producto (últimos 3 meses cerrados): lo que se vendería ganando el catálogo">Líder/mes</th>
                <th className={THN} title="Unidades por mes de todos los vendedores">Total/mes</th>
                <th className={THN} title="Vendedores con ventas">Vend.</th>
                <th className={THN} title="Precio mediano de los últimos 3 meses">Mediana</th>
                <th className={TH}>En Mercado Libre</th>
              </tr></thead>
              <tbody>{filas.map((f, i) => (
                <tr key={i} className={`${TR} ${f.cantidad ? "" : "opacity-70"}`}>
                  <td className={`${TD} max-w-72`}><span className="font-semibold">{[f.marca, f.modelo].filter(Boolean).join(" ")}</span>
                    <span className="block text-[11px] text-[#5C6B76]"><TituloCorto titulo={f.descripcion ?? f.linea} /></span></td>
                  <td className={`${TDN} font-bold`}>{f.cantidad || "—"}</td>
                  <td className={TDN}>{usd(f.fob)}</td><td className={TDN}>{usd(f.costo_usd)}</td><td className={TDN}>{pesos(f.costo_ars)}</td>
                  <td className={TDN}>{pesos(f.mercado?.precio_min)}</td>
                  <td className={`${TDN} ${f.ganancia != null && f.ganancia < 0 ? "text-[#C03420]" : ""}`}>{pesos(f.ganancia)}</td>
                  <td className={TDN}>{pct(f.sobre_venta)}</td><td className={TDN}>{pct(f.sobre_costo)}</td>
                  <td className={TDN}>{entero(f.mercado?.lider_mes)}</td><td className={TDN}>{entero(f.mercado?.unidades_mes)}</td><td className={TDN}>{entero(f.mercado?.vendedores)}</td>
                  <td className={TDN}>{pesos(f.mercado?.precio_mediana)}</td>
                  <td className={`${TD} max-w-80`}>{f.producto && f.mercado ? (
                    <span className="flex items-center gap-2"><FotosProducto fotos={f.mercado.foto ? [f.mercado.foto] : []} titulo={f.mercado.titulo ?? ""} />
                      <span><Link href={linkProducto(f.producto, {})} className="text-[#16577F]"><TituloCorto titulo={f.mercado.titulo} /></Link>
                        <VerEnMl producto={f.producto} titulo={f.mercado.titulo} />
                        <span className="block text-[10px] text-[#5C6B76]" title={f.nota ?? ""}>{CONFIANZA[f.confianza ?? ""] ?? ""}{f.nota ? ` · ${f.nota}` : ""}</span></span></span>
                  ) : <span className="text-[11px] text-[#5C6B76]" title={f.nota ?? ""}>No se vende en Mercado Libre (o no lo encontré){f.nota ? `: ${f.nota}` : ""}</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          {e && (
            <div className={`${CAJA} !p-0 overflow-x-auto max-w-xl`}>
              <p className="text-xs font-semibold px-3 pt-3 pb-2">Costo del envío propuesto</p>
              <table className={TABLA}><tbody>
                {([
                  ["FOB", e.fob], [`Flete: ${formatearNumero(e.kg_cobrables, "decimal")} kg cobrables`, e.flete], ["Seguro (sólo se declara)", e.seguro], ["CIF", e.cif],
                  ["Aranceles", e.aranceles], ["Tasa de estadística", e.estadistica], ["Packing", e.packing], ["AWB", e.awb], ["THC", e.thc], ["TCA", e.tca],
                  ["Gastos en destino", e.gastos_destino], ["Honorarios del despachante", e.despachante], ["Gastos del despachante", e.gastos_despachante],
                  ["Costo nacionalizado sin IVA", e.costo], ["IVA de importación (crédito, aparte)", e.iva],
                ] as [string, number][]).map(([t, v]) => (
                  <tr key={t} className={`${TR} ${/^(CIF|Costo)/.test(t) ? "font-bold" : ""}`}><td className={TD}>{t}</td><td className={TDN}>{usd(v)}</td></tr>
                ))}
              </tbody></table>
            </div>
          )}
          <p className="text-[11px] text-[#5C6B76] mt-3">Ganancia = precio sin IVA ({formatearNumero(r.config.iva_venta_pct, "pct")} %) − comisión Clásica de la categoría − envío de Mercado Libre ({r.envio_venta?.promedio != null ? `${pesos(r.envio_venta.promedio)} con IVA por unidad: promedio de tus ${r.envio_venta.ventas} ventas de ${r.config.envio_familia} de los últimos 90 días` : "sin dato: no se descuenta"}){r.config.gasto_venta ? ` − otros gastos (${pesos(r.config.gasto_venta)})` : ""} − costo nacionalizado; la comisión y el envío, sin su IVA (es crédito). La propuesta va de la que más gana sobre el costo a la que menos, hasta {formatearNumero(r.config.meses_tope, "decimal")} meses de lo que vende el líder, mientras alcance el monto.</p>
        </>
      )}
    </>
  );
}
