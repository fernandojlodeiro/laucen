// Copiar entre cuentas (Fer, 5/10): una fila por producto y una columna por cuenta
// de Mercado Libre, para ver en cuáles está cada publicación y crear en otra
// cuenta las que le faltan. Elegís origen y destino, marcás las filas, y "Preparar
// copia" deja un lote en la cola de ML esperando tu clic (lib/mercadolibre/copiar.ts).

import Link from "next/link";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import { BotonEnviar } from "@/app/radar/Cliente";
import { consulta } from "@/lib/erp/base";
import { PRIMARIO, SUAVE } from "@/app/botones";
import {
  entrarErp, Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, CAMPO, ETIQUETA, CAJA,
} from "@/app/componentes/erp";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import MarcarTodas from "./MarcarTodas";
import { accionPrepararCopia } from "./acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE = "/catalogo/publicaciones/copiar";

type SP = { origen?: string; destino?: string; est?: string; ver?: string; tipo?: string; q?: string; contiene?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };
type Celda = { i: string; e: string | null; l: string | null; c: boolean; v: boolean };
type Fila = { clave: string; titulo: string | null; sku: string | null; catalogo: boolean; con_var: boolean; cuentas: Record<string, Celda> };

const ESTADO: Record<string, { texto: string; tono: "verde" | "gris" | "amarillo" | "rojo" }> = {
  active: { texto: "Activa", tono: "verde" }, paused: { texto: "Pausada", tono: "gris" },
  under_review: { texto: "En revisión", tono: "amarillo" }, inactive: { texto: "Inactiva", tono: "rojo" },
};

