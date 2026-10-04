// Libros de IVA: de la base a los comprobantes del libro (lib/administracion/libro-iva.ts).
//
//   · Ventas: los comprobantes electrónicos autorizados en producción
//     (`comprobante`), por fecha; homologación no entra.
//   · Compras: las facturas de compra registradas (`factura_compra`; A y M
//     dan crédito fiscal, B y C no) y los despachos de importación
//     registrados (`despacho_importacion`, tipo 066: el IVA es crédito
//     fiscal, el IVA adicional es percepción de IVA, ganancias e IIBB van
//     como percepciones). Facturas E (del exterior) y X no entran.
//   · Avisos: lo que conviene mirar antes de presentar.

import { consulta } from "@/lib/erp/base";
import { CONDICION_RECEPTOR_TEXTO } from "@/lib/arca/facturar";
import {
  ADUANA, alicuotaDe, baseIvaDespacho, clasificarImpuestosDespacho, tipoCompra, textoComprobante,
  type CbteIva, type ImpuestoDespacho,
} from "@/lib/administracion/libro-iva";

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const PCT_DE_ID: Record<number, number> = { 3: 0, 4: 10.5, 5: 21, 6: 27, 8: 5, 9: 2.5 };
const CONDICION_TEXTO: Record<string, string> = {
  responsable_inscripto: "Responsable Inscripto", monotributo: "Monotributo", exento: "Exento", consumidor_final: "Consumidor Final", no_responsable: "No alcanzado",
};

export type AvisoLibro = { texto: string; enlace?: string };

export async function canalesConVentas(org: string) {
  return consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 order by nombre", [org]);
}

/** Los comprobantes de venta del período. */
/** Los libros son de una razón social (`emisorId`): cada CUIT presenta el suyo. Sin ella (null), de todas. */
export async function ventasDelPeriodo(org: string, desde: string, hasta: string, canalId?: number | null, emisorId: number | null = null): Promise<CbteIva[]> {
  const filas = await consulta<{ id: number; fecha: string; tipo_cbte: number; punto_venta: number; numero: string; doc_tipo: number; doc_nro: string;
    receptor_nombre: string | null; receptor_condicion_iva: number | null; moneda: string; cotizacion: string; importe_total: string; importe_neto: string;
    importe_iva: string; iva_detalle: { id?: number; pct?: number; base: number; importe: number }[] | null; canal: string | null; canal_id: number | null }>(`
    select c.id::int, to_char(c.fecha, 'YYYY-MM-DD') fecha, c.tipo_cbte, c.punto_venta, c.numero::text numero, c.doc_tipo, c.doc_nro, c.receptor_nombre,
           c.receptor_condicion_iva, c.moneda, c.cotizacion, c.importe_total, c.importe_neto, c.importe_iva, c.iva_detalle, ca.nombre canal, p.canal_id::int canal_id
      from comprobante c
      left join pedido p on p.id = c.pedido_id
      left join canal ca on ca.id = p.canal_id
     where c.organizacion_id = $1 and c.estado = 'autorizado' and c.ambiente = 'produccion' and c.numero is not null
       and c.fecha between $2::date and $3::date
       and ($4::bigint is null or p.canal_id = $4) and ($5::bigint is null or c.emisor_id = $5)`, [org, desde, hasta, canalId ?? null, emisorId]);
  return filas.map((f) => {
    const letraC = [11, 12, 13].includes(f.tipo_cbte);
    const total = Number(f.importe_total), neto = Number(f.importe_neto), iva = Number(f.importe_iva);
    const alicuotas = letraC ? [] : (f.iva_detalle ?? []).map((a) => ({ pct: Number(a.pct ?? PCT_DE_ID[Number(a.id)] ?? 21), base: Number(a.base), iva: Number(a.importe) }));
    const bases = alicuotas.reduce((s, a) => s + a.base, 0);
    const noGravado = letraC ? 0 : Math.max(0, r2(neto - bases));
    const otros = letraC ? 0 : Math.max(0, r2(total - neto - iva));
    return {
      origen: "venta", id: f.id, fecha: f.fecha, tipo: f.tipo_cbte, puntoVenta: f.punto_venta, numero: f.numero,
      docTipo: f.doc_tipo, docNro: f.doc_nro, nombre: f.receptor_nombre ?? (f.doc_tipo === 99 ? "Consumidor final" : ""),
      condicionIva: f.receptor_condicion_iva != null ? CONDICION_RECEPTOR_TEXTO[f.receptor_condicion_iva] ?? null : null,
      moneda: f.moneda === "PES" ? "PES" : "DOL", cotizacion: Number(f.cotizacion) || 1, nc: [3, 8, 13].includes(f.tipo_cbte),
      alicuotas, noGravado, exento: 0, sinDiscriminar: letraC ? total : 0,
      percepcionIva: 0, percepcionNacionales: 0, percepcionIibb: 0, percepcionMunicipal: 0, impuestosInternos: 0, otros, total,
      canal: f.canal, canalId: f.canal_id, enlace: `/administracion/facturacion/${f.id}`,
    } satisfies CbteIva;
  });
}

