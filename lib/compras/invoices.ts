// Invoices de compra: historial (pedido de Fer, 12/10). Se suben los Excel de los proveedores del exterior y quedan
// como registro de qué se compró, cuándo, cuánto y a qué precio, sólo para estadística: no mueven stock ni costos.
// Tablas en db/compras.sql; la lectura del Excel, en invoice-leer.ts (sin base).
//
//   · Entra «a revisar» y cuenta recién cuando se confirma.
//   · Llegada estimada = fecha del invoice + demora de la vía (avión o barco, configurable).
//   · Proveedor preferido del producto = el del invoice confirmado más reciente (se puede cambiar a mano en la ficha).
//   · Si el invoice es el de una compra por courier ya cargada, se vincula y esa compra no se cuenta dos veces.
//   · Cuánto duró cada compra (historialProducto): las ventas desde la primera llegada se van comiendo las compras en
//     orden (la primera que entró es la primera que se vende); una compra se agotó el día que lo vendido alcanza la suma
//     de ella y las anteriores. El stock que había antes de la primera compra registrada no se conoce.

import type ExcelJS from "exceljs";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { abrirLibro, valorCelda } from "@/lib/importar/leer";
import { leerInvoice, type Celda, type InvoiceLeido } from "@/lib/compras/invoice-leer";

export type ConfigInvoices = { demoraAvion: number; demoraBarco: number };
export const CONFIG_INVOICES: ConfigInvoices = { demoraAvion: 15, demoraBarco: 60 };
/** «2025-10-05» → «05/10/2025». */
export const diaAr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export const VIAS = { avion: "Avión", barco: "Barco" } as const;
export type Via = keyof typeof VIAS;

export async function configInvoices(org: string): Promise<ConfigInvoices> {
  const f = await una<{ valor: Partial<ConfigInvoices> }>("select valor from config_org where organizacion_id = $1 and clave = 'invoices'", [org]).catch(() => null);
  return { ...CONFIG_INVOICES, ...(f?.valor ?? {}) };
}

export async function guardarConfigInvoices(org: string, c: ConfigInvoices): Promise<void> {
  for (const [k, v] of Object.entries(c)) {
    if (!Number.isInteger(v) || v < 0 || v > 365) throw new ErrorErp(`La demora ${k === "demoraAvion" ? "por avión" : "por barco"} tiene que ser un número de días entre 0 y 365.`);
  }
  await consulta(`insert into config_org (organizacion_id, clave, valor) values ($1, 'invoices', $2::jsonb)
                  on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`, [org, JSON.stringify(c)]);
}

/** Las filas de una hoja como matriz (las fechas de Excel quedan «2025-10-05»). */
function matriz(hoja: ExcelJS.Worksheet): Celda[][] {
  const filas: Celda[][] = [];
  const ancho = Math.min(hoja.actualColumnCount || hoja.columnCount, 60);
  for (let i = 1; i <= Math.min(hoja.rowCount, 3000); i++) {
    const fila = hoja.getRow(i);
    const celdas: Celda[] = [];
    for (let j = 1; j <= ancho; j++) celdas.push(valorCelda(fila.getCell(j).value));
    filas.push(celdas);
  }
  return filas;
}

/** Lee el Excel: la primera hoja que tenga tabla de productos. */
export async function leerArchivoInvoice(contenido: ArrayBuffer): Promise<{ hoja: string; leido: InvoiceLeido }> {
  const libro = await abrirLibro(contenido);
  let primero: { hoja: string; leido: InvoiceLeido } | null = null;
  for (const h of libro.worksheets) {
    const leido = leerInvoice(matriz(h));
    if (leido.renglones.length) return { hoja: h.name, leido };
    primero ??= { hoja: h.name, leido };
  }
  return primero!;
}

/** Busca la variación de cada renglón por su SKU (sin importar mayúsculas ni espacios). */
async function emparejar(c: { query: (s: string, v: unknown[]) => Promise<unknown> }, org: string, invoiceId: number) {
  await c.query(`
    update compra_invoice_linea l set variacion_id = (
      select va.id from variacion va join producto p on p.id = va.producto_id
       where va.organizacion_id = $1 and upper(replace(va.sku, ' ', '')) = upper(replace(l.sku, ' ', ''))
       order by va.es_default desc, va.id limit 1)
     where l.invoice_id = $2 and l.organizacion_id = $1`, [org, invoiceId]);
}

