// Pedidos de todos los canales: listado con filtros. Sólo mirar: cambiar de
// estado lo hacen las sesiones siguientes (con cambiarEstado de lib/pedidos).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { ESTADOS_PEDIDO, ESTADOS_PAGO } from "@/lib/pedidos";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { AccionesExcel, TablaVista, paginaDeVista } from "@/app/listas/piezas";
import { LISTA_PEDIDOS, filtrosPedidos } from "./lista";

export const dynamic = "force-dynamic";

type SP = { estado?: string; canal?: string; pago?: string; desde?: string; hasta?: string; q?: string; cliente?: string; p?: string; orden?: string; dir?: string };

export default async function Pedidos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("pedidos_ver");
  const sp = await searchParams;
  const { estado, pago, canal, desde, hasta, q, cliente } = filtrosPedidos(sp);
  const ctx = { org: s.org.id, moneda: s.moneda };
  const [canales, vista] = await Promise.all([
    consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 order by nombre", [s.org.id]),
    paginaDeVista(LISTA_PEDIDOS, ctx, sp),
  ]);
  const hayFiltro = !!(estado || pago || canal || desde || hasta || q || cliente);

  return (
    <Pantalla titulo="Pedidos" subtitulo="Los pedidos de todos los canales"
      acciones={<AccionesExcel lista={LISTA_PEDIDOS} org={s.org.id} vista={vista.activa?.id} />}>
      <form className="flex flex-wrap items-end gap-2 mb-3">
        <label><span className={ETIQUETA}>Buscar</span>
          <input name="q" defaultValue={q} placeholder="Nº, id externo o cliente" className={`${CAMPO} w-52`} /></label>
        <label><span className={ETIQUETA}>Estado</span>
          <select name="estado" defaultValue={estado} className={CAMPO}>
            <option value="">Todos</option>
            <option value="pendientes">Pendientes (nuevo + pagado)</option>
            {Object.entries(ESTADOS_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label><span className={ETIQUETA}>Canal</span>
          <select name="canal" defaultValue={canal || ""} className={CAMPO}>
            <option value="">Todos</option>
            {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></label>
        <label><span className={ETIQUETA}>Pago</span>
          <select name="pago" defaultValue={pago} className={CAMPO}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label><span className={ETIQUETA}>Desde</span><input type="date" name="desde" defaultValue={desde} className={CAMPO} /></label>
        <label><span className={ETIQUETA}>Hasta</span><input type="date" name="hasta" defaultValue={hasta} className={CAMPO} /></label>
        {cliente > 0 && <input type="hidden" name="cliente" value={cliente} />}
        <button className={PRIMARIO}>Filtrar</button>
        {hayFiltro && <Link href="/ventas/pedidos" className={SUAVE}>Limpiar</Link>}
      </form>
      <div className="flex justify-end mb-2">{vista.selector}</div>
      <TablaVista lista={LISTA_PEDIDOS} campos={vista.campos} filas={vista.filas} total={vista.total} ctx={{ moneda: s.moneda, sp }}
        vacio={hayFiltro ? "No hay pedidos con esos filtros." : "Todavía no hay pedidos."} />
    </Pantalla>
  );
}
