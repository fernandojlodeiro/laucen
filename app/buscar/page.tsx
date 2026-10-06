// El buscador de la barra de arriba: productos, publicaciones (por título o
// MLA), pedidos, clientes y proveedores (por CUIT, razón social o DNI), hasta
// 20 de cada uno. Si lo buscado es un número, también busca por id.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { enVista } from "@/lib/moneda";
import { tienePermiso } from "@/lib/permisos";
import { ESTADOS_PEDIDO, type EstadoPedido } from "@/lib/pedidos";
import { PRIMARIO } from "@/app/botones";
import { entrarErp, Pantalla, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO } from "@/app/componentes/erp";
import { fecha, TONO_ESTADO, etiqueta } from "@/app/ventas/formato";
import FotosProducto from "@/app/componentes/FotosProducto";
import { verInactivos, MostrarInactivos } from "@/app/componentes/Inactivos";

export const dynamic = "force-dynamic";

const TOPE = 20;

export default async function Buscar({ searchParams }: { searchParams: Promise<{ q?: string; inactivos?: string }> }) {
  const s = await entrarErp("panel_ver");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const inactivos = verInactivos(sp);
  const n = /^\d{1,15}$/.test(q) ? Number(q) : null;
  const patron = `%${q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
  // Cada bloque se muestra sólo si la persona puede ver esa función.
  const ver = {
    productos: tienePermiso(s.permisos, "productos_ver"),
    pedidos: tienePermiso(s.permisos, "pedidos_ver"),
    clientes: tienePermiso(s.permisos, "clientes_ver"),
    publicaciones: tienePermiso(s.permisos, "publicaciones_ver"),
    proveedores: tienePermiso(s.permisos, "proveedores_ver"),
  };
  // Documentos escritos con puntos o guiones: se comparan sólo los dígitos. Sólo si lo buscado
  // parece un documento (sin letras): "SKU02252" no tiene que traer clientes con 02252 en el CUIT.
  const digitos = /\p{L}/u.test(q) ? "" : q.replace(/\D/g, "");
  const patronDigitos = digitos.length >= 4 ? `%${digitos}%` : "";

  const [productos, pedidos, clientes, publicaciones, proveedores] = q ? await Promise.all([
    ver.productos ? consulta<{ id: number; sku_base: string; titulo: string; estado: string; donde: string | null; fotos: string[] | null }>(`
      select p.id::int, p.sku_base, p.titulo, p.estado,
             (select string_agg(distinct v.sku, ', ') from variacion v
               where v.producto_id = p.id and v.sku <> p.sku_base and (v.sku ilike $2 or v.codigo_barras = $3)) donde,
             (select array_agg(url order by orden, id) from producto_foto where producto_id = p.id) fotos
        from producto p
       where p.organizacion_id = $1
         -- Un inactivo se ve con la caja tildada, o si lo buscado es justo su SKU (Fer, 6/10).
         and ($5 or p.estado <> 'archivado' or lower(p.sku_base) = lower($3)
              or exists (select 1 from variacion v where v.producto_id = p.id and lower(v.sku) = lower($3)))
         and (p.sku_base ilike $2 or p.titulo ilike $2 or p.codigo_barras = $3 or p.id = $4
              or exists (select 1 from variacion v where v.producto_id = p.id
                           and (v.sku ilike $2 or v.codigo_barras = $3 or v.titulo ilike $2)))
       order by (p.sku_base ilike $3) desc, p.titulo
       limit ${TOPE}`, [s.org.id, patron, q, n, inactivos]) : [],
    ver.pedidos ? consulta<{ id: number; id_externo: string | null; fecha: Date; canal: string; cliente: string | null; estado: EstadoPedido; total_ars: number; total_usd: number }>(`
      select p.id::int, p.id_externo, p.fecha, ca.nombre canal, cl.nombre cliente, p.estado, p.total_ars::float, p.total_usd::float
        from pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
       where p.organizacion_id = $1 and (p.id_externo ilike $2 or p.id = $3)
       order by (p.id = $3) desc nulls last, p.fecha desc
       limit ${TOPE}`, [s.org.id, patron, n]) : [],
    ver.clientes ? consulta<{ id: number; nombre: string; razon_social: string | null; email: string | null; documento_tipo: string | null; documento_numero: string | null; cuit: string | null }>(`
      select c.id::int, c.nombre, c.razon_social, c.email, c.documento_tipo, c.documento_numero, c.cuit
        from cliente c
       where c.organizacion_id = $1
         and (c.nombre ilike $2 or c.razon_social ilike $2 or c.email ilike $2 or c.documento_numero ilike $2 or c.cuit ilike $2 or c.id = $3
              or ($4 <> '' and (regexp_replace(coalesce(c.documento_numero, ''), '\\D', '', 'g') like $4
                                or regexp_replace(coalesce(c.cuit, ''), '\\D', '', 'g') like $4)))
       order by c.nombre
       limit ${TOPE}`, [s.org.id, patron, n, patronDigitos]) : [],
    ver.publicaciones ? consulta<{ id: number; id_externo: string | null; titulo: string | null; estado: string; canal: string; producto_id: number; sku: string }>(`
      select pu.id::int, pu.id_externo, coalesce(pu.titulo, v.titulo, p.titulo) titulo, pu.estado, ca.nombre canal, p.id::int producto_id, v.sku
        from publicacion pu join canal ca on ca.id = pu.canal_id join variacion v on v.id = pu.variacion_id join producto p on p.id = v.producto_id
       where pu.organizacion_id = $1 and (pu.titulo ilike $2 or pu.id_externo ilike $2 or v.sku ilike $2)
       order by (upper(pu.id_externo) = upper($3)) desc, pu.titulo
       limit ${TOPE}`, [s.org.id, patron, q]) : [],
    ver.proveedores ? consulta<{ id: number; nombre: string; razon_social: string | null; cuit: string | null; email: string | null }>(`
      select pr.id::int, pr.nombre, pr.razon_social, pr.cuit, pr.email
        from proveedor pr
       where pr.organizacion_id = $1
         and (pr.nombre ilike $2 or pr.razon_social ilike $2 or pr.cuit ilike $2 or pr.id = $3
              or ($4 <> '' and regexp_replace(coalesce(pr.cuit, ''), '\\D', '', 'g') like $4))
       order by pr.nombre
       limit ${TOPE}`, [s.org.id, patron, n, patronDigitos]) : [],
  ]) : [[], [], [], [], []];

  const nada = q && !productos.length && !pedidos.length && !clientes.length && !publicaciones.length && !proveedores.length;
  const Tope = ({ filas }: { filas: unknown[] }) => filas.length >= TOPE ? <p className="text-[11px] text-[#5C6B76] mt-1">Se muestran los primeros {TOPE}; afiná la búsqueda para ver otros.</p> : null;

  return (
    <Pantalla titulo="Buscar" subtitulo="Productos, publicaciones, pedidos, clientes y proveedores" ancho="max-w-5xl">
      <form className="flex flex-wrap items-center gap-2 mb-4">
        <input name="q" defaultValue={q} autoFocus placeholder="SKU, título, MLA, código de barras, nº de pedido, cliente o proveedor (nombre, razón social, CUIT, DNI)…" className={`${CAMPO} flex-1`} />
        <MostrarInactivos activo={inactivos} />
        <button className={PRIMARIO}>Buscar</button>
      </form>
      {!q && <p className="text-xs text-[#5C6B76]">Escribí qué buscar.</p>}
      {nada && <p className="text-xs text-[#5C6B76]">No se encontró nada con “{q}”.</p>}

      {productos.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold mb-2">Productos</h2>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>SKU</th><th className={TH}>Título</th><th className={TH}>Variación encontrada</th><th className={TH}>Estado</th></tr></thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id} className={TR}>
                    <td className={`${TD} font-mono whitespace-nowrap`}><span className="inline-flex items-center gap-2"><FotosProducto fotos={p.fotos} titulo={p.titulo} tamano={48} /><Link href={`/catalogo/productos/${p.id}`} className="text-[#16577F] hover:underline">{p.sku_base}</Link></span></td>
                    <td className={TD}><Link href={`/catalogo/productos/${p.id}`} className="font-semibold text-[#16577F] hover:underline">{p.titulo}</Link></td>
                    <td className={`${TD} font-mono`}>{p.donde ?? ""}</td>
                    <td className={TD}><Estado texto={p.estado === "activo" ? "Activo" : p.estado === "pausado" ? "Pausado" : "Inactivo"} tono={p.estado === "activo" ? "verde" : "gris"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Tope filas={productos} />
        </section>
      )}

      {publicaciones.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold mb-2">Publicaciones</h2>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Código</th><th className={TH}>Título</th><th className={TH}>Canal</th><th className={TH}>SKU</th><th className={TH}>Estado</th></tr></thead>
              <tbody>
                {publicaciones.map((x) => (
                  <tr key={x.id} className={TR}>
                    <td className={`${TD} font-mono whitespace-nowrap`}>{x.id_externo ?? "—"}</td>
                    <td className={TD}><Link href={`/catalogo/productos/${x.producto_id}`} className="font-semibold text-[#16577F] hover:underline">{x.titulo}</Link></td>
                    <td className={TD}>{x.canal}</td>
                    <td className={`${TD} font-mono`}>{x.sku}</td>
                    <td className={TD}><Estado texto={x.estado === "activa" ? "Activa" : x.estado === "pausada" ? "Pausada" : "Cerrada"} tono={x.estado === "activa" ? "verde" : "gris"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Tope filas={publicaciones} />
        </section>
      )}

      {pedidos.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold mb-2">Pedidos</h2>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={THN}>Nº</th><th className={THN}>Fecha</th><th className={TH}>Canal</th><th className={TH}>Id externo</th><th className={TH}>Cliente</th><th className={TH}>Estado</th><th className={THN}>Total</th></tr></thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className={TR}>
                    <td className={TDN}><Link href={`/ventas/pedidos/${p.id}`} className="font-semibold text-[#16577F] hover:underline">{p.id}</Link></td>
                    <td className={TDN}>{fecha(p.fecha)}</td>
                    <td className={TD}>{p.canal}</td>
                    <td className={`${TD} font-mono`}>{p.id_externo ?? "—"}</td>
                    <td className={TD}>{p.cliente ?? "—"}</td>
                    <td className={TD}><Estado texto={etiqueta(ESTADOS_PEDIDO, p.estado)} tono={TONO_ESTADO[p.estado] ?? "gris"} /></td>
                    <td className={TDN}>{enVista({ ars: p.total_ars, usd: p.total_usd }, s.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Tope filas={pedidos} />
        </section>
      )}

      {clientes.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold mb-2">Clientes</h2>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Nombre</th><th className={TH}>Documento</th><th className={TH}>Mail</th></tr></thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id} className={TR}>
                    <td className={TD}><Link href={`/ventas/clientes/${c.id}`} className="font-semibold text-[#16577F] hover:underline">{c.nombre}</Link>{c.razon_social && c.razon_social !== c.nombre && <span className="block text-[11px] text-[#5C6B76]">{c.razon_social}</span>}</td>
                    <td className={`${TD} whitespace-nowrap`}>{[c.cuit ? `CUIT ${c.cuit}` : null, c.documento_numero ? `${c.documento_tipo ?? ""} ${c.documento_numero}`.trim() : null].filter(Boolean).join(" · ") || "—"}</td>
                    <td className={TD}>{c.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Tope filas={clientes} />
        </section>
      )}

      {proveedores.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold mb-2">Proveedores</h2>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Nombre</th><th className={TH}>Razón social</th><th className={TH}>CUIT</th><th className={TH}>Mail</th></tr></thead>
              <tbody>
                {proveedores.map((x) => (
                  <tr key={x.id} className={TR}>
                    <td className={TD}><Link href={`/compras/proveedores?id=${x.id}`} className="font-semibold text-[#16577F] hover:underline">{x.nombre}</Link></td>
                    <td className={TD}>{x.razon_social ?? "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{x.cuit ?? "—"}</td>
                    <td className={TD}>{x.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Tope filas={proveedores} />
        </section>
      )}
    </Pantalla>
  );
}
