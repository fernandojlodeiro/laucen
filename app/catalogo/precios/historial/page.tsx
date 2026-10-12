// Catálogo › Historial de precios de lista (pedido de Fer, 12/10): todos los
// cambios de precio en las listas (las de la regla del seguimiento y los
// hechos a mano), con quién los hizo. Filtros: fechas, subieron / bajaron,
// lista, quién y búsqueda por SKU o título (app/catalogo/precios/historial/lista.tsx).

import { consulta } from "@/lib/erp/base";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import { Paginado } from "@/app/componentes/Lista";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import RangoFechas from "@/app/componentes/RangoFechas";
import { entrarErp, Pantalla, Avisos, ETIQUETA } from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_HISTORIAL_PRECIOS, SENTIDOS, sentidoDe, filtrosHistorial, CAMPOS_HISTORIAL, ORDEN_HISTORIAL, type FilaHistorial } from "./lista";
import TablaHistorial from "./Tabla";

export const dynamic = "force-dynamic";

type SP = { q?: string; contiene?: string; p?: string; orden?: string; dir?: string; desde?: string; hasta?: string; sentido?: string; lista?: string; quien?: string; ok?: string; error?: string };
export default async function HistorialPrecios({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("precios_ver");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const f = filtrosHistorial(s.org.id, sp);
  const [{ filas, total }, listas, personas] = await Promise.all([
    consultaPaginada<FilaHistorial>({
      campos: CAMPOS_HISTORIAL, desde: f.desde, donde: f.donde, orden: leerOrden(sp, ORDEN_HISTORIAL, f.orden),
    }, f.valores, sp),
    consulta<{ id: number; nombre: string }>("select id::int, nombre from lista_precios where organizacion_id = $1 order by orden, nombre", [s.org.id]),
    consulta<{ id: string; nombre: string }>(`select distinct u.id, coalesce(u.nombre, u.email) nombre from precio pr join usuarios u on u.id = pr.usuario_id
      where pr.organizacion_id = $1 order by 2`, [s.org.id]),
  ]);
  const sentido = sentidoDe(sp.sentido);

  return (
    <Pantalla titulo="Historial de precios de lista" subtitulo="Cada cambio de precio en las listas: cuánto, cuándo y quién lo hizo (una persona o la regla de precio del seguimiento)"
      acciones={<AccionesExcel lista={LISTA_HISTORIAL_PRECIOS} org={s.org.id} />}>
      <Avisos sp={sp} />
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar SKU o producto" limpiar={["p"]} />
        <div><span className={ETIQUETA}>Fechas</span><RangoFechas desde={sp.desde ?? ""} hasta={sp.hasta ?? ""} vacio="Todas las fechas" etiqueta="" limpiar={["p"]} /></div>
        <label><span className={ETIQUETA}>Qué cambios</span>
          <FiltroVivo parametro="sentido" valor={sentido === "cambios" ? "" : sentido} etiqueta="Qué cambios" limpiar={["p"]}>
            {Object.entries(SENTIDOS).map(([k, t]) => <option key={k} value={k === "cambios" ? "" : k}>{t}</option>)}
          </FiltroVivo>
        </label>
        <label><span className={ETIQUETA}>Lista</span>
          <FiltroVivo parametro="lista" valor={sp.lista ?? ""} etiqueta="Lista" limpiar={["p"]}>
            <option value="">Todas</option>
            {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </FiltroVivo>
        </label>
        <label><span className={ETIQUETA}>Quién</span>
          <FiltroVivo parametro="quien" valor={sp.quien ?? ""} etiqueta="Quién" limpiar={["p"]}>
            <option value="">Todos</option>
            <option value="regla">Regla de seguimiento (automática)</option>
            {personas.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </FiltroVivo>
        </label>
      </div>
      <TablaHistorial filas={filas} />
      <Paginado total={total} />
    </Pantalla>
  );
}
