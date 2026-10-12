// La tabla de cambios de precio de lista: la usan Catálogo › Historial de
// precios de lista y la pestaña «Cambios de precio» de la ficha del producto.

import Link from "next/link";
import { formatear } from "@/lib/moneda";
import { ThOrden } from "@/app/componentes/Lista";
import FotosProducto from "@/app/componentes/FotosProducto";
import { CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, url } from "@/app/componentes/erp";
import type { FilaHistorial } from "./lista";

export default function TablaHistorial({ filas }: { filas: FilaHistorial[] }) {
  return (
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="fecha" porDefecto>Cuándo</ThOrden><ThOrden col="sku">SKU</ThOrden><ThOrden col="titulo">Producto</ThOrden><ThOrden col="lista">Lista</ThOrden>
              <ThOrden col="antes" n>Antes</ThOrden><ThOrden col="despues" n>Después</ThOrden><ThOrden col="pct" n>Cambio</ThOrden><ThOrden col="quien">Quién</ThOrden><th className="px-2 py-1.5 text-left">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>No hay cambios de precio con esos filtros.</td></tr>}
            {filas.map((x) => (
              <tr key={x.id} className={TR}>
                <td className={`${TD} whitespace-nowrap`}>
                  {new Date(x.fecha).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}
                  <span className="block text-[10px] text-[#5C6B76]">rige desde {x.vigente}</span>
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  <span className="inline-flex items-center gap-2">
                    <FotosProducto fotos={x.fotos} titulo={x.sku} />
                    <Link href={url(`/catalogo/productos/${x.producto_id}`, { seccion: "precios" })} className="text-[#16577F] hover:underline font-mono">{x.sku}</Link>
                  </span>
                </td>
                <td className={TD}>{x.titulo}</td>
                <td className={TD}>{x.lista}</td>
                <td className={TDN}>{x.antes != null ? formatear(x.antes, "ARS") : "—"}</td>
                <td className={TDN}><b>{formatear(x.despues, "ARS")}</b>{x.moneda === "USD" && <span className="block text-[10px] text-[#5C6B76]">cargado en US$</span>}</td>
                <td className={`${TDN} whitespace-nowrap font-semibold ${x.sentido === "subio" ? "text-[#1F6E4A]" : x.sentido === "bajo" ? "text-[#C03420]" : "text-[#5C6B76]"}`}>
                  {x.sentido === "nuevo" ? "Nuevo" : x.pct == null ? "—" : `${x.sentido === "subio" ? "▲" : x.sentido === "bajo" ? "▼" : ""} ${Math.abs(x.pct).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`}
                </td>
                <td className={TD}>{x.quien}</td>
                <td className={`${TD} text-[11px] text-[#5C6B76]`}>{x.motivo ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );
}
