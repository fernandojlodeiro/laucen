// Pedidos de todos los canales: listado con filtros, el alta a mano ("Nuevo
// pedido", para los canales que no son Mercado Libre) y, si quedaron carritos
// de ML partidos en varios pedidos de antes, el botón para unirlos.

import Link from "next/link";
import RangoFechas from "@/app/componentes/RangoFechas";
import { consulta } from "@/lib/erp/base";
import { ESTADOS_PEDIDO, ESTADOS_PAGO } from "@/lib/pedidos";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { BotonEnviar } from "@/app/radar/Cliente";
import { contarCarritosPartidos } from "@/lib/mercadolibre/carritos";
import NuevoPedido from "./NuevoPedido";
import { accionUnirCarritos } from "./acciones";
import { AccionesExcel, TablaVista, paginaDeVista } from "@/app/listas/piezas";
import { LISTA_PEDIDOS, filtrosPedidos } from "./lista";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string; estado?: string; canal?: string; pago?: string; desde?: string; hasta?: string; q?: string; cliente?: string; p?: string; orden?: string; dir?: string };

export default async function Pedidos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("pedidos_ver");
  const sp = await searchParams;
  const { estado, pago, canal, desde, hasta, q, cliente } = filtrosPedidos(sp);
  const ctx = { org: s.org.id, moneda: s.moneda };
  const [canales, vista, aMano, partidos] = await Promise.all([
    consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 order by nombre", [s.org.id]),
    paginaDeVista(LISTA_PEDIDOS, ctx, sp),
    // Los canales donde se carga un pedido a mano (Mercado Libre no: entran solos).
    consulta<{ id: number; nombre: string; moneda: "ARS" | "USD" }>(`
      select ca.id::int, ca.nombre, coalesce(l.moneda_base, 'ARS') moneda from canal ca left join lista_precios l on l.id = ca.lista_precios_id
       where ca.organizacion_id = $1 and ca.estado = 'activo' and ca.tipo in ('local', 'web_minorista', 'web_mayorista', 'otro')
       order by (ca.tipo = 'local') desc, ca.nombre`, [s.org.id]),
    contarCarritosPartidos(s.org.id),
  ]);
  const hayFiltro = !!(estado || pago || canal || desde || hasta || q || cliente);

  return (
    <Pantalla titulo="Pedidos" subtitulo="Los pedidos de todos los canales"
      acciones={<><AccionesExcel lista={LISTA_PEDIDOS} org={s.org.id} vista={vista.activa?.id} /><BotonNuevo texto="Nuevo pedido" /></>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nuevo pedido" sinBoton>
        <NuevoPedido canales={aMano} />
      </AltaNueva>
      {partidos > 0 && (
        <form action={accionUnirCarritos} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#F0DDB0] bg-[#FFF8E8] px-3 py-2 mb-3 text-xs">
          <span className="flex-1 min-w-60">
            Hay {partidos === 1 ? "1 carrito" : `${partidos} carritos`} de Mercado Libre partidos en varios pedidos (entraron así antes de que un carrito fuera un solo pedido).
            Se unen los que todavía no se facturaron ni se empezaron a preparar; los otros quedan como están y se avisa cuáles.
          </span>
          <BotonEnviar clase={PRIMARIO} corriendo="Uniendo…">Unir carritos de Mercado Libre</BotonEnviar>
        </form>
      )}
      <form className="flex flex-wrap items-end gap-2 mb-3">
        <label><span className={ETIQUETA}>Buscar</span>
          <input name="q" defaultValue={q} placeholder="Nº, id externo o cliente" className={`${CAMPO} w-52`} /></label>
        <label><span className={ETIQUETA}>Estado</span>
          <select name="estado" defaultValue={estado} className={CAMPO}>
            <option value="todos">Todos</option>
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
        <div><span className={ETIQUETA}>Fechas</span><RangoFechas desde={desde} hasta={hasta} vacio="Todas las fechas" etiqueta="" limpiar={["p"]} /></div>
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
