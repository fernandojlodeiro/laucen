// Ficha de un producto, en pestañas (?seccion=): datos, costo, variaciones,
// atributos, fotos, cucardas, kit, precios, stock y publicaciones. Cada
// sección está en secciones.tsx; las acciones, en ../acciones.ts.
//
// AGENTS.md: la ficha abre en modo vista. Datos, Costo y Cucardas se editan
// con el lápiz de arriba a la derecha (?editar=ficha), y ahí mismo queda "Grabar"
// (manda el formulario "ficha" de la sección). En las grillas, el lápiz es de
// cada fila (?editar=<id>) y el alta va detrás de "Nuevo …" arriba a la derecha.

import SeccionSeguimiento from "./Seguimiento";
import { notFound } from "next/navigation";
import { una, consulta } from "@/lib/erp/base";
import FotosProducto from "@/app/componentes/FotosProducto";
import Pestanas from "@/app/componentes/Pestanas";
import { BotonNuevo } from "@/app/componentes/AltaNueva";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, BotonesFicha, editandoFicha, EDITAR_FICHA, url, Estado } from "@/app/componentes/erp";
import { accionBorrarProducto, accionCambiarEstadoProducto, accionDuplicarProducto } from "../acciones";
import { SUAVE } from "@/app/botones";
import { EstadoProducto, TIPOS_PRODUCTO } from "../comun";
import {
  type Producto, SeccionDatos, SeccionCosto, SeccionVariaciones, SeccionAtributos, SeccionFotos, SeccionCucardas, SeccionKit,
  SeccionPrecios, SeccionStock, SeccionPublicaciones,
} from "./secciones";

export const dynamic = "force-dynamic";

type SP = { seccion?: string; editar?: string; ok?: string; error?: string; orden?: string; dir?: string; pcanal?: string };