export async function crearInvoice(org: string, a: { archivo: string; ruta: string; proveedorId: number | null; usuarioId: string; hoja: string | null; leido: InvoiceLeido; pdf?: boolean }): Promise<number> {
  const { leido } = a;
  if (!leido.renglones.length && !a.pdf) throw new ErrorErp(`«${a.archivo}»: ${leido.avisos[0] ?? "no tiene renglones con SKU y cantidad."}`);
  // El mismo invoice dos veces: mismo número del mismo proveedor, o misma fecha con los mismos renglones.
  const huella = leido.renglones.map((r) => `${r.sku.toUpperCase()}:${r.cantidad}`).sort().join("|");
  const ya = await una<{ id: number; archivo: string }>(`
    select i.id::int, i.archivo from compra_invoice i
     where i.organizacion_id = $1 and i.proveedor_id is not distinct from $2
       and (($3::text is not null and upper(i.numero) = upper($3))
            or (i.fecha is not distinct from $4::date and (select string_agg(upper(l.sku) || ':' || (l.cantidad::float8)::text, '|' order by upper(l.sku) || ':' || (l.cantidad::float8)::text)
                                                              from compra_invoice_linea l where l.invoice_id = i.id) = $5))
     limit 1`, [org, a.proveedorId, leido.numero, leido.fecha, huella]);
  if (ya && !a.pdf) throw new ErrorErp(`«${a.archivo}» ya está cargado (invoice «${ya.archivo}»).`);
  if (a.pdf && (await una("select 1 from compra_invoice where organizacion_id = $1 and archivo = $2", [org, a.archivo.slice(0, 200)]))) throw new ErrorErp(`«${a.archivo}» ya está cargado.`);
  return enTransaccion(async (c) => {
    const r = await c.query<{ id: number }>(`
      insert into compra_invoice (organizacion_id, proveedor_id, archivo, ruta_storage, hoja, numero, fecha, fecha_texto, fecha_dudosa, avisos, usuario_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11) returning id::int`,
      [org, a.proveedorId, a.archivo.slice(0, 200), a.ruta, a.hoja, leido.numero, leido.fecha, leido.fechaTexto?.slice(0, 100) ?? null, leido.fechaDudosa, JSON.stringify(leido.avisos), a.usuarioId]);
    const id = r.rows[0].id;
    await c.query(`
      insert into compra_invoice_linea (organizacion_id, invoice_id, fila, sku, descripcion, cantidad, precio_usd)
      select $1, $2, x.fila, x.sku, x.descripcion, x.cantidad, x.precio from jsonb_to_recordset($3::jsonb) x(fila int, sku text, descripcion text, cantidad numeric, precio numeric)`,
      [org, id, JSON.stringify(leido.renglones)]);
    await emparejar(c, org, id);
    return id;
  });
}

export type FilaInvoice = {
  id: number; archivo: string; numero: string | null; fecha: string | null; fecha_dudosa: boolean; via: Via; estado: "revisar" | "confirmado"; ignorar_precio: boolean;
  proveedor_id: number | null; proveedor: string | null; compra_courier: string | null; renglones: number; unidades: number; total_usd: number | null; sin_producto: number;
  creado_ts: Date;
};

const CAMPOS_LISTA = `
  i.id::int, i.archivo, i.numero, i.fecha::text fecha, i.fecha_dudosa, i.via, i.estado, i.ignorar_precio, i.proveedor_id::int, pr.nombre proveedor, cc.nombre compra_courier, i.creado_ts,
  (select count(*) from compra_invoice_linea l where l.invoice_id = i.id)::int renglones,
  (select coalesce(sum(l.cantidad), 0) from compra_invoice_linea l where l.invoice_id = i.id)::float8 unidades,
  (select case when i.ignorar_precio then null else coalesce(sum(l.cantidad * l.precio_usd), 0) end from compra_invoice_linea l where l.invoice_id = i.id)::float8 total_usd,
  (select count(*) from compra_invoice_linea l where l.invoice_id = i.id and l.variacion_id is null)::int sin_producto`;

export const ORDEN_INVOICES = { fecha: "fecha", archivo: "lower(archivo)", numero: "numero", proveedor: "lower(proveedor)", estado: "estado", total: "total_usd", unidades: "unidades", renglones: "renglones" } as const;

export async function listaInvoices(org: string, orden: string): Promise<FilaInvoice[]> {
  return consulta<FilaInvoice>(`
    select * from (select ${CAMPOS_LISTA}
      from compra_invoice i left join proveedor pr on pr.id = i.proveedor_id left join compra_courier cc on cc.id = i.compra_courier_id
     where i.organizacion_id = $1) i
     order by ${orden}`, [org]);
}

