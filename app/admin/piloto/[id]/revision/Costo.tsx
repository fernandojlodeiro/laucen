import { cuenta, type DatosCosto } from "@/lib/piloto/costo";
import type { Caja, Parametros } from "@/lib/piloto/tipos";
import { formatearNumero } from "@/lib/numeros";
import Link from "next/link";
import { DESPLEGABLE_CHICO, SUAVE, VERDE } from "@/app/botones";
import { accionCorregirNcm } from "../../actions";

const LAPIZ = "text-sm leading-none rounded-lg px-2 py-1.5 bg-white border border-[#E3E9F0] text-[#16577F]";

const usd = (n: number | null) => (n == null ? "—" : `US$ ${formatearNumero(n, "usd")}`);
const pct = (n: number | null) => (n == null ? "—" : `${formatearNumero(n, "pct")}%`);
const color = (n: number | null) => (n == null ? "" : n >= 0 ? "text-[#1F6E4A]" : "text-[#C03420]");

/** Costo puesto en Argentina contra el precio de venta de Mercado Libre, con
 *  el desglose a un clic (Fer, 28/9). */
export function Costo({ fob, caja, precio, p, datos, cajaChina, unidades, lapiz }: {
  fob: number; caja: Caja | null; precio: number | null; p: Parametros; datos: DatosCosto | null;
  cajaChina?: { largo: number; ancho: number; alto: number; kg: number } | null; unidades?: number;
  lapiz?: { producto: number; corrida: number; editando: boolean; editar: string; cancelar: string };
}) {
  const cl = datos?.clasificacion;
  const k = cuenta(fob, caja, precio, p, datos, cajaChina, unidades);
  const t = datos?.tasas;
  const alt = datos?.alternativa;
  // Fer (28/9): una duda de NCM que no cambia el arancel no se menciona; si lo
  // cambia, se marca fuerte para revisarla.
  const avisos: string[] = [];
  if (t && alt && alt.arancel != null && t.arancel != null && alt.arancel !== t.arancel)
    avisos.push(`Revisar la NCM: puede ir en ${t.ncm} (arancel ${formatearNumero(t.arancel, "pct")}%) o en ${alt.ncm} (arancel ${formatearNumero(alt.arancel, "pct")}%). Se usó ${t.ncm}.`);
  if (t?.arancelMin != null && t.arancel != null)
    avisos.push(`Revisar la NCM ${t.ncm}: según la apertura, el arancel va de ${formatearNumero(t.arancelMin, "pct")}% a ${formatearNumero(t.arancel, "pct")}%. Se usó ${formatearNumero(t.arancel, "pct")}%.`);
  const filas: [string, string, string?][] = [
    ["FOB (costo en China)", usd(k.fob)],
    ["Seguro", usd(k.seguro), "1% del FOB"],
    ["Flete", usd(k.flete), k.fleteComo],
    ["CIF", usd(k.cif), "FOB + seguro + flete"],
    ["Derechos", usd(k.derechos), t?.arancel != null ? `${formatearNumero(t.arancel, "pct")}% del CIF (NCM ${t.ncm})` : "sin arancel"],
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
      {avisos.map((a) => <p key={a} className="text-[#C03420] font-bold">⚠ {a}</p>)}
      {/* NCM con lápiz: la corrección queda registrada para ese producto de China (Fer, 28/9). */}
      {lapiz?.editando ? (
        <form action={accionCorregirNcm} className="flex flex-wrap gap-1 items-center mt-1">
          <input type="hidden" name="producto" value={lapiz.producto} />
          <input type="hidden" name="corrida" value={lapiz.corrida} />
          <span>NCM:</span>
          <input name="ncm" defaultValue={cl?.sim ?? t?.ncm ?? ""} autoFocus placeholder="3926.90.90 o 3926.90.90.999A"
            className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs w-48" />
          <button className={VERDE}>Guardar</button>
          <Link href={lapiz.cancelar} className={SUAVE}>Cancelar</Link>
          <span className="text-[11px] text-[#5C6B76] w-full">Con la apertura completa (…999A) se toma su arancel exacto. Vale para todo este tipo de mercadería ({cl?.clave ?? "este producto"}) de acá en adelante.</span>
        </form>
      ) : t && (
        <p className="mt-1 flex flex-wrap items-center gap-2">
          <span>
            <b>NCM {cl?.sim ?? t.ncm}</b> · arancel {t.arancel != null ? `${formatearNumero(t.arancel, "pct")}%` : "?"}
            {cl && <span className="text-[#5C6B76]"> · tipo: {cl.clave} · {cl.fuente === "fer" ? "corregida por vos" : `clasificada por Claude${cl.nueva ? "" : " (del registro)"}`}{cl.material ? ` · material: ${cl.material}` : ""}</span>}
          </span>
          {lapiz && <Link href={lapiz.editar} className={LAPIZ} aria-label="Corregir la NCM">✏️</Link>}
          {cl?.motivo && cl.fuente !== "fer" && <span className="block w-full text-[11px] text-[#5C6B76]">{cl.motivo}</span>}
        </p>
      )}
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
