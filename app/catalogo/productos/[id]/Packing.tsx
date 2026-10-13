// Recuadro «Según packing list» de la ficha del producto (pestaña Datos): peso y volumen por unidad sacados de los
// packing lists de las compras, aparte del peso cargado en la ficha (lib/compras/packing.ts).

import { CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, Estado } from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import { FACTOR_AEREO, packingDeProducto } from "@/lib/compras/packing";

const dia = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "sin fecha");
const g = (n: number) => `${formatearNumero(Math.round(n), "entero")} g`;

export default async function PackingProducto({ org, productoId }: { org: string; productoId: number }) {
  const filas = await packingDeProducto(org, productoId);
  if (!filas.length) return null;
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
    </section>
  );
}