export type LineaInvoice = {
  id: number; fila: number | null; sku: string; descripcion: string | null; cantidad: number; precio_usd: number | null;
  variacion_id: number | null; producto_id: number | null; sku_sistema: string | null; titulo: string | null; fotos: string[] | null;
};

export async function invoice(org: string, id: number): Promise<{ cabecera: FilaInvoice & { notas: string | null; avisos: string[]; fecha_texto: string | null; compra_courier_id: number | null; hoja: string | null }; lineas: LineaInvoice[] } | null> {
  const cabecera = await una<FilaInvoice & { notas: string | null; avisos: string[]; fecha_texto: string | null; compra_courier_id: number | null; hoja: string | null }>(`
    select ${CAMPOS_LISTA}, i.notas, i.avisos, i.fecha_texto, i.compra_courier_id::int, i.hoja
      from compra_invoice i left join proveedor pr on pr.id = i.proveedor_id left join compra_courier cc on cc.id = i.compra_courier_id
     where i.organizacion_id = $1 and i.id = $2`, [org, id]);
  if (!cabecera) return null;
  const lineas = await consulta<LineaInvoice>(`
    select l.id::int, l.fila, l.sku, l.descripcion, l.cantidad::float8, l.precio_usd::float8, l.variacion_id::int, va.producto_id::int, va.sku sku_sistema, p.titulo,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = p.id) fotos
      from compra_invoice_linea l left join variacion va on va.id = l.variacion_id left join producto p on p.id = va.producto_id
     where l.organizacion_id = $1 and l.invoice_id = $2
     order by l.variacion_id is not null, l.fila, l.id`, [org, id]);
  return { cabecera, lineas };
}

/** Pone como preferido, en los productos de esos invoices, el proveedor del invoice confirmado más reciente de cada uno. */
async function actualizarPreferidos(org: string, invoiceId: number) {
  await consulta(`
    with prods as (select distinct va.producto_id from compra_invoice_linea l join variacion va on va.id = l.variacion_id where l.invoice_id = $2 and l.organizacion_id = $1),
    ultimo as (
      select distinct on (va.producto_id) va.producto_id, i.proveedor_id
        from compra_invoice_linea l join compra_invoice i on i.id = l.invoice_id join variacion va on va.id = l.variacion_id
       where i.organizacion_id = $1 and i.estado = 'confirmado' and i.proveedor_id is not null and va.producto_id in (select producto_id from prods)
       order by va.producto_id, i.fecha desc nulls last, i.id desc)
    update producto p set proveedor_id = u.proveedor_id from ultimo u
     where p.id = u.producto_id and p.organizacion_id = $1 and p.proveedor_id is distinct from u.proveedor_id`, [org, invoiceId]);
}

export async function guardarCabecera(org: string, id: number, c: { fecha: string | null; via: string; numero: string | null; proveedorId: number | null; compraCourierId: number | null; notas: string | null; ignorarPrecio: boolean }) {
  if (!(c.via in VIAS)) throw new ErrorErp("Elegí si vino por avión o por barco.");
  if (c.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) throw new ErrorErp("La fecha no es válida.");
  if (c.proveedorId && !(await una("select 1 from proveedor where id = $1 and organizacion_id = $2", [c.proveedorId, org]))) throw new ErrorErp("Ese proveedor no existe.");
  if (c.compraCourierId && !(await una("select 1 from compra_courier where id = $1 and organizacion_id = $2", [c.compraCourierId, org]))) throw new ErrorErp("Esa compra por courier no existe.");
  await consulta(`update compra_invoice set fecha = $3, fecha_dudosa = fecha_dudosa and fecha is not distinct from $3::date, via = $4, numero = $5, proveedor_id = $6, compra_courier_id = $7, notas = $8, ignorar_precio = $9
                   where id = $2 and organizacion_id = $1`, [org, id, c.fecha, c.via, c.numero, c.proveedorId, c.compraCourierId, c.notas, c.ignorarPrecio]);
  const i = await una<{ estado: string }>("select estado from compra_invoice where id = $1", [id]);
  if (i?.estado === "confirmado") await actualizarPreferidos(org, id);
}

export async function guardarLinea(org: string, lineaId: number, l: { sku: string; cantidad: number; precio: number | null }) {
  if (!l.sku.trim()) throw new ErrorErp("El renglón necesita un SKU.");
  if (!(l.cantidad > 0)) throw new ErrorErp("La cantidad tiene que ser mayor que cero.");
  const r = await una<{ invoice_id: number }>(`update compra_invoice_linea set sku = $3, cantidad = $4, precio_usd = $5 where id = $2 and organizacion_id = $1 returning invoice_id::int`,
    [org, lineaId, l.sku.trim(), l.cantidad, l.precio]);
  if (!r) throw new ErrorErp("Ese renglón no existe.");
  await enTransaccion((c) => emparejar(c, org, r.invoice_id));
  const i = await una<{ estado: string }>("select estado from compra_invoice where id = $1", [r.invoice_id]);
  if (i?.estado === "confirmado") await actualizarPreferidos(org, r.invoice_id);
  return r.invoice_id;
}

