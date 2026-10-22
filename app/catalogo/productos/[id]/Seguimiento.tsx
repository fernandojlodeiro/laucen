// La pestaña «Seguimiento» de la ficha del producto (pedido de Fer, 10/10;
// lib/seguimiento/): las publicaciones de la competencia que se siguen y, para
// elegir más, la búsqueda en Mercado Libre con «Seguir» al lado de cada una.

import { consulta, una } from "@/lib/erp/base";
import { SQL_A_LA_VENTA } from "@/lib/seguimiento/a-la-venta";
import { formatear, type Moneda } from "@/lib/moneda";
import { ultimaBusqueda, catalogosPegados, configSeguimiento, enlaceDe, esPack, parecido, type PubEncontrada } from "@/lib/seguimiento";
import Link from "next/link";
import { CasillaViva, FiltroVivo } from "@/app/componentes/BuscadorVivo";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { TachoConfirmar } from "@/app/radar/Cliente";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { SUAVE, PRIMARIO } from "@/app/botones";
import { CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, Estado, TituloSeccion } from "@/app/componentes/erp";
import BuscarSeguimiento from "./BuscarSeguimiento";
import { reglaDe } from "@/lib/seguimiento/regla";
import ReglaPrecio from "./ReglaPrecio";
import CasillaAccion from "@/app/componentes/CasillaAccion";
import { accionSeguir, accionSeguirPorNumero, accionDejarDeSeguir, accionLeerSeguimiento, accionCerrarCatalogo, accionExcluirDeRegla, accionConfirmarSeguida, accionConfirmarTodas } from "@/app/catalogo/productos/acciones-seguimiento";
import type { PubJuzgada } from "@/lib/seguimiento/comparables";

type Seguida = {
  id: number; item_id: string; catalogo_id: string | null; titulo: string | null; foto: string | null; permalink: string | null;
  vendedor: string | null; tienda_oficial: boolean | null; precio: number | null; precio_original: number | null; moneda: string | null;
  estado: string | null; tipo_publicacion: string | null; cuotas: string | null; envio_gratis: boolean | null;
  leido_ts: Date | null; error: string | null; cambio: number | null; entrega_dias: number | null; lecturas: number;
  internacional: boolean | null; excluido: boolean;
  /** La agregó sola la búsqueda de precio de mercado (origen «auto») y si una persona ya la revisó. */
  origen: string; origen_detalle: string | null; confirmada: boolean; confirmada_ts: Date | null; confirmada_por: string | null; motivo_ia: string | null; creado_ts: Date;
  /** La primera lectura (el comienzo del seguimiento) y cuántos cambios de precio o estado hubo. */
  desde: string | null; cambios: number;
  /** El último cambio de precio (entre dos lecturas seguidas), y si fue en la última lectura. */
  ultimo: { ts: string; antes: number; despues: number; enLaUltima: boolean } | null;
};

type Lectura = { id: number; ts: Date; fuente: string; precio: number | null; precio_original: number | null; estado: string | null; tipo_publicacion: string | null };

/** Cómo se ordena la búsqueda (Fer, 11/10): como la muestra Mercado Libre, por precio o por parecido al título nuestro. */
const ORDENES_BUSQUEDA = { ml: "Como en Mercado Libre", precio: "Precio, de menor a mayor", parecido: "Parecido al título del producto" } as const;
type OrdenBusqueda = keyof typeof ORDENES_BUSQUEDA;
const esOrdenBusqueda = (x: unknown): x is OrdenBusqueda => typeof x === "string" && Object.hasOwn(ORDENES_BUSQUEDA, x);

const TIPOS: Record<string, string> = { gold_special: "Clásica", gold_pro: "Premium", gold_premium: "Premium", free: "Gratuita", gold: "Oro", silver: "Plata", bronze: "Bronce" };
const ESTADOS: Record<string, { t: string; tono: "verde" | "amarillo" | "gris" | "rojo" }> = {
  activa: { t: "Activa", tono: "verde" }, pausada: { t: "Pausada", tono: "amarillo" }, cerrada: { t: "Terminada", tono: "gris" },
  no_figura: { t: "No figura en el catálogo", tono: "amarillo" }, sin_dato: { t: "Sin leer todavía", tono: "gris" },
};

const enlaceMl = (p: { permalink: string | null; item_id?: string; itemId?: string }) => p.permalink ?? enlaceDe(p.item_id ?? p.itemId ?? "");