type FilaCompra = { id: number; fecha: string; letra: string; es_nota_credito: boolean; es_nota_debito: boolean; punto_venta: number | null; numero: string | null;
  moneda: string; cotizacion: string; neto: string; iva: string; iva_detalle: { pct: number; base: number; importe: number }[] | null;
  percepcion_iva: string; percepcion_iibb: string; otros_impuestos: string; no_gravado: string; total: string;
  proveedor_id: number; nombre: string; cuit: string | null; condicion_iva: string | null };

/** Los comprobantes de compra del período (facturas y despachos) y los avisos que salen al armarlos. */
export async function comprasDelPeriodo(org: string, desde: string, hasta: string, emisorId: number | null = null): Promise<{ compras: CbteIva[]; avisos: AvisoLibro[] }> {
  const avisos: AvisoLibro[] = [];
  const facturas = await consulta<FilaCompra>(`
    select f.id::int, to_char(f.fecha, 'YYYY-MM-DD') fecha, f.letra, f.es_nota_credito, f.es_nota_debito, f.punto_venta, f.numero::text numero,
           f.moneda, f.cotizacion, f.neto, f.iva, f.iva_detalle, f.percepcion_iva, f.percepcion_iibb, f.otros_impuestos, f.no_gravado, f.total,
           p.id::int proveedor_id, coalesce(nullif(p.razon_social, ''), p.nombre) nombre, p.cuit, p.condicion_iva
      from factura_compra f join proveedor p on p.id = f.proveedor_id
     where f.organizacion_id = $1 and f.estado = 'registrada' and f.fecha between $2::date and $3::date and ($4::bigint is null or f.emisor_id = $4)`, [org, desde, hasta, emisorId]);
  const compras: CbteIva[] = [];
  for (const f of facturas) {
    const enlace = `/compras/facturas/${f.id}`;
    const tipo = tipoCompra(f.letra, f.es_nota_credito, f.es_nota_debito);
    const etiqueta = `${f.es_nota_credito ? "NC" : f.es_nota_debito ? "ND" : "Factura"} ${f.letra} ${f.punto_venta != null ? String(f.punto_venta).padStart(5, "0") + "-" : ""}${f.numero ?? "s/n"} de ${f.nombre}`;
    if (tipo == null || f.letra === "E") {
      avisos.push({ texto: `${etiqueta}: letra ${f.letra}, no entra en el libro (${f.letra === "E" ? "comprobante del exterior: la mercadería entra por el despacho" : "no es un comprobante fiscal"}).`, enlace });
      continue;
    }
    const cuit = (f.cuit ?? "").replace(/\D/g, "");
    if (cuit.length !== 11) avisos.push({ texto: `${etiqueta}: el proveedor no tiene CUIT válido (sale como "sin identificar").`, enlace: `/compras/proveedores?id=${f.proveedor_id}` });
    const usd = f.moneda === "USD";
    if (usd && !(Number(f.cotizacion) > 1)) avisos.push({ texto: `${etiqueta}: está en dólares y la cotización es ${Number(f.cotizacion)}.`, enlace });
    const discrimina = f.letra === "A" || f.letra === "M";
    const perc = Number(f.percepcion_iva) + Number(f.percepcion_iibb) + Number(f.otros_impuestos);
    let alicuotas: CbteIva["alicuotas"] = [];
    let noGravado = Number(f.no_gravado);
    let sinDiscriminar = 0;
    if (discrimina) {
      alicuotas = (f.iva_detalle ?? []).filter((a) => alicuotaDe(Number(a.pct)) != null).map((a) => ({ pct: Number(a.pct), base: Number(a.base), iva: Number(a.importe) }));
      const ivaTot = alicuotas.reduce((s, a) => s + a.iva, 0);
      if (!alicuotas.length || (ivaTot === 0 && Number(f.neto) > 0)) {
        avisos.push({ texto: `${etiqueta}: factura ${f.letra} sin IVA discriminado (no suma crédito fiscal).`, enlace });
        if (!alicuotas.length) noGravado = r2(noGravado + Number(f.neto));
      }
    } else {
      sinDiscriminar = Math.max(0, r2(Number(f.total) - perc - noGravado));
    }
    compras.push({
      origen: "compra", id: f.id, fecha: f.fecha, tipo, puntoVenta: f.punto_venta ?? 0, numero: f.numero ?? "0",
      docTipo: cuit.length === 11 ? 80 : 99, docNro: cuit.length === 11 ? cuit : "0", nombre: f.nombre,
      condicionIva: f.condicion_iva ? CONDICION_TEXTO[f.condicion_iva] ?? f.condicion_iva : null,
      moneda: usd ? "DOL" : "PES", cotizacion: usd ? Number(f.cotizacion) || 1 : 1, nc: f.es_nota_credito,
      alicuotas, noGravado, exento: 0, sinDiscriminar,
      percepcionIva: Number(f.percepcion_iva), percepcionNacionales: 0, percepcionIibb: Number(f.percepcion_iibb), percepcionMunicipal: 0,
      impuestosInternos: 0, otros: Number(f.otros_impuestos), total: Number(f.total), enlace,
    });
  }

  const despachos = await consulta<{ id: number; fecha: string; numero: string | null; cotizacion: string; fob_usd: string; flete_usd: string; seguro_usd: string;
    gastos: ImpuestoDespacho[] | null; impuestos: ImpuestoDespacho[] | null; proveedor: string | null }>(`
    select d.id::int, to_char(d.fecha, 'YYYY-MM-DD') fecha, d.numero, d.cotizacion, d.fob_usd, d.flete_usd, d.seguro_usd, d.gastos, d.impuestos,
           coalesce(nullif(p.razon_social, ''), p.nombre) proveedor
      from despacho_importacion d left join proveedor p on p.id = d.proveedor_id
     where d.organizacion_id = $1 and d.estado = 'registrado' and d.fecha between $2::date and $3::date and ($4::bigint is null or d.emisor_id = $4)`, [org, desde, hasta, emisorId]);
  for (const d of despachos) {
    const enlace = `/compras/despachos/${d.id}`;
    const cot = Number(d.cotizacion);
    const tributosBase = (d.gastos ?? []).filter((g) => /derecho|tasa estad/i.test(g.concepto ?? "")).reduce((s, g) => s + (Number(g.importe_ars) || 0), 0);
    const baseEstimada = (Number(d.fob_usd) + Number(d.flete_usd) + Number(d.seguro_usd)) * cot + tributosBase;
    const imp = clasificarImpuestosDespacho(d.impuestos ?? []);
    const b = baseIvaDespacho(imp.iva, baseEstimada);
    const nombre = `Despacho ${d.numero ?? "s/n"}`;
    if (!d.numero) avisos.push({ texto: `${nombre} del ${d.fecha.split("-").reverse().join("/")}: no tiene número de despacho (ARCA lo pide).`, enlace });
    if (imp.iva <= 0) avisos.push({ texto: `${nombre}: no tiene IVA cargado en sus impuestos (no suma crédito fiscal).`, enlace });
    if (b.dudosa) avisos.push({ texto: `${nombre}: el IVA no da 21 % ni 10,5 % de CIF + derechos + tasa estadística; se informa al ${String(b.pct).replace(".", ",")} % con base ${b.base.toLocaleString("es-AR")}. Revisalo.`, enlace });
    compras.push({
      origen: "despacho", id: d.id, fecha: d.fecha, tipo: 66, puntoVenta: 0, numero: "0", despacho: d.numero,
      docTipo: 80, docNro: ADUANA.cuit, nombre: ADUANA.nombre, condicionIva: d.proveedor ? `Proveedor: ${d.proveedor}` : null,
      moneda: "PES", cotizacion: 1, nc: false,
      alicuotas: imp.iva > 0 ? [{ pct: b.pct, base: b.base, iva: imp.iva }] : [], noGravado: 0, exento: 0, sinDiscriminar: 0,
      percepcionIva: imp.percepcionIva, percepcionNacionales: imp.percepcionNacionales, percepcionIibb: imp.percepcionIibb, percepcionMunicipal: 0,
      impuestosInternos: 0, otros: imp.otros, total: r2(b.base + imp.iva + imp.percepcionIva + imp.percepcionNacionales + imp.percepcionIibb + imp.otros), enlace,
    });
  }
  return { compras, avisos };
}