export async function agregarLinea(org: string, invoiceId: number, l: { sku: string; cantidad: number; precio: number | null; descripcion: string | null }) {
  if (!l.sku.trim()) throw new ErrorErp("El renglón necesita un SKU.");
  if (!(l.cantidad > 0)) throw new ErrorErp("La cantidad tiene que ser mayor que cero.");
  if (!(await una("select 1 from compra_invoice where id = $1 and organizacion_id = $2", [invoiceId, org]))) throw new ErrorErp("Ese invoice no existe.");
  await consulta(`insert into compra_invoice_linea (organizacion_id, invoice_id, fila, sku, descripcion, cantidad, precio_usd)
                  values ($1, $2, (select coalesce(max(fila), 0) + 1 from compra_invoice_linea where invoice_id = $2), $3, $4, $5, $6)`,
    [org, invoiceId, l.sku.trim(), l.descripcion, l.cantidad, l.precio]);
  await enTransaccion((c) => emparejar(c, org, invoiceId));
  const i = await una<{ estado: string }>("select estado from compra_invoice where id = $1", [invoiceId]);
  if (i?.estado === "confirmado") await actualizarPreferidos(org, invoiceId);
}

export async function borrarLinea(org: string, lineaId: number) {
  await consulta("delete from compra_invoice_linea where id = $2 and organizacion_id = $1", [org, lineaId]);
}

export async function confirmar(org: string, id: number) {
  const i = await una<{ fecha: string | null }>("select fecha::text from compra_invoice where id = $2 and organizacion_id = $1", [org, id]);
  if (!i) throw new ErrorErp("Ese invoice no existe.");
  if (!i.fecha) throw new ErrorErp("Falta la fecha: cargala con el lápiz antes de confirmar.");
  if (!(await una("select 1 from compra_invoice_linea where invoice_id = $1", [id]))) throw new ErrorErp("No tiene renglones: cargalos antes de confirmar.");
  await consulta("update compra_invoice set estado = 'confirmado', fecha_dudosa = false where id = $2 and organizacion_id = $1", [org, id]);
  await actualizarPreferidos(org, id);
}

export async function volverARevisar(org: string, id: number) {
  await consulta("update compra_invoice set estado = 'revisar' where id = $2 and organizacion_id = $1", [org, id]);
}

export async function borrarInvoice(org: string, id: number) {
  await consulta("delete from compra_invoice where id = $2 and organizacion_id = $1", [org, id]);
}

// ── Historial de compras de un producto (ficha, pestaña Compras) ─────────────

export type CompraHistorial = {
  origen: "invoice" | "courier"; doc_id: number; documento: string; proveedor: string | null; via: string;
  fecha: string; llegada: string; sku: string; cantidad: number; precio_usd: number | null;
  /** Calculado: cuándo se terminó de vender (orden de llegada) y en cuántos días; o cuántas quedan. */
  agotada: string | null; dias: number | null; quedan: number;
};

const SQL_COMPRAS = `
  select 'invoice' origen, i.id::int doc_id, coalesce(i.numero, i.archivo) documento, pr.nombre proveedor, i.via,
         i.fecha::text fecha, (i.fecha + case i.via when 'barco' then $3::int else $4::int end)::text llegada,
         va.sku, l.cantidad::float8, case when i.ignorar_precio then null else l.precio_usd end::float8 precio_usd, va.producto_id::int
    from compra_invoice_linea l join compra_invoice i on i.id = l.invoice_id join variacion va on va.id = l.variacion_id
    left join proveedor pr on pr.id = i.proveedor_id
   where i.organizacion_id = $1 and i.estado = 'confirmado' and i.fecha is not null and va.producto_id = any($2::bigint[])
  union all
  select 'courier', c.id::int, c.nombre, c.proveedor, 'courier', (c.ingreso_ts at time zone 'America/Argentina/Buenos_Aires')::date::text,
         (c.ingreso_ts at time zone 'America/Argentina/Buenos_Aires')::date::text, va.sku, l.cantidad::float8, l.fob_unit_usd::float8, va.producto_id::int
    from compra_courier_linea l join compra_courier c on c.id = l.compra_id join variacion va on va.id = l.variacion_id
   where c.organizacion_id = $1 and c.ingreso_ts is not null and va.producto_id = any($2::bigint[])
     and not exists (select 1 from compra_invoice i where i.compra_courier_id = c.id and i.estado = 'confirmado')`;

