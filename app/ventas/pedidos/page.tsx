// Pedidos de todos los canales: listado con filtros que aplican al momento
// (sin botón Filtrar) y el alta a mano ("Nuevo pedido", para los canales que
// no son Mercado Libre). El botón para unir carritos de ML partidos ya se usó
// (Fer, 3/10) y no se muestra más; la función queda en lib/mercadolibre/carritos.ts.

import Link from "next/link";
import RangoFechas from "@/app/componentes/RangoFechas";
import { consulta } from "@/lib/erp/base";
import { ESTADOS_PEDIDO, ESTADOS_PAGO } from "@/lib/pedidos";
import { SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, ETIQUETA } from "@/app/componentes/erp";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import NuevoPedido from "./NuevoPedido";
import { AccionesExcel, TablaVista, paginaDeVista } from "@/app/listas/piezas";
import { LISTA_PEDIDOS, filtrosPedidos } from "./lista";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string; estado?: string; canal?: string; pago?: string; desde?: string; hasta?: string; q?: string; cliente?: string; p?: string; orden?: string; dir?: string };

export default async function Pedidos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("pedidos_ver");
  const sp = await searchParams;
  const { estado, pago, canal, desde, hasta, q, cliente } = filtrosPedidos(sp);
  const ctx = { org: s.org.id, moneda: s.moneda };
  const [canales, vista, aMano] = await Promise.all([
    consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 order by nombre", [s.org.id]),
    paginaDeVista(LISTA_PEDIDOS, ctx, sp),
    // Los canales donde se carga un pedido a mano (Mercado Libre no: entran solos).
    consulta<{ id: number; nombre: string; moneda: "ARS" | "USD" }>(`
      select ca.id::int, ca.nombre, coalesce(l.moneda_base, 'ARS') moneda from canal ca left join lista_precios l on l.id = ca.lista_precios_id
       where ca.organizacion_id = $1 and ca.estado = 'activo' and ca.tipo in ('local', 'web_minorista', 'web_mayorista', 'otro')
       order by (ca.tipo = 'local') desc, ca.nombre`, [s.org.id]),
  ]);
  const hayFiltro = !!((estado && estado !== "pendientes") || pago || canal || desde || hasta || q || cliente);

  return (
    <Pantalla titulo="Pedidos" subtitulo="Los pedidos de todos los canales"
      acciones={<><AccionesExcel lista={LISTA_PEDIDOS} org={s.org.id} vista={vista.activa?.id} /><BotonNuevo texto="Nuevo pedido" /></>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nuevo pedido" sinBoton>
        <NuevoPedido canales={aMano} />
      </AltaNueva>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div><span className={ETIQUETA}>Buscar</span><BuscadorVivo q={q} comienza={false} sinComienza placeholder="Nº, id externo o cliente" limpiar={["p"]} /></div>
        <div><span className={ETIQUETA}>Estado</span>
          <FiltroVivo key={`e${estado}`} parametro="estado" valor={estado || "todos"} etiqueta="Estado" limpiar={["p"]}>
            <option value="todos">Todos</option>
            <option value="pendientes">Pendientes (nuevo + pagado)</option>
            {Object.entries(ESTADOS_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </FiltroVivo></div>
        <div><span className={ETIQUETA}>Canal</span>
          <FiltroVivo key={`c${canal}`} parametro="canal" valor={canal ? String(canal) : ""} etiqueta="Canal" limpiar={["p"]}>
            <option value="">Todos</option>
            {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </FiltroVivo></div>
        <div><span className={ETIQUETA}>Pago</span>
          <FiltroVivo key={`p${pago}`} parametro="pago" valor={pago} etiqueta="Pago" limpiar={["p"]}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </FiltroVivo></div>
        <div><span className={ETIQUETA}>Fechas</span><RangoFechas desde={desde} hasta={hasta} vacio="Todas las fechas" etiqueta="" limpiar={["p"]} /></div>
        {hayFiltro && <Link href="/ventas/pedidos" className={SUAVE}>Limpiar filtros</Link>}
      </div>
      <div className="flex justify-end mb-2">{vista.selector}</div>
      <TablaVista lista={LISTA_PEDIDOS} campos={vista.campos} filas={vista.filas} total={vista.total} ctx={{ moneda: s.moneda, sp }}
        vacio={hayFiltro ? "No hay pedidos con esos filtros." : "Todavía no hay pedidos."} />
    </Pantalla>
  );
}
