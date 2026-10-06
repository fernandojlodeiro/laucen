// El buscador de la barra de arriba (Fer, 6/10): "incluís TODOS los campos de la base… como en
// Virtual Seller, ponía lo que ponía y aparecía". Una sección por tabla de negocio (productos,
// publicaciones, pedidos, clientes, proveedores, preguntas y mensajes, WhatsApp, reclamos, envíos,
// facturas, compras, despachos, recepciones, cuentas corrientes, recibos, tesorería), cada una
// buscando en todos sus datos de texto con la regla de todo el panel (lib/busqueda.ts), hasta 20
// de cada una, todas las consultas a la vez.

import Link from "next/link";
import type { ReactNode } from "react";
import { consulta } from "@/lib/erp/base";
import { enVista, buscarInactivos, fijarBuscarInactivos } from "@/lib/moneda";
import { parametroBusqueda, sqlBusqueda, AYUDA_BUSQUEDA, type CampoBusqueda, type CampoSimple } from "@/lib/busqueda";
import { tienePermiso } from "@/lib/permisos";
import { ESTADOS_PEDIDO, type EstadoPedido } from "@/lib/pedidos";
import { cuitLegible } from "@/lib/cuit";
import { telefonoConAclaracion } from "@/lib/telefono";
import { TIPOS_CBTE } from "@/lib/arca/facturar";
import { PRIMARIO } from "@/app/botones";
import { entrarErp, Pantalla, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO } from "@/app/componentes/erp";
import { fecha, fechaHora, TONO_ESTADO, etiqueta } from "@/app/ventas/formato";
import FotosProducto from "@/app/componentes/FotosProducto";
import { verInactivos, MostrarInactivos } from "@/app/componentes/Inactivos";

export const dynamic = "force-dynamic";

const TOPE = 20;
const ENLACE = "text-[#16577F] hover:underline";

// ── Piezas para armar los campos ─────────────────────────────

/** Los datos de un cliente (alias `a`): nombre, razón social, apodo, mail, CUIT, documento, teléfonos. */
const camposCliente = (a: string): CampoSimple[] => [
  `${a}.id::text`, `${a}.nombre`, `${a}.razon_social`, `${a}.apodo_ml`, `${a}.email`, `${a}.nombre_pila`, `${a}.apellido`, `${a}.notas`,
  { num: `${a}.cuit` }, { num: `${a}.documento_numero` }, { num: `${a}.telefono` }, { num: `${a}.telefono_movil` }, `${a}.telefono_aclaracion`, `${a}.telefono_movil_aclaracion`,
];
/** El cliente de la fila (por su id). */
const deCliente = (id: string): CampoBusqueda => ({ de: `select 1 from cliente bc where bc.id = ${id}`, campos: camposCliente("bc") });
/** El proveedor de la fila (por su id). */
const deProveedor = (id: string): CampoBusqueda => ({
  de: `select 1 from proveedor bp where bp.id = ${id}`,
  campos: ["bp.nombre", "bp.razon_social", "bp.contacto", "bp.email", { num: "bp.cuit" }],
});
/** El cliente o el proveedor de un movimiento de cuenta corriente o un recibo (alias `a`). */
const deTercero = (a: string): CampoBusqueda[] => [
  { de: `select 1 from cliente bc where ${a}.tercero_tipo = 'cliente' and bc.id = ${a}.tercero_id`, campos: camposCliente("bc") },
  { de: `select 1 from proveedor bp where ${a}.tercero_tipo = 'proveedor' and bp.id = ${a}.tercero_id`, campos: ["bp.nombre", "bp.razon_social", { num: "bp.cuit" }] },
];
/** Cada dato (texto o número) de un jsonb: una dirección de envío, retenciones… */
const hojasJson = (x: string): CampoBusqueda => ({
  de: `select 1 from jsonb_path_query(coalesce(${x}, 'null'::jsonb), 'strict $.** ? (@.type() == "string" || @.type() == "number")') bh(j) where true`,
  campos: ["(bh.j #>> '{}')"],
});
/** La dirección de una fila de cliente_direccion (alias `d`), dato por dato y "calle número" junto. */
const camposDireccion = (d: string): CampoSimple[] => [
  `${d}.etiqueta`, `${d}.calle`, `${d}.numero`, `concat_ws(' ', ${d}.calle, ${d}.numero)`, `${d}.piso_depto`, `${d}.localidad`, `${d}.provincia`,
  `${d}.codigo_postal`, `${d}.pais`, `${d}.receptor`, { num: `${d}.receptor_telefono` }, `${d}.referencia`,
];
const nombreTercero = (a: string) =>
  `case when ${a}.tercero_tipo = 'cliente' then (select nombre from cliente where id = ${a}.tercero_id) else (select nombre from proveedor where id = ${a}.tercero_id) end`;
/** Un texto de la fila (`campo`) donde aparece alguna de las condiciones: para mostrar qué coincidió. */
const conAlguna = (campo: string) =>
  `exists (select 1 from jsonb_array_elements($2::jsonb) bg(v), jsonb_array_elements_text(bg.v) bt(x) where ${campo} ilike bt.x)`;

/** "en_proceso" → "En proceso". */
const legible = (x: string | null | undefined) => (x ? (x.charAt(0).toUpperCase() + x.slice(1)).replace(/_/g, " ") : "—");
const corto = (x: string | null | undefined, n = 140) => (!x ? "—" : x.length > n ? `${x.slice(0, n)}…` : x);
const nroCbte = (pv: number | null, n: number | null) =>
  n == null ? "s/n" : `${String(pv ?? 0).padStart(5, "0")}-${String(n).padStart(8, "0")}`;

type Columna<T> = { t: string; n?: boolean; c: (r: T) => ReactNode };