const DIA = 86400000;

/** Reparte las ventas entre las compras en orden de llegada (pura; la prueban los tests). `ventas`: [día ISO, unidades], en orden. */
export function duracionCompras<T extends { llegada: string; cantidad: number }>(compras: T[], ventas: [string, number][]): (T & { agotada: string | null; dias: number | null; quedan: number })[] {
  const orden = [...compras].sort((a, b) => a.llegada.localeCompare(b.llegada));
  let acum = 0, v = 0, vendido = 0;
  return orden.map((c) => {
    acum += c.cantidad;
    while (v < ventas.length && vendido < acum) { vendido += ventas[v][1]; v++; }
    if (vendido >= acum && v > 0) {
      const agotada = ventas[v - 1][0];
      const dias = Math.max(0, Math.round((Date.parse(agotada) - Date.parse(c.llegada)) / DIA));
      return { ...c, agotada, dias, quedan: 0 };
    }
    return { ...c, agotada: null, dias: null, quedan: Math.min(c.cantidad, acum - vendido) };
  }).reverse();
}

export async function historialProducto(org: string, productoId: number): Promise<CompraHistorial[]> {
  const cfg = await configInvoices(org);
  const compras = await consulta<Omit<CompraHistorial, "agotada" | "dias" | "quedan"> & { producto_id: number }>(SQL_COMPRAS, [org, [productoId], cfg.demoraBarco, cfg.demoraAvion]);
  if (!compras.length) return [];
  const desde = compras.reduce((m, c) => (c.llegada < m ? c.llegada : m), compras[0].llegada);
  // Ventas del producto (todas sus variaciones, y las de los kits que lo llevan) desde la primera llegada.
  const ventas = await consulta<{ dia: string; uds: number }>(`
    with vs as (select id from variacion where producto_id = $2 and organizacion_id = $1)
    select (e.fecha at time zone 'America/Argentina/Buenos_Aires')::date::text dia,
           sum(case when e.variacion_id in (select id from vs) then e.cantidad else e.cantidad * k.cantidad end)::float8 uds
      from venta_estadistica e
      left join kit_componente k on k.variacion_kit_id = e.variacion_id and k.variacion_componente_id in (select id from vs)
     where e.organizacion_id = $1 and e.fecha >= $3::date and e.estado not in ('cancelled', 'cancelado', 'invalid')
       and (e.variacion_id in (select id from vs) or k.variacion_componente_id is not null)
     group by 1 order by 1`, [org, productoId, desde]);
  return duracionCompras(compras, ventas.map((x) => [x.dia, x.uds])).map(({ producto_id: _p, ...c }) => c);
}

/** Cuántas compras registradas tiene cada producto (invoices confirmados y compras por courier). */
export async function comprasPorProducto(org: string, productoIds: number[]): Promise<Map<number, number>> {
  if (!productoIds.length) return new Map();
  const cfg = await configInvoices(org);
  const r = await consulta<{ producto_id: number; n: number }>(`select producto_id, count(distinct (origen, doc_id))::int n from (${SQL_COMPRAS}) x group by 1`, [org, productoIds, cfg.demoraBarco, cfg.demoraAvion]);
  return new Map(r.map((x) => [x.producto_id, x.n]));
}

/** Los proveedores para elegir (los que tienen productos primero). */
export async function opcionesProveedores(org: string) {
  const r = await consulta<{ id: number; nombre: string; n: number }>(`
    select pr.id::int, pr.nombre, (select count(*) from producto p where p.proveedor_id = pr.id)::int n
      from proveedor pr where pr.organizacion_id = $1 and pr.estado = 'activo'
     order by (select count(*) from producto p where p.proveedor_id = pr.id) desc, lower(pr.nombre)`, [org]);
  return r.map((p) => ({ id: p.id, texto: p.nombre, detalle: p.n ? `(${p.n})` : undefined }));
}

/** Confirma todos los «a revisar» con fecha segura (no dudosa). Devuelve cuántos. */
export async function confirmarListos(org: string): Promise<number> {
  const ids = await consulta<{ id: number }>(`select id::int from compra_invoice where organizacion_id = $1 and estado = 'revisar' and fecha is not null and not fecha_dudosa and exists (select 1 from compra_invoice_linea l where l.invoice_id = compra_invoice.id)`, [org]);
  for (const { id } of ids) await confirmar(org, id);
  return ids.length;
}
