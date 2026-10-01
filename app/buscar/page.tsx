// El buscador de la barra de arriba: productos, pedidos y clientes, hasta 20
// de cada uno. Si lo buscado es un número, también busca por id.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { enVista } from "@/lib/moneda";
import { tienePermiso } from "@/lib/permisos";
import { ESTADOS_PEDIDO, type EstadoPedido } from "@/lib/pedidos";
import { PRIMARIO } from "@/app/botones";
import { entrarErp, Pantalla, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO } from "@/app/componentes/erp";
import { fecha, TONO_ESTADO, etiqueta } from "@/app/ventas/formato";

export const dynamic = "force-dynamic";

const TOPE = 20;

export default async function Buscar({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await entrarErp("panel_ver");
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const n = /^\d{1,15}$/.test(q) ? Number(q) : null;
  const patron = `%${q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
  // Cada bloque se muestra sólo si la persona puede ver esa función.
  const ver = {
    productos: tienePermiso(s.permisos, "productos_ver"),
    pedidos: tienePermiso(s.permisos, "pedidos_ver"),
    clientes: tienePermiso(s.permisos, "clientes_ver"),
  };

  const [productos, pedidos, clientes] = q ? await Promise.all([
    ver.productos ? consulta<{ id: number; sku_base: string; titulo: string; estado: string; donde: string | null }>(`
      select p.id::int, p.sku_base, p.titulo, p.estado,
             (select string_agg(distinct v.sku, ', ') from variacion v
               where v.producto_id = p.id and v.sku <> p.sku_base and (v.sku ilike $2 or v.codigo_barras = $3)) donde
        from producto p
       where p.organizacion_id = $1
         and (p.sku_base ilike $2 or p.titulo ilike $2 or p.codigo_barras = $3 or p.id = $4
              or exists (select 1 from variacion v where v.producto_id = p.id
                           and (v.sku ilike $2 or v.codigo_barras = $3 or v.titulo ilike $2)))
       order by (p.sku_base ilike $3) desc, p.titulo
       limit ${TOPE}`, [s.org.id, patron, q, n]) : [],
    ver.pedidos ? consulta<{ id: number; id_externo: string | null; fecha: Date; canal: string; cliente: string | null; estado: EstadoPedido; total_ars: number; total_usd: number }>(`
      select p.id::int, p.id_externo, p.fecha, ca.nombre canal, cl.nombre cliente, p.estado, p.total_ars::float, p.total_usd::float
        from pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
       where p.organizacion_id = $1 and (p.id_externo ilike $2 or p.id = $3)
       order by (p.id = $3) desc nulls last, p.fecha desc
       limit ${TOPE}`, [s.org.id, patron, n]) : [],
    ver.clientes ? consulta<{ id: number; nombre: string; email: string | null; documento_tipo: string | null; documento_numero: string | null }>(`
      select c.id::int, c.nombre, c.email, c.documento_tipo, c.documento_numero
        from cliente c
       where c.organizacion_id = $1
         and (c.nombre ilike $2 or c.email ilike $2 or c.documento_numero ilike $2 or c.id = $3
              or ($4 <> '' and regexp_replace(coalesce(c.documento_numero, ''), '\\D', '', 'g') = $4))
       order by c.nombre
       limit ${TOPE}`, [s.org.id, patron, n, q.replace(/\D/g, "").length >= 6 ? q.replace(/\D/g, "") : ""]) : [],
  ]) : [[], [], []];

  const nada = q && !productos.length && !pedidos.length && !clientes.length;
  const Tope = ({ filas }: { filas: unknown[] }) => filas.length >= TOPE ? <p className="text-[11px] text-[#5C6B76] mt-1">Se muestran los primeros {TOPE}; afiná la búsqueda para ver otros.</p> : null;

  return (
    <Pantalla titulo="Buscar" subtitulo="Productos, pedidos y clientes" ancho="max-w-5xl">
      <form className="flex gap-2 mb-4">
        <input name="q" defaultValue={q} autoFocus placeholder="SKU, título, código de barras, nº de pedido, cliente, mail, documento…" className={`${CAMPO} flex-1`} />
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
                    <td className={`${TD} font-mono whitespace-nowrap`}><Link href={`/catalogo/productos/${p.id}`} className="text-[#16577F] hover:underline">{p.sku_base}</Link></td>
                    <td className={TD}><Link href={`/catalogo/productos/${p.id}`} className="font-semibold text-[#16577F] hover:underline">{p.titulo}</Link></td>
                    <td className={`${TD} font-mono`}>{p.donde ?? ""}</td>
                    <td className={TD}><Estado texto={p.estado === "activo" ? "Activo" : p.estado === "pausado" ? "Pausado" : "Archivado"} tono={p.estado === "activo" ? "verde" : "gris"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Tope filas={productos} />
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
                    <td className={TD}><Link href={`/ventas/clientes/${c.id}`} className="font-semibold text-[#16577F] hover:underline">{c.nombre}</Link></td>
                    <td className={`${TD} whitespace-nowrap`}>{c.documento_numero ? `${c.documento_tipo ?? ""} ${c.documento_numero}`.trim() : "—"}</td>
                    <td className={TD}>{c.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Tope filas={clientes} />
        </section>
      )}
    </Pantalla>
  );
}