/** Los avisos que no salen de armar las filas: duplicados, cargados en el
 *  período con fecha de otro, borradores, ventas sin autorizar, etc. */
export async function avisosDelPeriodo(org: string, desde: string, hasta: string, ventas: CbteIva[], compras: CbteIva[], emisorId: number | null = null): Promise<AvisoLibro[]> {
  const avisos: AvisoLibro[] = [];
  const fechaAr = (f: string) => f.split("-").reverse().join("/");

  // Duplicados en compras: mismo CUIT, tipo, punto de venta y número.
  const vistos = new Map<string, CbteIva>();
  for (const c of compras) {
    const k = c.origen === "despacho" ? `D|${c.despacho ?? `id${c.id}`}` : `${c.docNro === "0" ? c.nombre : c.docNro}|${c.tipo}|${c.puntoVenta}|${Number(c.numero)}`;
    const otro = vistos.get(k);
    if (otro) avisos.push({ texto: `Posible duplicado: ${textoComprobante(c)} de ${c.nombre} está dos veces (fechas ${fechaAr(otro.fecha)} y ${fechaAr(c.fecha)}).`, enlace: c.enlace });
    else vistos.set(k, c);
  }
  // Duplicados en ventas (no deberían: el número lo da ARCA).
  const vv = new Set<string>();
  for (const c of ventas) {
    const k = `${c.tipo}|${c.puntoVenta}|${c.numero}`;
    if (vv.has(k)) avisos.push({ texto: `Comprobante de venta repetido: ${textoComprobante(c)}.`, enlace: c.enlace });
    vv.add(k);
    if ([1, 2, 3].includes(c.tipo) && c.docTipo !== 80) avisos.push({ texto: `${textoComprobante(c)}: es A y el receptor no tiene CUIT.`, enlace: c.enlace });
    if (c.moneda !== "PES" && !(c.cotizacion > 1)) avisos.push({ texto: `${textoComprobante(c)}: en moneda extranjera con cotización ${c.cotizacion}.`, enlace: c.enlace });
  }

  // Cargadas en el período con fecha de otro período (no están en este libro).
  const otras = await consulta<{ id: number; fecha: string; letra: string; es_nota_credito: boolean; punto_venta: number | null; numero: string | null; nombre: string }>(`
    select f.id::int, to_char(f.fecha, 'YYYY-MM-DD') fecha, f.letra, f.es_nota_credito, f.punto_venta, f.numero::text numero, p.nombre
      from factura_compra f join proveedor p on p.id = f.proveedor_id
     where f.organizacion_id = $1 and f.estado = 'registrada'
       and (coalesce(f.registrada_ts, f.creado_ts) at time zone 'America/Argentina/Buenos_Aires')::date between $2::date and $3::date
       and f.fecha not between $2::date and $3::date and ($4::bigint is null or f.emisor_id = $4)
     order by f.fecha`, [org, desde, hasta, emisorId]);
  for (const f of otras) {
    avisos.push({ texto: `${f.es_nota_credito ? "NC" : "Factura"} ${f.letra} ${f.punto_venta != null ? String(f.punto_venta).padStart(5, "0") + "-" : ""}${f.numero ?? "s/n"} de ${f.nombre}: se cargó en este período pero tiene fecha ${fechaAr(f.fecha)}; está en el libro de ese mes (si ya se presentó, consultalo con el contador).`, enlace: `/compras/facturas/${f.id}` });
  }
  const otrosDesp = await consulta<{ id: number; fecha: string; numero: string | null }>(`
    select id::int, to_char(fecha, 'YYYY-MM-DD') fecha, numero from despacho_importacion
     where organizacion_id = $1 and estado = 'registrado'
       and (coalesce(registrado_ts, creado_ts) at time zone 'America/Argentina/Buenos_Aires')::date between $2::date and $3::date
       and fecha not between $2::date and $3::date and ($4::bigint is null or emisor_id = $4)`, [org, desde, hasta, emisorId]);
  for (const d of otrosDesp) avisos.push({ texto: `Despacho ${d.numero ?? "s/n"}: se registró en este período pero tiene fecha ${fechaAr(d.fecha)}.`, enlace: `/compras/despachos/${d.id}` });

  // Lo que tiene fecha del período y no entra.
  const [borr] = await consulta<{ facturas: number; despachos: number }>(`
    select (select count(*)::int from factura_compra where organizacion_id = $1 and estado = 'borrador' and fecha between $2::date and $3::date and ($4::bigint is null or emisor_id = $4)) facturas,
           (select count(*)::int from despacho_importacion where organizacion_id = $1 and estado = 'borrador' and fecha between $2::date and $3::date and ($4::bigint is null or emisor_id = $4)) despachos`, [org, desde, hasta, emisorId]);
  if (borr.facturas) avisos.push({ texto: `${borr.facturas} factura(s) de compra del período siguen en borrador: no entran hasta registrarlas.`, enlace: "/compras/facturas" });
  if (borr.despachos) avisos.push({ texto: `${borr.despachos} despacho(s) del período siguen en borrador: no entran hasta registrarlos.`, enlace: "/compras/despachos" });
  const vent = await consulta<{ estado: string; ambiente: string; n: number }>(`
    select estado, ambiente, count(*)::int n from comprobante
     where organizacion_id = $1 and fecha between $2::date and $3::date and not (estado = 'autorizado' and ambiente = 'produccion') and ($4::bigint is null or emisor_id = $4)
     group by 1, 2`, [org, desde, hasta, emisorId]);
  const homo = vent.filter((v) => v.ambiente !== "produccion" && v.estado === "autorizado").reduce((s, v) => s + v.n, 0);
  const sinCae = vent.filter((v) => v.ambiente === "produccion" && v.estado !== "autorizado").reduce((s, v) => s + v.n, 0);
  if (homo) avisos.push({ texto: `${homo} comprobante(s) de venta de homologación (prueba) no entran en el libro.`, enlace: "/administracion/facturacion" });
  if (sinCae) avisos.push({ texto: `${sinCae} comprobante(s) de venta del período no están autorizados por ARCA (pendientes, con error o rechazados): no entran.`, enlace: "/administracion/facturacion" });
  return avisos;
}

/** Todo lo del período de una razón social: ventas (de todos los canales), compras y avisos. */
export async function libroIvaPeriodo(org: string, desde: string, hasta: string, emisorId: number | null = null) {
  const [ventas, { compras, avisos: avisosCompras }] = await Promise.all([ventasDelPeriodo(org, desde, hasta, null, emisorId), comprasDelPeriodo(org, desde, hasta, emisorId)]);
  const avisos = [...avisosCompras, ...(await avisosDelPeriodo(org, desde, hasta, ventas, compras, emisorId))];
  return { ventas, compras, avisos };
}
