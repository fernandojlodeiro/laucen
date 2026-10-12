// Informe: qué precios subirían o bajarían con la regla de seguimiento de cada producto (lib/informes/precios-seguimiento.ts).
// Sólo muestra: cada cambio se aplica desde la pestaña Seguimiento del producto.

import Link from "next/link";
import FotosProducto from "@/app/componentes/FotosProducto";
import { entrarErp, Pantalla, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import { fecha } from "@/app/ventas/formato";
import { preciosSeguimiento } from "@/lib/informes/precios-seguimiento";
import { Desplegable } from "../Filtros";

export const dynamic = "force-dynamic";

const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const QUE = { sube: ["Sube", "verde"], baja: ["Baja", "rojo"], queda: ["Queda igual", "gris"], sin_dato: ["Sin dato", "amarillo"] } as const;

export default async function PreciosSeguimiento({ searchParams }: { searchParams: Promise<{ que?: string }> }) {
  const s = await entrarErp("precios_ver");
  const sp = await searchParams;
  const todas = await preciosSeguimiento(s.org.id);
  const que = sp.que && Object.hasOwn(QUE, sp.que) ? (sp.que as keyof typeof QUE) : null;
  const filas = que ? todas.filter((f) => f.que === que) : todas;
  const cuenta = (q: keyof typeof QUE) => todas.filter((f) => f.que === q).length;

  return (
    <Pantalla titulo="Precios según seguimiento"
      subtitulo="Qué haría la regla de seguimiento de cada producto con la Clásica, con el último precio leído del competidor: el objetivo, nunca debajo del piso ni arriba del techo. Nada cambia hasta apretar «Aplicar» en la pestaña Seguimiento del producto.">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <Desplegable parametro="que" etiqueta="Ver" valor={que ?? ""}
          opciones={[{ valor: "", texto: `Todos (${todas.length})` }, ...Object.entries(QUE).map(([k, [t]]) => ({ valor: k, texto: `${t} (${cuenta(k as keyof typeof QUE)})` }))]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Producto</th><th className={THN}>Costo hoy</th><th className={THN}>Piso</th><th className={THN}>Clásica hoy</th>
              <th className={TH}>Competidor</th><th className={THN}>Su precio</th><th className={THN}>Objetivo</th><th className={THN}>Quedaría</th>
              <th className={THN}>Cambio</th><th className={TH}>Qué pasa</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>No hay productos con regla de seguimiento.</td></tr>}
            {filas.map((f) => {
              const [t, tono] = QUE[f.que];
              return (
                <tr key={f.producto_id} className={TR}>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-2 align-middle">
                      <FotosProducto fotos={f.fotos} titulo={f.titulo} />
                      <Link href={`/catalogo/productos/${f.producto_id}?seccion=seguimiento`} className="font-mono text-[#16577F] hover:underline whitespace-nowrap">{f.sku}</Link>
                    </span>{" "}<span className="text-[#5C6B76]">{f.titulo}</span>
                  </td>
                  <td className={TDN}>{pesos(f.costo)}</td>
                  <td className={TDN}>{pesos(f.piso)}</td>
                  <td className={TDN}>{pesos(f.clasica)}</td>
                  <td className={TD}>
                    {f.permalink ? <a href={f.permalink} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline">{f.vendedor ?? f.item_id} ↗</a> : (f.vendedor ?? "—")}
                    {f.leido_ts && <span className="block text-[10px] text-[#5C6B76]">leído el {fecha(f.leido_ts)}</span>}
                  </td>
                  <td className={TDN}>{f.estado_ref === "activa" ? pesos(f.referencia) : <span className="text-[#5C6B76]">{f.estado_ref === "sin_dato" ? "sin leer" : f.estado_ref ?? "—"}</span>}</td>
                  <td className={TDN}>{pesos(f.objetivo)}</td>
                  <td className={`${TDN} font-semibold`}>{pesos(f.nuevo ?? f.clasica)}</td>
                  <td className={`${TDN} ${f.cambio_pct == null ? "" : f.cambio_pct > 0 ? "text-[#1F6E4A]" : "text-[#C03420]"}`}>
                    {f.cambio_pct == null ? "—" : `${f.cambio_pct > 0 ? "+" : ""}${f.cambio_pct.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`}
                  </td>
                  <td className={TD}><Estado texto={t} tono={tono} />{f.motivo && <span className="text-[10px] text-[#5C6B76] ml-1.5">{f.motivo}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5C6B76] mt-2">
        Costo hoy = último costo en dólares al dólar de hoy. Objetivo = precio del competidor menos la diferencia de la regla. Si el objetivo cae debajo del piso, queda en el piso; si sube arriba del techo, queda en el techo.
      </p>
    </Pantalla>
  );
}
