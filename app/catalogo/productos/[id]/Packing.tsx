// Recuadro «Según packing list» de la ficha del producto (pestaña Datos): peso y volumen por unidad sacados de los
// packing lists de las compras, aparte del peso cargado en la ficha (lib/compras/packing.ts).

import { CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, Estado } from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import Link from "next/link";
import { FACTOR_AEREO, packingDeProducto } from "@/lib/compras/packing";
import { consulta } from "@/lib/erp/base";
import { configVia, costoCourier, costoFinal, costosResueltos } from "@/lib/compras/via";

const dia = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "sin fecha");
const g = (n: number) => `${formatearNumero(Math.round(n), "entero")} g`;

const usd = (n: number) => `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function PackingProducto({ org, productoId, familiaId }: { org: string; productoId: number; familiaId: number | null }) {
  const filas = await packingDeProducto(org, productoId);
  if (!filas.length) return null;
  // ¿Avión o barco? Con el dato que rige y el FOB de cada variación (lib/compras/via.ts).
  const [cfg, resueltos, fobs] = await Promise.all([
    configVia(org), costosResueltos(org, [{ id: productoId, familia_id: familiaId }]),
    consulta<{ id: number; fob: number | null }>("select id::int, case when costo_moneda = 'USD' then costo_fob::float8 end fob from variacion where organizacion_id = $1 and producto_id = $2", [org, productoId]),
  ]);
  const r = resueltos.get(productoId) ?? null;
  const fobDe = new Map(fobs.map((x) => [x.id, x.fob]));
  const vias = filas.filter((f) => f.rige).map((f) => {
    const fob = fobDe.get(f.variacion_id) ?? null;
    const kg = Math.max(f.peso_g / 1000, f.cbm * FACTOR_AEREO);
    const avion = kg * cfg.aereoUsdKg, barco = f.cbm * cfg.barcoUsdM3;
    return { f, fob, avion, barco, pct: fob ? (avion / fob) * 100 : null, finalAvion: fob ? costoCourier(fob, avion, cfg) : null, finalBarco: fob ? costoFinal(fob, barco, r, cfg) : null };
  });
  const variaciones = new Set(filas.map((f) => f.variacion_id)).size;
  return (
    <section className="mt-4">
      <h2 className="text-sm font-bold mb-1">Según packing list</h2>
      <p className="text-xs text-[#5C6B76] mb-2">
        Peso y volumen por unidad tomados de los packing lists de las compras (con su parte de caja y embalaje). No cambia el peso de arriba.
        <b> Exacto</b>: venía en cajas propias. <b>Aproximado</b>: en una caja mezclada, repartida por partes iguales entre todas sus unidades.
        Rige el exacto y, entre iguales, el más nuevo (★).
      </p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH} />{variaciones > 1 && <th className={TH}>Variación</th>}<th className={TH}>Dato</th>
              <th className={THN}>Peso por unidad</th><th className={THN} title="Volumen por unidad, en centímetros cúbicos">Volumen por unidad</th>
              <th className={THN} title={`Volumen × ${FACTOR_AEREO} kg por m³: lo que cobra el flete aéreo si es mayor que el peso real`}>Peso volumétrico (avión)</th>
              <th className={THN} title="El mayor entre el peso real y el volumétrico">Cobrable por avión</th>
              <th className={TH}>Packing list</th><th className={THN}>Unidades</th><th className={TH}>Cajas</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const vol = f.cbm * FACTOR_AEREO * 1000;
              const cobrable = Math.max(vol, f.peso_g);
              return (
                <tr key={`${f.variacion_id}-${f.packing_list_id}`} className={`${TR} ${f.rige ? "" : "text-[#5C6B76]"}`}>
                  <td className={TD} title={f.rige ? "Es el dato que rige" : undefined}>{f.rige ? "★" : ""}</td>
                  {variaciones > 1 && <td className={`${TD} font-mono`}>{f.sku_variacion}</td>}
                  <td className={TD}>{f.exacto ? <Estado texto="Exacto" tono="verde" /> : <Estado texto="Aproximado" tono="ambar" />}</td>
                  <td className={`${TDN} ${f.rige ? "font-semibold" : ""}`}>{g(f.peso_g)}</td>
                  <td className={TDN}>{formatearNumero(Math.round(f.cbm * 1e6), "entero")} cm³</td>
                  <td className={TDN}>{g(vol)}</td>
                  <td className={`${TDN} ${vol > f.peso_g * 1.5 ? "text-[#C03420] font-semibold" : ""}`} title={vol > f.peso_g ? "Cobra por volumen" : "Cobra por peso"}>{g(cobrable)}</td>
                  <td className={TD}>{f.numero ?? f.archivo} · {dia(f.fecha)}{f.via ? ` · ${f.via === "barco" ? "barco" : "avión"}` : ""}</td>
                  <td className={TDN}>{formatearNumero(f.cantidad, "entero")}</td>
                  <td className={`${TD} text-[11px] max-w-[10rem] truncate`} title={f.cajas ?? ""}>{f.cajas}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[#5C6B76] mt-1">En rojo, los que por avión pagan bastante más por volumen que por peso (el volumétrico supera en 50 % al real).</p>
      <div className="mt-2 text-xs space-y-0.5">
        {vias.map((v) => (
          <p key={v.f.variacion_id}>
            {variaciones > 1 && <span className="font-mono mr-1">{v.f.sku_variacion}:</span>}
            Flete por avión <b>{usd(v.avion)}</b> por unidad (US$ {cfg.aereoUsdKg}/kg){v.pct != null && <> = <b className={v.pct > cfg.umbralFletePct ? "text-[#C03420]" : ""}>{v.pct.toFixed(1).replace(".", ",")} % del FOB</b>{v.pct > cfg.umbralFletePct && " (conviene barco)"}</>}
            {" · "}por barco <b>{usd(v.barco)}</b> (US$ {cfg.barcoUsdM3}/m³).
            {v.finalAvion != null && v.finalBarco != null && <> Costo final: avión por courier <b>{usd(v.finalAvion)}</b> (FOB + flete + {cfg.courierPct} % del FOB), barco con IVA <b>{usd(v.finalBarco)}</b>{r?.derecho_pct.valor == null && ` (sin NCM: impuestos y gastos ${cfg.recargoSinDatosPct} %)`}.</>}
          </p>
        ))}
        <p className="text-[10px] text-[#5C6B76]">La categoría (avión, conviene barco, no rentable o imposible por avión) contra el precio de la Clásica está en <Link href="/compras/sugerencia" className="text-[#16577F] hover:underline">Sugerencia de compra</Link>.</p>
      </div>
    </section>
  );
}
