// Ficha de un producto, en pestañas (?seccion=): datos, variaciones,
// atributos, fotos, cucardas, kit, precios, stock y publicaciones. Cada
// sección está en secciones.tsx; las acciones, en ../acciones.ts.

import Link from "next/link";
import { notFound } from "next/navigation";
import { una } from "@/lib/erp/base";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos } from "@/app/componentes/erp";
import { accionBorrarProducto, accionCambiarEstadoProducto } from "../acciones";
import { SUAVE } from "@/app/botones";
import { EstadoProducto, TIPOS_PRODUCTO } from "../comun";
import {
  type Producto, SeccionDatos, SeccionVariaciones, SeccionAtributos, SeccionFotos, SeccionCucardas, SeccionKit,
  SeccionPrecios, SeccionStock, SeccionPublicaciones,
} from "./secciones";

export const dynamic = "force-dynamic";

type SP = { seccion?: string; editar?: string; ok?: string; error?: string };

export default async function FichaProducto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("productos_ver");
  const { id } = await params;
  const sp = await searchParams;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) notFound();

  const p = await una<Producto>(`
    select p.id::int, p.sku_base, p.titulo, p.descripcion, p.familia_id::int, f.nombre familia, p.marca, p.tipo, p.estado, p.codigo_barras,
           p.modelo, p.linea, p.garantia, p.condicion, p.categoria_ml, p.atributos_ml, p.kit_vs,
           p.peso_g, p.largo_cm::float8, p.ancho_cm::float8, p.alto_cm::float8, p.descuento_pct::float8, p.umbral_pausa, p.stock_minimo,
           (with recursive cadena as (
              select fa.id, fa.padre_id, fa.descuento_pct, 0 nivel from familia fa where fa.id = p.familia_id
              union all
              select fa.id, fa.padre_id, fa.descuento_pct, c.nivel + 1 from familia fa join cadena c on fa.id = c.padre_id where c.nivel < 20
            ) select descuento_pct from cadena where descuento_pct is not null order by nivel limit 1)::float8 descuento_familia,
           (config_de(p.organizacion_id, 'umbral_pausa', '1'))::text umbral_org,
           (select id::int from variacion v where v.producto_id = p.id and v.es_default) variacion_default
      from producto p left join familia f on f.id = p.familia_id
     where p.id = $2 and p.organizacion_id = $1`, [s.org.id, pid]);
  if (!p) notFound();

  const secciones: [string, string][] = [
    ["datos", "Datos"],
    ["variaciones", p.tipo === "con_variaciones" ? "Variaciones" : "Variación"],
    ["atributos", "Atributos"],
    ["fotos", "Fotos"],
    ["cucardas", "Cucardas"],
    ...(p.tipo === "kit" ? [["kit", "Componentes del kit"] as [string, string]] : []),
    ["precios", "Precios"],
    ["stock", "Stock"],
    ["publicaciones", "Publicaciones"],
  ];
  const seccion = secciones.some(([k]) => k === sp.seccion) ? sp.seccion! : "datos";
  const base = `/catalogo/productos/${p.id}`;
  const props = { s, p, sp, seccion };

  return (
    <Pantalla
      titulo={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[#5C6B76]">{p.sku_base}</span> {p.titulo} <EstadoProducto estado={p.estado} /></span>}
      subtitulo={<>{TIPOS_PRODUCTO[p.tipo]}{p.familia ? ` · ${p.familia}` : ""}{p.marca ? ` · ${p.marca}` : ""} · <Link href="/catalogo/productos" className="text-[#16577F]">← Volver a productos</Link></>}
      acciones={
        <span className="inline-flex items-center gap-2">
          {/* Inactivo = archivado: deja de aparecer en listados y buscadores. */}
          <form action={accionCambiarEstadoProducto}>
            <input type="hidden" name="producto_id" value={p.id} /><input type="hidden" name="seccion" value={seccion} />
            <input type="hidden" name="estado" value={p.estado === "archivado" ? "activo" : "archivado"} />
            <button className={SUAVE}>{p.estado === "archivado" ? "Volver a Activo" : "Pasar a Inactivo"}</button>
          </form>
          <TachoConfirmar accion={accionBorrarProducto} campos={{ producto_id: String(p.id), seccion }} pregunta="¿Borrar el producto entero?" />
        </span>
      }
    >
      <Avisos sp={sp} />
      <nav className="flex gap-1 border-b border-[#E3E9F0] mb-4 overflow-x-auto">
        {secciones.map(([k, t]) => (
          <Link key={k} href={k === "datos" ? base : `${base}?seccion=${k}`} scroll={false}
            className={`px-3 py-2 text-xs font-bold -mb-px border-b-2 rounded-t-lg whitespace-nowrap ${k === seccion ? "border-[#16577F] text-[#16577F] bg-white" : "border-transparent text-[#5C6B76] hover:text-[#16577F]"}`}>
            {t}
          </Link>
        ))}
      </nav>
      {seccion === "datos" && <SeccionDatos {...props} />}
      {seccion === "variaciones" && <SeccionVariaciones {...props} />}
      {seccion === "atributos" && <SeccionAtributos {...props} />}
      {seccion === "fotos" && <SeccionFotos {...props} />}
      {seccion === "cucardas" && <SeccionCucardas {...props} />}
      {seccion === "kit" && <SeccionKit {...props} />}
      {seccion === "precios" && <SeccionPrecios {...props} />}
      {seccion === "stock" && <SeccionStock {...props} />}
      {seccion === "publicaciones" && <SeccionPublicaciones {...props} />}
    </Pantalla>
  );
}
