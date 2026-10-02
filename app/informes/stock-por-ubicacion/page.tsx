// Informe: stock por ubicación. Cada ubicación con los productos que tiene
// adentro (una o todas), con el total de unidades de cada una. Filtros
// arriba; "Descargar Excel" baja lo mismo con los mismos filtros.

import { Fragment } from "react";
import { VERDE } from "@/app/botones";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import { entrarErp, Pantalla, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { depositosYUbicaciones, leerFiltroUbicacion, stockPorUbicacion, type FilaUbicacion } from "@/lib/informes/inventario";
import { Desplegable, FiltroUbicacion } from "../Filtros";

export const dynamic = "force-dynamic";

const BASE = "/informes/stock-por-ubicacion";
const EN_PANTALLA = 2000;

type SP = Record<string, string | undefined>;

const entero = (n: number) => n.toLocaleString("es-AR");

export default async function StockPorUbicacion({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("informes_stock_ver");
  const sp = await searchParams;
  const f = leerFiltroUbicacion(sp);
  const [{ depositos, ubicaciones }, filas] = await Promise.all([depositosYUbicaciones(s.org.id), stockPorUbicacion(s.org.id, f)]);
  const params = { q: f.q || null, contiene: f.comienza ? null : "1", dep: f.depositoId, u: f.ubicacionId };

  // Agrupadas por ubicación, en el orden de recorrido.
  const grupos: { id: number; deposito: string; ubicacion: string; descripcion: string | null; filas: FilaUbicacion[] }[] = [];
  for (const r of filas.slice(0, EN_PANTALLA)) {
    const g = grupos.at(-1);
    if (g?.id === r.ubicacion_id) g.filas.push(r);
    else grupos.push({ id: r.ubicacion_id, deposito: r.deposito, ubicacion: r.ubicacion, descripcion: r.descripcion, filas: [r] });
  }
  const variosDepositos = new Set(filas.map((r) => r.deposito)).size > 1;
  const total = filas.reduce((a, r) => a + r.cantidad, 0);
  const opcionesUbic = ubicaciones.filter((u) => !f.depositoId || u.deposito_id === f.depositoId)
    .map((u) => ({ valor: String(u.id), texto: depositos.length > 1 ? `${u.deposito} · ${u.codigo}` : u.codigo, detalle: u.descripcion }));

  return (
    <Pantalla titulo="Stock por ubicación" subtitulo="Qué hay adentro de cada ubicación: una o todas."
      acciones={<a href={url(`${BASE}/excel`, params)} className={VERDE}>Descargar Excel</a>}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        {depositos.length > 1 && (
          <Desplegable parametro="dep" etiqueta="Depósito" valor={String(f.depositoId ?? "")} limpiar={["u"]}
            opciones={[{ valor: "", texto: "Todos" }, ...depositos.map((d) => ({ valor: String(d.id), texto: d.nombre }))]} />
        )}
        <FiltroUbicacion valor={String(f.ubicacionId ?? "")} opciones={opcionesUbic} />
        <BuscadorVivo q={f.q} comienza={f.comienza} placeholder="Producto: SKU o descripción" />
      </div>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Código</th><th className={TH}>Producto</th><th className={THN}>Cantidad</th><th className={THN}>Reservado</th></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={4} className={`${TD} text-[#5C6B76]`}>No hay stock con esos filtros.</td></tr>}
            {grupos.map((g) => (
              <Fragment key={g.id}>
                <tr className="bg-[#EEF3F8]">
                  <td colSpan={2} className={`${TD} font-bold`}>
                    {variosDepositos ? `${g.deposito} · ` : ""}{g.ubicacion}
                    {g.descripcion && <span className="ml-2 font-normal text-[#5C6B76]">{g.descripcion}</span>}
                  </td>
                  <td className={`${TDN} font-bold`}>{entero(g.filas.reduce((a, r) => a + r.cantidad, 0))}</td>
                  <td className={TDN} />
                </tr>
                {g.filas.map((r) => (
                  <tr key={r.sku} className={TR}>
                    <td className={`${TD} whitespace-nowrap pl-6`}>{r.sku}</td>
                    <td className={TD}>{r.titulo}</td>
                    <td className={`${TDN} ${r.cantidad < 0 ? "text-[#C03420] font-semibold" : ""}`}>{entero(r.cantidad)}</td>
                    <td className={TDN}>{r.reservado ? entero(r.reservado) : ""}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {filas.length > 0 && (
              <tr className={`${TR} font-bold bg-[#FAFBFC]`}>
                <td colSpan={2} className={TD}>Total ({entero(new Set(filas.map((r) => r.ubicacion_id)).size)} ubicaciones)</td>
                <td className={TDN}>{entero(total)}</td><td className={TDN} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filas.length > EN_PANTALLA && <p className="text-[11px] text-[#5C6B76] mt-1">Se ven las primeras {entero(EN_PANTALLA)} filas de {entero(filas.length)}; el total es de todas. El Excel trae todas.</p>}
    </Pantalla>
  );
}
