// El buscador de la barra de arriba: productos, publicaciones (por título, MLA
// o SKU), pedidos, clientes y proveedores (por CUIT, razón social o DNI), hasta
// 20 de cada uno. Si lo buscado es un número, también busca por id.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { enVista, buscarInactivos, fijarBuscarInactivos } from "@/lib/moneda";
import { tienePermiso } from "@/lib/permisos";
import { ESTADOS_PEDIDO, type EstadoPedido } from "@/lib/pedidos";
import { PRIMARIO } from "@/app/botones";
import { entrarErp, Pantalla, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO } from "@/app/componentes/erp";
import { fecha, TONO_ESTADO, etiqueta } from "@/app/ventas/formato";
import FotosProducto from "@/app/componentes/FotosProducto";
import { verInactivos, MostrarInactivos } from "@/app/componentes/Inactivos";

export const dynamic = "force-dynamic";

const TOPE = 20;

export default async function Buscar({ searchParams }: { searchParams: Promise<{ q?: string; inactivos?: string; ci?: string }> }) {
  const s = await entrarErp("panel_ver");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 200);
  // "Mostrar inactivos" queda como la dejó cada usuario (Fer, 6/10): si el formulario trae la caja
  // (ci=1) manda lo tildado y se guarda; si no (un enlace), vale lo último que eligió.
  const guardado = await buscarInactivos(s.usuario.id, s.org.id).catch(() => false);
  const inactivos = sp.ci === "1" ? verInactivos(sp) : guardado;
  if (sp.ci === "1" && inactivos !== guardado) await fijarBuscarInactivos(s.usuario.id, s.org.id, inactivos).catch(() => {});
  // Cada bloque se muestra sólo si la persona puede ver esa función.
  const ver = {
    productos: tienePermiso(s.permisos, "productos_ver"),
    pedidos: tienePermiso(s.permisos, "pedidos_ver"),
    clientes: tienePermiso(s.permisos, "clientes_ver"),
    publicaciones: tienePermiso(s.permisos, "publicaciones_ver"),
    proveedores: tienePermiso(s.permisos, "proveedores_ver"),
  };
  // Cómo se busca (Fer, 6/10): la frase escrita, entera y tal cual (con sus espacios), en cualquier
  // parte de cada dato. El "?" separa condiciones que tienen que cumplirse TODAS en el mismo
  // resultado (cada una en cualquiera de sus datos): "note?12gb" trae lo que dice "note" y "12gb".
  const terminos = [...new Set(q.split("?").map((t) => t.trim()).filter(Boolean))].slice(0, 10);
  const patrones = terminos.map((t) => `%${t.replace(/[\\%_]/g, (x) => `\\${x}`)}%`);
  // Un término de sólo números (con o sin puntos y guiones, sin letras) también se compara con los
  // CUIT y DNI sin puntos ni guiones: "02252" puede ser un pedazo de CUIT; "SKU02252" no. Va en un
  // arreglo alineado con los términos ("" = no se compara por dígitos).
  const digitosDe = terminos.map((t) => {
    const d = /\p{L}/u.test(t) ? "" : t.replace(/\D/g, "");
    return d.length >= 4 ? `%${d}%` : "";
  });
  // El número interno (pedido, cliente, proveedor, producto) sólo si se buscó un número solo.
  const numeros = terminos.length === 1 && /^\d{1,15}$/.test(terminos[0]) ? [Number(terminos[0])] : [];
  /** Todos los términos ($2) están en el mismo resultado, cada uno en alguno de los campos. Con
   *  `digitos` (y $4 = digitosDe), un término de sólo números vale también si está en los dígitos
   *  de esos campos. */
  const todas = (campos: string[], digitos: string[] = []) => {
    const conds = [...campos.map((c) => c.includes(" w") ? c : `${c} ilike w`),
      ...digitos.map((c) => `(d <> '' and regexp_replace(coalesce(${c}, ''), '\\D', '', 'g') like d)`)];
    const desde = digitos.length ? "unnest($2::text[], $4::text[]) t(w, d)" : "unnest($2::text[]) w";
    return `not exists (select 1 from ${desde} where not coalesce(${conds.join(" or ")}, false))`;
  };
  // Del producto: sus datos y los de sus variaciones.
  const CAMPOS_PRODUCTO = ["p.sku_base", "p.titulo", "p.marca", "p.codigo_barras",
    "exists (select 1 from variacion v where v.producto_id = p.id and (v.sku ilike w or v.titulo ilike w or v.codigo_barras ilike w))"];

  // Productos y publicaciones, con o sin los inactivos (los de producto archivado).
  const buscarProductos = (inc: boolean) =>
    ver.productos ? consulta<{ id: number; sku_base: string; titulo: string; estado: string; donde: string | null; fotos: string[] | null }>(`
      select p.id::int, p.sku_base, p.titulo, p.estado,
             (select string_agg(distinct v.sku, ', ') from variacion v
               where v.producto_id = p.id and v.sku <> p.sku_base and (v.sku ilike any($2::text[]) or v.codigo_barras = any($3::text[]))) donde,
             (select array_agg(url order by orden, id) from producto_foto where producto_id = p.id) fotos
        from producto p
       where p.organizacion_id = $1 and ($5 or p.estado <> 'archivado')
         and (${todas(CAMPOS_PRODUCTO)} or p.id = any($4::bigint[]))
       order by (lower(p.sku_base) = any(select lower(x) from unnest($3::text[]) x)) desc, p.titulo
       limit ${TOPE}`, [s.org.id, patrones, terminos, numeros, inc]) : [];
  const buscarPublicaciones = (inc: boolean) =>
    ver.publicaciones ? consulta<{ id: number; id_externo: string | null; titulo: string | null; estado: string; canal: string; producto_id: number; sku: string }>(`
      select pu.id::int, pu.id_externo, coalesce(pu.titulo, v.titulo, p.titulo) titulo, pu.estado, ca.nombre canal, p.id::int producto_id, v.sku
        from publicacion pu join canal ca on ca.id = pu.canal_id join variacion v on v.id = pu.variacion_id join producto p on p.id = v.producto_id
       where pu.organizacion_id = $1 and ($4 or p.estado <> 'archivado')
         and ${todas(["pu.titulo", "pu.id_externo", "v.sku"])}
       order by (upper(pu.id_externo) = any(select upper(x) from unnest($3::text[]) x)) desc, pu.titulo
       limit ${TOPE}`, [s.org.id, patrones, terminos, inc]) : [];

  const [productos0, pedidos, clientes, publicaciones0, proveedores, inactivosOcultos] = q ? await Promise.all([
    buscarProductos(inactivos),
    ver.pedidos ? consulta<{ id: number; id_externo: string | null; fecha: Date; canal: string; cliente: string | null; estado: EstadoPedido; total_ars: number; total_usd: number }>(`
      select p.id::int, p.id_externo, p.fecha, ca.nombre canal, cl.nombre cliente, p.estado, p.total_ars::float, p.total_usd::float
        from pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
       where p.organizacion_id = $1 and (${todas(["p.id_externo"])} or p.id = any($3::bigint[]))
       order by (p.id = any($3::bigint[])) desc, p.fecha desc
       limit ${TOPE}`, [s.org.id, patrones, numeros]) : [],
    ver.clientes ? consulta<{ id: number; nombre: string; razon_social: string | null; email: string | null; documento_tipo: string | null; documento_numero: string | null; cuit: string | null }>(`
      select c.id::int, c.nombre, c.razon_social, c.email, c.documento_tipo, c.documento_numero, c.cuit
        from cliente c
       where c.organizacion_id = $1
         and (${todas(["c.nombre", "c.razon_social", "c.email", "c.documento_numero", "c.cuit"], ["c.documento_numero", "c.cuit"])} or c.id = any($3::bigint[]))
       order by c.nombre
       limit ${TOPE}`, [s.org.id, patrones, numeros, digitosDe]) : [],
    buscarPublicaciones(inactivos),
    ver.proveedores ? consulta<{ id: number; nombre: string; razon_social: string | null; cuit: string | null; email: string | null }>(`
      select pr.id::int, pr.nombre, pr.razon_social, pr.cuit, pr.email
        from proveedor pr
       where pr.organizacion_id = $1
         and (${todas(["pr.nombre", "pr.razon_social", "pr.cuit"], ["pr.cuit"])} or pr.id = any($3::bigint[]))
       order by pr.nombre
       limit ${TOPE}`, [s.org.id, patrones, numeros, digitosDe]) : [],
    // Sin la caja tildada: cuántos productos inactivos coinciden, para avisarlo.
    ver.productos && !inactivos ? consulta<{ n: number }>(`
      select count(*)::int n from producto p
       where p.organizacion_id = $1 and p.estado = 'archivado'
         and ${todas(CAMPOS_PRODUCTO)}`, [s.org.id, patrones]).then((r) => r[0]?.n ?? 0) : 0,
  ]) : [[], [], [], [], [], 0];
  // Si lo único que coincide es inactivo, se muestra igual aunque la caja no esté tildada (Fer, 6/10).
  // Con cualquier cosa activa encontrada, los inactivos siguen escondidos salvo con la caja.
  const soloInactivos = !!q && !inactivos && inactivosOcultos > 0
    && !productos0.length && !pedidos.length && !clientes.length && !publicaciones0.length && !proveedores.length;
  const [productos, publicaciones] = soloInactivos
    ? await Promise.all([buscarProductos(true), buscarPublicaciones(true)])
    : [productos0, publicaciones0];

  const nada = q && !productos.length && !pedidos.length && !clientes.length && !publicaciones.length && !proveedores.length;
  const Tope = ({ filas }: { filas: unknown[] }) => filas.length >= TOPE ? <p className="text-[11px] text-[#5C6B76] mt-1">Se muestran los primeros {TOPE}; afiná la búsqueda para ver otros.</p> : null;

  return (
    <Pantalla titulo="Buscar" subtitulo="Productos, publicaciones, pedidos, clientes y proveedores" ancho="max-w-5xl">
      <form className="flex flex-wrap items-center gap-2 mb-4">
        <input name="q" defaultValue={q} autoFocus placeholder="SKU, título, MLA, código de barras, nº de pedido, cliente o proveedor (nombre, razón social, CUIT, DNI)…" className={`${CAMPO} flex-1`} />
        <input type="hidden" name="ci" value="1" />
        <MostrarInactivos activo={inactivos} ayuda="Sin tildar, los inactivos aparecen sólo cuando lo único que coincide es inactivo. Tildada, aparecen siempre. Queda como la dejes." />
        <button className={PRIMARIO}>Buscar</button>
      </form>
      <p className="-mt-2 mb-4 text-[11px] text-[#5C6B76]">
        Busca lo que escribiste <b>tal cual</b>, entero (con sus espacios), en cualquier parte. Para pedir <b>varias condiciones a la vez</b>, separalas con <b className="font-mono text-[#16577F]">?</b>: trae lo que cumple <b>todas</b> en el mismo resultado (por ejemplo <span className="font-mono">note?12gb</span> trae lo que dice “note” y también “12gb”). Los <b>inactivos</b> salen sólo si es lo único que coincide, salvo que tildes “Mostrar inactivos”: ahí salen siempre.
      </p>
      {!q && <p className="text-xs text-[#5C6B76]">Escribí qué buscar.</p>}
      {nada && <p className="text-xs text-[#5C6B76]">No se encontró nada con “{q}”.</p>}
      {soloInactivos && <p className="text-xs text-[#5C6B76] mb-3">No hay nada activo con “{q}”: se muestran los inactivos que coinciden.</p>}
      {inactivosOcultos > 0 && !soloInactivos && (
        <p className="text-xs text-[#5C6B76] mb-3">
          {inactivosOcultos === 1 ? "Hay 1 producto inactivo" : `Hay ${inactivosOcultos} productos inactivos`} que coincide{inactivosOcultos === 1 ? "" : "n"}: tildá “Mostrar inactivos” para verlo{inactivosOcultos === 1 ? "" : "s"}.
        </p>
      )}

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
