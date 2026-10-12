// Ficha de una compra por courier: flete por kilo, % courier e ingreso (lápiz arriba a la derecha) y sus productos con
// el costo de cada uno: (FOB + peso × flete por kilo) × (1 + % courier), en dólares y en pesos al dólar de hoy
// (costo de reposición). «Grabar costos en los productos» deja FOB, último costo y peso en cada producto.

import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonConfirmar } from "@/app/radar/Cliente";
import { VERDE } from "@/app/botones";
import FotosProducto from "@/app/componentes/FotosProducto";
import CampoNumero from "@/app/componentes/CampoNumero";
import {
  entrarErp, Pantalla, Avisos, BotonesFicha, Dato, editandoFicha, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { compra, costoUnitario } from "@/lib/compras/courier";
import { tcDelDia, formatear } from "@/lib/moneda";
import { formatearNumero } from "@/lib/numeros";
import { fechaHora } from "@/app/ventas/formato";
import { accionGrabarCostosCourier, accionGuardarCompraCourier } from "../acciones";

export const dynamic = "force-dynamic";

const aLocal = (d: Date | null) => (d ? new Date(new Date(d).getTime() - 3 * 3600_000).toISOString().slice(0, 16) : "");

export default async function FichaCompraCourier({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; editar?: string }> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const cid = Number((await params).id);
  if (!Number.isInteger(cid) || cid <= 0) notFound();
  const [d, tc] = await Promise.all([compra(s.org.id, cid), tcDelDia(s.org.id)]);
  if (!d) notFound();
  const { compra: c, lineas } = d;
  const editando = editandoFicha(sp);
  const base = `/compras/courier/${cid}`;
  const filas = lineas.map((l) => {
    const usd = costoUnitario(l.fob_unit_usd, l.peso_g, c.flete_usd_kg, c.courier_pct);
    return { ...l, kg: (l.cantidad * (l.peso_g ?? 0)) / 1000, flete: (l.cantidad * (l.peso_g ?? 0) / 1000) * c.flete_usd_kg, usd, ars: tc ? usd * tc.venta : null };
  });
  const tot = filas.reduce((a, f) => ({ u: a.u + f.cantidad, fob: a.fob + f.cantidad * f.fob_unit_usd, kg: a.kg + f.kg, flete: a.flete + f.flete, costo: a.costo + f.cantidad * f.usd }),
    { u: 0, fob: 0, kg: 0, flete: 0, costo: 0 });
  const usd = (n: number, dec = 2) => `US$ ${formatearNumero(Math.round(n * 10 ** dec) / 10 ** dec, "decimal")}`;
  return (
    <Pantalla titulo={`Compra ${c.nombre}`} camino={[{ texto: c.nombre }]}
      subtitulo="Costo de cada producto = (FOB + peso × flete por kilo) × (1 + % courier). En pesos, al dólar de hoy (costo de reposición)."
      acciones={
        <span className="inline-flex flex-wrap items-center gap-2">
          {!editando && <BotonConfirmar accion={accionGrabarCostosCourier} campos={{ id: String(cid) }} clase={VERDE} texto="Grabar costos en los productos"
            pregunta={`¿Grabar FOB, costo y peso en los ${lineas.length} productos?`} corriendo="Grabando…" />}
          <BotonesFicha editando={editando} ver={base} editar={`${base}?editar=ficha`} />
        </span>
      }>
      <Avisos sp={sp} />
      <form id="ficha" action={accionGuardarCompraCourier} className={`${CAJA} mb-4 flex flex-wrap gap-4 items-start`}>
        <input type="hidden" name="id" value={cid} />
        {editando ? (
          <>
            <label className="w-40"><span className={ETIQUETA}>Flete US$ por kilo</span><CampoNumero name="flete_usd_kg" valor={c.flete_usd_kg} tipo="decimal" className={`${CAMPO} w-full`} /></label>
            <label className="w-40"><span className={ETIQUETA}>% courier</span><CampoNumero name="courier_pct" valor={c.courier_pct} tipo="pct" className={`${CAMPO} w-full`} /></label>
            <label className="w-52"><span className={ETIQUETA}>Ingreso al stock</span><input type="datetime-local" name="ingreso" defaultValue={aLocal(c.ingreso_ts)} className={`${CAMPO} w-full`} /></label>
            <label className="w-60"><span className={ETIQUETA}>Proveedor</span><input name="proveedor" defaultValue={c.proveedor ?? ""} className={`${CAMPO} w-full`} /></label>
            <label className="flex-1 min-w-60"><span className={ETIQUETA}>Notas</span><input name="notas" defaultValue={c.notas ?? ""} className={`${CAMPO} w-full`} /></label>
          </>
        ) : (
          <>
            <Dato etiqueta="Flete US$ por kilo" numero className="w-40">{formatear(c.flete_usd_kg, "USD")}</Dato>
            <Dato etiqueta="% courier" numero className="w-40">{`${formatearNumero(c.courier_pct, "pct")} %`}</Dato>
            <Dato etiqueta="Ingreso al stock" className="w-52">{c.ingreso_ts ? fechaHora(c.ingreso_ts) : "—"}</Dato>
            <Dato etiqueta="Proveedor" className="w-60">{c.proveedor ?? "—"}</Dato>
            <Dato etiqueta="Notas" className="flex-1 min-w-60">{c.notas ?? "—"}</Dato>
          </>
        )}
      </form>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-4">
        <Dato etiqueta="Unidades" numero>{formatearNumero(tot.u, "entero")}</Dato>
        <Dato etiqueta="FOB" numero>{usd(tot.fob)}</Dato>
        <Dato etiqueta="Kilos" numero>{formatearNumero(Math.round(tot.kg * 100) / 100, "decimal")}</Dato>
        <Dato etiqueta="Flete" numero>{usd(tot.flete)}</Dato>
        <Dato etiqueta="Costo total" numero>{usd(tot.costo)}</Dato>
        <Dato etiqueta="Dólar de hoy" numero>{tc ? `$ ${formatearNumero(tc.venta, "pesos")}` : "—"}</Dato>
      </div>
      <p className="text-[11px] text-[#5C6B76] mb-2">
        {c.costos_grabados_ts ? `Costos grabados en los productos el ${fechaHora(c.costos_grabados_ts)}.` : "Los costos todavía no se grabaron en los productos."}
      </p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Producto</th><th className={THN}>Comprado</th><th className={THN}>Cargado al stock</th><th className={THN}>FOB unit.</th>
              <th className={THN}>Peso unit. (g)</th><th className={THN}>Kilos</th><th className={THN}>Flete</th><th className={THN}>Costo unit. US$</th>
              <th className={THN}>Costo unit. $ (hoy)</th><th className={TH}>Nota</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className={TR}>
                <td className={TD}>
                  <span className="inline-flex items-center gap-2 align-middle">
                    <FotosProducto fotos={f.fotos} titulo={f.descripcion} />
                    {f.producto_id ? <Link href={`/catalogo/productos/${f.producto_id}`} className="font-mono text-[#16577F] hover:underline">{f.sku}</Link> : <span className="font-mono">{f.sku ?? "—"}</span>}
                  </span>{" "}<span className="text-[#5C6B76]">{f.descripcion}</span>
                </td>
                <td className={TDN}>{formatearNumero(f.cantidad, "entero")}</td>
                <td className={`${TDN} ${f.cargado != null && f.cargado !== f.cantidad ? "text-[#C03420] font-bold" : ""}`}>{f.cargado != null ? formatearNumero(f.cargado, "entero") : "—"}</td>
                <td className={TDN}>{usd(f.fob_unit_usd, 4)}</td>
                <td className={TDN}>{f.peso_g != null ? formatearNumero(f.peso_g, "decimal") : "—"}</td>
                <td className={TDN}>{formatearNumero(Math.round(f.kg * 100) / 100, "decimal")}</td>
                <td className={TDN}>{usd(f.flete)}</td>
                <td className={TDN}>{usd(f.usd, 4)}</td>
                <td className={TDN}>{f.ars != null ? `$ ${formatearNumero(Math.round(f.ars), "pesos")}` : "—"}</td>
                <td className={`${TD} text-[11px] text-[#5C6B76]`}>{f.nota ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
