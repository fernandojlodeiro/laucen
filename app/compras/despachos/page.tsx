// Despachos de importación: la mercadería importada con todos sus costos.
// Cada uno se arma en borrador y al registrarlo prorratea flete, seguro y
// gastos sobre las líneas por su FOB (costo puesto en depósito).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { formatear } from "@/lib/moneda";
import { PRIMARIO, SUAVE } from "@/app/botones";
import {
  entrarErp, Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha } from "@/app/ventas/formato";
import { ESTADO_DESPACHO } from "../comun";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_DESPACHOS, GASTOS_DESPACHO, LINEAS_DESPACHO, COSTO_DESPACHO } from "./lista";

export const dynamic = "force-dynamic";

type SP = { proveedor?: string; estado?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

type Fila = {
  id: number; numero: string | null; fecha: Date; proveedor_id: number | null; proveedor: string | null; fob_usd: number; flete_seguro_usd: number;
  gastos_ars: number; cotizacion: number; estado: string; lineas: number;
};

export default async function Despachos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("despachos_ver");
  const sp = await searchParams;
  const proveedorId = Number(sp.proveedor) || 0;
  const estado = sp.estado && Object.hasOwn(ESTADO_DESPACHO, sp.estado) ? sp.estado : "";
  const GASTOS = GASTOS_DESPACHO;
  const LINEAS = LINEAS_DESPACHO;
  const base = await LISTA_DESPACHOS.consulta!({ org: s.org.id, moneda: s.moneda }, sp);
  const [proveedores, { filas, total }] = await Promise.all([
    consulta<{ id: number; nombre: string }>(`
      select distinct p.id::int, p.nombre from proveedor p join despacho_importacion d on d.proveedor_id = p.id
       where p.organizacion_id = $1 order by p.nombre`, [s.org.id]),
    consultaPaginada<Fila>({
      campos: `d.id::int, d.numero, d.fecha, d.proveedor_id::int, p.nombre proveedor, d.fob_usd::float, (d.flete_usd + d.seguro_usd)::float flete_seguro_usd,
               ${GASTOS}::float gastos_ars, d.cotizacion::float, d.estado, ${LINEAS}::int lineas`,
      desde: base.desde,
      donde: base.donde,
      orden: leerOrden(sp, {
        fecha: "d.fecha", numero: "d.numero", proveedor: "p.nombre", lineas: LINEAS, fob: "d.fob_usd", flete: "(d.flete_usd + d.seguro_usd)",
        gastos: GASTOS, costo: COSTO_DESPACHO, estado: "d.estado",
      }, base.orden),
    }, base.valores, sp),
  ]);
  const hayFiltro = !!(proveedorId || estado);

  return (
    <Pantalla titulo="Despachos de importación" subtitulo="La mercadería importada con su FOB, flete, seguro y gastos: queda el costo puesto en depósito"
      acciones={<><AccionesExcel lista={LISTA_DESPACHOS} org={s.org.id} /><Link href="/compras/despachos/nuevo" className={PRIMARIO}>+ Nuevo despacho</Link></>}>
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
              <ThOrden col="fecha" n porDefecto>Fecha</ThOrden><ThOrden col="numero">Despacho</ThOrden><ThOrden col="proveedor">Proveedor</ThOrden><ThOrden col="lineas" n>Líneas</ThOrden>
              <ThOrden col="fob" n>FOB</ThOrden><ThOrden col="flete" n>Flete + seguro</ThOrden><ThOrden col="gastos" n>Gastos</ThOrden><ThOrden col="costo" n>Costo total</ThOrden><ThOrden col="estado">Estado</ThOrden>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>{hayFiltro ? "Nada con esos filtros." : "Todavía no hay despachos."}</td></tr>}
            {filas.map((d) => {
              const est = ESTADO_DESPACHO[d.estado] ?? ESTADO_DESPACHO.borrador;
              return (
                <tr key={d.id} className={TR}>
                  <td className={TDN}><Link href={`/compras/despachos/${d.id}`} className="hover:underline">{fecha(d.fecha)}</Link></td>
                  <td className={`${TD} font-mono`}>
                    <Link href={`/compras/despachos/${d.id}`} className="font-semibold text-[#16577F] hover:underline">{d.numero ?? `#${d.id} (sin número)`}</Link>
                  </td>
                  <td className={TD}>{d.proveedor_id ? <Link href={url("/compras/proveedores", { id: d.proveedor_id })} className="text-[#16577F] hover:underline">{d.proveedor}</Link> : "—"}</td>
                  <td className={TDN}><Link href={`/compras/despachos/${d.id}`} className="hover:underline">{d.lineas}</Link></td>
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
      <Paginado total={total} />
    </Pantalla>
  );
}
