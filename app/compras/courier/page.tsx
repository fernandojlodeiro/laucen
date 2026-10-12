// Compras › Compras por courier (pedido de Fer, 12/10; lib/compras/courier.ts): cada compra con su flete por kilo,
// su % courier y sus productos. El costo de cada producto sale de ahí; la compra no mueve stock.

import Link from "next/link";
import { entrarErp, Pantalla, Avisos, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { compras } from "@/lib/compras/courier";
import { formatear } from "@/lib/moneda";
import { formatearNumero } from "@/lib/numeros";
import { fechaHora } from "@/app/ventas/formato";
import { SUAVE } from "@/app/botones";

export const dynamic = "force-dynamic";

export default async function ComprasCourier({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const filas = await compras(s.org.id);
  return (
    <Pantalla titulo="Compras por courier" subtitulo="Las importaciones por courier: flete por kilo y un único % para toda la compra. De acá sale el costo de cada producto (no mueve stock)."
      acciones={<><Link href="/compras/courier/informe" className={SUAVE}>Informe de importaciones</Link><Link href="/compras/courier/control" className={SUAVE}>Control de stock</Link></>}>
      <Avisos sp={sp} />
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Compra</th><th className={TH}>Ingreso al stock</th><th className={THN}>Productos</th><th className={THN}>Unidades</th>
              <th className={THN}>FOB US$</th><th className={THN}>Kilos</th><th className={THN}>Flete US$/kg</th><th className={THN}>% courier</th><th className={TH}>Costos</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>Todavía no hay compras por courier.</td></tr>}
            {filas.map((c) => (
              <tr key={c.id} className={TR}>
                <td className={TD}><Link href={`/compras/courier/${c.id}`} className="font-bold text-[#16577F] hover:underline">{c.nombre}</Link>{c.proveedor ? <span className="text-[#5C6B76]"> · {c.proveedor}</span> : null}</td>
                <td className={TD}>{c.ingreso_ts ? fechaHora(c.ingreso_ts) : "—"}</td>
                <td className={TDN}>{c.lineas}</td>
                <td className={TDN}>{formatearNumero(c.unidades, "entero")}</td>
                <td className={TDN}>{formatear(c.fob, "USD")}</td>
                <td className={TDN}>{formatearNumero(c.kg, "decimal")}</td>
                <td className={TDN}>{formatear(c.flete_usd_kg, "USD")}</td>
                <td className={TDN}>{formatearNumero(c.courier_pct, "pct")} %</td>
                <td className={TD}>{c.costos_grabados_ts ? <Estado texto="Grabados en los productos" tono="verde" /> : <Estado texto="Sin grabar" tono="amarillo" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
