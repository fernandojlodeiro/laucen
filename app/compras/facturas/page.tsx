// Facturas de compra: las de los proveedores (mercadería, servicios, la del
// proveedor del exterior y las del despachante), con filtros por proveedor y
// estado. Cada una se arma en borrador y se registra desde su detalle.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { AccionesExcel, TablaVista, paginaDeVista } from "@/app/listas/piezas";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { BotonEnviar } from "@/app/radar/Cliente";
import { elegirRazonSocial, nombreRs } from "@/lib/razon-social";
import SelectorRazonSocial from "@/app/componentes/SelectorRazonSocial";
import { ESTADO_FACTURA } from "../comun";
import { accionSubirArca } from "./arca/acciones";
import { LISTA_FACTURAS_COMPRA, filtrosFacturasCompra } from "./lista";

export const dynamic = "force-dynamic";

const IMPORTAR = "Importar de ARCA (Mis Comprobantes)";

type SP = { rs?: string; proveedor?: string; estado?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

export default async function FacturasCompra({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const { proveedor: proveedorId, estado } = filtrosFacturasCompra(sp);
  const [proveedores, vista] = await Promise.all([
    consulta<{ id: number; nombre: string }>("select id::int, nombre from proveedor where organizacion_id = $1 order by estado, nombre", [s.org.id]),
    paginaDeVista(LISTA_FACTURAS_COMPRA, { org: s.org.id, moneda: s.moneda }, sp),
  ]);
  const rs = await elegirRazonSocial(s.org.id, sp.rs);
  const hayFiltro = !!(proveedorId || estado || rs.id);

  return (
    <Pantalla titulo="Facturas de compra" subtitulo="Lo que te facturan los proveedores: mercadería, servicios, el proveedor del exterior y el despachante"
      acciones={<><AccionesExcel lista={LISTA_FACTURAS_COMPRA} org={s.org.id} vista={vista.activa?.id} /><BotonNuevo texto={IMPORTAR} /><Link href="/compras/facturas/nueva" className={PRIMARIO}>+ Nueva factura</Link></>}>
      <Avisos sp={sp} />
      <AltaNueva texto={IMPORTAR} sinBoton>
        <form action={accionSubirArca} className="flex flex-wrap items-end gap-3">
          {rs.multi && (
            <label><span className={ETIQUETA}>De la razón social</span>
              <select name="emisor" defaultValue={rs.id ?? rs.razones.find((x) => x.es_principal)?.id} className={CAMPO}>
                {rs.razones.map((x) => <option key={x.id} value={x.id}>{nombreRs(x)}</option>)}
              </select></label>
          )}
          <label><span className={ETIQUETA}>Archivo de ARCA → Mis Comprobantes → Recibidos (.csv o .xlsx)</span>
            <input type="file" name="archivo" required accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="text-xs" /></label>
          <BotonEnviar clase={PRIMARIO} corriendo="Leyendo…">Subir y ver</BotonEnviar>
          <p className="w-full text-[11px] text-[#5C6B76]">Primero se ve cada comprobante con su proveedor y si ya estaba cargado; nada se registra hasta apretar «Importar». Subir dos veces el mismo mes no duplica.</p>
        </form>
      </AltaNueva>
      <form className="flex flex-wrap items-end gap-2 mb-3">
        {rs.multi && rs.id && <input type="hidden" name="rs" value={rs.id} />}
        {rs.multi && <SelectorRazonSocial razones={rs.razones.map((x) => ({ id: x.id, nombre: nombreRs(x) }))} valor={rs.id} />}
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

      <div className="flex justify-end mb-2">{vista.selector}</div>
      <TablaVista lista={LISTA_FACTURAS_COMPRA} campos={vista.campos} filas={vista.filas} total={vista.total} ctx={{ moneda: s.moneda, sp }}
        vacio={hayFiltro ? "Nada con esos filtros." : "Todavía no hay facturas de compra."} />
    </Pantalla>
  );
}
