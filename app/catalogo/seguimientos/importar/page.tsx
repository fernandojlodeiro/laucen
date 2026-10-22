// Catálogo › Seguimientos › Importar de Virtual Seller (pedido de Fer, 14/10): subir el informe «Seguimientos totales»
// y ver qué entró en cada importación (lib/seguimiento/importar-vs.ts).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { entrarErp, Pantalla, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { fechaHora } from "@/app/ventas/formato";
import type { ResumenVs } from "@/lib/seguimiento/importar-vs";
import SubirSeguimientosVs from "./SubirSeguimientosVs";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { SUAVE } from "@/app/botones";
import { accionReimportarSeguimientosVs } from "./acciones";

export const dynamic = "force-dynamic";
// La importación corre de fondo después de contestar: miles de filas.
export const maxDuration = 300;

const ESTADOS = { corriendo: ["Importando…", "amarillo"], terminada: ["Terminada", "verde"], error: ["Con error", "rojo"] } as const;
const n = (x: number | undefined) => (x ?? 0).toLocaleString("es-AR");

export default async function ImportarSeguimientosVs() {
  const s = await entrarErp("productos_ver");
  const imps = await consulta<{ id: number; archivo: string; ts: Date; estado: keyof typeof ESTADOS; resumen: Partial<ResumenVs>; error: string | null; ruta: string | null }>(`
    select id::int, archivo, ts, estado, resumen, error, ruta from seguimiento_importacion where organizacion_id = $1 order by id desc limit 30`, [s.org.id]);
  return (
    <Pantalla titulo="Importar seguimientos de Virtual Seller" ancho="max-w-5xl" camino={[{ texto: "Importar de Virtual Seller" }]}
      subtitulo="El informe «Seguimientos totales» de Virtual Seller: cada publicación de la competencia que se seguía pasa a seguirse en el producto, ya revisada.">
      <SubirSeguimientosVs organizacionId={s.org.id} />
      <ul className="text-[11px] text-[#5C6B76] mt-2 mb-5 list-disc pl-4 grid gap-0.5">
        <li>El producto sale del «ID Seguimiento» (el SKU nuestro antes del año: «SKU00680-U-2026-1» → SKU00680-U; con «SEG-» adelante, también). La columna SKU del informe no se usa.</li>
        <li>No entran: las publicaciones de nuestras cuentas, las de notebooks, las de un SKU que ya no está en el catálogo y las de un producto sin ninguna publicación activa ni pausada en Mercado Libre (sólo cerradas o ninguna).</li>
        <li>Se releen solas (lo que cuesta) sólo las de productos a la venta: con publicación activa en Mercado Libre y stock disponible. Las de un producto pausado o sin stock entran igual y quedan de referencia en la pestaña Seguimiento del producto (para cuando se vuelva a comprar); se leen a pedido con «Leer ahora».</li>
        <li>Entran revisadas, con el último precio y estado del informe. Las pausadas o terminadas entran igual: se ven aparte en la pestaña Seguimiento y la regla de precio no las usa.</li>
        <li>Los vendedores chinos (apodo «CN…ARR») quedan marcados como internacionales: no cuentan para la regla.</li>
        <li>Si una ya se seguía, no cambia su origen; el precio y el estado se ponen al día si lo que había era más viejo. Se puede importar el mismo archivo dos veces sin duplicar nada.</li>
      </ul>

      <h2 className="text-sm font-bold mb-2">Importaciones ({imps.length})</h2>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={THN}>Fecha</th><th className={TH}>Archivo</th><th className={TH}>Estado</th><th className={THN}>Filas</th><th className={THN}>Nuevas</th>
              <th className={THN}>Al día / ya estaban</th><th className={THN}>Productos</th><th className={THN} title="Activas / pausadas o terminadas">Activas / pausadas</th>
              <th className={THN} title="Eran de nuestras cuentas">Nuestras</th><th className={THN} title="Seguimientos de notebooks: no entran">Notebooks</th>
              <th className={TH}>No entraron</th><th /></tr>
          </thead>
          <tbody>
            {imps.length === 0 && <tr><td colSpan={12} className={`${TD} text-[#5C6B76]`}>Todavía no hay ninguna.</td></tr>}
            {imps.map((i) => {
              const r = i.resumen, [t, tono] = ESTADOS[i.estado] ?? [i.estado, "gris"];
              return (
                <tr key={i.id} className={TR}>
                  <td className={TDN}>{fechaHora(i.ts)}</td>
                  <td className={TD}>{i.archivo}</td>
                  <td className={TD}><Estado texto={t} tono={tono} />{i.error && <span className="block text-[10px] text-[#C03420]">{i.error}</span>}</td>
                  <td className={TDN}>{n(r.filas)}</td>
                  <td className={TDN}>{n(r.nuevas)}</td>
                  <td className={TDN}>{n(r.actualizadas)} / {n(r.yaEstaban)}</td>
                  <td className={TDN}>
                    <Link href="/catalogo/seguimientos?estado=confirmado" className="text-[#16577F] hover:underline">{n(r.productos)}</Link>
                    {r.productosALaVenta != null && <span className="block text-[10px] text-[#5C6B76]" title="Con publicación activa y stock: sólo ésos se releen solos">{n(r.productosALaVenta)} a la venta</span>}
                  </td>
                  <td className={TDN}>{n(r.activas)} / {n(r.pausadas)}</td>
                  <td className={TDN}>{n(r.propias)}</td>
                  <td className={TDN}>{n(r.notebooks)}</td>
                  <td className={TD}>
                    {r.sinPublicacionActiva?.length ? (
                      <details>
                        <summary className="cursor-pointer text-[#7A5600]">{r.sinPublicacionActiva.length} SKU sin publicación activa ni pausada</summary>
                        <ul className="mt-1 text-[11px] max-h-60 overflow-y-auto">
                          {r.sinPublicacionActiva.map((x) => <li key={x.sku}><span className="font-mono">{x.sku}</span> <span className="text-[#5C6B76]">({x.filas} fila{x.filas === 1 ? "" : "s"})</span></li>)}
                        </ul>
                      </details>
                    ) : null}
                    {r.noEncontrados?.length ? (
                      <details>
                        <summary className="cursor-pointer text-[#C03420]">{r.noEncontrados.length} SKU que no están en el catálogo</summary>
                        <ul className="mt-1 text-[11px] max-h-60 overflow-y-auto">
                          {r.noEncontrados.map((x) => <li key={x.sku}><span className="font-mono">{x.sku}</span> <span className="text-[#5C6B76]">({x.id}; {x.filas} fila{x.filas === 1 ? "" : "s"})</span></li>)}
                        </ul>
                      </details>
                    ) : null}
                    {!r.noEncontrados?.length && !r.sinPublicacionActiva?.length && "—"}
                    {(r.sinId || r.sinPublicacion) ? <span className="block text-[10px] text-[#5C6B76]">{r.sinId ? `${r.sinId} sin ID de seguimiento` : ""}{r.sinId && r.sinPublicacion ? " · " : ""}{r.sinPublicacion ? `${r.sinPublicacion} sin número de publicación` : ""}</span> : null}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    {i.ruta && i.estado !== "corriendo" && (
                      <BotonTarea accion={accionReimportarSeguimientosVs} tipo="seguimientos-vs" clase={SUAVE} texto="Volver a importar" campos={{ id: String(i.id) }}
                        pregunta="¿Importar otra vez este archivo? No duplica: suma lo que antes no entró" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