export default async function CopiarEntreCuentas({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("publicaciones_ver");
  const sp = await searchParams;
  const org = s.org.id;

  const cuentas = await consulta<{ id: number; nombre: string; nickname: string | null }>(`
    select c.id::int, c.nombre, mc.nickname from meli_cuenta mc join canal c on c.id = mc.canal_id
     where mc.organizacion_id = $1 and mc.estado = 'activa' order by c.id`, [org]);
  if (cuentas.length < 2) {
    return (
      <Pantalla titulo="Copiar entre cuentas" subtitulo="Las mismas publicaciones en todas las cuentas de Mercado Libre" ancho="max-w-3xl">
        <div className={CAJA}><p className="text-xs">Hacen falta al menos dos cuentas de Mercado Libre conectadas (<Link href="/config/canales" className="text-[#16577F] underline">Configuración › Canales</Link>).</p></div>
      </Pantalla>
    );
  }

  const origen = cuentas.find((c) => c.id === Number(sp.origen)) ?? cuentas.find((c) => /baires/i.test(c.nombre)) ?? cuentas[0];
  const destino = cuentas.find((c) => c.id === Number(sp.destino) && c.id !== origen.id)
    ?? cuentas.find((c) => c.id !== origen.id && /tiendavirtual s$/i.test(c.nombre)) ?? cuentas.find((c) => c.id !== origen.id)!;
  const soloActivas = sp.est !== "todas";
  const soloFaltan = sp.ver !== "todas";
  const tipo = sp.tipo === "catalogo" || sp.tipo === "normal" ? sp.tipo : "";
  const q = sp.q?.trim() || "";
  const comienza = sp.contiene !== "1";

  // Una fila por producto (SKU sin "DE-" o, si no tiene, título sin tildes) con lo que tiene cada cuenta.
  const desde = `(
    with base as (
      select m.canal_id, m.item_id, m.titulo, m.sku, m.estado, m.permalink,
             coalesce(m.datos_externos -> 'ml' ->> 'catalog_listing', 'false') = 'true' catalogo,
             jsonb_array_length(coalesce(m.datos_externos -> 'ml' -> 'variations', '[]'::jsonb)) nvar,
             case when coalesce(trim(m.sku), '') <> '' then 'S:' || upper(regexp_replace(trim(m.sku), '^DE-', '', 'i'))
                  else 'T:' || trim(regexp_replace(lower(translate(coalesce(m.titulo, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^a-z0-9]+', ' ', 'g')) end clave
        from meli_item m
       where m.organizacion_id = $1 and m.canal_id = any($2::bigint[]) and m.estado <> 'closed'
    ), uno as (
      select distinct on (clave, canal_id) * from base order by clave, canal_id, (estado = 'active') desc, item_id
    )
    select clave, (array_agg(titulo order by canal_id))[1] titulo, (array_agg(sku order by canal_id))[1] sku,
           bool_or(catalogo) catalogo, bool_or(nvar > 0) con_var,
           jsonb_object_agg(canal_id::text, jsonb_build_object('i', item_id, 'e', estado, 'l', permalink, 'c', catalogo, 'v', nvar > 0)) cuentas
      from uno group by clave
  ) x`;
  const donde = `(x.cuentas -> $3::text) is not null
    and ($4::boolean is false or x.cuentas -> $3::text ->> 'e' = 'active')
    and ($5::boolean is false or not (x.cuentas ? $6::text))
    and ${sqlBusqueda("$7", ["x.titulo", "x.sku", "(select string_agg(e.value ->> 'i', ' ') from jsonb_each(x.cuentas) e)"])}
    and ($8::text = '' or ($8::text = 'catalogo' and x.catalogo) or ($8::text = 'normal' and not x.catalogo))`;
  const { filas, total } = await consultaPaginada<Fila>(
    { campos: "x.*", desde, donde, orden: leerOrden(sp, { titulo: "x.titulo", sku: "x.sku" }, "x.titulo, x.clave") },
    [org, cuentas.map((c) => c.id), String(origen.id), soloActivas, soloFaltan, String(destino.id), parametroBusqueda(q, comienza), tipo], sp);

  const aqui = url(BASE, { origen: origen.id, destino: destino.id, est: sp.est, ver: sp.ver, tipo: tipo || null, q, contiene: sp.contiene, p: sp.p, orden: sp.orden, dir: sp.dir });
  const n = (x: number) => x.toLocaleString("es-AR");
  const puede = (f: Fila) => {
    const o = f.cuentas[String(origen.id)];
    return !!o && o.e === "active" && !o.c && !o.v && !f.cuentas[String(destino.id)];
  };

  return (
    <Pantalla titulo="Copiar entre cuentas" subtitulo="Cada producto en cuáles cuentas de Mercado Libre está, y crear en otra cuenta lo que le falta">
      <Avisos sp={sp} />

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <label><span className={ETIQUETA}>Copiar desde</span>
          <FiltroVivo parametro="origen" valor={String(origen.id)} etiqueta="Cuenta de origen" limpiar={["destino"]}>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </FiltroVivo></label>
        <label><span className={ETIQUETA}>hacia</span>
          <FiltroVivo parametro="destino" valor={String(destino.id)} etiqueta="Cuenta de destino">
            {cuentas.filter((c) => c.id !== origen.id).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </FiltroVivo></label>
        <label><span className={ETIQUETA}>Publicaciones de origen</span>
          <FiltroVivo parametro="est" valor={soloActivas ? "" : "todas"} etiqueta="Estado en el origen">
            <option value="">Sólo activas</option><option value="todas">Activas y pausadas</option>
          </FiltroVivo></label>
        <label><span className={ETIQUETA}>Mostrar</span>
          <FiltroVivo parametro="ver" valor={soloFaltan ? "" : "todas"} etiqueta="Qué mostrar">
            <option value="">Sólo las que faltan en el destino</option><option value="todas">Todas</option>
          </FiltroVivo></label>
        <label><span className={ETIQUETA}>Tipo</span>
          <FiltroVivo parametro="tipo" valor={tipo} etiqueta="Tipo de publicación">
            <option value="">Todas</option><option value="normal">No son de catálogo</option><option value="catalogo">De catálogo</option>
          </FiltroVivo></label>
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar por título o SKU…" />
      </div>

      <div className="grid gap-3 mb-3">
        <form id="copiar" action={accionPrepararCopia} className={`${CAJA} space-y-2`}>
          <input type="hidden" name="origen" value={origen.id} /><input type="hidden" name="destino" value={destino.id} /><input type="hidden" name="volver" value={aqui} />
          <p className="text-xs">Marcá las publicaciones y apretá <b>Preparar copia</b>: se comprueban con Mercado Libre (sin publicar nada) y queda un lote para revisar. No sale nada hasta que lo mandes.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" name="variar_titulo" className="h-4 w-4 accent-[#16577F]" /> Variar el título (las palabras de atrás pasan adelante)</label>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" name="rotar_fotos" className="h-4 w-4 accent-[#16577F]" /> Cambiar la foto principal (la primera pasa al final)</label>
          </div>
          <BotonEnviar clase={PRIMARIO} corriendo="Comprobando con Mercado Libre… (no cierres la pantalla)">Preparar copia hacia {destino.nombre}</BotonEnviar>
        </form>
      </div>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}><MarcarTodas /></th>
              <ThOrden col="titulo" porDefecto>Producto</ThOrden>
              <ThOrden col="sku">SKU</ThOrden>
              {cuentas.map((c) => (
                <th key={c.id} className={`${TH} ${c.id === origen.id ? "text-[#16577F]" : c.id === destino.id ? "text-[#1F6E4A]" : ""}`}>
                  {c.nombre}{c.id === origen.id ? " (origen)" : c.id === destino.id ? " (destino)" : ""}
                </th>
              ))}
              <th className={TH}>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={cuentas.length + 4} className={`${TD} text-[#5C6B76]`}>
                {q ? "Nada coincide con la búsqueda." : soloFaltan ? `No falta ninguna en ${destino.nombre} con estos filtros.` : "No hay publicaciones para mostrar."}
              </td></tr>
            )}
            {filas.map((f) => {
              const o = f.cuentas[String(origen.id)];
              const elegible = puede(f);
              return (
                <tr key={f.clave} className={TR}>
                  <td className={TD}>
                    {elegible && o
                      ? <input type="checkbox" form="copiar" name="item" value={o.i} aria-label={`Copiar ${f.titulo ?? o.i}`} className="h-4 w-4 accent-[#16577F]" />
                      : <input type="checkbox" disabled aria-label="No se puede copiar" className="h-4 w-4" />}
                  </td>
                  <td className={`${TD} min-w-56 font-semibold`}>{f.titulo ?? "—"}</td>
                  <td className={`${TD} whitespace-nowrap`}>{f.sku ?? <span className="text-[#5C6B76]">—</span>}</td>
                  {cuentas.map((c) => {
                    const x = f.cuentas[String(c.id)];
                    const est = x?.e ? ESTADO[x.e] ?? { texto: x.e, tono: "gris" as const } : null;
                    return (
                      <td key={c.id} className={`${TD} whitespace-nowrap`}>
                        {x ? (
                          <span className="inline-flex items-center gap-1">
                            {x.l ? <a href={x.l} target="_blank" rel="noopener noreferrer" className="text-[#16577F] underline">{x.i} ↗</a> : x.i}
                            {est && <Estado texto={est.texto} tono={est.tono} />}
                          </span>
                        ) : <span className="text-[#5C6B76]">—</span>}
                      </td>
                    );
                  })}
                  <td className={`${TD} whitespace-nowrap text-[#5C6B76]`}>
                    {f.catalogo ? "Catálogo (próximamente)" : f.con_var ? "Con variaciones (próximamente)" : o && o.e !== "active" ? "Pausada en el origen" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
      <p className="text-[11px] text-[#5C6B76] mt-2">{n(total)} productos con estos filtros. Hasta 40 publicaciones por vez.</p>
    </Pantalla>
  );
}
