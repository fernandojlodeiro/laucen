// Informe: ventas por canal o por razón social (lib/informes/ventas-canal.ts). Monto y cantidad de pedidos (carritos,
// no ítems) del período, con el gráfico en barras o líneas, el total de cada canal y el detalle por período.

import RangoFechas from "@/app/componentes/RangoFechas";
import { entrarErp, Pantalla, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, TituloSeccion } from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import { AGRUPAR, GRAFICOS, MEDIDAS, PASOS, leerFiltroVentas, ventasPorCanal } from "@/lib/informes/ventas-canal";
import { Desplegable } from "../Filtros";
import Grafico, { colorDe, etiquetaPeriodo, valorTexto } from "./Grafico";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SP = Record<string, string | undefined>;
const pesos = (n: number) => `$ ${formatearNumero(Math.round(n), "pesos")}`;
const entero = (n: number) => formatearNumero(n, "entero");
const pct = (n: number, t: number) => (t ? `${formatearNumero(Math.round((n / t) * 1000) / 10, "pct")} %` : "—");
const opciones = (o: Record<string, string>, defecto: string) => Object.entries(o).map(([k, v]) => ({ valor: k === defecto ? "" : k, texto: v }));

export default async function VentasPorCanal({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("informes_ventas_ver");
  const sp = await searchParams;
  const f = leerFiltroVentas(sp);
  const { grupos, puntos, periodos } = await ventasPorCanal(s.org.id, f);
  const total = { monto: grupos.reduce((t, g) => t + g.monto, 0), pedidos: grupos.reduce((t, g) => t + g.pedidos, 0) };
  const valor = new Map(puntos.map((p) => [`${p.periodo}|${p.clave}`, p]));
  const de = (per: string, clave: string) => valor.get(`${per}|${clave}`)?.[f.medida] ?? 0;

  return (
    <Pantalla titulo="Ventas por canal"
      subtitulo="Monto y cantidad de pedidos de todos los canales (Mercado Libre, web, local y el historial de Virtual Seller), sin canceladas. Un pedido es un carrito, no cada producto. Montos en pesos de cada momento, sin el envío.">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <RangoFechas desde={f.desde} hasta={f.hasta} />
        <Desplegable parametro="por" etiqueta="Separado por" valor={f.por === "canal" ? "" : f.por} opciones={opciones(AGRUPAR, "canal")} />
        <Desplegable parametro="paso" etiqueta="Agrupado" valor={f.pasoElegido === "auto" ? "" : f.pasoElegido} opciones={opciones(PASOS, "auto")} />
        <Desplegable parametro="medida" etiqueta="Gráfico de" valor={f.medida === "monto" ? "" : f.medida} opciones={opciones(MEDIDAS, "monto")} />
        <Desplegable parametro="grafico" etiqueta="En" valor={f.grafico === "barras" ? "" : f.grafico} opciones={opciones(GRAFICOS, "barras")} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        <div className={CAJA}><p className="text-[11px] text-[#5C6B76]">Monto</p><p className="text-xl font-bold tabular-nums">{pesos(total.monto)}</p></div>
        <div className={CAJA}><p className="text-[11px] text-[#5C6B76]">Pedidos</p><p className="text-xl font-bold tabular-nums">{entero(total.pedidos)}</p></div>
        <div className={CAJA}><p className="text-[11px] text-[#5C6B76]">Ticket promedio</p><p className="text-xl font-bold tabular-nums">{total.pedidos ? pesos(total.monto / total.pedidos) : "—"}</p></div>
      </div>

      <div className={`${CAJA} mb-4`}>
        {grupos.length
          ? <Grafico grupos={grupos} puntos={puntos} periodos={periodos} medida={f.medida} grafico={f.grafico} paso={f.paso} />
          : <p className="text-xs text-[#5C6B76]">No hay ventas en ese período.</p>}
      </div>

      <TituloSeccion titulo={`Por ${f.por === "canal" ? "canal" : "razón social"} (${grupos.length})`} />
      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>{AGRUPAR[f.por]}</th>
              <th className={THN} title="Cantidad de pedidos (carritos)">Pedidos</th><th className={THN} title="Porcentaje de los pedidos">% ped.</th>
              <th className={THN}>Monto</th><th className={THN} title="Porcentaje del monto">% monto</th>
              <th className={THN} title="Monto dividido la cantidad de pedidos">Ticket prom.</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g, i) => (
              <tr key={g.clave} className={TR}>
                <td className={TD}><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: colorDe(i) }} aria-hidden />{g.nombre}</td>
                <td className={TDN}>{entero(g.pedidos)}</td><td className={TDN}>{pct(g.pedidos, total.pedidos)}</td>
                <td className={TDN}>{pesos(g.monto)}</td><td className={TDN}>{pct(g.monto, total.monto)}</td>
                <td className={TDN}>{g.pedidos ? pesos(g.monto / g.pedidos) : "—"}</td>
              </tr>
            ))}
            {grupos.length > 1 && (
              <tr className={`${TR} font-bold`}>
                <td className={TD}>Total</td>
                <td className={TDN}>{entero(total.pedidos)}</td><td className={TDN}>100 %</td>
                <td className={TDN}>{pesos(total.monto)}</td><td className={TDN}>100 %</td>
                <td className={TDN}>{total.pedidos ? pesos(total.monto / total.pedidos) : "—"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {grupos.length > 0 && <>
        <TituloSeccion titulo={`${MEDIDAS[f.medida]} ${PASOS[f.paso].toLowerCase()} (${periodos.length})`} />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Período</th>
                {grupos.map((g, i) => <th key={g.clave} className={THN} title={g.nombre}><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: colorDe(i) }} aria-hidden />{g.nombre}</th>)}
                <th className={THN}>Total</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((per) => {
                const tot = grupos.reduce((t, g) => t + de(per, g.clave), 0);
                return (
                  <tr key={per} className={TR}>
                    <td className={TD}>{etiquetaPeriodo(per, f.paso, true)}</td>
                    {grupos.map((g) => <td key={g.clave} className={TDN}>{de(per, g.clave) ? valorTexto(de(per, g.clave), f.medida) : ""}</td>)}
                    <td className={`${TDN} font-bold`}>{tot ? valorTexto(tot, f.medida) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
    </Pantalla>
  );
}
