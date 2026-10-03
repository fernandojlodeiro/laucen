// Movimientos de stock: todos, los más nuevos primero, de a 50. Filtros por
// producto, fechas, tipo, usuario y depósito; "Descargar Excel" baja lo mismo
// con los mismos filtros. Se llega desde Consulta de stock ("Ver todos los
// movimientos" de una variación, que entra con ?v=) o desde el menú.

import Link from "next/link";
import { SUAVE, VERDE } from "@/app/botones";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import { entrarErp, Pantalla, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { TIPOS_MOVIMIENTO } from "@/lib/stock";
import RangoFechas from "@/app/componentes/RangoFechas";
import { POR_PAGINA, leerFiltroMovimientos, movimientos, opcionesMovimientos, parametrosMovimientos, referencia } from "./consulta";

export const dynamic = "force-dynamic";

const BASE = "/stock/movimientos";

export default async function Movimientos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await entrarErp("stock_ver");
  const f = leerFiltroMovimientos(await searchParams);
  const [traidas, { depositos, usuarios, variacion }] = await Promise.all([
    movimientos(s.org.id, f, POR_PAGINA + 1, (f.p - 1) * POR_PAGINA),
    opcionesMovimientos(s.org.id, f.variacionId),
  ]);
  const hayMas = traidas.length > POR_PAGINA;
  const filas = traidas.slice(0, POR_PAGINA);
  const params = parametrosMovimientos(f);

  return (
    <Pantalla titulo="Movimientos de stock" subtitulo="Cada entrada, salida, reserva y transferencia, los más nuevos primero."
      acciones={<>
        <Link href={url("/stock/consulta", { v: f.variacionId })} className={SUAVE}>Consulta de stock</Link>
        <a href={url(`${BASE}/excel`, params)} className={VERDE}>Descargar Excel</a>
      </>}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        {variacion ? (
          <span className="inline-flex items-center gap-2 text-xs rounded-lg px-2 py-1 bg-[#EEF3F8] text-[#16577F]">
            Producto: <b>{variacion.sku}</b> · {variacion.titulo}
            <Link href={url(BASE, { ...params, v: null })} className={SUAVE} aria-label="Quitar el filtro de producto">×</Link>
          </span>
        ) : (
          <BuscadorVivo q={f.q} comienza={f.comienza} placeholder="Producto: SKU o descripción" limpiar={["p", "v"]} />
        )}
        <RangoFechas desde={f.desde ?? ""} hasta={f.hasta ?? ""} vacio="Todas las fechas" />
        <FiltroVivo parametro="tipo" valor={f.tipo ?? ""} etiqueta="Tipo" limpiar={["p"]}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_MOVIMIENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </FiltroVivo>
        <FiltroVivo parametro="usuario" valor={f.usuario ?? ""} etiqueta="Usuario" limpiar={["p"]}>
          <option value="">Todos los usuarios</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </FiltroVivo>
        {depositos.length > 1 && (
          <FiltroVivo parametro="dep" valor={String(f.depositoId ?? "")} etiqueta="Depósito" limpiar={["p"]}>
            <option value="">Todos los depósitos</option>
            {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </FiltroVivo>
        )}
      </div>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Fecha</th><th className={TH}>Tipo</th><th className={TH}>SKU</th><th className={TH}>Producto</th>
              <th className={TH}>Origen</th><th className={TH}>Destino</th><th className={THN}>Cantidad</th>
              <th className={TH}>Referencia</th><th className={TH}>Nota</th><th className={TH}>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>No hay movimientos con esos filtros.</td></tr>}
            {filas.map((m) => (
              <tr key={m.id} className={TR}>
                <td className={`${TD} whitespace-nowrap`}>{m.fecha}</td>
                <td className={TD}>{TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  <Link href={`/catalogo/productos/${m.producto_id}`} className="font-semibold text-[#16577F] hover:underline">{m.sku}</Link>
                  {m.kit_sku && <div className="text-[10px] text-[#5C6B76]">del kit {m.kit_sku}</div>}
                </td>
                <td className={TD}>{m.titulo}</td>
                <td className={TD}>{m.origen ?? "—"}</td>
                <td className={TD}>{m.destino ?? "—"}</td>
                <td className={TDN}>{m.cantidad}</td>
                <td className={TD}>{referencia(m) ?? "—"}</td>
                <td className={TD}>{m.nota ?? "—"}</td>
                <td className={TD}>{m.usuario ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(f.p > 1 || hayMas) && (
        <nav className="flex items-center justify-between gap-2 mt-3 text-xs text-[#5C6B76]">
          {f.p > 1 ? <Link href={url(BASE, { ...params, p: f.p > 2 ? f.p - 1 : null })} className={SUAVE}>← Anterior</Link> : <span />}
          <span>Página {f.p}</span>
          {hayMas ? <Link href={url(BASE, { ...params, p: f.p + 1 })} className={SUAVE}>Siguiente →</Link> : <span />}
        </nav>
      )}
    </Pantalla>
  );
}
