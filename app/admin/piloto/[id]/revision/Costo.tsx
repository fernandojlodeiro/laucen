import { cuenta, type DatosCosto } from "@/lib/piloto/costo";
import type { Caja, Parametros } from "@/lib/piloto/tipos";
import { formatearNumero } from "@/lib/numeros";
import { DESPLEGABLE_CHICO } from "@/app/botones";

const usd = (n: number | null) => (n == null ? "—" : `US$ ${formatearNumero(n, "usd")}`);
const pct = (n: number | null) => (n == null ? "—" : `${formatearNumero(n, "pct")}%`);
const color = (n: number | null) => (n == null ? "" : n >= 0 ? "text-[#1F6E4A]" : "text-[#C03420]");

/** Costo puesto en Argentina contra el precio de venta de Mercado Libre, con
 *  el desglose a un clic (Fer, 28/9). */
export function Costo({ fob, caja, precio, p, datos }: { fob: number; caja: Caja | null; precio: number | null; p: Parametros; datos: DatosCosto | null }) {
  const k = cuenta(fob, caja, precio, p, datos);
  const t = datos?.tasas;
  const filas: [string, string, string?][] = [
    ["FOB (costo en China)", usd(k.fob)],
    ["Seguro", usd(k.seguro), "1% del FOB"],
    ["Flete", usd(k.flete), k.fleteComo],
    ["CIF", usd(k.cif), "FOB + seguro + flete"],
    ["Derechos", usd(k.derechos), t?.arancel != null ? `${formatearNumero(t.arancel, "pct")}% del CIF${t.arancelMin != null ? ` (según la apertura, desde ${formatearNumero(t.arancelMin, "pct")}%; se toma el más alto)` : ""}` : "sin arancel"],
    ["Tasa de estadística", usd(k.estadistica), t ? `${formatearNumero(t.estadistica, "pct")}% del CIF` : ""],
    ["Base imponible", usd(k.base), "CIF + derechos + estadística"],
    ["IVA", usd(k.iva), t ? `${formatearNumero(t.iva, "pct")}% de la base${t.deDespachos ? "" : " (sin despachos de esa NCM: se asume)"}` : ""],
    ["Despachante, depósito y otros", usd(k.gastos), "3% del CIF"],
    ["Costo puesto en Argentina", usd(k.costo)],
  ];
  return (
    <div className="mt-2 border-t border-[#E3E9F0] pt-2">
      <p>
        <b>Costo puesto en Argentina: {usd(k.costo)}</b> · venta en Mercado Libre {usd(k.venta)} ·{" "}
        rentabilidad bruta <b className={color(k.sobreCosto)}>{pct(k.sobreCosto)} sobre el costo</b> ({pct(k.sobreVenta)} sobre la venta)
        {k.neto != null && <> · neto de Mercado Libre {usd(k.neto)}: <b className={color(k.netoSobreCosto)}>{pct(k.netoSobreCosto)} sobre el costo</b> ({pct(k.netoSobreVenta)} sobre la venta)</>}
      </p>
      {k.falta.length > 0 && <p className="text-[#8a6100]">Para completar la cuenta falta {k.falta.join(" y ")}.</p>}
      <details className="mt-1 group">
        <summary className={DESPLEGABLE_CHICO}>Ver la cuenta</summary>
        <table className="mt-2 text-[11px]">
          <tbody>
            {filas.map(([a, b, c]) => (
              <tr key={a} className={a === "CIF" || a.startsWith("Costo") || a === "Base imponible" ? "font-bold" : ""}>
                <td className="pr-3 py-0.5">{a}</td><td className="pr-3 py-0.5 text-right whitespace-nowrap">{b}</td><td className="text-[#5C6B76]">{c}</td>
              </tr>
            ))}
            <tr><td colSpan={3} className="pt-2 font-bold">Mercado Libre (publicación clásica, envío por Full)</td></tr>
            <tr><td className="pr-3">Precio de venta</td><td className="pr-3 text-right">{usd(k.venta)}</td><td className="text-[#5C6B76]">{precio != null ? `$ ${formatearNumero(precio, "pesos")} ÷ ${p.dolar}` : ""}</td></tr>
            <tr><td className="pr-3">Comisión</td><td className="pr-3 text-right">{usd(k.comision)}</td><td className="text-[#5C6B76]">{datos?.ml.comision != null ? `$ ${formatearNumero(datos.ml.comision, "pesos")}` : ""}</td></tr>
            <tr><td className="pr-3">Envío Full</td><td className="pr-3 text-right">{usd(k.envio)}</td><td className="text-[#5C6B76]">{datos?.ml.envio != null ? `$ ${formatearNumero(datos.ml.envio, "pesos")}` : ""}</td></tr>
            <tr className="font-bold"><td className="pr-3">Neto antes de impuestos y otros gastos</td><td className="pr-3 text-right">{usd(k.neto)}</td><td /></tr>
          </tbody>
        </table>
        {t && (
          <p className="mt-2 text-[11px]">
            <b>NCM {t.ncm}</b>{t.aproximada ? ` (el juez propuso ${t.propuesta}, que no existe: se tomó la más usada de la misma subpartida)` : ""}
            {!t.existe && " — no está en el nomenclador"}{t.descripcion && ` — ${t.descripcion}`}
            {t.despachos > 0 && <span className="text-[#5C6B76]"> · usada en {formatearNumero(t.despachos, "entero")} ítems de despachos del último año</span>}
          </p>
        )}
        {!!datos?.ml.errores.length && <p className="text-[11px] text-[#8a6100]">Mercado Libre no dio: {datos.ml.errores.join(" · ")}</p>}
      </details>
    </div>
  );
}