function Seccion<T>({ titulo, filas, columnas, clave }: { titulo: string; filas: T[]; columnas: Columna<T>[]; clave: (r: T) => string | number }) {
  if (!filas.length) return null;
  return (
    <section className="mb-5">
      <h2 className="text-sm font-bold mb-2">{titulo} ({filas.length}{filas.length >= TOPE ? "+" : ""})</h2>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr>{columnas.map((c) => <th key={c.t} className={c.n ? THN : TH}>{c.t}</th>)}</tr></thead>
          <tbody>
            {filas.map((r) => (
              <tr key={clave(r)} className={TR}>{columnas.map((c) => <td key={c.t} className={c.n ? TDN : TD}>{c.c(r)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length >= TOPE && <p className="text-[11px] text-[#5C6B76] mt-1">Se muestran los primeros {TOPE}; afiná la búsqueda para ver otros.</p>}
    </section>
  );
}

// ── Filas de cada sección ────────────────────────────────────

type Producto = { id: number; sku_base: string; titulo: string; estado: string; marca: string | null; donde: string | null; fotos: string[] | null };
type Publicacion = { id: number; id_externo: string | null; titulo: string | null; estado: string; canal: string; producto_id: number; sku: string };
type ItemMl = { item_id: string; variation_id: string; canal_id: number; canal: string; titulo: string | null; sku: string | null; estado: string | null };
type Pedido = { id: number; id_externo: string | null; fecha: Date; canal: string; cliente: string | null; cliente_id: number | null; estado: EstadoPedido; total_ars: number; total_usd: number };
type Cliente = { id: number; nombre: string; razon_social: string | null; email: string | null; documento_tipo: string | null; documento_numero: string | null; cuit: string | null; telefonos: string[]; localidad: string | null };
type Proveedor = { id: number; nombre: string; razon_social: string | null; cuit: string | null; email: string | null; telefonos: string[]; localidad: string | null };
type Pregunta = { id: number; fecha: Date | null; texto: string | null; respuesta: string | null; estado: string | null; publicacion: string | null; item_id: string | null };
type ConvMl = { pack_id: string; canal: string | null; ultimo_ts: Date | null; cliente: string | null; pedido_id: number | null; texto: string | null };
type Chat = { id: number; nombre: string | null; externo: string | null; canal: string; ultimo_ts: Date | null; texto: string | null };
type Reclamo = { id: number; fecha: Date | null; tipo: string | null; motivo: string | null; estado: string; cliente: string | null; pedido_id: number | null };
type Envio = { id: number; pedido_id: number | null; tracking: string | null; transportista: string | null; receptor: string | null; estado: string | null; destino: string | null };
type Comprobante = { id: number; fecha: Date | null; tipo_cbte: number; punto_venta: number | null; numero: number | null; receptor_nombre: string | null; doc_nro: string | null; estado: string; importe_total: number };
type FacturaCompra = { id: number; fecha: Date | null; comprobante: string; proveedor: string | null; proveedor_id: number; estado: string; total: number; moneda: string };
type Despacho = { id: number; fecha: Date | null; numero: string | null; proveedor: string | null; estado: string };
type Recepcion = { id: number; creado_ts: Date; tipo: string | null; documento: string | null; proveedor: string | null; estado: string };
type MovCc = { id: number; fecha: Date | null; tercero_tipo: string; tercero_id: number; tercero: string | null; descripcion: string | null; importe: number; moneda: string };
type Recibo = { id: number; fecha: Date | null; tipo: string; numero: number; tercero_tipo: string; tercero_id: number; tercero: string | null; total: number; moneda: string; estado: string };
type MovFondos = { id: number; fecha: Date | null; cuenta_id: number; cuenta: string; concepto: string | null; importe: number };

/** [móvil, su aclaración, fijo, su aclaración] → "11 5555-1234 (Juan) · 4444-5555", "—" si no hay. */
const telefonos = (t: (string | null)[]) =>
  [telefonoConAclaracion(t[0], t[1]), telefonoConAclaracion(t[2], t[3])].filter(Boolean).join(" · ") || "—";
const enlaceCc = (tipo: string, id: number) => url("/administracion/cuentas-corrientes", { tercero: tipo, id });
const pesos = (n: number, moneda = "ARS") => `${moneda === "USD" ? "US$" : "$"} ${Number(n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function Buscar({ searchParams }: { searchParams: Promise<{ q?: string; inactivos?: string; ci?: string }> }) {
  const s = await entrarErp("panel_ver");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 200);
  // "Mostrar inactivos" queda como la dejó cada usuario (Fer, 6/10): si el formulario trae la caja
  // (ci=1) manda lo tildado y se guarda; si no (un enlace), vale lo último que eligió.
  const guardado = await buscarInactivos(s.usuario.id, s.org.id).catch(() => false);
  const inactivos = sp.ci === "1" ? verInactivos(sp) : guardado;
  if (sp.ci === "1" && inactivos !== guardado) await fijarBuscarInactivos(s.usuario.id, s.org.id, inactivos).catch(() => {});
  // Cada sección se muestra sólo si la persona puede ver su pantalla.
  const p = (k: Parameters<typeof tienePermiso>[1]) => tienePermiso(s.permisos, k);
  const ver = {
    productos: p("productos_ver"), publicaciones: p("publicaciones_ver"), pedidos: p("pedidos_ver"), clientes: p("clientes_ver"),
    proveedores: p("proveedores_ver"), preguntas: p("preguntas_ver"), whatsapp: p("mensajes_ver"), reclamos: p("reclamos_ver"),
    envios: p("envios_ver"), facturacion: p("facturacion_ver"), compras: p("compras_ver"), despachos: p("despachos_ver"),
    recepciones: p("recepcion_ver"), cc: p("cuentas_corrientes_ver"), tesoreria: p("tesoreria_ver"),
  };
  // $1 organización · $2 lo escrito (lib/busqueda.ts) · $3 lo escrito en minúsculas (lo exacto sale primero).
  const base = [s.org.id, parametroBusqueda(q), q.toLowerCase()];
  const buscar = <T,>(si: boolean, sql: string, extra: unknown[] = []): Promise<T[]> =>
    si && q ? consulta<T & Record<string, unknown>>(sql, [...base, ...extra]) as Promise<T[]> : Promise.resolve([]);

  // Del producto: todos sus datos de texto, su familia, sus atributos, sus variaciones (y los
  // atributos de cada una) y los SKU viejos que lo nombran.
  const CAMPOS_PRODUCTO: CampoBusqueda[] = [
    "p.id::text", "p.sku_base", "p.titulo", "p.descripcion", "p.marca", "p.modelo", "p.linea", "p.garantia", "p.categoria_ml", "p.codigo_barras",
    { de: "select 1 from familia bf where bf.id = p.familia_id", campos: ["bf.nombre"] },
    { de: "select 1 from producto_atributo ba where ba.producto_id = p.id", campos: ["ba.nombre", "ba.valor"] },
    { de: "select 1 from variacion bv where bv.producto_id = p.id", campos: ["bv.id::text", "bv.sku", "bv.titulo", "bv.codigo_barras"] },
    { de: "select 1 from variacion_atributo bva join variacion bv on bv.id = bva.variacion_id where bv.producto_id = p.id", campos: ["bva.nombre", "bva.valor"] },
    { de: "select 1 from sku_equivalencia be where be.organizacion_id = p.organizacion_id and be.sku = p.sku_base", campos: ["be.alias"] },
  ];
  const buscarProductos = (inc: boolean) => buscar<Producto>(ver.productos, `
    select p.id::int, p.sku_base, p.titulo, p.estado, p.marca,
           (select string_agg(distinct v.sku, ', ') from variacion v
             where v.producto_id = p.id and v.sku <> p.sku_base and (${conAlguna("v.sku")} or ${conAlguna("v.titulo")} or ${conAlguna("v.codigo_barras")})) donde,
           (select array_agg(url order by orden, id) from producto_foto where producto_id = p.id) fotos
      from producto p
     where p.organizacion_id = $1 and ($4 or p.estado <> 'archivado') and ${sqlBusqueda("$2", CAMPOS_PRODUCTO)}
     order by (lower(p.sku_base) = $3 or p.id::text = $3) desc, p.titulo
     limit ${TOPE}`, [inc]);
  // La publicación: sus datos, los de su variación y producto, y lo que trae Mercado Libre de ella.
  const buscarPublicaciones = (inc: boolean) => buscar<Publicacion>(ver.publicaciones, `
    select pu.id::int, pu.id_externo, coalesce(pu.titulo, v.titulo, p.titulo) titulo, pu.estado, ca.nombre canal, p.id::int producto_id, v.sku
      from publicacion pu join canal ca on ca.id = pu.canal_id join variacion v on v.id = pu.variacion_id join producto p on p.id = v.producto_id
     where pu.organizacion_id = $1 and ($4 or p.estado <> 'archivado')
       and ${sqlBusqueda("$2", ["pu.id::text", "pu.id_externo", "pu.titulo", "pu.categoria_externa", "pu.variacion_externa", "v.sku", "v.titulo", "p.sku_base", "p.titulo",
         { de: "select 1 from meli_item bm where bm.publicacion_id = pu.id", campos: ["bm.item_id", "bm.variation_id", "bm.titulo", "bm.sku", "bm.atributos", "bm.categoria", "bm.permalink"] }])}
     order by (lower(pu.id_externo) = $3) desc, pu.titulo
     limit ${TOPE}`, [inc]);

  const [
    productos0, publicaciones0, itemsMl, pedidos, clientes, proveedores, preguntas, convMl, chats, reclamos, envios,
    comprobantes, facturasCompra, despachos, recepciones, movCc, recibos, movFondos, inactivosOcultos,
  ] = await Promise.all([
    buscarProductos(inactivos),
    buscarPublicaciones(inactivos),
    // Lo que está en Mercado Libre y todavía no se vinculó a una publicación de Laucen.
    buscar<ItemMl>(ver.publicaciones, `
      select mi.item_id, mi.variation_id, mi.canal_id::int, ca.nombre canal, mi.titulo, mi.sku, mi.estado
        from meli_item mi join canal ca on ca.id = mi.canal_id
       where mi.organizacion_id = $1 and mi.publicacion_id is null
         and ${sqlBusqueda("$2", ["mi.item_id", "mi.variation_id", "mi.titulo", "mi.sku", "mi.atributos", "mi.categoria", "mi.permalink"])}
       order by (lower(mi.item_id) = $3) desc, mi.titulo
       limit ${TOPE}`),
    // El pedido: sus datos, sus líneas, su cliente, sus pagos y su envío (con la dirección).
    buscar<Pedido>(ver.pedidos, `
      select p.id::int, p.id_externo, p.fecha, ca.nombre canal, cl.nombre cliente, p.cliente_id::int, p.estado, p.total_ars::float, p.total_usd::float
        from pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
       where p.organizacion_id = $1
         and ${sqlBusqueda("$2", ["p.id::text", "p.id_externo", "p.notas", "p.codigo_seguimiento", "p.medio_pago", hojasJson("p.envio"),
           { de: "select 1 from pedido_linea bl where bl.pedido_id = p.id", campos: ["bl.titulo", "bl.sku"] },
           deCliente("p.cliente_id"),
           { de: "select 1 from pago bpa where bpa.pedido_id = p.id", campos: ["bpa.id_externo", "bpa.medio", "bpa.detalle"] },
           { de: "select 1 from envio be where be.pedido_id = p.id", campos: ["be.id_externo", "be.tracking", "be.transportista", "be.receptor", "be.metodo"] },
           { de: `select 1 from envio be, jsonb_path_query(coalesce(be.direccion, 'null'::jsonb), 'strict $.** ? (@.type() == "string" || @.type() == "number")') bh(j) where be.pedido_id = p.id`, campos: ["(bh.j #>> '{}')"] }])}
       order by (p.id::text = $3 or lower(p.id_externo) = $3) desc, p.fecha desc
       limit ${TOPE}`),
    // El cliente: todos sus datos, sus direcciones, su id en cada canal y su cuenta de la tienda.
    buscar<Cliente>(ver.clientes, `
      select c.id::int, c.nombre, c.razon_social, c.email, c.documento_tipo, c.documento_numero, c.cuit,
             array[c.telefono_movil, c.telefono_movil_aclaracion, c.telefono, c.telefono_aclaracion] telefonos,
             (select d.localidad from cliente_direccion d where d.cliente_id = c.id order by d.principal desc, d.id limit 1) localidad
        from cliente c
       where c.organizacion_id = $1
         and ${sqlBusqueda("$2", [...camposCliente("c"),
           { de: "select 1 from cliente_direccion bd where bd.cliente_id = c.id", campos: camposDireccion("bd") },
           { de: "select 1 from cliente_identidad bi where bi.cliente_id = c.id", campos: ["bi.id_externo"] },
           { de: "select 1 from cliente_cuenta bcc where bcc.cliente_id = c.id", campos: ["bcc.email"] }])}
       order by (c.id::text = $3 or lower(c.nombre) = $3) desc, c.nombre
       limit ${TOPE}`),
    buscar<Proveedor>(ver.proveedores, `
      select pr.id::int, pr.nombre, pr.razon_social, pr.cuit, pr.email,
             array[pr.telefono_movil, pr.telefono_movil_aclaracion, pr.telefono, pr.telefono_aclaracion] telefonos, pr.localidad
        from proveedor pr
       where pr.organizacion_id = $1
         and ${sqlBusqueda("$2", ["pr.id::text", "pr.nombre", "pr.razon_social", { num: "pr.cuit" }, "pr.pais", "pr.email", { num: "pr.telefono" }, { num: "pr.telefono_movil" }, "pr.telefono_aclaracion", "pr.telefono_movil_aclaracion",
           "pr.contacto", "pr.calle", "pr.localidad", "pr.provincia", "pr.codigo_postal", "pr.condiciones_pago", "pr.notas"])}
       order by (pr.id::text = $3 or lower(pr.nombre) = $3) desc, pr.nombre
       limit ${TOPE}`),
    // Preguntas de Mercado Libre: la pregunta, la respuesta, la publicación y el comprador.
    buscar<Pregunta>(ver.preguntas, `
      select q.id::int, q.fecha, q.texto, q.respuesta, q.estado, q.item_id,
             (select mi.titulo from meli_item mi where mi.organizacion_id = q.organizacion_id and mi.item_id = q.item_id limit 1) publicacion
        from meli_pregunta q
       where q.organizacion_id = $1
         and ${sqlBusqueda("$2", ["q.id::text", "q.item_id", "q.texto", "q.respuesta", "q.sugerencia", "q.comprador_id::text",
           { de: "select 1 from meli_item bm where bm.organizacion_id = q.organizacion_id and bm.item_id = q.item_id", campos: ["bm.titulo", "bm.sku"] }])}
       order by q.fecha desc nulls last
       limit ${TOPE}`),
    // Mensajes de posventa de Mercado Libre: por conversación (pack), con su pedido y su cliente.
    buscar<ConvMl>(ver.preguntas, `
      select mc.pack_id, ca.nombre canal, mc.ultimo_ts, cl.nombre cliente, mc.pedido_id::int,
             (select m.texto from meli_mensaje m where m.organizacion_id = mc.organizacion_id and m.pack_id = mc.pack_id and ${conAlguna("m.texto")}
               order by m.fecha desc limit 1) texto
        from meli_conversacion mc left join canal ca on ca.id = mc.canal_id
             left join pedido pe on pe.id = mc.pedido_id left join cliente cl on cl.id = pe.cliente_id
       where mc.organizacion_id = $1
         and ${sqlBusqueda("$2", ["mc.pack_id", "mc.sugerencia",
           { de: "select 1 from meli_mensaje bm where bm.organizacion_id = mc.organizacion_id and bm.pack_id = mc.pack_id", campos: ["bm.id", "bm.texto"] },
           { de: "select 1 from pedido bpe where bpe.id = mc.pedido_id", campos: ["bpe.id::text", "bpe.id_externo"] },
           { de: "select 1 from pedido bpe join cliente bc on bc.id = bpe.cliente_id where bpe.id = mc.pedido_id", campos: camposCliente("bc") }])}
       order by mc.ultimo_ts desc nulls last
       limit ${TOPE}`),
    // WhatsApp: el chat (nombre, teléfono, notas), sus mensajes, sus casos y su cliente.
    buscar<Chat>(ver.whatsapp, `
      select ch.id::int, ch.nombre, ch.externo, ch.canal, ch.ultimo_ts,
             (select m.texto from chat_mensaje m where m.chat_id = ch.id and ${conAlguna("m.texto")} order by m.ts desc limit 1) texto
        from chat ch
       where ch.organizacion_id = $1
         and ${sqlBusqueda("$2", ["ch.id::text", "ch.nombre", { num: "ch.externo" }, "ch.notas",
           { de: "select 1 from chat_mensaje bm where bm.chat_id = ch.id", campos: ["bm.texto"] },
           { de: "select 1 from chat_caso bk where bk.chat_id = ch.id", campos: ["bk.asunto", "bk.motivo", "bk.resolucion"] },
           deCliente("ch.cliente_id")])}
       order by ch.ultimo_ts desc nulls last
       limit ${TOPE}`),
    // Reclamos y devoluciones: el reclamo, sus mensajes, su pedido y su cliente.
    buscar<Reclamo>(ver.reclamos, `
      select r.id::int, r.fecha, r.tipo, r.motivo, r.estado, cl.nombre cliente, r.pedido_id::int
        from reclamo r left join cliente cl on cl.id = r.cliente_id
       where r.organizacion_id = $1
         and ${sqlBusqueda("$2", ["r.id::text", "r.id_externo", "r.orden_externa", "r.comprador_externo", "r.motivo_id", "r.motivo", "r.resolucion",
           "r.devolucion_id", "r.devolucion_tracking", "r.notas",
           { de: "select 1 from reclamo_mensaje brm where brm.reclamo_id = r.id", campos: ["brm.texto"] },
           { de: "select 1 from pedido bpe where bpe.id = r.pedido_id", campos: ["bpe.id::text", "bpe.id_externo"] },
           deCliente("r.cliente_id")])}
       order by (r.id::text = $3 or lower(r.id_externo) = $3) desc, r.fecha desc nulls last
       limit ${TOPE}`),
    // Envíos: tracking, transportista, receptor y la dirección de entrega.
    buscar<Envio>(ver.envios, `
      select e.id::int, e.pedido_id::int, e.tracking, e.transportista, e.receptor, e.estado,
             concat_ws(', ', e.direccion ->> 'linea', e.direccion ->> 'localidad', e.direccion ->> 'provincia') destino
        from envio e
       where e.organizacion_id = $1
         and ${sqlBusqueda("$2", ["e.id::text", "e.id_externo", "e.tracking", "e.transportista", "e.receptor", "e.metodo", "e.logistica", hojasJson("e.direccion"),
           { de: "select 1 from pedido bpe where bpe.id = e.pedido_id", campos: ["bpe.id::text", "bpe.id_externo"] }])}
       order by (lower(e.tracking) = $3 or lower(e.id_externo) = $3) desc, e.creado_ts desc
       limit ${TOPE}`),
    // Facturas emitidas (y notas de crédito): número, receptor, CAE, observaciones y sus líneas.
    buscar<Comprobante>(ver.facturacion, `
      select c.id::int, c.fecha, c.tipo_cbte::int, c.punto_venta::int, c.numero::int, c.receptor_nombre, c.doc_nro, c.estado, c.importe_total::float
        from comprobante c
       where c.organizacion_id = $1
         and ${sqlBusqueda("$2", ["c.id::text", "lpad(c.punto_venta::text, 5, '0') || '-' || lpad(c.numero::text, 8, '0')", "c.numero::text",
           { num: "c.doc_nro" }, "c.receptor_nombre", "c.receptor_domicilio", "c.cae", "c.observaciones", "c.ml_documento_id",
           { de: "select 1 from comprobante_linea bl where bl.comprobante_id = c.id", campos: ["bl.descripcion"] },
           { de: "select 1 from pedido bpe where bpe.id = c.pedido_id", campos: ["bpe.id::text", "bpe.id_externo"] },
           deCliente("c.cliente_id")])}
       order by c.fecha desc nulls last, c.id desc
       limit ${TOPE}`),
    // Facturas de compra: número, CAE, notas, sus líneas y el proveedor.
    buscar<FacturaCompra>(ver.compras, `
      select f.id::int, f.fecha, f.proveedor_id::int, pr.nombre proveedor, f.estado, f.total::float, f.moneda,
             (case when f.es_nota_credito then 'NC ' when f.es_nota_debito then 'ND ' else '' end) || f.letra || ' '
               || coalesce(lpad(f.punto_venta::text, 5, '0') || '-', '') || coalesce(lpad(f.numero::text, 8, '0'), 's/n') comprobante
        from factura_compra f left join proveedor pr on pr.id = f.proveedor_id
       where f.organizacion_id = $1
         and ${sqlBusqueda("$2", ["f.id::text", "lpad(f.punto_venta::text, 5, '0') || '-' || lpad(f.numero::text, 8, '0')", "f.numero::text", "f.cae", "f.notas",
           { de: "select 1 from factura_compra_linea bl where bl.factura_id = f.id", campos: ["bl.descripcion"] },
           deProveedor("f.proveedor_id")])}
       order by f.fecha desc nulls last, f.id desc
       limit ${TOPE}`),
    // Despachos de importación: número, notas, sus líneas (descripción, NCM) y el proveedor.
    buscar<Despacho>(ver.despachos, `
      select d.id::int, d.fecha, d.numero, pr.nombre proveedor, d.estado
        from despacho_importacion d left join proveedor pr on pr.id = d.proveedor_id
       where d.organizacion_id = $1
         and ${sqlBusqueda("$2", ["d.id::text", "d.numero", "d.notas",
           { de: "select 1 from despacho_linea bl where bl.despacho_id = d.id", campos: ["bl.descripcion", "bl.ncm"] },
           deProveedor("d.proveedor_id")])}
       order by d.fecha desc nulls last, d.id desc
       limit ${TOPE}`),
    // Recepciones de mercadería y devoluciones: documento, nota, proveedor, pedido.
    buscar<Recepcion>(ver.recepciones, `
      select r.id::int, r.creado_ts, r.tipo, r.documento, pr.nombre proveedor, r.estado
        from recepcion r left join proveedor pr on pr.id = r.proveedor_id
       where r.organizacion_id = $1
         and ${sqlBusqueda("$2", ["r.id::text", "r.documento", "r.nota", "r.venta_externa", deProveedor("r.proveedor_id"),
           { de: "select 1 from pedido bpe where bpe.id = r.pedido_id", campos: ["bpe.id::text", "bpe.id_externo"] }])}
       order by r.creado_ts desc
       limit ${TOPE}`),
    // Movimientos de cuenta corriente (de clientes y proveedores): descripción y a quién.
    buscar<MovCc>(ver.cc, `
      select m.id::int, m.fecha, m.tercero_tipo, m.tercero_id::int, ${nombreTercero("m")} tercero, m.descripcion, m.importe::float, m.moneda
        from cc_movimiento m
       where m.organizacion_id = $1
         and ${sqlBusqueda("$2", ["m.id::text", "m.descripcion", ...deTercero("m")])}
       order by m.fecha desc nulls last, m.id desc
       limit ${TOPE}`),
    // Recibos (cobros) y órdenes de pago: número, notas, retenciones y a quién.
    buscar<Recibo>(ver.cc, `
      select r.id::int, r.fecha, r.tipo, r.numero::int, r.tercero_tipo, r.tercero_id::int, ${nombreTercero("r")} tercero, r.total::float, r.moneda, r.estado
        from recibo r
       where r.organizacion_id = $1
         and ${sqlBusqueda("$2", ["r.numero::text", "r.notas", hojasJson("r.retenciones"), ...deTercero("r")])}
       order by r.fecha desc nulls last, r.id desc
       limit ${TOPE}`),
    // Tesorería: movimientos de fondos (concepto) y la línea del extracto bancario con que se concilió.
    buscar<MovFondos>(ver.tesoreria, `
      select m.id::int, m.fecha, m.cuenta_id::int, cf.nombre cuenta, m.concepto, m.importe::float
        from movimiento_fondos m join cuenta_fondos cf on cf.id = m.cuenta_id
       where m.organizacion_id = $1
         and ${sqlBusqueda("$2", ["m.id::text", "m.concepto",
           { de: "select 1 from extracto_linea bx where bx.id = m.extracto_linea_id", campos: ["bx.descripcion", "bx.referencia"] }])}
       order by m.fecha desc nulls last, m.id desc
       limit ${TOPE}`),
    // Sin la caja tildada: cuántos productos inactivos coinciden, para avisarlo.
    ver.productos && !inactivos && q ? consulta<{ n: number }>(`
      select count(*)::int n from producto p
       where p.organizacion_id = $1 and p.estado = 'archivado' and ${sqlBusqueda("$2", CAMPOS_PRODUCTO)}`, base.slice(0, 2)).then((r) => r[0]?.n ?? 0) : Promise.resolve(0),
  ]);
  const otros = [itemsMl, pedidos, clientes, proveedores, preguntas, convMl, chats, reclamos, envios, comprobantes, facturasCompra, despachos, recepciones, movCc, recibos, movFondos];
  // Si lo único que coincide es inactivo, se muestra igual aunque la caja no esté tildada (Fer, 6/10).
  // Con cualquier cosa activa encontrada, los inactivos siguen escondidos salvo con la caja.
  const soloInactivos = !!q && !inactivos && inactivosOcultos > 0
    && !productos0.length && !publicaciones0.length && otros.every((x) => !x.length);
  const [productos, publicaciones] = soloInactivos
    ? await Promise.all([buscarProductos(true), buscarPublicaciones(true)])
    : [productos0, publicaciones0];
  const nada = q && !productos.length && !publicaciones.length && otros.every((x) => !x.length);

  return (
    <Pantalla titulo="Buscar" subtitulo="En todos los datos: productos, publicaciones, pedidos, clientes, proveedores, preguntas, mensajes, reclamos, envíos, facturas y más" ancho="max-w-6xl">
      <form className="flex flex-wrap items-center gap-2 mb-4">
        <input name="q" defaultValue={q} autoFocus placeholder="Cualquier dato: SKU, título, MLA, pedido, cliente, CUIT, teléfono, domicilio, mensaje…" className={`${CAMPO} flex-1`} />
        <input type="hidden" name="ci" value="1" />
        <MostrarInactivos activo={inactivos} ayuda="Sin tildar, los inactivos aparecen sólo cuando lo único que coincide es inactivo. Tildada, aparecen siempre. Queda como la dejes." />
        <button className={PRIMARIO}>Buscar</button>
      </form>
      <p className="-mt-2 mb-4 text-[11px] text-[#5C6B76]">
        {AYUDA_BUSQUEDA} Los <b>inactivos</b> salen sólo si es lo único que coincide, salvo que tildes “Mostrar inactivos”: ahí salen siempre.
      </p>
      {!q && <p className="text-xs text-[#5C6B76]">Escribí qué buscar.</p>}
      {nada && <p className="text-xs text-[#5C6B76]">No se encontró nada con “{q}”.</p>}
      {soloInactivos && <p className="text-xs text-[#5C6B76] mb-3">No hay nada activo con “{q}”: se muestran los inactivos que coinciden.</p>}
      {inactivosOcultos > 0 && !soloInactivos && (
        <p className="text-xs text-[#5C6B76] mb-3">
          {inactivosOcultos === 1 ? "Hay 1 producto inactivo" : `Hay ${inactivosOcultos} productos inactivos`} que coincide{inactivosOcultos === 1 ? "" : "n"}: tildá “Mostrar inactivos” para verlo{inactivosOcultos === 1 ? "" : "s"}.
        </p>
      )}

      <Seccion titulo="Productos" filas={productos} clave={(r) => r.id} columnas={[
        { t: "SKU", c: (r) => <span className="inline-flex items-center gap-2 font-mono whitespace-nowrap"><FotosProducto fotos={r.fotos} titulo={r.titulo} tamano={48} /><Link href={`/catalogo/productos/${r.id}`} className={ENLACE}>{r.sku_base}</Link></span> },
        { t: "Título", c: (r) => <Link href={`/catalogo/productos/${r.id}`} className={`font-semibold ${ENLACE}`}>{r.titulo}</Link> },
        { t: "Marca", c: (r) => r.marca ?? "—" },
        { t: "Variación encontrada", c: (r) => <span className="font-mono">{r.donde ?? ""}</span> },
        { t: "Estado", c: (r) => <Estado texto={r.estado === "activo" ? "Activo" : r.estado === "pausado" ? "Pausado" : "Inactivo"} tono={r.estado === "activo" ? "verde" : "gris"} /> },
      ]} />

      <Seccion titulo="Publicaciones" filas={publicaciones} clave={(r) => r.id} columnas={[
        { t: "Código", c: (r) => <span className="font-mono whitespace-nowrap">{r.id_externo ?? "—"}</span> },
        { t: "Título", c: (r) => <Link href={`/catalogo/productos/${r.producto_id}`} className={`font-semibold ${ENLACE}`}>{r.titulo}</Link> },
        { t: "Canal", c: (r) => r.canal },
        { t: "SKU", c: (r) => <Link href={`/catalogo/productos/${r.producto_id}`} className={`font-mono ${ENLACE}`}>{r.sku}</Link> },
        { t: "Estado", c: (r) => <Estado texto={r.estado === "activa" ? "Activa" : r.estado === "pausada" ? "Pausada" : "Cerrada"} tono={r.estado === "activa" ? "verde" : "gris"} /> },
      ]} />

      <Seccion titulo="En Mercado Libre, sin vincular" filas={itemsMl} clave={(r) => `${r.canal_id}-${r.item_id}-${r.variation_id}`} columnas={[
        { t: "Código", c: (r) => <Link href={url("/catalogo/publicaciones/ml", { canal: r.canal_id, f: "sin", q: r.item_id, contiene: "1" })} className={`font-mono whitespace-nowrap ${ENLACE}`}>{r.item_id}</Link> },
        { t: "Título", c: (r) => r.titulo ?? "—" },
        { t: "Cuenta", c: (r) => r.canal },
        { t: "SKU", c: (r) => <span className="font-mono">{r.sku ?? "—"}</span> },
        { t: "Estado", c: (r) => <Estado texto={r.estado === "active" ? "Activa" : r.estado === "paused" ? "Pausada" : legible(r.estado)} tono={r.estado === "active" ? "verde" : "gris"} /> },
      ]} />

      <Seccion titulo="Pedidos" filas={pedidos} clave={(r) => r.id} columnas={[
        { t: "Nº", n: true, c: (r) => <Link href={`/ventas/pedidos/${r.id}`} className={`font-semibold ${ENLACE}`}>{r.id}</Link> },
        { t: "Fecha", n: true, c: (r) => fecha(r.fecha) },
        { t: "Canal", c: (r) => r.canal },
        { t: "Id externo", c: (r) => <span className="font-mono">{r.id_externo ?? "—"}</span> },
        { t: "Cliente", c: (r) => r.cliente_id ? <Link href={`/ventas/clientes/${r.cliente_id}`} className={ENLACE}>{r.cliente}</Link> : "—" },
        { t: "Estado", c: (r) => <Estado texto={etiqueta(ESTADOS_PEDIDO, r.estado)} tono={TONO_ESTADO[r.estado] ?? "gris"} /> },
        { t: "Total", n: true, c: (r) => enVista({ ars: r.total_ars, usd: r.total_usd }, s.moneda) },
      ]} />

      <Seccion titulo="Clientes" filas={clientes} clave={(r) => r.id} columnas={[
        { t: "N.º", n: true, c: (r) => <Link href={`/ventas/clientes/${r.id}`} className={ENLACE}>{r.id}</Link> },
        { t: "Nombre", c: (r) => <><Link href={`/ventas/clientes/${r.id}`} className={`font-semibold ${ENLACE}`}>{r.nombre}</Link>{r.razon_social && r.razon_social !== r.nombre && <span className="block text-[11px] text-[#5C6B76]">{r.razon_social}</span>}</> },
        { t: "Documento", c: (r) => <span className="whitespace-nowrap">{[r.cuit ? `CUIT ${cuitLegible(r.cuit)}` : null, r.documento_numero ? `${r.documento_tipo ?? ""} ${r.documento_numero}`.trim() : null].filter(Boolean).join(" · ") || "—"}</span> },
        { t: "Mail", c: (r) => r.email ?? "—" },
        { t: "Teléfono", c: (r) => telefonos(r.telefonos) },
        { t: "Localidad", c: (r) => r.localidad ?? "—" },
      ]} />

      <Seccion titulo="Proveedores" filas={proveedores} clave={(r) => r.id} columnas={[
        { t: "N.º", n: true, c: (r) => <Link href={url("/compras/proveedores", { id: r.id })} className={ENLACE}>{r.id}</Link> },
        { t: "Nombre", c: (r) => <Link href={url("/compras/proveedores", { id: r.id })} className={`font-semibold ${ENLACE}`}>{r.nombre}</Link> },
        { t: "Razón social", c: (r) => r.razon_social ?? "—" },
        { t: "CUIT", c: (r) => <span className="whitespace-nowrap">{r.cuit ? cuitLegible(r.cuit) : "—"}</span> },
        { t: "Mail", c: (r) => r.email ?? "—" },
        { t: "Teléfono", c: (r) => telefonos(r.telefonos) },
        { t: "Localidad", c: (r) => r.localidad ?? "—" },
      ]} />

      <Seccion titulo="Preguntas de Mercado Libre" filas={preguntas} clave={(r) => r.id} columnas={[
        { t: "Fecha", n: true, c: (r) => fechaHora(r.fecha) },
        { t: "Publicación", c: (r) => <span><span className="font-mono">{r.item_id ?? ""}</span>{r.publicacion && <span className="block text-[11px] text-[#5C6B76]">{corto(r.publicacion, 70)}</span>}</span> },
        { t: "Pregunta", c: (r) => <Link href={url("/ventas/preguntas", { ver: r.estado === "ANSWERED" ? "respondidas" : null })} className={ENLACE}>{corto(r.texto)}</Link> },
        { t: "Respuesta", c: (r) => corto(r.respuesta) },
        { t: "Estado", c: (r) => <Estado texto={r.estado === "ANSWERED" ? "Respondida" : r.estado === "UNANSWERED" ? "Sin responder" : legible(r.estado?.toLowerCase())} tono={r.estado === "UNANSWERED" ? "amarillo" : "gris"} /> },
      ]} />

      <Seccion titulo="Mensajes de Mercado Libre" filas={convMl} clave={(r) => r.pack_id} columnas={[
        { t: "Último", n: true, c: (r) => fechaHora(r.ultimo_ts) },
        { t: "Conversación", c: (r) => <Link href={url("/ventas/preguntas", { ver: "mensajes", pack: r.pack_id })} className={`font-semibold ${ENLACE}`}>{r.cliente ?? `Pack ${r.pack_id}`}</Link> },
        { t: "Cuenta", c: (r) => r.canal ?? "—" },
        { t: "Pedido", n: true, c: (r) => r.pedido_id ? <Link href={`/ventas/pedidos/${r.pedido_id}`} className={ENLACE}>{r.pedido_id}</Link> : "—" },
        { t: "Mensaje", c: (r) => corto(r.texto) },
      ]} />

      <Seccion titulo="WhatsApp" filas={chats} clave={(r) => r.id} columnas={[
        { t: "Último", n: true, c: (r) => fechaHora(r.ultimo_ts) },
        { t: "Chat", c: (r) => <Link href={url("/ventas/mensajes", { con: r.id })} className={`font-semibold ${ENLACE}`}>{r.nombre ?? r.externo ?? `Chat ${r.id}`}</Link> },
        { t: "Teléfono", c: (r) => <span className="whitespace-nowrap">{r.externo ?? "—"}</span> },
        { t: "Mensaje", c: (r) => corto(r.texto) },
      ]} />

      <Seccion titulo="Reclamos y devoluciones" filas={reclamos} clave={(r) => r.id} columnas={[
        { t: "Nº", n: true, c: (r) => <Link href={`/ventas/reclamos/${r.id}`} className={`font-semibold ${ENLACE}`}>{r.id}</Link> },
        { t: "Fecha", n: true, c: (r) => fecha(r.fecha) },
        { t: "Tipo", c: (r) => legible(r.tipo) },
        { t: "Motivo", c: (r) => corto(r.motivo, 80) },
        { t: "Cliente", c: (r) => r.cliente ?? "—" },
        { t: "Pedido", n: true, c: (r) => r.pedido_id ? <Link href={`/ventas/pedidos/${r.pedido_id}`} className={ENLACE}>{r.pedido_id}</Link> : "—" },
        { t: "Estado", c: (r) => <Estado texto={legible(r.estado)} tono={r.estado === "resuelto" ? "verde" : "amarillo"} /> },
      ]} />

      <Seccion titulo="Envíos" filas={envios} clave={(r) => r.id} columnas={[
        { t: "Pedido", n: true, c: (r) => r.pedido_id ? <Link href={`/ventas/pedidos/${r.pedido_id}`} className={`font-semibold ${ENLACE}`}>{r.pedido_id}</Link> : "—" },
        { t: "Tracking", c: (r) => <Link href={url("/ventas/envios", { q: r.tracking ?? String(r.pedido_id ?? "") })} className={`font-mono ${ENLACE}`}>{r.tracking ?? "—"}</Link> },
        { t: "Transportista", c: (r) => r.transportista ?? "—" },
        { t: "Recibe", c: (r) => r.receptor ?? "—" },
        { t: "Destino", c: (r) => r.destino || "—" },
        { t: "Estado", c: (r) => legible(r.estado) },
      ]} />

      <Seccion titulo="Facturas emitidas" filas={comprobantes} clave={(r) => r.id} columnas={[
        { t: "Fecha", n: true, c: (r) => fecha(r.fecha) },
        { t: "Comprobante", c: (r) => <Link href={`/administracion/facturacion/${r.id}`} className={`font-semibold whitespace-nowrap ${ENLACE}`}>{TIPOS_CBTE[r.tipo_cbte]?.nombre ?? "Comprobante"} {nroCbte(r.punto_venta, r.numero)}</Link> },
        { t: "Receptor", c: (r) => r.receptor_nombre ?? "—" },
        { t: "Documento", c: (r) => <span className="whitespace-nowrap">{r.doc_nro ? (r.doc_nro.length === 11 ? cuitLegible(r.doc_nro) : r.doc_nro) : "—"}</span> },
        { t: "Estado", c: (r) => legible(r.estado) },
        { t: "Total", n: true, c: (r) => pesos(r.importe_total) },
      ]} />

      <Seccion titulo="Facturas de compra" filas={facturasCompra} clave={(r) => r.id} columnas={[
        { t: "Fecha", n: true, c: (r) => fecha(r.fecha) },
        { t: "Comprobante", c: (r) => <Link href={`/compras/facturas/${r.id}`} className={`font-semibold whitespace-nowrap ${ENLACE}`}>{r.comprobante}</Link> },
        { t: "Proveedor", c: (r) => r.proveedor ? <Link href={url("/compras/proveedores", { id: r.proveedor_id })} className={ENLACE}>{r.proveedor}</Link> : "—" },
        { t: "Estado", c: (r) => legible(r.estado) },
        { t: "Total", n: true, c: (r) => pesos(r.total, r.moneda) },
      ]} />

      <Seccion titulo="Despachos de importación" filas={despachos} clave={(r) => r.id} columnas={[
        { t: "Fecha", n: true, c: (r) => fecha(r.fecha) },
        { t: "Despacho", c: (r) => <Link href={`/compras/despachos/${r.id}`} className={`font-semibold font-mono ${ENLACE}`}>{r.numero ?? `#${r.id}`}</Link> },
        { t: "Proveedor", c: (r) => r.proveedor ?? "—" },
        { t: "Estado", c: (r) => legible(r.estado) },
      ]} />

      <Seccion titulo="Recepciones" filas={recepciones} clave={(r) => r.id} columnas={[
        { t: "Nº", n: true, c: (r) => <Link href={`/deposito/recepcion/${r.id}`} className={`font-semibold ${ENLACE}`}>{r.id}</Link> },
        { t: "Fecha", n: true, c: (r) => fecha(r.creado_ts) },
        { t: "Tipo", c: (r) => legible(r.tipo) },
        { t: "Documento", c: (r) => r.documento ?? "—" },
        { t: "Proveedor", c: (r) => r.proveedor ?? "—" },
        { t: "Estado", c: (r) => legible(r.estado) },
      ]} />

      <Seccion titulo="Movimientos de cuenta corriente" filas={movCc} clave={(r) => r.id} columnas={[
        { t: "Fecha", n: true, c: (r) => fecha(r.fecha) },
        { t: "De", c: (r) => <Link href={enlaceCc(r.tercero_tipo, r.tercero_id)} className={`font-semibold ${ENLACE}`}>{r.tercero ?? "—"}</Link> },
        { t: "Es", c: (r) => (r.tercero_tipo === "cliente" ? "Cliente" : "Proveedor") },
        { t: "Descripción", c: (r) => corto(r.descripcion) },
        { t: "Importe", n: true, c: (r) => pesos(r.importe, r.moneda) },
      ]} />

      <Seccion titulo="Recibos y órdenes de pago" filas={recibos} clave={(r) => r.id} columnas={[
        { t: "Fecha", n: true, c: (r) => fecha(r.fecha) },
        { t: "Comprobante", c: (r) => <Link href={enlaceCc(r.tercero_tipo, r.tercero_id)} className={`font-semibold whitespace-nowrap ${ENLACE}`}>{r.tipo === "cobro" ? "Recibo" : "Orden de pago"} {r.numero}</Link> },
        { t: "De", c: (r) => r.tercero ?? "—" },
        { t: "Estado", c: (r) => legible(r.estado) },
        { t: "Total", n: true, c: (r) => pesos(r.total, r.moneda) },
      ]} />

      <Seccion titulo="Tesorería" filas={movFondos} clave={(r) => r.id} columnas={[
        { t: "Fecha", n: true, c: (r) => fecha(r.fecha) },
        { t: "Cuenta", c: (r) => <Link href={`/administracion/tesoreria/${r.cuenta_id}`} className={`font-semibold ${ENLACE}`}>{r.cuenta}</Link> },
        { t: "Concepto", c: (r) => corto(r.concepto) },
        { t: "Importe", n: true, c: (r) => pesos(r.importe) },
      ]} />
    </Pantalla>
  );
}
