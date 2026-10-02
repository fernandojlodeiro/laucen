// Despachos de importación: la mercadería importada con todos sus costos.
// Cada uno se arma en borrador y al registrarlo prorratea flete, seguro y
// gastos sobre las líneas por su FOB (costo puesto en depósito).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { PRIMARIO, SUAVE } from "@/app/botones";
import {
  entrarErp, Pantalla, Avisos, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha } from "@/app/ventas/formato";
import { ESTADO_DESPACHO } from "../comun";

export const dynamic = "force-dynamic";

type SP = { proveedor?: string; estado?: string; ok?: string; error?: string };

type Fila = {
  id: number; numero: string | null; fecha: Date; proveedor: string | null; fob_usd: number; flete_seguro_usd: number;
  gastos_ars: number; cotizacion: number; estado: string; lineas: number;
};

const LIMITE = 300;

export default async function Despachos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("despachos_ver");
  const sp = await searchParams;
  const proveedorId = Number(sp.proveedor) || 0;
  const estado = sp.estado && Object.hasOwn(ESTADO_DESPACHO, sp.estado) ? sp.estado : "";
  const [proveedores, filas] = await Promise.all([
    consulta<{ id: number; nombre: string }>(`
      select distinct p.id::int, p.nombre from proveedor p join despacho_importacion d on d.proveedor_id = p.id
       where p.organizacion_id = $1 order by p.nombre`, [s.org.id]),
    consulta<Fila>(`
      select d.id::int, d.numero, d.fecha, p.nombre proveedor, d.fob_usd::float, (d.flete_usd + d.seguro_usd)::float flete_seguro_usd,
             coalesce((select sum((g->>'importe_ars')::numeric) from jsonb_array_elements(d.gastos) g), 0)::float gastos_ars,
             d.cotizacion::float, d.estado, (select count(*) from despacho_linea l where l.despacho_id = d.id)::int lineas
        from despacho_importacion d left join proveedor p on p.id = d.proveedor_id
       where d.organizacion_id = $1 and ($2 = 0 or d.proveedor_id = $2) and ($3 = '' or d.estado = $3)
       order by d.fecha desc, d.id desc limit ${LIMITE}`, [s.org.id, proveedorId, estado]),
  ]);
  const hayFiltro = !!(proveedorId || estado);

  return (
    <Pantalla titulo="Despachos de importación" subtitulo="La mercadería importada con su FOB, flete, seguro y gastos: queda el costo puesto en depósito"
      acciones={<Link href="/compras/despachos/nuevo" className={PRIMARIO}>Nuevo despacho</Link>}>
      <Avisos sp={sp} />
      <form className="flex flex-wrap items-end gap-2 mb-3">
        <label><span className={ETIQUETA}>Proveedor</span>
          <select name="proveedor" defaultValue={proveedorId || ""} className={CAMPO}>
            <option value="">Todos</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select></label>
        <label><span className={ETIQUETA}>Estado</span>
          <select name="estado" defaultValue={estado} className={CAMPO}>
            <option value="">Todos</option>
            {Object.entries(ESTADO_DESPACHO).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select></label>
        <button className={PRIMARIO}>Filtrar</button>
        {hayFiltro && <Link href="/compras/despachos" className={SUAVE}>Limpiar</Link>}
      </form>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={THN}>Fecha</th><th className={TH}>Despacho</th><th className={TH}>Proveedor</th><th className={THN}>Líneas</th>
              <th className={THN}>FOB</th><th className={THN}>Flete + seguro</th><th className={THN}>Gastos</th><th className={THN}>Costo total</th><th className={TH}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>{hayFiltro ? "Nada con esos filtros." : "Todavía no hay despachos."}</td></tr>}
            {filas.map((d) => {
              const est = ESTADO_DESPACHO[d.estado] ?? ESTADO_DESPACHO.borrador;
              return (
                <tr key={d.id} className={TR}>
                  <td className={TDN}>{fecha(d.fecha)}</td>
                  <td className={`${TD} font-mono`}>
                    <Link href={`/compras/despachos/${d.id}`} className="font-semibold text-[#16577F] hover:underline">{d.numero ?? `#${d.id} (sin número)`}</Link>
                  </td>
                  <td className={TD}>{d.proveedor ?? "—"}</td>
                  <td className={TDN}>{d.lineas}</td>
                  <td className={TDN}>{formatear(d.fob_usd, "USD")}</td>
                  <td className={TDN}>{formatear(d.flete_seguro_usd, "USD")}</td>
                  <td className={TDN}>{formatear(d.gastos_ars, "ARS")}</td>
                  <td className={TDN}>{formatear((d.fob_usd + d.flete_seguro_usd) * d.cotizacion + d.gastos_ars, "ARS")}</td>
                  <td className={TD}><Estado texto={est.texto} tono={est.tono} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filas.length === LIMITE && <p className="text-[11px] text-[#5C6B76] mt-2">Se muestran los últimos {LIMITE}: usá los filtros para ver más.</p>}
    </Pantalla>
  );
}
