// Nota de crédito de una factura emitida FUERA de Laucen (pedido de Fer 5/10,
// bitácora #341): ventas de antes de Laucen (Virtual Seller) que vuelven. No
// hay pedido ni comprobante acá: la factura se busca en ARCA por tipo, punto
// de venta y número (misma razón social), y la nota de crédito va asociada a
// ella (CbtesAsoc) con `asociado_externo`. Puede ser total o parcial; la suma
// de las notas de crédito vivas nunca pasa el total de la factura.

import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { consultarFactura, type FacturaArca } from "@/lib/arca/wsfe";
import { emisorDe, discriminar, TIPOS_CBTE } from "@/lib/arca/facturar";

/** Cuántas líneas trae el formulario (alcanzan para una devolución de pocos productos). */
export const LINEAS_NC = 6;
export const NC_DE: Record<number, number> = { 1: 3, 6: 8, 11: 13 };
const ALICUOTAS = [0, 2.5, 5, 10.5, 21, 27];
const ALICUOTA_PCT: Record<number, number> = { 3: 0, 9: 2.5, 8: 5, 4: 10.5, 5: 21, 6: 27 };
const r2 = (x: number) => Math.round(x * 100) / 100;

export type FacturaExterna = FacturaArca & {
  emisorId: number; nombre: string;
  /** Lo ya devuelto con notas de crédito vivas (autorizadas, pendientes o con error). */
  devuelto: number;
  /** El cliente de Laucen con ese documento, si hay uno. */
  cliente: { id: number; nombre: string; condicion_iva: string | null } | null;
  /** Las alícuotas en % (21, 10.5…), con su total con IVA: para armar las líneas. */
  porAlicuota: { pct: number; total: number }[];
};

const clave = (emisorId: number, tipo: number, pv: number, nro: number) => [String(emisorId), String(tipo), String(pv), String(nro)];

/** Lo ya devuelto de esa factura con notas de crédito vivas. */
async function devueltoDe(org: string, emisorId: number, tipo: number, pv: number, nro: number): Promise<number> {
  const r = await una<{ t: string | null }>(`
    select sum(importe_total) t from comprobante
     where organizacion_id = $1 and emisor_id = $2::bigint and estado in ('autorizado', 'pendiente', 'error')
       and (asociado_externo ->> 'tipo') = $3 and (asociado_externo ->> 'punto_venta') = $4 and (asociado_externo ->> 'numero') = $5`,
    [org, ...clave(emisorId, tipo, pv, nro)]);
  return Number(r?.t ?? 0);
}

/** Busca la factura en ARCA. Si la emitió Laucen, avisa: esa se anula desde su ficha. */
export async function buscarFacturaExterna(org: string, emisorId: number, tipo: number, pv: number, nro: number): Promise<FacturaExterna> {
  const e = await emisorDe(org, emisorId);
  if (!e) throw new ErrorErp("Elegí la razón social que emitió la factura.");
  if (!NC_DE[tipo]) throw new ErrorErp("Elegí el tipo de factura (A, B o C).");
  if (!Number.isInteger(pv) || pv <= 0 || !Number.isInteger(nro) || nro <= 0) throw new ErrorErp("Poné el punto de venta y el número de la factura.");
  const propia = await una<{ id: number }>(`select id::int from comprobante where organizacion_id = $1 and emisor_id = $2 and ambiente = $3
                                              and tipo_cbte = $4 and punto_venta = $5 and numero = $6 and estado = 'autorizado'`, [org, e.id, e.ambiente, tipo, pv, nro]);
  if (propia) throw new ErrorErp(`Esa factura la emitió Laucen: anulala desde su ficha (comprobante ${propia.id}).`);
  const f = await consultarFactura(e.id, e.ambiente, e.cuit, pv, tipo, nro);
  if (!f || !f.cae || f.total <= 0) {
    throw new ErrorErp(`ARCA no tiene la ${TIPOS_CBTE[tipo].nombre} ${String(pv).padStart(5, "0")}-${String(nro).padStart(8, "0")} de ${e.razon_social}. Revisá el tipo, el punto de venta, el número y la razón social.`);
  }
  const doc = f.docNro.replace(/\D/g, "");
  const cliente = doc && doc !== "0" ? await una<{ id: number; nombre: string; condicion_iva: string | null }>(`
    select id::int, coalesce(razon_social, nombre) nombre, condicion_iva from cliente
     where organizacion_id = $1 and (regexp_replace(coalesce(cuit, ''), '\\D', '', 'g') = $2 or regexp_replace(coalesce(documento_numero, ''), '\\D', '', 'g') = $2)
     order by id limit 1`, [org, doc]) : null;
  const porAlicuota = f.alicuotas.length
    ? f.alicuotas.map((a) => ({ pct: ALICUOTA_PCT[a.id] ?? 21, total: r2(a.base + a.importe) }))
    : [{ pct: tipo === 11 ? 0 : 21, total: f.total }];
  return { ...f, emisorId: e.id, nombre: e.razon_social, devuelto: await devueltoDe(org, e.id, tipo, pv, nro), cliente, porAlicuota };
}

export type LineaNc = { descripcion: string; cantidad: number; precio: number; ivaPct: number };

