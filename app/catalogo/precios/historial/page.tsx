// Catálogo › Historial de precios de lista (pedido de Fer, 12/10): todos los
// cambios de precio en las listas (las de la regla del seguimiento y los
// hechos a mano), con quién los hizo. Filtros: fechas, subieron / bajaron,
// lista, quién y búsqueda por SKU o título (app/catalogo/precios/historial/lista.tsx).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import { formatear } from "@/lib/moneda";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import RangoFechas from "@/app/componentes/RangoFechas";
import FotosProducto from "@/app/componentes/FotosProducto";
import { entrarErp, Pantalla, Avisos, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, ETIQUETA, url } from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_HISTORIAL_PRECIOS, SENTIDO, QUIEN, SENTIDOS, sentidoDe, filtrosHistorial } from "./lista";

export const dynamic = "force-dynamic";

type SP = { q?: string; contiene?: string; p?: string; orden?: string; dir?: string; desde?: string; hasta?: string; sentido?: string; lista?: string; quien?: string; ok?: string; error?: string };
type Fila = { id: number; fecha: Date; vigente: string; producto_id: number; sku: string; titulo: string; lista: string; antes: number | null; despues: number;
  pct: number | null; sentido: string; quien: string; motivo: string | null; moneda: string; fotos: string[] | null };

const ORDEN = { fecha: "h.creado_ts", sku: "v.sku", titulo: "lower(coalesce(v.titulo, p.titulo))", lista: "l.nombre", antes: "h.antes_ars", despues: "h.importe_ars",
  pct: "case when h.moneda_origen = 'USD' then (h.importe_usd - h.antes_usd) / nullif(h.antes_usd, 0) else (h.importe_ars - h.antes_ars) / nullif(h.antes_ars, 0) end", quien: QUIEN };

export default async function HistorialPrecios({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("precios_ver");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const f = filtrosHistorial(s.org.id, sp);
  const [{ filas, total }, listas, personas] = await Promise.all([
    consultaPaginada<Fila>({
      campos: `h.id::int, h.creado_ts fecha, to_char(h.vigente_desde, 'DD/MM/YYYY') vigente, p.id::int producto_id, v.sku, coalesce(v.titulo, p.titulo) titulo,
               l.nombre lista, h.antes_ars::float8 antes, h.importe_ars::float8 despues, h.moneda_origen moneda,
               round((case when h.moneda_origen = 'USD' then (h.importe_usd - h.antes_usd) / nullif(h.antes_usd, 0) else (h.importe_ars - h.antes_ars) / nullif(h.antes_ars, 0) end * 100)::numeric, 1)::float8 pct,
               ${SENTIDO} sentido, ${QUIEN} quien, h.motivo,
               (select array_agg(pf.url order by pf.orden, pf.id) from producto_foto pf where pf.producto_id = p.id) fotos`,
      desde: f.desde, donde: f.donde, orden: leerOrden(sp, ORDEN, f.orden),
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
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="fecha" porDefecto>Cuándo</ThOrden><ThOrden col="sku">SKU</ThOrden><ThOrden col="titulo">Producto</ThOrden><ThOrden col="lista">Lista</ThOrden>
              <ThOrden col="antes" n>Antes</ThOrden><ThOrden col="despues" n>Después</ThOrden><ThOrden col="pct" n>Cambio</ThOrden><ThOrden col="quien">Quién</ThOrden><th className="px-2 py-1.5 text-left">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>No hay cambios de precio con esos filtros.</td></tr>}
            {filas.map((x) => (
              <tr key={x.id} className={TR}>
                <td className={`${TD} whitespace-nowrap`}>
                  {new Date(x.fecha).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}
                  <span className="block text-[10px] text-[#5C6B76]">rige desde {x.vigente}</span>
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  <span className="inline-flex items-center gap-2">
                    <FotosProducto fotos={x.fotos} titulo={x.sku} />
                    <Link href={url(`/catalogo/productos/${x.producto_id}`, { seccion: "precios" })} className="text-[#16577F] hover:underline font-mono">{x.sku}</Link>
                  </span>
                </td>
                <td className={TD}>{x.titulo}</td>
                <td className={TD}>{x.lista}</td>
                <td className={TDN}>{x.antes != null ? formatear(x.antes, "ARS") : "—"}</td>
                <td className={TDN}><b>{formatear(x.despues, "ARS")}</b>{x.moneda === "USD" && <span className="block text-[10px] text-[#5C6B76]">cargado en US$</span>}</td>
                <td className={`${TDN} whitespace-nowrap font-semibold ${x.sentido === "subio" ? "text-[#1F6E4A]" : x.sentido === "bajo" ? "text-[#C03420]" : "text-[#5C6B76]"}`}>
                  {x.sentido === "nuevo" ? "Nuevo" : x.pct == null ? "—" : `${x.sentido === "subio" ? "▲" : x.sentido === "bajo" ? "▼" : ""} ${Math.abs(x.pct).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`}
                </td>
                <td className={TD}>{x.quien}</td>
                <td className={`${TD} text-[11px] text-[#5C6B76]`}>{x.motivo ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
    </Pantalla>
  );
}
