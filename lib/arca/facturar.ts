// Facturar un pedido (sesión 4): arma el comprobante desde el pedido (tipo
// A/B/C según emisor y receptor, IVA discriminado desde precios con IVA),
// pide el CAE a ARCA y lo guarda. También notas de crédito y la facturación
// automática (al llegar el pedido al estado elegido en Configuración).
//
// Números: el próximo es "último autorizado en ARCA + 1", pedido con un
// candado por punto de venta y tipo (dos facturas a la vez no chocan). Si una
// respuesta se pierde, el reintento consulta ARCA antes de pedir otro número
// (no se duplica la factura).

import type { PoolClient } from "pg";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { pool } from "@/db";
import type { Ambiente } from "@/lib/arca/credenciales";
import { ultimoAutorizado, solicitarCae, consultarComprobante } from "@/lib/arca/wsfe";

export type Emisor = {
  cuit: string; razon_social: string; condicion_iva: "responsable_inscripto" | "monotributo" | "exento"; domicilio: string | null;
  iibb: string | null; inicio_actividades: string | null; punto_venta: number; ambiente: Ambiente;
  facturar_automatico: boolean; facturar_al: string;
};

export const TIPOS_CBTE: Record<number, { nombre: string; letra: string; nc: boolean }> = {
  1: { nombre: "Factura A", letra: "A", nc: false }, 6: { nombre: "Factura B", letra: "B", nc: false }, 11: { nombre: "Factura C", letra: "C", nc: false },
  3: { nombre: "Nota de crédito A", letra: "A", nc: true }, 8: { nombre: "Nota de crédito B", letra: "B", nc: true }, 13: { nombre: "Nota de crédito C", letra: "C", nc: true },
};
export const DOC_TIPOS: Record<number, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI", 99: "Consumidor final" };
// Condición frente al IVA del receptor (RG 5616).
export const CONDICION_RECEPTOR: Record<string, number> = { responsable_inscripto: 1, exento: 4, consumidor_final: 5, monotributo: 6, no_responsable: 15 };
export const CONDICION_RECEPTOR_TEXTO: Record<number, string> = { 1: "IVA Responsable Inscripto", 4: "IVA Sujeto Exento", 5: "Consumidor Final", 6: "Responsable Monotributo", 15: "IVA No Alcanzado" };
const ALICUOTA_ID: Record<string, number> = { "0": 3, "2.5": 9, "5": 8, "10.5": 4, "21": 5, "27": 6 };

