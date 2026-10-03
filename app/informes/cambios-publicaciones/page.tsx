// Informe: cambios en publicaciones de Mercado Libre. Qué publicaciones
// cambiaron de estado (activa, pausada, cerrada, en revisión…), de precio o
// de stock en un rango de fechas, y si el cambio lo mandó Laucen (la cola) o
// lo hizo alguien fuera de Laucen. La historia la anota un trigger sobre la
// copia local de cada publicación (meli_item → meli_item_cambio) desde el
// 3/10: de antes no hay nada.

import { consulta } from "@/lib/erp/base";
import { consultaPaginada } from "@/lib/lista";
import BuscadorVivo, { CasillaViva, FiltroVivo } from "@/app/componentes/BuscadorVivo";
import RangoFechas from "@/app/componentes/RangoFechas";
import { entrarErp, Pantalla } from "@/app/componentes/erp";
import { AccionesExcel, TablaVista } from "@/app/listas/piezas";
import { camposDe, elegir, ordenDe, seleccion, type Fila } from "@/lib/listas/tipos";
import { CasillasVivas, Desplegable } from "../Filtros";
import { LISTA_CAMBIOS_PUBLICACIONES as LISTA, filtrosCambios } from "./lista";
import { CAMPOS_CAMBIO } from "./formato";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

export default async function CambiosPublicaciones({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("informes_publicaciones_ver");
  const sp = await searchParams;
  const f = filtrosCambios(sp);
  const ctx = { org: s.org.id, moneda: s.moneda };
  const todos = await camposDe(LISTA, ctx);
  // En pantalla: "Cambios" sólo agrupando (cada cambio es uno); agrupando, también desde cuándo.
  const claves = f.agrupar
    ? LISTA.enPantalla.flatMap((k) => (k === "fecha" ? ["primera", "fecha"] : [k]))
    : LISTA.enPantalla.filter((k) => k !== "cambios");
  const campos = elegir(LISTA, todos, claves).map((c) =>
    f.agrupar && c.clave === "fecha" ? { ...c, titulo: "Último cambio" } : c);
  const [base, canales] = await Promise.all([
    LISTA.consulta!(ctx, sp),
    consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 and tipo = 'mercadolibre' order by nombre", [s.org.id]),
  ]);
  const { filas, total } = await consultaPaginada<Fila>({
    campos: seleccion(campos, todos, LISTA.siempre), desde: base.desde, donde: base.donde, orden: ordenDe(todos, sp, base.orden),
  }, base.valores, sp);
  const hayFiltro = !!(f.q || f.canal || f.externos);

  return (
    <Pantalla titulo="Cambios en publicaciones"
      subtitulo="Las publicaciones de Mercado Libre que cambiaron de estado, de precio o de stock, cuándo y quién: Laucen (lo mandó la cola) o alguien fuera de Laucen (en Mercado Libre). La historia arranca el 3/10/2026: de antes no hay nada."
      acciones={<AccionesExcel lista={LISTA} org={s.org.id} />}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={f.q} comienza={f.comienza} placeholder="Publicación (MLA…), SKU o título" />
        <RangoFechas desde={f.desde} hasta={f.hasta} />
        <FiltroVivo parametro="canal" valor={f.canal ? String(f.canal) : ""} etiqueta="Cuenta">
          <option value="">Todas las cuentas</option>
          {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </FiltroVivo>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
        <CasillasVivas parametro="tipos" etiqueta="Qué cambió:" elegidas={f.tipos} defecto={["estado", "precio"]}
          opciones={Object.entries(CAMPOS_CAMBIO).map(([valor, texto]) => ({ valor, texto }))} />
        <CasillaViva parametro="externos" activo={f.externos} etiqueta="Sólo los que hizo alguien fuera de Laucen" />
        <Desplegable parametro="agrupar" etiqueta="Ver" valor={f.agrupar ? "1" : ""}
          opciones={[{ valor: "", texto: "Cada cambio" }, { valor: "1", texto: "Una fila por publicación" }]} />
      </div>
      <TablaVista lista={LISTA} campos={campos} filas={filas} total={total} ctx={{ moneda: s.moneda, sp }}
        vacio={f.tipos.length === 0 ? "Tildá al menos un tipo de cambio (estado, precio o stock)."
          : hayFiltro ? "Nada coincide con los filtros en esas fechas." : "No hubo cambios en esas fechas."} />
      <p className="text-[11px] text-[#5C6B76] mt-1">
        {f.agrupar
          ? "Una fila por publicación (y variación) y tipo de cambio: el valor al empezar el rango → el valor al terminar, y cuántas veces cambió. Si volvió a como estaba, se ve igual a los dos lados."
          : "El estado de una publicación con variaciones se anota en cada variación."}
        {" "}«Laucen» = hace menos de 15 minutos la cola le había mandado a ML un cambio de ese tipo a esa publicación; si no, «Fuera de Laucen».
      </p>
    </Pantalla>
  );
}