/** Arma (sin mandar) la nota de crédito de una factura de afuera. */
export async function prepararNotaCreditoExterna(org: string, d: {
  emisorId: number; tipo: number; puntoVenta: number; numero: number; clienteId: number | null; receptorNombre: string | null;
  condicionIva: number | null; lineas: LineaNc[]; usuarioId: string | null;
}): Promise<number> {
  // Se vuelve a leer de ARCA: lo que llega del formulario no se toma como cierto.
  const f = await buscarFacturaExterna(org, d.emisorId, d.tipo, d.puntoVenta, d.numero);
  const e = (await emisorDe(org, d.emisorId))!;
  const tipoNc = NC_DE[d.tipo];
  const conIva = d.tipo !== 11;
  const lineas = d.lineas.filter((l) => l.descripcion.trim() && l.cantidad > 0 && l.precio > 0);
  if (!lineas.length) throw new ErrorErp("Cargá al menos una línea con descripción, cantidad y precio.");
  for (const l of lineas) if (conIva && !ALICUOTAS.includes(l.ivaPct)) throw new ErrorErp(`El IVA de "${l.descripcion}" no es una alícuota válida.`);
  const items = lineas.map((l) => {
    const total = r2(l.precio * l.cantidad);
    const pct = conIva ? l.ivaPct : 0;
    const neto = conIva ? r2(total / (1 + pct / 100)) : total;
    return { ...l, total, iva_pct: pct, neto, iva: r2(total - neto) };
  });
  const t = discriminar(items, conIva);
  const disponible = r2(f.total - f.devuelto);
  if (t.total > disponible + 0.01) {
    throw new ErrorErp(f.devuelto > 0
      ? `La nota de crédito ($ ${t.total.toLocaleString("es-AR")}) pasa lo que queda por devolver de la factura ($ ${disponible.toLocaleString("es-AR")}; ya hay notas de crédito por $ ${f.devuelto.toLocaleString("es-AR")}).`
      : `La nota de crédito ($ ${t.total.toLocaleString("es-AR")}) pasa el total de la factura ($ ${f.total.toLocaleString("es-AR")}).`);
  }

  const cl = d.clienteId ? await una<{ id: number; nombre: string; condicion_iva: string | null; domicilio: string | null }>(`
    select cl.id::int, coalesce(cl.razon_social, cl.nombre) nombre, cl.condicion_iva,
           (select concat_ws(', ', concat_ws(' ', x.calle, x.numero), x.localidad, x.provincia) from cliente_direccion x
             where x.cliente_id = cl.id order by (x.etiqueta = 'Fiscal') desc, x.principal desc, x.id limit 1) domicilio
      from cliente cl where cl.id = $1 and cl.organizacion_id = $2`, [d.clienteId, org]) : null;
  if (d.clienteId && !cl) throw new ErrorErp(`No hay ningún cliente con el N.º ${d.clienteId}.`);
  // La condición frente al IVA del receptor: la que dice la factura; si no la tiene, la elegida.
  const condicion = f.condicionIvaReceptor ?? d.condicionIva ?? 5;
  const nombre = d.receptorNombre?.trim() || cl?.nombre || "Consumidor final";

  return enTransaccion(async (c) => {
    const r = await c.query<{ id: string }>(`
      insert into comprobante (organizacion_id, pedido_id, cliente_id, ambiente, tipo_cbte, punto_venta, doc_tipo, doc_nro, receptor_nombre,
                               receptor_condicion_iva, receptor_domicilio, importe_total, importe_neto, importe_iva, iva_detalle,
                               asociado_externo, usuario_id, fecha, emisor_id)
      values ($1, null, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16,
              (now() at time zone 'America/Argentina/Buenos_Aires')::date, $17) returning id`,
      [org, cl?.id ?? null, e.ambiente, tipoNc, e.punto_venta, f.docTipo, f.docNro, nombre, condicion, cl?.domicilio ?? null,
        t.total, conIva ? t.neto : t.total, conIva ? t.iva : 0,
        JSON.stringify(conIva ? t.alicuotas.map((a) => ({ id: a.id, pct: a.pct, base: a.base, importe: a.importe })) : []),
        JSON.stringify({ tipo: d.tipo, punto_venta: d.puntoVenta, numero: d.numero, fecha: f.fecha, total: f.total }), d.usuarioId, e.id]);
    const id = Number(r.rows[0].id);
    for (const [i, l] of items.entries()) {
      await c.query(`insert into comprobante_linea (organizacion_id, comprobante_id, variacion_id, descripcion, cantidad, precio_unit, iva_pct, neto, iva, total, orden)
                     values ($1, $2, null, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [org, id, l.descripcion.trim().slice(0, 200), l.cantidad, l.precio, l.iva_pct, l.neto, l.iva, l.total, i]);
    }
    return id;
  });
}

/** Las notas de crédito hechas sobre una factura de afuera (para mostrar en la pantalla). */
export async function notasDeFacturaExterna(org: string, emisorId: number, tipo: number, pv: number, nro: number) {
  return consulta<{ id: number; tipo_cbte: number; punto_venta: number; numero: string | null; estado: string; importe_total: number }>(`
    select id::int, tipo_cbte, punto_venta, numero::text, estado, importe_total::float from comprobante
     where organizacion_id = $1 and emisor_id = $2::bigint and (asociado_externo ->> 'tipo') = $3 and (asociado_externo ->> 'punto_venta') = $4
       and (asociado_externo ->> 'numero') = $5 order by id`, [org, ...clave(emisorId, tipo, pv, nro)]);
}