function Precio({ precio, original, moneda }: { precio: number | null; original: number | null; moneda: string | null }) {
  if (precio == null) return <span className="text-[#5C6B76]">—</span>;
  const m = (moneda === "USD" ? "USD" : "ARS") as Moneda;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      {original != null && original > precio && <span className="text-[10px] text-[#5C6B76] line-through">{formatear(original, m)}</span>}
      <b>{formatear(precio, m)}</b>
    </span>
  );
}

function hace(d: Date | null) {
  if (!d) return "nunca";
  const dias = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  return dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`;
}

/** «Llega en N días», en rojo si tarda más de lo que compite. */
function Entrega({ dias, demora, gratis }: { dias: number | null | undefined; demora: number; gratis: boolean | null | undefined }) {
  return (
    <span className="whitespace-nowrap">
      {dias == null ? <span className="text-[#5C6B76]">—</span>
        : <span className={dias > demora ? "text-[#C03420] font-semibold" : ""}>{dias === 0 ? "Hoy" : dias === 1 ? "1 día" : `${dias} días`}</span>}
      {gratis != null && <span className="block text-[10px] text-[#5C6B76]">{gratis ? "Envío gratis" : "Envío a cargo"}</span>}
    </span>
  );
}

export default async function SeccionSeguimiento({ s, p, sp }: { s: { org: { id: string } }; p: { id: number; titulo: string }; sp: { packs?: string; propias?: string; demoradas?: string; internacionales?: string; borden?: string; hist?: string; editar?: string; pausadas?: string } }) {
  const hist = Number(sp.hist) || null;
  const [seguidas, busqueda, conf, lecturas, catalogos, regla, venta] = await Promise.all([
    consulta<Seguida>(`
      select sp.id::int, sp.item_id, sp.catalogo_id, sp.titulo, sp.foto, sp.permalink, sp.vendedor, sp.tienda_oficial, sp.precio::float8, sp.precio_original::float8,
             sp.moneda, sp.estado, sp.tipo_publicacion, sp.cuotas, sp.envio_gratis, sp.leido_ts, sp.error, sp.entrega_dias, sp.internacional, sp.excluido,
             sp.origen, sp.origen_detalle, sp.confirmada, sp.confirmada_ts, sp.confirmada_por, sp.motivo_ia, sp.creado_ts,
             -- Cuánto cambió el precio desde la lectura anterior.
             (select (sp.precio - l.precio)::float8 from seguimiento_lectura l where l.seguimiento_id = sp.id and l.precio is not null
               order by l.ts desc offset 1 limit 1) cambio,
             (select count(*)::int from seguimiento_lectura l where l.seguimiento_id = sp.id) lecturas,
             (select min(l.ts)::text from seguimiento_lectura l where l.seguimiento_id = sp.id) desde,
             -- Cambios: lecturas con otro precio, estado o tipo que la anterior (Fer, 13/10: el historial muestra sólo eso).
             (select count(*)::int from (select l.precio, l.estado, l.tipo_publicacion,
                     lag(l.precio) over w pa, lag(l.estado) over w ea, lag(l.tipo_publicacion) over w ta, row_number() over w n
                from seguimiento_lectura l where l.seguimiento_id = sp.id window w as (order by l.ts, l.id)) c
               where c.n > 1 and (c.precio is distinct from c.pa and c.precio is not null and c.pa is not null
                                  or c.estado is distinct from c.ea or c.tipo_publicacion is distinct from c.ta and c.tipo_publicacion is not null)) cambios,
             (select json_build_object('ts', c.ts, 'antes', c.antes, 'despues', c.despues, 'enLaUltima', c.ts = c.ultima)
                from (select l.ts, l.precio::float8 despues, (lag(l.precio) over (order by l.ts, l.id))::float8 antes, max(l.ts) over () ultima
                        from seguimiento_lectura l where l.seguimiento_id = sp.id and l.precio is not null) c
               where c.antes is not null and c.antes <> c.despues order by c.ts desc limit 1) ultimo
        from seguimiento_pub sp where sp.organizacion_id = $1 and sp.producto_id = $2
       order by sp.precio nulls last, sp.id`, [s.org.id, p.id]),
    ultimaBusqueda(s.org.id, p.id).catch(() => null),
    configSeguimiento(s.org.id),
    // El historial de una de las seguidas: cada lectura, de la más nueva a la más vieja.
    hist ? consulta<Lectura>(`
      select l.id::int, l.ts, l.fuente, l.precio::float8, l.precio_original::float8, l.estado, l.tipo_publicacion
        from seguimiento_lectura l join seguimiento_pub sp on sp.id = l.seguimiento_id
       where l.organizacion_id = $1 and sp.producto_id = $2 and l.seguimiento_id = $3
       order by l.ts desc limit 2000`, [s.org.id, p.id, hist]) : Promise.resolve([] as Lectura[]),
    catalogosPegados(s.org.id, p.id).catch(() => []),
    reglaDe(s.org.id, p.id).catch(() => null),
    // Si no está a la venta, las comunes no se releen solas (Fer, 22/10).
    una<{ ok: boolean }>(`select ${SQL_A_LA_VENTA} ok from producto p where p.id = $1 and p.organizacion_id = $2`, [p.id, s.org.id]).catch(() => null),
  ]);
  // La referencia de la regla de precio (si está prendida): la elegida o la más barata de las activas con precio. Si la
  // elegida deja de estar activa, la que sigue (Fer, 14/10), igual que en lib/seguimiento/regla.ts.
  const sirven = seguidas.filter((x) => x.estado === "activa" && x.precio != null && (x.moneda ?? "ARS") === "ARS" && !x.excluido && !x.internacional && x.confirmada)
    .sort((a, b) => a.precio! - b.precio!);
  const referenciaId = !regla || regla.modo === "apagada" ? null
    : (regla.contra === "una" && sirven.find((x) => x.id === regla.seguimientoId)?.id) || (sirven[0]?.id ?? null);
  // Las pausadas, terminadas o que no figuran van aparte, a un clic (Fer, 14/10): no cuentan para la regla.
  const fueraDeVenta = (x: Seguida) => x.estado === "pausada" || x.estado === "cerrada" || x.estado === "no_figura";
  const activas = seguidas.filter((x) => !fueraDeVenta(x)), pausadas = seguidas.filter(fueraDeVenta);
  const verPausadas = sp.pausadas === "1" || pausadas.some((x) => x.id === hist);
  const seguidosIds = new Set(seguidas.map((x) => x.item_id));
  // Los resultados: sin packs (si el nuestro no lo es) ni los nuestros, salvo que se pidan; los más parecidos al nuestro primero.
  const nuestroEsPack = esPack(p.titulo);
  const todos = (busqueda?.resultados ?? []).filter((r) => !r.esCatalogo)
    .map((r) => ({ ...r, pack: !nuestroEsPack && esPack(r.titulo), parecido: parecido(p.titulo, r.titulo) }));
  const demora = (r: PubEncontrada) => r.entregaDias != null && r.entregaDias > conf.demoraDias;
  const packs = todos.filter((r) => r.pack).length, propias = todos.filter((r) => r.propia).length, demoradas = todos.filter(demora).length;
  const internacionales = todos.filter((r) => r.internacional).length;
  const verPacks = sp.packs === "1", verPropias = sp.propias === "1", verDemoradas = sp.demoradas === "1", verInternacionales = sp.internacionales === "1";
  // «Como en Mercado Libre»: el orden en que vino la búsqueda (los vendedores de un catálogo, en su lugar).
  const borden: OrdenBusqueda = esOrdenBusqueda(sp.borden) ? sp.borden : "ml";
  const resultados = todos.map((r, posicion) => ({ ...r, posicion }))
    .filter((r) => (verPacks || !r.pack) && (verPropias || !r.propia) && (verDemoradas || !demora(r)) && (verInternacionales || !r.internacional))
    .sort((a, b) => borden === "precio" ? (a.precio ?? Infinity) - (b.precio ?? Infinity) || a.posicion - b.posicion
      : borden === "parecido" ? b.parecido - a.parecido || a.posicion - b.posicion
      : a.posicion - b.posicion);
  // El enlace al historial de una seguida (o cerrarlo), sin perder lo demás de la dirección.
  const conHist = (id: number | null) => {
    const q = new URLSearchParams({ seccion: "seguimiento" });
    for (const k of ["packs", "propias", "demoradas", "internacionales", "borden", "pausadas"] as const) if (sp[k]) q.set(k, sp[k]!);
    if (id) q.set("hist", String(id));
    return `/catalogo/productos/${p.id}?${q}`;
  };
  const campos = { producto_id: String(p.id) };
  const conPausadas = (ver: boolean) => {
    const q = new URLSearchParams({ seccion: "seguimiento" });
    for (const k of ["packs", "propias", "demoradas", "internacionales", "borden"] as const) if (sp[k]) q.set(k, sp[k]!);
    if (ver) q.set("pausadas", "1");
    return `/catalogo/productos/${p.id}?${q}`;
  };
  const sinConfirmar = seguidas.filter((x) => !x.confirmada).length;
  // Un renglón de una seguida (y su historial abierto, si se pidió).
  const fila = (x: Seguida) => [
                // Lo que cambió en la última lectura, en amarillo; si es la referencia de la regla, en rosa (Fer, 12/10).
                <tr key={x.id} className={`${TR} ${x.ultimo?.enLaUltima ? (x.id === referenciaId ? "bg-[#FCE4EC]" : "bg-[#FFF8E5]") : ""}`}>
                  <td className={TD}>
                    <span className="flex items-start gap-2">
                      <span className="h-10 w-10 shrink-0">{x.foto && <img src={x.foto} alt="" className="h-10 w-10 object-contain rounded bg-white" />}</span>
                      <span>
                        <a href={enlaceMl(x)} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline">{x.titulo ?? x.item_id} ↗</a>
                        <span className="block text-[10px] text-[#5C6B76] font-mono">{x.item_id}{x.catalogo_id && <> · 📖 Catálogo {x.catalogo_id}</>}</span>
                        {x.id === referenciaId && <span className="inline-block mt-0.5 rounded px-1 text-[10px] font-semibold bg-[#AD1457] text-white" title="La regla de precio compara contra ésta">🎯 Referencia de la regla</span>}
                        {!x.confirmada && <span className="inline-block mt-0.5 mr-1 rounded px-1 text-[10px] font-semibold bg-[#FFF1CC] text-[#7A5600]"
                          title={`La siguió sola la búsqueda de precio de mercado${x.motivo_ia ? `. IA: ${x.motivo_ia}` : ""}. Falta que una persona la revise.`}>🤖 Automática · sin revisar</span>}
                        {x.confirmada && x.origen === "auto" && <span className="inline-block mt-0.5 mr-1 rounded px-1 text-[10px] bg-[#E6F4EA] text-[#1F6E4A]"
                          title={`La siguió sola la búsqueda de precio de mercado${x.motivo_ia ? ` (IA: ${x.motivo_ia})` : ""}; la revisó ${x.confirmada_por ?? "una persona"}${x.confirmada_ts ? ` el ${new Date(x.confirmada_ts).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}` : ""}.`}>🤖 Automática · revisada</span>}
                        {x.internacional && <span className="inline-block mt-0.5 mr-1 rounded px-1 text-[10px] font-semibold bg-[#E3E9F0] text-[#16577F]" title="Vendedor de afuera o entrega internacional: no cuenta para la regla (le faltan los impuestos)">🌐 Internacional</span>}
                      </span>
                    </span>
                  </td>
                  <td className={TD}>{x.vendedor ?? "—"}{x.tienda_oficial && <span className="block text-[10px] text-[#1F6E4A]">Tienda oficial</span>}</td>
                  <td className={TDN}>
                    <Precio precio={x.precio} original={x.precio_original} moneda={x.moneda} />
                    <UltimoCambio u={x.ultimo} desde={x.desde} />
                  </td>
                  <td className={TD}>{x.tipo_publicacion ? TIPOS[x.tipo_publicacion] ?? x.tipo_publicacion : "—"}{x.cuotas && <span className="block text-[10px] text-[#5C6B76]">{x.cuotas}</span>}</td>
                  <td className={TD}><Entrega dias={x.entrega_dias} demora={conf.demoraDias} gratis={x.envio_gratis} /></td>
                  <td className={TD}><Estado texto={ESTADOS[x.estado ?? "sin_dato"]?.t ?? x.estado ?? "—"} tono={ESTADOS[x.estado ?? "sin_dato"]?.tono ?? "gris"} /></td>
                  <td className={`${TD} whitespace-nowrap`}>{hace(x.leido_ts)}{x.error && <span className="block text-[10px] text-[#C03420] max-w-48 whitespace-normal">{x.error}</span>}</td>
                  <td className={TD}>
                    <CasillaAccion accion={accionConfirmarSeguida} campos={{ id: String(x.id), producto_id: String(p.id) }} activa={x.confirmada}
                      etiqueta="Revisada" ayuda={x.confirmada ? deDondeRevisada(x) : "Tildala cuando confirmes que es el mismo producto: recién ahí cuenta para la regla de precio"} />
                    {x.confirmada && <span className="block text-[10px] text-[#5C6B76] whitespace-nowrap">{deDondeCorto(x)}</span>}
                  </td>
                  <td className={TD}>
                    <CasillaAccion accion={accionExcluirDeRegla} campos={{ id: String(x.id), producto_id: String(p.id) }} activa={x.excluido}
                      etiqueta="Excluir" ayuda="Tildada: la seguís y ves su precio, pero la regla de precio no la tiene en cuenta" />
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <Link href={conHist(hist === x.id ? null : x.id)} scroll={false} className={SUAVE}
                      title="Los cambios de precio, estado o tipo de esta publicación desde que se sigue">📈 Historial ({x.cambios})</Link>
                  </td>
                  {/* Dejar de seguir: a la derecha, como todo editar y borrar (Fer, 12/10). */}
                  <td className={`${TD} w-8 text-right`}>
                    <TachoConfirmar accion={accionDejarDeSeguir} campos={{ id: String(x.id), producto_id: String(p.id) }} pregunta="¿Dejar de seguirla?" />
                  </td>
                </tr>,
                hist === x.id && (
                  <tr key={`h${x.id}`}>
                    <td colSpan={11} className="bg-[#F7F9FB] px-3 py-2"><Historial lecturas={lecturas} moneda={x.moneda} /></td>
                  </tr>
                ),
];

  return (
    <div className="grid gap-4">
      <section className={CAJA}>
        <TituloSeccion titulo={`Publicaciones que seguís (${activas.length})`}>
          <BotonNuevo texto="Agregar por número" />
          {sinConfirmar > 0 && (
            <form action={accionConfirmarTodas}>
              <input type="hidden" name="producto_id" value={p.id} />
              <button className={SUAVE} title="Las que siguió sola la búsqueda de precio de mercado: quedan revisadas por vos y cuentan para la regla de precio">✓ Confirmar todas ({sinConfirmar})</button>
            </form>
          )}
          {seguidas.length > 0 && (
            <BotonTarea accion={accionLeerSeguimiento} tipo={`seguimiento-leer-${p.id}`} clase={SUAVE} texto="Leer ahora" campos={campos}
              pregunta="¿Leerlas ahora? Las comunes cuestan (las de catálogo, no)" />
          )}
        </TituloSeccion>
        <AltaNueva texto="Agregar por número" sinBoton>
          <form action={accionSeguirPorNumero} className="grid gap-2">
            <input type="hidden" name="producto_id" value={p.id} />
            <textarea name="numeros" rows={3} placeholder={"https://articulo.mercadolibre.com.ar/MLA-1234567890-…\nMLA1234567890\nhttps://www.mercadolibre.com.ar/…/p/MLA12345678 (un catálogo: muestra sus vendedores)"} className={`${CAMPO} w-full`} autoFocus />
            <span className="flex items-center gap-2">
              <button className={PRIMARIO}>Agregar</button>
              <span className="text-[11px] text-[#5C6B76]">Links o números de publicación (MLA…), uno por renglón: se leen enseguida. El link de un catálogo (…/p/MLA…) muestra a todos sus vendedores para elegir.</span>
            </span>
          </form>
        </AltaNueva>
        <p className="text-[11px] text-[#5C6B76] mb-2">
          Se vuelven a leer cada {conf.frecuenciaDias} día{conf.frecuenciaDias === 1 ? "" : "s"}, a la madrugada (Configuración › Seguimiento de publicaciones).
          Las de catálogo se leen gratis; las comunes, con un costo chico.
          {venta && !venta.ok && <> <b className="text-[#7A5600]">Este producto no está a la venta</b> (sin publicación activa en Mercado Libre o sin stock disponible): las comunes no se releen solas; quedan de referencia y «Leer ahora» las lee a pedido.</>}
          Las marcadas 🤖 las siguió sola la búsqueda de precio de mercado: no cuentan para la regla de precio hasta que tildás «Revisada».
        </p>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr><th className={TH}>Publicación</th><th className={TH}>Vendedor</th><th className={THN}>Precio</th><th className={TH}>Tipo</th>
                <th className={TH}>Entrega</th><th className={TH}>Estado</th><th className={TH}>Leída</th><th className={TH} title="Tildada: una persona la revisó (las agregadas a mano ya nacen revisadas)">Revisada</th><th className={TH} title="Tildada: se sigue, pero no cuenta para la regla de precio">Fuera de la regla</th><th /><th /></tr>
            </thead>
            <tbody>
              {activas.length === 0 && <tr><td colSpan={11} className={`${TD} text-[#5C6B76]`}>{pausadas.length ? "Ninguna activa: las que seguís están pausadas o terminadas (abajo)." : "Todavía no seguís ninguna: buscalas abajo y tocá «Seguir», o agregalas por número."}</td></tr>}
              {activas.flatMap(fila)}
            </tbody>
          </table>
        </div>
        {pausadas.length > 0 && (
          <div className="mt-3">
            <Link href={conPausadas(!verPausadas)} scroll={false} className={SUAVE}
              title="Las que el vendedor pausó, terminó o ya no figuran en el catálogo: se siguen leyendo, pero la regla de precio no las usa">
              {verPausadas ? "▾" : "▸"} Pausadas o terminadas ({pausadas.length})
            </Link>
            {verPausadas && (
              <div className={`${CAJA_TABLA} mt-2`}>
                <table className={TABLA}>
                  <thead className={THEAD}>
                    <tr><th className={TH}>Publicación</th><th className={TH}>Vendedor</th><th className={THN}>Precio</th><th className={TH}>Tipo</th>
                    <th className={TH}>Entrega</th><th className={TH}>Estado</th><th className={TH}>Leída</th><th className={TH} title="Tildada: una persona la revisó (las agregadas a mano ya nacen revisadas)">Revisada</th><th className={TH} title="Tildada: se sigue, pero no cuenta para la regla de precio">Fuera de la regla</th><th /><th /></tr>
                  </thead>
                  <tbody>
                    {pausadas.flatMap(fila)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {catalogos.map((c) => (
        <section key={c.catalogoId} className={CAJA}>
          <TituloSeccion titulo={<>Vendedores del catálogo «{c.titulo ?? c.catalogoId}» ({c.resultados.length})</>}>
            <TachoConfirmar accion={accionCerrarCatalogo} campos={{ producto_id: String(p.id), catalogo: c.catalogoId }} pregunta="¿Sacar esta lista?" />
          </TituloSeccion>
          <p className="text-[11px] text-[#5C6B76] mb-2">
            Del link de catálogo pegado en «Agregar por número» ({c.catalogoId}), leído gratis el {new Date(c.ts).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}.
            Tocá «+ Seguir» en los que quieras; el tacho saca la lista (lo que ya seguís queda).
          </p>
          {c.resultados.length
            ? <TablaEncontradas filas={[...c.resultados].sort((a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity))} productoId={p.id} seguidos={seguidosIds} demora={conf.demoraDias} />
            : <p className="text-xs text-[#5C6B76]">Mercado Libre no devolvió vendedores para ese catálogo.</p>}
        </section>
      ))}

      <ReglaPrecio org={s.org.id} productoId={p.id} seguidas={seguidas} editando={sp.editar === "regla"}
        ver={conHist(hist)} editar={`${conHist(hist)}&editar=regla`} />

      <section className={CAJA}>
        <TituloSeccion titulo={`Buscar en Mercado Libre para seguir${busqueda ? ` (${resultados.length})` : ""}`} />
        <BuscarSeguimiento productoId={p.id} inicial={busqueda?.texto ?? p.titulo} />
        {busqueda && (
          <p className="text-[11px] text-[#5C6B76] mt-2">Última búsqueda: «{busqueda.texto}», {new Date(busqueda.ts).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}. Volver a buscar cuesta de nuevo.</p>
        )}
        {busqueda && todos.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs">
            <CasillaViva parametro="packs" activo={verPacks} etiqueta={`Mostrar también packs y varias unidades (${packs})`} />
            <CasillaViva parametro="propias" activo={verPropias} etiqueta={`Mostrar también las nuestras (${propias})`} />
            <CasillaViva parametro="demoradas" activo={verDemoradas} etiqueta={`Mostrar también las que tardan más de ${conf.demoraDias} días (${demoradas})`} />
            <CasillaViva parametro="internacionales" activo={verInternacionales} etiqueta={`Mostrar también las internacionales (${internacionales})`}
              ayuda="Vendedores de afuera o con entrega internacional: su precio no se compara porque le faltan los impuestos." />
            <label className="flex items-center gap-1">Ordenar:
              <FiltroVivo parametro="borden" valor={borden} etiqueta="Ordenar la búsqueda">
                {Object.entries(ORDENES_BUSQUEDA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </FiltroVivo>
            </label>
            <span className="text-[11px] text-[#5C6B76]">«Como en Mercado Libre» es el orden del buscador (más relevantes). Las de catálogo muestran a cada vendedor que compite, en el lugar del catálogo.</span>
          </div>
        )}
        {busqueda && resultados.length > 0 && (
          <TablaEncontradas filas={resultados} productoId={p.id} seguidos={seguidosIds} demora={conf.demoraDias} />
        )}
      </section>
    </div>
  );
}

/** Las lecturas donde algo cambió (precio, estado o tipo), de la más nueva a la más vieja; la primera es el comienzo
 *  del seguimiento. Pura. */
export function soloCambios(lecturas: Lectura[]): (Lectura & { antes: number | null; comienzo: boolean })[] {
  const crono = [...lecturas].reverse();
  const out: (Lectura & { antes: number | null; comienzo: boolean })[] = [];
  let prev: Lectura | null = null, precioAntes: number | null = null;
  for (const l of crono) {
    const cambia = !prev || (l.precio != null && precioAntes != null && l.precio !== precioAntes) || l.estado !== prev.estado
      || (l.tipo_publicacion != null && l.tipo_publicacion !== prev.tipo_publicacion);
    if (cambia) out.push({ ...l, antes: prev ? precioAntes : null, comienzo: !prev });
    prev = l;
    if (l.precio != null) precioAntes = l.precio;
  }
  return out.reverse();
}

/** Cómo fue cambiando una publicación seguida: sólo las veces que cambió algo (Fer, 13/10), no cada lectura. */
function Historial({ lecturas, moneda }: { lecturas: Lectura[]; moneda: string | null }) {
  if (!lecturas.length) return <p className="text-xs text-[#5C6B76]">Todavía no se leyó ninguna vez.</p>;
  const m = (moneda === "USD" ? "USD" : "ARS") as Moneda;
  const cambios = soloCambios(lecturas);
  const ultima = lecturas[0];
  return (
    <div>
      <table className="text-xs">
        <thead><tr className="text-[#5C6B76]"><th className="text-left pr-4 font-semibold">Desde</th><th className="text-right pr-4 font-semibold">Precio</th>
          <th className="text-right pr-4 font-semibold">Cambio</th><th className="text-left pr-4 font-semibold">Tipo</th><th className="text-left font-semibold">Estado</th></tr></thead>
        <tbody>
          {cambios.map((l) => {
            const cambio = l.precio != null && l.antes != null ? l.precio - l.antes : null;
            return (
              <tr key={l.id}>
                <td className="pr-4 py-0.5 whitespace-nowrap">{new Date(l.ts).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}</td>
                <td className="pr-4 py-0.5 text-right"><Precio precio={l.precio} original={l.precio_original} moneda={m} /></td>
                <td className={`pr-4 py-0.5 text-right ${cambio != null && cambio < 0 ? "text-[#C03420]" : "text-[#1F6E4A]"}`}>
                  {l.comienzo ? <span className="text-[#5C6B76]">Comienzo del seguimiento</span>
                    : cambio ? `${cambio < 0 ? "▼" : "▲"} ${formatear(Math.abs(cambio), m)} (${((cambio / l.antes!) * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %)` : <span className="text-[#5C6B76]">—</span>}
                </td>
                <td className="pr-4 py-0.5">{l.tipo_publicacion ? TIPOS[l.tipo_publicacion] ?? l.tipo_publicacion : "—"}</td>
                <td className="py-0.5">{ESTADOS[l.estado ?? "sin_dato"]?.t ?? l.estado ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-[#5C6B76] mt-1">
        Sólo las veces que cambió el precio, el estado o el tipo. Última lectura: {new Date(ultima.ts).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}.
      </p>
    </div>
  );
}

/** Una lista de publicaciones encontradas (búsqueda o catálogo pegado), con «+ Seguir» al lado de cada una. */
function TablaEncontradas({ filas, productoId, seguidos, demora }: { filas: (PubJuzgada & { pack?: boolean })[]; productoId: number; seguidos: Set<string>; demora: number }) {
  return (
    <div className={`${CAJA_TABLA} mt-2`}>
      <table className={TABLA}>
        <thead className={THEAD}>
          <tr><th className={TH}>Publicación</th><th className={TH}>Vendedor</th><th className={THN}>Precio</th><th className={TH}>Tipo y cuotas</th><th className={TH}>Entrega</th>
            <th className={TH} title="Si la IA la juzga el mismo producto que el nuestro (y por qué)">IA</th><th /></tr>
        </thead>
        <tbody>
          {filas.map((r) => (
            <tr key={r.itemId} className={`${TR} ${r.propia ? "bg-[#F7F9FB]" : ""}`}>
              <td className={TD}>
                <span className="flex items-start gap-2">
                  <span className="h-10 w-10 shrink-0">{r.foto && <img src={r.foto} alt="" className="h-10 w-10 object-contain rounded bg-white" />}</span>
                  <span>
                    <a href={enlaceMl({ permalink: r.permalink, itemId: r.itemId })} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline">{r.titulo} ↗</a>
                    <span className="block text-[10px] text-[#5C6B76] font-mono">
                      {r.itemId}{r.catalogoId && " · 📖 Catálogo (el título es el del catálogo, no el del vendedor)"}{r.publicidad && " · Publicidad"}{r.pack && " · Pack"}{r.internacional && " · 🌐 Internacional"}
                    </span>
                  </span>
                </span>
              </td>
              <td className={TD}>{r.vendedor ?? "—"}{r.tiendaOficial && <span className="block text-[10px] text-[#1F6E4A]">Tienda oficial</span>}</td>
              <td className={TDN}><Precio precio={r.precio} original={r.precioOriginal} moneda={r.moneda} /></td>
              <td className={`${TD} text-[11px]`}>{r.tipoPublicacion ? <b className="block">{TIPOS[r.tipoPublicacion] ?? r.tipoPublicacion}</b> : null}{r.cuotas ?? (r.tipoPublicacion ? null : "—")}</td>
              <td className={TD}><Entrega dias={r.entregaDias} demora={demora} gratis={r.envioGratis} /></td>
              <td className={`${TD} text-[11px] max-w-48`}>
                {r.comparable == null ? <span className="text-[#5C6B76]">—</span>
                  : r.comparable ? <span className="text-[#1F6E4A]"><b>✓ Comparable</b>{r.motivoIa && <span className="block text-[10px]">{r.motivoIa}</span>}</span>
                  : <span className="text-[#5C6B76]">✗ No{r.motivoIa && <span className="block text-[10px]">{r.motivoIa}</span>}</span>}
              </td>
              <td className={`${TD} text-right whitespace-nowrap`}>
                {r.propia ? <span className="text-[11px] text-[#5C6B76]">Nuestra</span>
                  : seguidos.has(r.itemId) ? <span className="text-[11px] text-[#1F6E4A] font-semibold">✓ Siguiendo</span>
                  : (
                    <form action={accionSeguir}>
                      <input type="hidden" name="producto_id" value={productoId} /><input type="hidden" name="item" value={r.itemId} />
                      <button className={SUAVE}>+ Seguir</button>
                    </form>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const diaMes = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" }) : "");

/** Por qué cuenta como revisada (Fer, 14/10): quién la revisó o, si la agregó una persona, de dónde vino. */
function deDondeRevisada(x: Seguida): string {
  if (x.confirmada_por) return `Revisada por ${x.confirmada_por} el ${diaMes(x.confirmada_ts)}`;
  if (x.origen === "importado" && x.origen_detalle?.startsWith("Virtual Seller")) return `Importada de Virtual Seller el ${diaMes(x.creado_ts)} (${x.origen_detalle.replace(/^Virtual Seller, /, "")}): la eligió una persona en Virtual Seller`;
  if (x.origen === "importado") return `Agregada desde una planilla el ${diaMes(x.creado_ts)}: el link lo eligió una persona en la planilla`;
  if (x.origen === "busqueda") return `Elegida con «+ Seguir» de la búsqueda el ${diaMes(x.creado_ts)}`;
  if (x.origen === "manual") return `Agregada por número el ${diaMes(x.creado_ts)}`;
  return "Revisada";
}
function deDondeCorto(x: Seguida): string {
  if (x.confirmada_por) return `por ${x.confirmada_por.split("@")[0]} · ${diaMes(x.confirmada_ts)}`;
  if (x.origen === "importado" && x.origen_detalle?.startsWith("Virtual Seller")) return `desde Virtual Seller · ${diaMes(x.creado_ts)}`;
  if (x.origen === "importado") return `desde planilla · ${diaMes(x.creado_ts)}`;
  if (x.origen === "busqueda") return `con «+ Seguir» · ${diaMes(x.creado_ts)}`;
  if (x.origen === "manual") return `por número · ${diaMes(x.creado_ts)}`;
  return "";
}

/** El último cambio de precio de una seguida: «▲ $ 5.408 (27,8 %) · 12/10 (antes $ 19.455)». */
function UltimoCambio({ u, desde }: { u: Seguida["ultimo"]; desde: string | null }) {
  // Sin cambios: el mismo precio desde el comienzo del seguimiento (Fer, 13/10).
  if (!u) return <span className="block text-[10px] text-[#5C6B76] whitespace-nowrap">{desde
    ? `igual desde el comienzo (${new Date(desde).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" })})`
    : "sin leer todavía"}</span>;
  const d = u.despues - u.antes;
  const pct = u.antes ? (d / u.antes) * 100 : null;
  return (
    <span className={`block text-[10px] whitespace-nowrap ${u.enLaUltima ? "font-semibold" : ""} ${d < 0 ? "text-[#C03420]" : "text-[#1F6E4A]"}`}
      title={`Antes ${formatear(u.antes, "ARS")}${u.enLaUltima ? " · cambió en la última lectura" : ""}`}>
      {d < 0 ? "▼" : "▲"} {formatear(Math.abs(d), "ARS")}{pct != null && ` (${Math.abs(pct).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %)`}
      <span className="text-[#5C6B76] font-normal"> · {new Date(u.ts).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" })}</span>
    </span>
  );
}
