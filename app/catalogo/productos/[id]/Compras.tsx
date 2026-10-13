// Pestaña Compras de la ficha del producto: el historial de compras (invoices confirmados y compras por courier), con
// fecha, llegada estimada, cantidad, precio y cuánto tardó en venderse cada una (lib/compras/invoices.ts). Sólo estadística.

import Link from "next/link";
import { CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import { diaAr, historialProducto, VIAS } from "@/lib/compras/invoices";

export default async function SeccionCompras({ org, productoId }: { org: string; productoId: number }) {
  const filas = await historialProducto(org, productoId);
  const usd = (n: number) => `US$ ${formatearNumero(Math.round(n * 10000) / 10000, "decimal")}`;
  const conDias = filas.filter((f) => f.dias != null);
  const promedio = conDias.length ? Math.round(conDias.reduce((t, f) => t + f.dias!, 0) / conDias.length) : null;
  return (
    <section>
      <p className="text-xs text-[#5C6B76] mb-2">
        Lo que se compró de este producto, de los <Link href="/compras/invoices" className="text-[#16577F] hover:underline">invoices de compra</Link> confirmados
        y las <Link href="/compras/courier" className="text-[#16577F] hover:underline">compras por courier</Link>. No mueve stock.
        {promedio != null && <> Cada compra tardó en venderse <b>{promedio} días</b> en promedio.</>}
      </p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Fecha</th><th className={TH}>Llegada estimada</th><th className={TH}>Documento</th><th className={TH}>Proveedor</th><th className={TH}>Vía</th>
              <th className={TH}>Variación</th><th className={THN}>Cantidad</th><th className={THN}>Precio unit.</th><th className={THN}>Total</th>
              <th className={TH} title="Desde que llegó (o desde que se terminó la compra anterior) hasta que se vendió su cantidad">Se vendió</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>Todavía no hay compras registradas de este producto.</td></tr>}
            {filas.map((f, i) => (
              <tr key={i} className={TR}>
                <td className={TDN}>{diaAr(f.fecha)}</td>
                <td className={TDN}>{diaAr(f.llegada)}</td>
                <td className={TD}><Link href={f.origen === "invoice" ? `/compras/invoices/${f.doc_id}` : `/compras/courier/${f.doc_id}`} className="text-[#16577F] hover:underline">{f.documento}</Link></td>
                <td className={TD}>{f.proveedor ?? "—"}</td>
                <td className={TD}>{f.via === "courier" ? "Courier" : VIAS[f.via as keyof typeof VIAS] ?? f.via}</td>
                <td className={`${TD} font-mono`}>{f.sku}</td>
                <td className={TDN}>{formatearNumero(f.cantidad, "entero")}</td>
                <td className={TDN}>{f.precio_usd == null ? <span className="text-[#5C6B76]">—</span> : usd(f.precio_usd)}</td>
                <td className={TDN}>{f.precio_usd == null ? "—" : `US$ ${formatearNumero(Math.round(f.cantidad * f.precio_usd * 100) / 100, "decimal")}`}</td>
                <td className={TD}>
                  {f.agotada ? <>en {formatearNumero(f.dias!, "entero")} días <span className="text-[#5C6B76]">(del {diaAr(f.desde)} al {diaAr(f.agotada)})</span></>
                    : <span className="text-[#5C6B76]">quedan {formatearNumero(Math.round(f.quedan), "entero")}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[#5C6B76] mt-1">
        La fecha es la del invoice; la llegada se estima con la demora de la vía (configurable en Invoices de compra). «Se vendió»: cada compra empieza a venderse cuando llega
        (o al terminarse la anterior, si todavía quedaba) y se termina cuando las ventas de todos los canales desde ahí suman su cantidad. Si hubo compras que no están registradas, puede figurar más rápida de lo real.
      </p>
    </section>
  );
}
