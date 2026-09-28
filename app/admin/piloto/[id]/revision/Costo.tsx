import { cuenta, type DatosCosto } from "@/lib/piloto/costo";
import type { Caja, Parametros } from "@/lib/piloto/tipos";
import { formatearNumero } from "@/lib/numeros";
import Link from "next/link";
import { DESPLEGABLE_CHICO, SUAVE, VERDE } from "@/app/botones";
import { accionCorregirNcm } from "../../actions";

const LAPIZ = "text-sm leading-none rounded-lg px-2 py-1.5 bg-white border border-[#E3E9F0] text-[#16577F]";

const usd = (n: number | null) => (n == null ? "—" : `US$ ${formatearNumero(n, "usd")}`);
const pct = (n: number | null) => (n == null ? "—" : `${formatearNumero(n, "pct")}%`);
// Neto sobre la venta (Fer, 28/9): 30% o más, verde; menos de 20, ámbar; menos de 10,
// casi rojo; menos de 5, rojo.
const colorNeto = (n: number | null) => n == null ? "text-[#5C6B76]" : n >= 30 ? "text-[#138A4B]" : n >= 20 ? "text-[#1F6E4A]"
  : n >= 10 ? "text-[#B7791F]" : n >= 5 ? "text-[#D2551E]" : "text-[#C03420]";

/** Costo puesto en Argentina contra el precio de venta de Mercado Libre, con
 *  el desglose a un clic (Fer, 28/9). */
export function Costo({ fob, caja, precio, p, datos, cajaChina, unidades, lapiz, tramos }: {
  fob: number; caja: Caja | null; precio: number | null; p: Parametros; datos: DatosCosto | null;
  cajaChina?: { largo: number; ancho: number; alto: number; kg: number } | null; unidades?: number;
  tramos?: { desde: number; hasta: number | null; usd: number }[];
  lapiz?: { producto: number; corrida: number; editando: boolean; editar: string; cancelar: string };
}) {
  const cl = datos?.clasificacion;
  const k = cuenta(fob, caja, precio, p, datos, cajaChina, unidades);
  // Con el precio por volumen (el último tramo de la publicación): cuánto rinde trayendo más cantidad (Fer, 28/9).
  const u = unidades ?? 1;
  const ultimo = tramos && tramos.length > 1 ? tramos[tramos.length - 1] : null;
  const kv = ultimo ? cuenta(Math.max(0, fob - u * tramos![0].usd + u * ultimo.usd), caja, precio, p, datos, cajaChina, unidades) : null;
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
  // El cuadro de siempre, para ver la cuenta de un golpe de vista (Fer, 28/9). El número
  // que más mira es el último: neto después de Mercado Libre, sobre la venta.
  const conVol = !!(kv && ultimo);
  const filasCuadro: [string, (x: typeof k) => string, boolean?][] = [
    ["Costo puesto en Argentina", (x) => usd(x.costo)],
    ["Venta en Mercado Libre", (x) => usd(x.venta)],
    ["Bruta sobre el costo", (x) => pct(x.sobreCosto)],
    ["Bruta sobre la venta", (x) => pct(x.sobreVenta)],
    ["Neto de ML (sin comisión ni envío Full)", (x) => usd(x.neto)],
    ["Neto sobre el costo", (x) => pct(x.netoSobreCosto)],
    ["Neto sobre la venta", (x) => pct(x.netoSobreVenta), true],
  ];
  return (
    <div className="mt-2">
      <table className="text-xs border border-[#E3E9F0] rounded-lg">
        {conVol && (
          <thead>
            <tr className="text-[11px] text-[#5C6B76]">
              <th />
              <th className="px-2 py-1 text-right font-normal">Pedido mínimo</th>
              <th className="px-2 py-1 text-right font-normal">Por volumen (≥ {formatearNumero(ultimo!.desde, "entero")} u.)</th>
            </tr>
          </thead>
        )}
        <tbody>
          {filasCuadro.map(([nombre, valor, principal]) => (
            <tr key={nombre} className={principal ? "border-t border-[#E3E9F0]" : ""}>
              <td className={`px-2 py-0.5 ${principal ? "font-bold" : ""}`}>{nombre}</td>
              {[k, ...(conVol ? [kv!] : [])].map((x, i) => (
                <td key={i} className={`px-2 py-0.5 text-right whitespace-nowrap ${principal ? `text-base font-bold ${colorNeto(x.netoSobreVenta)}` : ""}`}>{valor(x)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <details className="mt-1">
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
    </div>
  );
}
