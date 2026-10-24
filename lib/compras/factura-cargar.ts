// Una factura de compra leída por la IA (de un PDF o una foto) → cargada en Laucen (pedido de Fer, 23/10 y 24/10): la usan
// «Subir factura» de Facturas de compra y la lectura de las carpetas del Drive (lib/compras/drive-facturas.ts).
//   · Va a nombre de la razón social del CUIT receptor (sin CUIT, la principal).
//   · El proveedor se busca por CUIT; si no está, se crea.
//   · Si el proveedor tiene cuenta de gasto, queda registrada; si no, en borrador hasta que se elija.
//   · Si esa factura ya estaba cargada (por ejemplo, importada de Mis Comprobantes), no se duplica: se le suma el
//     archivo si no tenía.

import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { detalleIibb, aComprobante, type LecturaFactura } from "@/lib/compras/factura-leer";
import { armarFactura } from "@/lib/administracion/arca-mc-leer";
import { recalcularFactura, registrarFactura } from "@/lib/administracion/compras";

export type FacturaCargada = { id: number; estado: "registrada" | "borrador" | "ya_estaba"; mensaje: string };

export async function cargarFacturaLeida(org: string, usuarioId: string, lectura: LecturaFactura, archivo: string, nombreArchivo: string): Promise<FacturaCargada> {
  const x = aComprobante(lectura);
  if ("error" in x) throw new ErrorErp(x.error);
  const c = x.c;
  const armada = armarFactura(c);
  if (armada.error) throw new ErrorErp(`La factura leída no cierra: ${armada.error} Cargala a mano.`);
  // A nombre de qué razón social: la del CUIT receptor (si no figura, la principal).
  const receptor = String(lectura.cuit_receptor ?? "").replace(/\D/g, "");
  const emisor = receptor
    ? await una<{ id: number }>("select id::int from emisor where organizacion_id = $1 and regexp_replace(cuit, '\\D', '', 'g') = $2", [org, receptor])
    : await una<{ id: number }>("select id::int from emisor where organizacion_id = $1 and es_principal", [org]);
  if (!emisor) throw new ErrorErp(`La factura está a nombre del CUIT ${receptor}, que no es de ninguna de tus razones sociales.`);
  let prov = await una<{ id: number; nombre: string; cuenta_gasto_id: number | null }>(
    "select id::int, nombre, cuenta_gasto_id::int from proveedor where organizacion_id = $1 and regexp_replace(cuit, '\\D', '', 'g') = $2 order by (estado = 'activo') desc, id limit 1", [org, c.cuit]);
  const ya = prov ? await una<{ id: number; archivo: string | null }>(`select id::int, archivo from factura_compra where organizacion_id = $1 and proveedor_id = $2 and letra = $3
      and es_nota_credito = $4 and es_nota_debito = $5 and punto_venta is not distinct from $6 and numero = $7 and estado <> 'anulada'`,
    [org, prov.id, c.letra, c.nc, c.nd, c.puntoVenta, c.numero]) : null;
  if (ya) {
    if (!ya.archivo) await consulta("update factura_compra set archivo = $3 where id = $1 and organizacion_id = $2 and archivo is null", [ya.id, org, archivo]);
    return { id: ya.id, estado: "ya_estaba", mensaje: `ya estaba cargada (factura de compra #${ya.id})${ya.archivo ? "" : "; le sumé el archivo"}` };
  }
  if (!prov) {
    const cond = c.letra === "A" || c.letra === "M" ? "responsable_inscripto" : c.letra === "C" ? "monotributo" : null;
    prov = await una<{ id: number; nombre: string; cuenta_gasto_id: number | null }>(`insert into proveedor (organizacion_id, nombre, razon_social, cuit, condicion_iva, notas)
      values ($1, $2, $2, $3, $4, 'Creado al leer una factura') returning id::int, nombre, cuenta_gasto_id::int`, [org, c.denominacion.slice(0, 200), c.cuit, cond]);
  }
  const p = prov!;
  const venc = lectura.vencimiento && /^\d{4}-\d{2}-\d{2}$/.test(lectura.vencimiento) ? lectura.vencimiento : c.fecha;
  const estandar = [1, 2, 3, 6, 7, 8, 11, 12, 13, 51, 52, 53].includes(c.tipo);
  const fid = await enTransaccion(async (cx) => {
    const f = await cx.query<{ id: string }>(`
      insert into factura_compra (organizacion_id, proveedor_id, letra, es_nota_credito, es_nota_debito, punto_venta, numero, fecha, vencimiento, moneda, cotizacion,
                                  percepcion_iva, percepcion_iibb, otros_impuestos, no_gravado, cuenta_gasto_id, notas, usuario_id, origen, cae, emisor_id, tipo_cbte, archivo)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'pdf', $19, $20, $21, $22) returning id`,
      [org, p.id, c.letra, c.nc, c.nd, c.puntoVenta, c.numero, c.fecha, venc, c.moneda, c.moneda === "USD" ? c.cotizacion || null : 1,
        armada.percepcionIva, armada.percepcionIibb, armada.otrosImpuestos, armada.noGravado, p.cuenta_gasto_id,
        [`Leída del archivo «${nombreArchivo}» (${c.tipoTexto}).`, armada.aviso].filter(Boolean).join(" "), usuarioId, c.cae, emisor.id, estandar ? null : c.tipo, archivo]);
    const id = Number(f.rows[0].id);
    // Las percepciones de IIBB por provincia, si la factura las discrimina y suman lo mismo.
    const det = detalleIibb(lectura, armada.percepcionIibb);
    if (det) {
      await cx.query("update factura_compra set percepcion_iibb_detalle = $2::jsonb where id = $1", [id, JSON.stringify(det)]);
      if (det.length === 1) await cx.query("update proveedor set iibb_jurisdiccion = $2 where id = $1 and iibb_jurisdiccion is null", [p.id, det[0].jur]);
    }
    let orden = 0;
    for (const l of armada.lineas) {
      await cx.query(`insert into factura_compra_linea (organizacion_id, factura_id, descripcion, cantidad, costo_unit, iva_pct, neto, iva, orden)
                      values ($1, $2, $3, 1, $4, $5, $4, $6, $7)`, [org, id, l.descripcion, l.neto, l.ivaPct, l.iva, ++orden]);
    }
    return id;
  });
  const t = await recalcularFactura(org, fid);
  if (Math.abs(t.total - c.total) > 0.02)
    return { id: fid, estado: "borrador", mensaje: `quedó en borrador: el total armado (${t.total}) no coincide con el de la factura (${c.total}). Revisala.` };
  if (!p.cuenta_gasto_id)
    return { id: fid, estado: "borrador", mensaje: `leída; el proveedor ${p.nombre} todavía no tiene cuenta de gasto: elegila en la cabecera (queda recordada) y registrala.` };
  await registrarFactura(org, fid, usuarioId);
  return { id: fid, estado: "registrada", mensaje: "leída y registrada con la cuenta de gasto del proveedor." };
}
