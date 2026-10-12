// Compras › Compras por courier › Control de stock (pedido de Fer, 12/10; lib/compras/courier.ts › controlStock):
// por producto de cada compra, lo cargado, lo vendido desde que entró, el saldo que tendría que haber, lo disponible
// hoy y la diferencia, valorizada al precio de la Clásica. Sólo consulta: no mueve stock.

import Link from "next/link";
import FotosProducto from "@/app/componentes/FotosProducto";
import { entrarErp, Pantalla, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { Desplegable } from "@/app/informes/Filtros";
import { compras, controlStock } from "@/lib/compras/courier";
import { formatearNumero } from "@/lib/numeros";
import { fechaHora } from "@/app/ventas/formato";

export const dynamic = "force-dynamic";

const entero = (n: number | null) => (n == null ? "—" : formatearNumero(n, "entero"));
const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const color = (n: number | null) => (n == null || n === 0 ? "" : n < 0 ? "text-[#C03420] font-semibold" : "text-[#1F6E4A] font-semibold");

export default async function ControlStock({ searchParams }: { searchParams: Promise<{ compra?: string }> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const lista = await compras(s.org.id);
  const elegida = lista.find((c) => c.id === Number(sp.compra))?.id ?? null;
  const filas = await controlStock(s.org.id, elegida);
  const suma = (f: (x: (typeof filas)[number]) => number | null) => filas.reduce((a, x) => a + (f(x) ?? 0), 0);
  const faltan = filas.filter((x) => (x.diferencia ?? 0) < 0);
  const sobran = filas.filter((x) => (x.diferencia ?? 0) > 0);
  const tot = (xs: typeof filas) => ({ u: xs.reduce((a, x) => a + (x.diferencia ?? 0), 0), m: xs.reduce((a, x) => a + (x.monto ?? 0), 0) });
  const [tf, ts] = [tot(faltan), tot(sobran)];

  return (
    <Pantalla titulo="Control de stock de las compras" camino={[{ texto: "Control de stock" }]}
      subtitulo="Por cada producto de la compra: lo cargado, lo vendido desde que entró al stock (todos los canales), lo que tendría que quedar, lo disponible hoy y la diferencia valorizada al precio de la Clásica.">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <Desplegable parametro="compra" etiqueta="Compra" valor={elegida ? String(elegida) : ""}
          opciones={[{ valor: "", texto: "Todas" }, ...lista.map((c) => ({ valor: String(c.id), texto: `${c.nombre}${c.ingreso_ts ? ` (${fechaHora(c.ingreso_ts)})` : ""}` }))]} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
        {[["Faltan (unidades)", entero(tf.u), "text-[#C03420]"], ["Faltante a precio de venta", pesos(tf.m), "text-[#C03420]"],
          ["Sobran (unidades)", entero(ts.u), "text-[#1F6E4A]"], ["Sobrante a precio de venta", pesos(ts.m), "text-[#1F6E4A]"]].map(([k, v, c]) => (
          <div key={k} className="bg-white border border-[#E3E9F0] rounded-lg px-3 py-2"><div className="text-[#5C6B76]">{k}</div><div className={`text-right tabular-nums font-bold text-sm ${c}`}>{v}</div></div>
        ))}
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Compra</th><th className={TH}>Producto</th><th className={THN}>Comprado</th><th className={THN}>Cargado</th>
              <th className={THN}>Vendido ML</th><th className={THN}>Vendido otros canales</th><th className={THN}>Vendido en kits</th><th className={THN}>Vendido total</th>
              <th className={THN}>Saldo</th><th className={THN}>Disponible hoy</th><th className={THN}>Diferencia</th><th className={THN}>Precio Clásica</th><th className={THN}>Diferencia $</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={13} className={`${TD} text-[#5C6B76]`}>No hay compras por courier.</td></tr>}
            {filas.map((x) => (
              <tr key={`${x.compra_id}-${x.sku}-${x.descripcion}`} className={TR}>
                <td className={TD}><Link href={`/compras/courier/${x.compra_id}`} className="text-[#16577F] hover:underline">{x.compra}</Link></td>
                <td className={TD}>
                  <span className="inline-flex items-center gap-2 align-middle">
                    <FotosProducto fotos={x.fotos} titulo={x.descripcion} />
                    {x.producto_id ? <Link href={`/catalogo/productos/${x.producto_id}`} className="font-mono text-[#16577F] hover:underline whitespace-nowrap">{x.sku}</Link> : <span className="font-mono">{x.sku ?? "—"}</span>}
                  </span>{" "}<span className="text-[#5C6B76]">{x.descripcion}</span>
                </td>
                <td className={TDN}>{entero(x.comprado)}</td>
                <td className={TDN}>{entero(x.cargado)}</td>
                <td className={TDN}>{x.variacion_id ? <Link href={`/ventas/historial?producto=${x.producto_id}&desde=${x.ingreso_ts ? new Date(x.ingreso_ts).toISOString().slice(0, 10) : ""}`} className="text-[#16577F] hover:underline">{entero(x.vendido_ml)}</Link> : entero(x.vendido_ml)}</td>
                <td className={TDN}>{entero(x.vendido_otros)}</td>
                <td className={TDN}>{entero(x.vendido_kits)}</td>
                <td className={`${TDN} font-semibold`}>{entero(x.vendido)}</td>
                <td className={TDN}>{entero(x.saldo)}</td>
                <td className={TDN}>{entero(x.disponible)}</td>
                <td className={`${TDN} ${color(x.diferencia)}`}>{entero(x.diferencia)}</td>
                <td className={TDN}>{pesos(x.precio)}</td>
                <td className={`${TDN} ${color(x.monto)}`}>{pesos(x.monto)}</td>
              </tr>
            ))}
            {filas.length > 0 && (
              <tr className={`${TR} font-bold`}>
                <td className={TD} colSpan={2}>Total</td>
                <td className={TDN}>{entero(suma((x) => x.comprado))}</td><td className={TDN}>{entero(suma((x) => x.cargado))}</td>
                <td className={TDN}>{entero(suma((x) => x.vendido_ml))}</td><td className={TDN}>{entero(suma((x) => x.vendido_otros))}</td>
                <td className={TDN}>{entero(suma((x) => x.vendido_kits))}</td><td className={TDN}>{entero(suma((x) => x.vendido))}</td>
                <td className={TDN}>{entero(suma((x) => x.saldo))}</td><td className={TDN}>{entero(suma((x) => x.disponible))}</td>
                <td className={`${TDN} ${color(suma((x) => x.diferencia))}`}>{entero(suma((x) => x.diferencia))}</td><td className={TDN} />
                <td className={`${TDN} ${color(suma((x) => x.monto))}`}>{pesos(suma((x) => x.monto))}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5C6B76] mt-2">
        Saldo = cargado − vendido. Diferencia = disponible hoy − saldo: en rojo falta mercadería, en verde sobra (stock anterior a la compra, devoluciones o ajustes).
        Si el producto tenía stock de antes, sus ventas también cuentan acá: no se puede saber de qué compra salió cada unidad.
      </p>
    </Pantalla>
  );
}