export default async function FichaProducto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("productos_ver");
  const { id } = await params;
  const sp = await searchParams;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) notFound();

  const p = await una<Producto>(`
    select p.id::int, p.sku_base, p.titulo, p.descripcion, p.familia_id::int, f.nombre familia, p.marca, p.marca_id::int, p.tipo, p.estado, p.codigo_barras,
           p.modelo, p.linea, p.garantia, p.condicion, p.categoria_ml, p.atributos_ml, p.kit_vs, p.precio_en_dolares, p.no_publicable,
           p.peso_g, p.largo_cm::float8, p.ancho_cm::float8, p.alto_cm::float8, p.descuento_pct::float8, p.umbral_pausa, p.stock_minimo,
           (with recursive cadena as (
              select fa.id, fa.padre_id, fa.descuento_pct, 0 nivel from familia fa where fa.id = p.familia_id
              union all
              select fa.id, fa.padre_id, fa.descuento_pct, c.nivel + 1 from familia fa join cadena c on fa.id = c.padre_id where c.nivel < 20
            ) select descuento_pct from cadena where descuento_pct is not null order by nivel limit 1)::float8 descuento_familia,
           (config_de(p.organizacion_id, 'umbral_pausa', '0'))::text umbral_org,
           (select id::int from variacion v where v.producto_id = p.id and v.es_default) variacion_default
      from producto p left join familia f on f.id = p.familia_id
     where p.id = $2 and p.organizacion_id = $1`, [s.org.id, pid]);
  if (!p) notFound();

  // Lo que cuenta cada pestaña, entre paréntesis.
  const n = (await una<Record<string, number>>(`
    -- Variaciones: la única default sin atributos no cuenta (el producto se maneja como uno solo).
    select (select case when count(*) <= 1 and not exists (select 1 from variacion_atributo a join variacion v2 on v2.id = a.variacion_id
                                                            where v2.producto_id = $2 and v2.organizacion_id = $1)
                        then 0 else count(*) end
              from variacion v where v.producto_id = $2 and v.organizacion_id = $1)::int variaciones,
           (select count(*) from producto_atributo a where a.producto_id = $2 and a.organizacion_id = $1)::int atributos,
           ((select count(*) from producto_foto f where f.producto_id = $2 and f.organizacion_id = $1)
            + (select count(*) from variacion_foto f join variacion v on v.id = f.variacion_id where v.producto_id = $2 and f.organizacion_id = $1))::int fotos,
           (select count(*) from producto_cucarda pc where pc.producto_id = $2 and pc.organizacion_id = $1)::int cucardas,
           (select count(*) from kit_componente k join variacion v on v.id = k.variacion_kit_id where v.producto_id = $2 and k.organizacion_id = $1)::int kit,
           (select count(distinct (pr.lista_id, pr.variacion_id)) from precio pr join variacion v on v.id = pr.variacion_id
              join lista_precios l on l.id = pr.lista_id and l.estado = 'activa'
             where v.producto_id = $2 and pr.organizacion_id = $1)::int precios,
           (select coalesce(sum(stock_disponible_deposito(v.organizacion_id, v.id, d.id)), 0) from variacion v cross join deposito d
             where v.producto_id = $2 and v.organizacion_id = $1 and d.organizacion_id = $1 and d.estado = 'activo')::int stock,
           (select count(*) from publicacion pu join variacion v on v.id = pu.variacion_id where v.producto_id = $2 and pu.organizacion_id = $1)::int publicaciones,
           (select count(*) from cucarda c where c.organizacion_id = $1 and c.estado = 'activa')::int cucardas_activas,
           (select count(*) from seguimiento_pub sg where sg.producto_id = $2 and sg.organizacion_id = $1)::int seguimiento`,
    [s.org.id, pid])) ?? {};

  // Fotos del producto (las de sus variaciones si no tiene propias): la principal se ve en "Datos".
  const fotosUrls = (!sp.seccion || sp.seccion === "datos") ? (await consulta<{ url: string }>(`
    select url from (
      select url, 0 g, orden, id from producto_foto where producto_id = $2 and organizacion_id = $1
      union all
      select f.url, 1, f.orden, f.id from variacion_foto f join variacion v on v.id = f.variacion_id where v.producto_id = $2 and f.organizacion_id = $1
    ) x order by g, orden, id`, [s.org.id, pid])).map((f) => f.url) : [];

  const secciones: [string, string, number | null][] = [
    ["datos", "Datos", null],
    ["costo", "Costo", null],
    ["variaciones", "Variaciones", n.variaciones ?? 0],
    ["atributos", "Atributos", n.atributos ?? 0],
    ["fotos", "Fotos", n.fotos ?? 0],
    ["cucardas", "Cucardas", n.cucardas ?? 0],
    ...(p.tipo === "kit" ? [["kit", "Componentes del kit", n.kit ?? 0] as [string, string, number]] : []),
    ["precios", "Precios", n.precios ?? 0],
    ["stock", "Stock", n.stock ?? 0],
    ["publicaciones", "Publicaciones", n.publicaciones ?? 0],
    ["seguimiento", "Seguimiento", n.seguimiento ?? 0],
  ];
  const seccion = secciones.some(([k]) => k === sp.seccion) ? sp.seccion! : "datos";
  const base = `/catalogo/productos/${p.id}`;
  const aqui = (extra: Record<string, string | number> = {}) => url(base, { seccion: seccion === "datos" ? undefined : seccion, ...extra });
  // Secciones que son un formulario entero: se ven, y se editan con el lápiz.
  const conFicha = seccion === "datos" || seccion === "costo" || (seccion === "cucardas" && (n.cucardas_activas ?? 0) + (n.cucardas ?? 0) > 0);
  const editando = conFicha && editandoFicha(sp);
  const props = { s, p, sp, seccion, editando };

  return (
    <Pantalla
      titulo={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[#5C6B76]">{p.sku_base}</span> {p.titulo} <EstadoProducto estado={p.estado} />{p.no_publicable && <Estado texto="No publicable" tono="gris" />}</span>}
      subtitulo={<>{TIPOS_PRODUCTO[p.tipo]}{p.familia ? ` · ${p.familia}` : ""}{p.marca ? ` · ${p.marca}` : ""}</>}
      camino={[{ texto: p.sku_base }]}
      acciones={
        <span className="inline-flex flex-wrap items-center gap-2">
          {seccion === "variaciones" && p.tipo === "con_variaciones" && <BotonNuevo texto="Nueva variación" />}
          {seccion === "atributos" && <BotonNuevo texto="Nuevo atributo" />}
          {seccion === "kit" && <BotonNuevo texto="Nuevo componente" />}
          {conFicha && <BotonesFicha editando={editando} ver={aqui()} editar={aqui({ editar: EDITAR_FICHA })} />}
          {!editando && (
            <>
              {/* Duplicar: copia exacta, pausada y con SKU nuevo, abierta en edición. */}
              <form action={accionDuplicarProducto}>
                <input type="hidden" name="producto_id" value={p.id} /><input type="hidden" name="seccion" value={seccion} />
                <button className={SUAVE}>Duplicar</button>
              </form>
              {/* Inactivo = archivado: deja de aparecer en listados y buscadores. */}
              <form action={accionCambiarEstadoProducto}>
                <input type="hidden" name="producto_id" value={p.id} /><input type="hidden" name="seccion" value={seccion} />
                <input type="hidden" name="estado" value={p.estado === "archivado" ? "activo" : "archivado"} />
                <button className={SUAVE}>{p.estado === "archivado" ? "Volver a Activo" : "Pasar a Inactivo"}</button>
              </form>
              <TachoConfirmar accion={accionBorrarProducto} campos={{ producto_id: String(p.id), seccion }} pregunta="¿Borrar el producto entero?" />
            </>
          )}
        </span>
      }
    >
      <Avisos sp={sp} />
      <Pestanas items={secciones.map(([k, t, cuenta]) => ({ clave: k, texto: t, cuenta, activa: k === seccion, href: k === "datos" ? base : `${base}?seccion=${k}` }))} />
      {seccion === "datos" && fotosUrls.length > 0 && (
        <div className="flex flex-wrap items-start gap-2">
          {/* Todas del mismo tamaño (Fer, 6/10); tocando cualquiera se abren todas. */}
          {fotosUrls.slice(0, 6).map((u, i) => <FotosProducto key={u} fotos={fotosUrls} portada={i} titulo={p.titulo} tamano={88} />)}
          {fotosUrls.length > 6 && <span className="self-center text-xs text-[#5C6B76]">+{fotosUrls.length - 6} más</span>}
        </div>
      )}
      {seccion === "datos" && <SeccionDatos {...props} />}
      {seccion === "costo" && <SeccionCosto {...props} />}
      {seccion === "variaciones" && <SeccionVariaciones {...props} />}
      {seccion === "atributos" && <SeccionAtributos {...props} />}
      {seccion === "fotos" && <SeccionFotos {...props} />}
      {seccion === "cucardas" && <SeccionCucardas {...props} />}
      {seccion === "kit" && <SeccionKit {...props} />}
      {seccion === "precios" && <SeccionPrecios {...props} />}
      {seccion === "stock" && <SeccionStock {...props} />}
      {seccion === "publicaciones" && <SeccionPublicaciones {...props} />}
      {seccion === "seguimiento" && <SeccionSeguimiento s={s} p={p} />}
    </Pantalla>
  );
}
