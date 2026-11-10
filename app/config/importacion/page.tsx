// Configuración › Costos de importación (Fer, 10/11): con qué se costea una importación de notebooks en Sourcing ›
// Market Pro › Importar. Abre en vista; el lápiz arriba a la derecha pasa a edición (?editar=ficha).

import Link from "next/link";
import { entrarErp, Pantalla, Avisos, Dato, BotonesFicha, TituloSeccion, editandoFicha, CAMPO, ETIQUETA, CAJA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import CampoNumero from "@/app/componentes/CampoNumero";
import { formatearNumero } from "@/lib/numeros";
import { costearEnvio, leerConfigCosteo } from "@/lib/marketpro/costeo-config";
import { CAMPOS } from "./campos";
import { accionGuardarCosteo } from "./acciones";

export const dynamic = "force-dynamic";
type SP = { editar?: string; ok?: string; error?: string };

const AYUDA = "block text-[11px] text-[#5C6B76] mt-0.5";
const usd = (n: number) => `US$ ${formatearNumero(n, "usd")}`;

export default async function CostosImportacion({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("market_pro_config");
  const sp = await searchParams;
  const c = await leerConfigCosteo(s.org.id);
  const editando = editandoFicha(sp, "ficha");
  const VOLVER = "/config/importacion";
  const grupos = [...new Set(CAMPOS.map((f) => f.grupo))];
  const ej = costearEnvio(c, 12000, 30);

  return (
    <Pantalla titulo="Costos de importación" ancho="max-w-5xl"
      subtitulo={<>Con qué se calcula el costo nacionalizado en <Link href="/market-pro/importar" className="underline">Market Pro › Importar</Link>. Todo se reparte entre los modelos en proporción a su valor FOB.</>}
      acciones={<BotonesFicha editando={editando} ver={VOLVER} editar={`${VOLVER}?editar=ficha`} form="ficha" />}>
      <Avisos sp={sp} />
      {!editando ? (
        <>
          <div className={`${CAJA} mb-4`}><Dato etiqueta="Ruta">{c.nombre}</Dato></div>
          {grupos.map((g) => (
            <div key={g} className="mb-4">
              <TituloSeccion titulo={g} />
              <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start`}>
                {CAMPOS.filter((f) => f.grupo === g).map((f) => (
                  <Dato key={f.clave} etiqueta={f.etiqueta} numero ayuda={f.ayuda}>{formatearNumero(c[f.clave] as number, f.tipo)}</Dato>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        <form id="ficha" action={accionGuardarCosteo}>
          <div className={`${CAJA} mb-4`}><label><span className={ETIQUETA}>Ruta</span>
            <input name="nombre" defaultValue={c.nombre} className={`${CAMPO} w-full`} /></label></div>
          {grupos.map((g) => (
            <div key={g} className="mb-4">
              <TituloSeccion titulo={g} />
              <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start`}>
                {CAMPOS.filter((f) => f.grupo === g).map((f) => (
                  <label key={f.clave}><span className={ETIQUETA}>{f.etiqueta}</span>
                    <CampoNumero name={f.clave} valor={c[f.clave] as number} tipo={f.tipo} className={`${CAMPO} w-full`} />
                    {f.ayuda && <span className={AYUDA}>{f.ayuda}</span>}</label>
                ))}
              </div>
            </div>
          ))}
          <TituloSeccion titulo="Tabla TCA (por kg cobrables del envío)" />
          <div className={`${CAJA} mb-4`}>
            <textarea name="tca" rows={20} defaultValue={c.tca.map(([h, p]) => `${h == null ? "más" : formatearNumero(h, "decimal")}; ${formatearNumero(p, "usd")}`).join("\n")}
              className={`${CAMPO} w-full max-w-xs font-mono text-xs`} />
            <span className={AYUDA}>Un renglón por tramo: «hasta kg; US$». El último, «más; US$».</span>
          </div>
        </form>
      )}

      {!editando && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <TituloSeccion titulo="Tabla TCA (por kg cobrables del envío)" />
            <div className={`${CAJA} !p-0 overflow-x-auto`}>
              <table className={TABLA}>
                <thead className={THEAD}><tr><th className={TH}>Desde</th><th className={TH}>Hasta</th><th className={THN}>US$</th></tr></thead>
                <tbody>{c.tca.map(([h, p], i) => (
                  <tr key={i} className={TR}><td className={TD}>Más de {formatearNumero(i ? c.tca[i - 1][0] ?? 0 : 0, "decimal")} kg</td>
                    <td className={TD}>{h == null ? "Más" : `${formatearNumero(h, "decimal")} kg`}</td><td className={TDN}>{formatearNumero(p, "usd")}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div>
            <TituloSeccion titulo="Ejemplo: una caja, 30 notebooks a US$ 400 FOB" />
            <div className={`${CAJA} !p-0 overflow-x-auto`}>
              <table className={TABLA}><tbody>
                {([
                  ["FOB", ej.fob], [`Flete: ${formatearNumero(ej.kg_cobrables, "decimal")} kg cobrables`, ej.flete], ["Seguro (sólo se declara)", ej.seguro],
                  ["CIF", ej.cif], ["Aranceles", ej.aranceles], ["Tasa de estadística", ej.estadistica], ["Packing", ej.packing], ["AWB", ej.awb], ["THC", ej.thc],
                  ["TCA", ej.tca], ["Gastos en destino", ej.gastos_destino], ["Honorarios del despachante", ej.despachante], ["Gastos del despachante", ej.gastos_despachante],
                  ["Costo nacionalizado sin IVA", ej.costo], ["Por notebook", ej.costo / 30], ["IVA de importación (crédito, aparte)", ej.iva],
                ] as [string, number][]).map(([t, v]) => (
                  <tr key={t} className={`${TR} ${/^(CIF|Costo|Por notebook)/.test(t) ? "font-bold" : ""}`}><td className={TD}>{t}</td><td className={TDN}>{usd(v)}</td></tr>
                ))}
                <tr className={TR}><td className={TD}>Costo ÷ FOB</td><td className={TDN}>{formatearNumero(ej.coef, "decimal")}</td></tr>
              </tbody></table>
            </div>
          </div>
        </div>
      )}
    </Pantalla>
  );
}
