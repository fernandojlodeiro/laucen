// Facturas de compra: las de los proveedores (mercadería, servicios, la del
// proveedor del exterior y las del despachante), con filtros por proveedor y
// estado. Cada una se arma en borrador y se registra desde su detalle.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { PRIMARIO, SUAVE } from "@/app/botones";
import {
  entrarErp, Pantalla, Avisos, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha } from "@/app/ventas/formato";
import { ESTADO_FACTURA, numeroFactura } from "../comun";

export const dynamic = "force-dynamic";

type SP = { proveedor?: string; estado?: string; ok?: string; error?: string };

type Fila = {
  id: number; fecha: Date; proveedor: string; letra: string; es_nota_credito: boolean; punto_venta: number | null; numero: string | null;
  moneda: "ARS" | "USD"; total: string; estado: string; lineas: number;
};

const LIMITE = 300;

export default async function FacturasCompra({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const proveedorId = Number(sp.proveedor) || 0;
  const estado = sp.estado && Object.hasOwn(ESTADO_FACTURA, sp.estado) ? sp.estado : "";
  const [proveedores, filas] = await Promise.all([
    consulta<{ id: number; nombre: string }>("select id::int, nombre from proveedor where organizacion_id = $1 order by estado, nombre", [s.org.id]),
    consulta<Fila>(`
      select f.id::int, f.fecha, p.nombre proveedor, f.letra, f.es_nota_credito, f.punto_venta, f.numero::text, f.moneda, f.total, f.estado,
             (select count(*) from factura_compra_linea l where l.factura_id = f.id)::int lineas
        from factura_compra f join proveedor p on p.id = f.proveedor_id
       where f.organizacion_id = $1 and ($2 = 0 or f.proveedor_id = $2) and ($3 = '' or f.estado = $3)
       order by f.fecha desc, f.id desc limit ${LIMITE}`, [s.org.id, proveedorId, estado]),
  ]);
  const hayFiltro = !!(proveedorId || estado);

  return (
    <Pantalla titulo="Facturas de compra" subtitulo="Lo que te facturan los proveedores: mercadería, servicios, el proveedor del exterior y el despachante"
      acciones={<Link href="/compras/facturas/nueva" className={PRIMARIO}>Nueva factura</Link>}>
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
            {Object.entries(ESTADO_FACTURA).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select></label>
        <button className={PRIMARIO}>Filtrar</button>
        {hayFiltro && <Link href="/compras/facturas" className={SUAVE}>Limpiar</Link>}
      </form>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={THN}>Fecha</th><th className={TH}>Proveedor</th><th className={TH}>Comprobante</th><th className={THN}>Líneas</th><th className={THN}>Total</th><th className={TH}>Estado</th></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>{hayFiltro ? "Nada con esos filtros." : "Todavía no hay facturas de compra."}</td></tr>}
            {filas.map((f) => {
              const est = ESTADO_FACTURA[f.estado] ?? ESTADO_FACTURA.borrador;
              return (
                <tr key={f.id} className={TR}>
                  <td className={TDN}>{fecha(f.fecha)}</td>
                  <td className={TD}>{f.proveedor}</td>
                  <td className={`${TD} font-mono whitespace-nowrap`}>
                    <Link href={`/compras/facturas/${f.id}`} className="font-semibold text-[#16577F] hover:underline">{numeroFactura(f)}</Link>
                  </td>
                  <td className={TDN}>{f.lineas}</td>
                  <td className={TDN}>{formatear(f.es_nota_credito ? -Number(f.total) : f.total, f.moneda)}</td>
                  <td className={TD}><Estado texto={est.texto} tono={est.tono} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filas.length === LIMITE && <p className="text-[11px] text-[#5C6B76] mt-2">Se muestran las últimas {LIMITE}: usá los filtros para ver más.</p>}
    </Pantalla>
  );
}