export async function emisorDe(org: string): Promise<Emisor | null> {
  return una<Emisor>(`select cuit, razon_social, condicion_iva, domicilio, iibb, to_char(inicio_actividades, 'YYYY-MM-DD') inicio_actividades,
                             punto_venta, ambiente, facturar_automatico, facturar_al from emisor where organizacion_id = $1`, [org]);
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Neto e IVA de cada alícuota a partir de totales con IVA. */
function discriminar(lineas: { total: number; iva_pct: number }[], conIva: boolean) {
  const porAlicuota = new Map<number, number>();
  for (const l of lineas) porAlicuota.set(l.iva_pct, (porAlicuota.get(l.iva_pct) ?? 0) + l.total);
  const alicuotas = [...porAlicuota.entries()].map(([pct, total]) => {
    const base = conIva ? r2(total / (1 + pct / 100)) : r2(total);
    return { pct, id: ALICUOTA_ID[String(Number(pct))] ?? 5, base, importe: conIva ? r2(total - base) : 0, total: r2(total) };
  });
  const total = r2(alicuotas.reduce((s, a) => s + a.total, 0));
  const neto = r2(alicuotas.reduce((s, a) => s + a.base, 0));
  return { alicuotas, total, neto, iva: r2(total - neto) };
}

/** Arma (sin mandar) la factura de un pedido. Tira ErrorErp si falta algo. */
export async function prepararFactura(org: string, pedidoId: number, usuarioId: string | null, c?: PoolClient): Promise<number> {
  const q = c ? <T,>(s: string, v: unknown[]) => c.query(s, v).then((r) => r.rows as T[]) : <T,>(s: string, v: unknown[]) => consulta(s, v) as Promise<T[]>;
  const e = await emisorDe(org);
  if (!e) throw new ErrorErp("Falta cargar los datos de facturación (Administración → Facturación → Configuración).");
  const ya = await q<{ id: number; estado: string }>("select id::int, estado from comprobante where organizacion_id = $1 and pedido_id = $2 and tipo_cbte in (1, 6, 11) and estado in ('autorizado', 'pendiente', 'error') order by id desc limit 1", [org, pedidoId]);
  if (ya[0]) {
    if (ya[0].estado === "autorizado") throw new ErrorErp("Ese pedido ya está facturado.");
    return ya[0].id; // pendiente o con error: se reintenta el mismo
  }
  const p = (await q<{ cliente_id: number | null; total_ars: string; estado: string; nombre: string | null; razon_social: string | null; cuit: string | null;
    documento_tipo: string | null; documento_numero: string | null; condicion_iva: string | null; domicilio: string | null }>(`
    select p.cliente_id::int, p.total_ars, p.estado, cl.nombre, cl.razon_social, cl.cuit, cl.documento_tipo, cl.documento_numero, cl.condicion_iva,
           (select concat_ws(', ', concat_ws(' ', d.calle, d.numero), d.localidad, d.provincia) from cliente_direccion d
             where d.cliente_id = cl.id order by (d.etiqueta = 'Fiscal') desc, d.principal desc, d.id limit 1) domicilio
      from pedido p left join cliente cl on cl.id = p.cliente_id where p.id = $1 and p.organizacion_id = $2`, [pedidoId, org]))[0];
  if (!p) throw new ErrorErp("El pedido no existe.");
  if (["cancelado", "nuevo"].includes(p.estado)) throw new ErrorErp(`Un pedido ${p.estado} no se factura.`);

  // Tipo de comprobante y receptor.
  const condRec = p.condicion_iva ?? "consumidor_final";
  const tipo = e.condicion_iva !== "responsable_inscripto" ? 11 : ["responsable_inscripto", "monotributo"].includes(condRec) ? 1 : 6;
  const cuit = p.cuit?.replace(/\D/g, "");
  const dni = p.documento_numero?.replace(/\D/g, "");
  let docTipo = 99, docNro = "0";
  if (cuit?.length === 11) { docTipo = 80; docNro = cuit; }
  else if (dni && dni.length >= 7 && dni.length <= 8) { docTipo = 96; docNro = dni; }
  else if (dni?.length === 11) { docTipo = 80; docNro = dni; }
  if (tipo === 1 && docTipo !== 80) throw new ErrorErp("Para una factura A el cliente necesita CUIT: corregilo en la ficha del cliente.");

  const lineas = await q<{ variacion_id: number | null; titulo: string; cantidad: number; unit: string; iva_pct: string | null }>(`
    select l.variacion_id::int, l.titulo, l.cantidad, l.precio_unit_ars unit, pr.iva_pct
      from pedido_linea l left join variacion v on v.id = l.variacion_id left join producto pr on pr.id = v.producto_id
     where l.pedido_id = $1 order by l.orden, l.id`, [pedidoId]);
  if (!lineas.length) throw new ErrorErp("El pedido no tiene líneas.");
  const conIva = tipo !== 11;
  const items = lineas.map((l) => {
    const total = r2(Number(l.unit) * l.cantidad);
    const pct = conIva ? Number(l.iva_pct ?? 21) : 0;
    const neto = conIva ? r2(total / (1 + pct / 100)) : total;
    return { ...l, total, iva_pct: pct, neto, iva: r2(total - neto) };
  });
  const t = discriminar(items, conIva);

  const correr = async (cx: PoolClient) => {
    const cb = await cx.query<{ id: string }>(`
      insert into comprobante (organizacion_id, pedido_id, cliente_id, ambiente, tipo_cbte, punto_venta, doc_tipo, doc_nro, receptor_nombre,
                               receptor_condicion_iva, receptor_domicilio, importe_total, importe_neto, importe_iva, iva_detalle, usuario_id, fecha)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, (now() at time zone 'America/Argentina/Buenos_Aires')::date)
      returning id`,
      [org, pedidoId, p.cliente_id, e.ambiente, tipo, e.punto_venta, docTipo, docNro, p.razon_social ?? p.nombre ?? "Consumidor final",
        CONDICION_RECEPTOR[condRec] ?? 5, p.domicilio, t.total, conIva ? t.neto : t.total, conIva ? t.iva : 0,
        JSON.stringify(conIva ? t.alicuotas.map((a) => ({ id: a.id, pct: a.pct, base: a.base, importe: a.importe })) : []), usuarioId]);
    const id = Number(cb.rows[0].id);
    for (const [i, l] of items.entries()) {
      await cx.query(`insert into comprobante_linea (organizacion_id, comprobante_id, variacion_id, descripcion, cantidad, precio_unit, iva_pct, neto, iva, total, orden)
                      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [org, id, l.variacion_id, l.titulo, l.cantidad, Number(l.unit), l.iva_pct, l.neto, l.iva, l.total, i]);
    }
    return id;
  };
  return c ? correr(c) : enTransaccion(correr);
}

/** Arma la nota de crédito total de una factura autorizada. */
export async function prepararNotaCredito(org: string, facturaId: number, usuarioId: string | null): Promise<number> {
  const f = await una<{ tipo_cbte: number; estado: string }>("select tipo_cbte, estado from comprobante where id = $1 and organizacion_id = $2", [facturaId, org]);
  if (!f) throw new ErrorErp("La factura no existe.");
  if (f.estado !== "autorizado" || ![1, 6, 11].includes(f.tipo_cbte)) throw new ErrorErp("Sólo se anula una factura autorizada.");
  const ya = await una("select 1 from comprobante where comprobante_asociado_id = $1 and estado in ('autorizado', 'pendiente', 'error')", [facturaId]);
  if (ya) throw new ErrorErp("Esa factura ya tiene una nota de crédito.");
  const tipoNc = { 1: 3, 6: 8, 11: 13 }[f.tipo_cbte as 1 | 6 | 11];
  return enTransaccion(async (c) => {
    const r = await c.query<{ id: string }>(`
      insert into comprobante (organizacion_id, pedido_id, cliente_id, ambiente, tipo_cbte, punto_venta, doc_tipo, doc_nro, receptor_nombre,
                               receptor_condicion_iva, receptor_domicilio, importe_total, importe_neto, importe_iva, iva_detalle,
                               comprobante_asociado_id, usuario_id, fecha)
      select organizacion_id, pedido_id, cliente_id, ambiente, $3, punto_venta, doc_tipo, doc_nro, receptor_nombre, receptor_condicion_iva,
             receptor_domicilio, importe_total, importe_neto, importe_iva, iva_detalle, id, $4, (now() at time zone 'America/Argentina/Buenos_Aires')::date
        from comprobante where id = $1 and organizacion_id = $2 returning id`, [facturaId, org, tipoNc, usuarioId]);
    const id = Number(r.rows[0].id);
    await c.query(`insert into comprobante_linea (organizacion_id, comprobante_id, variacion_id, descripcion, cantidad, precio_unit, iva_pct, neto, iva, total, orden)
                   select organizacion_id, $2, variacion_id, descripcion, cantidad, precio_unit, iva_pct, neto, iva, total, orden from comprobante_linea where comprobante_id = $1`, [facturaId, id]);
    return id;
  });
}

/** Manda el comprobante a ARCA y guarda el resultado. */
export async function emitir(org: string, comprobanteId: number): Promise<{ estado: string; mensaje: string }> {
  const e = await emisorDe(org);
  if (!e) throw new ErrorErp("Falta cargar los datos de facturación.");
  const cb = await una<{ estado: string; ambiente: Ambiente; tipo_cbte: number; punto_venta: number; numero: string | null; fecha: string; concepto: number;
    doc_tipo: number; doc_nro: string; importe_total: string; importe_neto: string; importe_iva: string; iva_detalle: { id: number; base: number; importe: number }[];
    receptor_condicion_iva: number; asociado_id: string | null }>(`
    select estado, ambiente, tipo_cbte, punto_venta, numero, to_char(fecha, 'YYYY-MM-DD') fecha, concepto, doc_tipo, doc_nro, importe_total, importe_neto,
           importe_iva, iva_detalle, receptor_condicion_iva, comprobante_asociado_id asociado_id
      from comprobante where id = $1 and organizacion_id = $2`, [comprobanteId, org]);
  if (!cb) throw new ErrorErp("El comprobante no existe.");
  if (cb.estado === "autorizado") return { estado: "autorizado", mensaje: "Ya estaba autorizado." };

  // Candado por punto de venta y tipo, en una conexión aparte durante todo el pedido a ARCA.
  const candado = await pool.connect();
  try {
    await candado.query("begin");
    await candado.query("select pg_advisory_xact_lock(hashtext($1))", [`cbte:${org}:${cb.ambiente}:${cb.punto_venta}:${cb.tipo_cbte}`]);

    // ¿Un intento anterior llegó a ARCA y se perdió la respuesta?
    if (cb.numero) {
      const previo = await consultarComprobante(org, cb.ambiente, e.cuit, cb.punto_venta, cb.tipo_cbte, Number(cb.numero)).catch(() => null);
      if (previo?.cae && Math.abs(previo.total - Number(cb.importe_total)) < 0.01 && previo.docNro.replace(/\D/g, "") === cb.doc_nro.replace(/\D/g, "")) {
        await consulta("update comprobante set estado = 'autorizado', cae = $3, cae_vto = $4, autorizado_ts = now(), observaciones = null where id = $1 and organizacion_id = $2",
          [comprobanteId, org, previo.cae, previo.vto]);
        await candado.query("commit");
        return { estado: "autorizado", mensaje: `Autorizado (CAE ${previo.cae}).` };
      }
    }
    const numero = (await ultimoAutorizado(org, cb.ambiente, e.cuit, cb.punto_venta, cb.tipo_cbte)) + 1;
    let asociado = null;
    if (cb.asociado_id) {
      const a = await una<{ tipo_cbte: number; punto_venta: number; numero: string; fecha: string }>(
        "select tipo_cbte, punto_venta, numero, to_char(fecha, 'YYYY-MM-DD') fecha from comprobante where id = $1", [cb.asociado_id]);
      if (a) asociado = { tipo: a.tipo_cbte, puntoVenta: a.punto_venta, numero: Number(a.numero), cuit: e.cuit, fecha: a.fecha };
    }
    // La fecha del comprobante: hoy (ARCA acepta hasta 5 días para atrás en bienes, pero no hace falta).
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    await consulta("update comprobante set numero = $3, fecha = $4, intentos = intentos + 1 where id = $1 and organizacion_id = $2", [comprobanteId, org, numero, hoy]);
    let r;
    try {
      r = await solicitarCae(org, cb.ambiente, e.cuit, {
        puntoVenta: cb.punto_venta, tipo: cb.tipo_cbte, numero, fecha: hoy, concepto: cb.concepto, docTipo: cb.doc_tipo, docNro: cb.doc_nro,
        total: Number(cb.importe_total), neto: Number(cb.importe_neto), iva: Number(cb.importe_iva), condicionIvaReceptor: cb.receptor_condicion_iva,
        alicuotas: cb.iva_detalle.map((a) => ({ id: a.id, base: Number(a.base), importe: Number(a.importe) })), asociado,
      });
    } catch (err) {
      await consulta("update comprobante set estado = 'error', observaciones = $3 where id = $1 and organizacion_id = $2", [comprobanteId, org, (err as Error).message.slice(0, 500)]);
      await candado.query("commit");
      throw err;
    }
    const obs = [...r.errores, ...r.observaciones].join(" · ") || null;
    if (r.resultado === "A" && r.cae) {
      await consulta(`update comprobante set estado = 'autorizado', cae = $3, cae_vto = $4, observaciones = $5, autorizado_ts = now(),
                             pedido_a_arca = jsonb_build_object('xml', $6::text), respuesta_arca = jsonb_build_object('xml', $7::text)
                       where id = $1 and organizacion_id = $2`, [comprobanteId, org, r.cae, r.vto, obs, r.pedido, r.respuesta]);
      await candado.query("commit");
      return { estado: "autorizado", mensaje: `Autorizado: ${TIPOS_CBTE[cb.tipo_cbte].nombre} ${String(cb.punto_venta).padStart(5, "0")}-${String(numero).padStart(8, "0")}, CAE ${r.cae}.` };
    }
    // Rechazado: el número no se usó, se libera.
    await consulta(`update comprobante set estado = 'rechazado', numero = null, observaciones = $3,
                           pedido_a_arca = jsonb_build_object('xml', $4::text), respuesta_arca = jsonb_build_object('xml', $5::text)
                     where id = $1 and organizacion_id = $2`, [comprobanteId, org, obs ?? "Rechazado sin motivo", r.pedido, r.respuesta]);
    await candado.query("commit");
    return { estado: "rechazado", mensaje: `ARCA lo rechazó: ${obs ?? "sin motivo"}` };
  } catch (err) {
    await candado.query("rollback").catch(() => {});
    throw err;
  } finally {
    candado.release();
  }
}

/** Facturación automática: los pedidos que llegaron al estado elegido y no
 *  tienen factura, y los comprobantes con error para reintentar. */
export async function facturarPendientes(org: string, hastaMs: number): Promise<{ emitidos: number; errores: string[] }> {
  const res = { emitidos: 0, errores: [] as string[] };
  const e = await emisorDe(org);
  if (!e) return res;
  if (e.facturar_automatico) {
    const eventos = await consulta<{ pedido_id: number }>(`
      with ev as (
        update evento set procesado_ts = now(), procesado_por = 'facturacion'
         where organizacion_id = $1 and tipo = 'pedido_estado_cambiado' and procesado_ts is null and payload ->> 'nuevo' = $2
        returning (payload ->> 'pedido_id')::int pedido_id)
      select distinct pedido_id from ev`, [org, e.facturar_al]);
    for (const { pedido_id } of eventos) {
      if (Date.now() > hastaMs) break;
      try {
        const id = await prepararFactura(org, pedido_id, "sistema");
        const r = await emitir(org, id);
        if (r.estado === "autorizado") res.emitidos++; else res.errores.push(`pedido ${pedido_id}: ${r.mensaje}`);
      } catch (err) {
        res.errores.push(`pedido ${pedido_id}: ${(err as Error).message}`);
      }
    }
  }
  const conError = await consulta<{ id: number }>("select id::int from comprobante where organizacion_id = $1 and estado = 'error' and intentos < 5 order by id limit 20", [org]);
  for (const { id } of conError) {
    if (Date.now() > hastaMs) break;
    try { if ((await emitir(org, id)).estado === "autorizado") res.emitidos++; } catch (err) { res.errores.push(`comprobante ${id}: ${(err as Error).message}`); }
  }
  return res;
}
