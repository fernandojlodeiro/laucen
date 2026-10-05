// Facturación de Mercado Libre por API — SÓLO LECTURA (todo GET; AGENTS.md:
// leer de ML sí se puede). Para qué:
//   1. costo por venta: cada cargo (comisión, envío, cargo fijo, impuestos)
//      con su orden → el pedido de Laucen ("Cargos de Mercado Libre" en la
//      ficha, "Neto ML" en la lista, informe de rentabilidad);
//   2. retenciones y percepciones que cobran ML y Mercado Pago, por período;
//   3. control: las facturas que ML dice haber emitido contra las facturas de
//      compra importadas de ARCA (Mis Comprobantes) con el CUIT de ML.
// NO registra facturas de compra: ésas entran sólo por la importación de ARCA.
//
// Endpoints (por cuenta, grupo ML = Mercado Libre y MP = Mercado Pago):
//   GET /billing/integration/monthly/periods?group=G&document_type=BILL&offset&limit
//   GET /billing/integration/periods/key/{key}/documents?group=G&document_type=BILL|CREDIT_NOTE&offset&limit
//   GET /billing/integration/periods/key/{key}/group/G/details?document_type=BILL|CREDIT_NOTE&offset&limit
// Con 150 ms entre lecturas de una misma cuenta. Se lee una vez por noche
// (en la ventana de la barrida, lo llama /api/erp/tareas) y con el botón
// "Traer facturación de ML".

import { consulta, una } from "@/lib/erp/base";
import { ml, type CuentaMl, type RespuestaMl } from "@/lib/mercadolibre/api";
import { RITMO_LECTURA_MS } from "@/lib/mercadolibre/barrida";

export type Grupo = "ML" | "MP";
export type TipoCargo = "comision" | "envio" | "cargo_fijo" | "publicidad" | "impuesto" | "bonificacion" | "otro";
export type Impuesto = "iva" | "iibb" | "ganancias" | "otro";

export const TIPOS_CARGO: Record<TipoCargo, string> = {
  comision: "Comisión por venta", envio: "Envíos", cargo_fijo: "Cargo fijo", publicidad: "Publicidad",
  impuesto: "Impuestos (percepciones y retenciones)", bonificacion: "Bonificaciones", otro: "Otros cargos",
};
export const IMPUESTOS: Record<Impuesto, string> = { iva: "IVA", iibb: "Ingresos Brutos", ganancias: "Ganancias", otro: "Otros" };
/** Lo que es costo de la venta (los impuestos no: son percepciones / retenciones, se toman a cuenta). */
export const TIPOS_COSTO: TipoCargo[] = ["comision", "envio", "cargo_fijo", "publicidad", "bonificacion", "otro"];
export const SQL_TIPOS_COSTO = `(${TIPOS_COSTO.map((t) => `'${t}'`).join(", ")})`;

const r2 = (x: number) => Math.round(x * 100) / 100;
const txt = (v: unknown) => (v == null || v === "" ? null : String(v));
const sinAcentos = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ── Lo que contesta ML (sólo lo que se usa; el resto queda en `datos`) ──

export type PeriodoMl = { key?: string; amount?: number; unpaid_amount?: number; expiration_date?: string; period?: { date_from?: string; date_to?: string } };
export type DocumentoMl = {
  id?: number | string; document_type?: string; document_number?: string | null; associated_document_id?: number | string | null;
  date?: string; creation_date?: string; document_date?: string; date_created?: string; expiration_date?: string;
  amount?: number; unpaid_amount?: number; document_status?: string; currency_id?: string;
  files?: { file_id?: string; reference_number?: string; url?: string }[];
};
export type DetalleMl = {
  charge_info?: {
    detail_id?: number | string; legal_document_number?: string; legal_document_status?: string; creation_date_time?: string;
    transaction_detail?: string; detail_amount?: number; detail_type?: string; detail_sub_type?: string | null;
    debited_from_operation_description?: string; status?: string;
  };
  discount_info?: { charge_amount_without_discount?: number; discount_amount?: number; discount_reason?: string };
  sales_info?: { order_id?: number | string; operation_id?: number | string; sale_date_time?: string; transaction_amount?: number; pack_id?: number | string }[];
  shipping_info?: { shipping_id?: number | string; pack_id?: number | string; receiver_shipping_cost?: number };
  items_info?: { item_id?: string; item_title?: string; order_id?: number | string; item_amount?: number }[];
  document_info?: { document_id?: number | string };
  currency_info?: { currency_id?: string };
  operation_info?: { order_id?: number | string; reference_id?: number | string };
};

/** Qué es un cargo, por su descripción y su código. */
export function clasificarCargo(concepto: string | null | undefined, subtipo?: string | null, tipoDetalle?: string | null): { tipo: TipoCargo; impuesto: Impuesto | null } {
  const t = sinAcentos(`${concepto ?? ""} ${subtipo ?? ""}`);
  if (/bonus|credit/i.test(tipoDetalle ?? "") || /bonific|reintegro|devolucion de cargo|anulacion de cargo/.test(t)) return { tipo: "bonificacion", impuesto: null };
  if (/percep|retenc|impuesto|tribut|sirtac|ingresos brutos|\biibb\b|ganancias|\biva\b/.test(t)) {
    const impuesto: Impuesto = /ingresos brutos|\biibb\b|sirtac|brutos/.test(t) ? "iibb" : /ganancia/.test(t) ? "ganancias" : /\biva\b/.test(t) ? "iva" : "otro";
    return { tipo: "impuesto", impuesto };
  }
  if (/env[io]|shipping|flete|mercado env|logistic/.test(t)) return { tipo: "envio", impuesto: null };
  if (/publicidad|product ads|\bads\b|anuncio|campana|brand/.test(t)) return { tipo: "publicidad", impuesto: null };
  if (/cargo fijo|costo fijo|fijo por|fixed/.test(t)) return { tipo: "cargo_fijo", impuesto: null };
  if (/venta|vender|comision|sale fee|cargo por|\bcv\b/.test(t)) return { tipo: "comision", impuesto: null };
  return { tipo: "otro", impuesto: null };
}

export type FilaCargo = {
  detalle_id: string; documento_id: string | null; fecha: string | null; tipo: TipoCargo; impuesto: Impuesto | null; concepto: string | null;
  subtipo: string | null; monto: number; moneda: string | null; order_id: string | null; item_id: string | null; datos: Record<string, unknown>;
};

/** Un renglón del detalle de ML → un cargo. `notaCredito`: viene del detalle
 *  de las notas de crédito (resta). Sin id de detalle, se descarta (null). */
export function mapearCargo(d: DetalleMl, notaCredito = false): FilaCargo | null {
  const ci = d.charge_info ?? {};
  const detalle = txt(ci.detail_id);
  if (!detalle) return null;
  const concepto = txt(ci.transaction_detail) ?? txt(ci.debited_from_operation_description);
  const { tipo, impuesto } = clasificarCargo(concepto, ci.detail_sub_type, ci.detail_type);
  const signo = notaCredito || tipo === "bonificacion" ? -1 : 1;
  const venta = d.sales_info?.[0];
  const item = d.items_info?.[0];
  const order = txt(venta?.order_id) ?? txt(item?.order_id) ?? txt(d.operation_info?.order_id);
  const pack = txt(d.shipping_info?.pack_id) ?? txt(venta?.pack_id);
  return {
    detalle_id: detalle, documento_id: txt(d.document_info?.document_id), fecha: txt(ci.creation_date_time) ?? txt(venta?.sale_date_time),
    tipo, impuesto, concepto, subtipo: txt(ci.detail_sub_type), monto: r2(signo * Math.abs(Number(ci.detail_amount) || 0)),
    moneda: txt(d.currency_info?.currency_id), order_id: order, item_id: txt(item?.item_id),
    datos: Object.fromEntries(Object.entries({ pack_id: pack, documento_legal: txt(ci.legal_document_number), item: txt(item?.item_title),
      envio: txt(d.shipping_info?.shipping_id), descuento: d.discount_info?.discount_amount ?? null, tipo_detalle: txt(ci.detail_type) }).filter(([, v]) => v != null)),
  };
}

/** "A 0034-00123456", "0034-00123456", "A0034-00123456" → punto de venta y número. */
export function numeroDeDocumento(s: string | null | undefined): { puntoVenta: number; numero: number } | null {
  const m = String(s ?? "").match(/(\d{1,5})\s*-\s*(\d{1,8})\s*$/);
  return m ? { puntoVenta: Number(m[1]), numero: Number(m[2]) } : null;
}

export type FilaDocumento = { documento_id: string; tipo: "BILL" | "CREDIT_NOTE"; numero: string | null; punto_venta: number | null; numero_cbte: number | null;
  fecha: string | null; monto: number; moneda: string | null; estado: string | null; archivos: unknown[]; datos: Record<string, unknown> };

export function mapearDocumento(d: DocumentoMl, tipo: "BILL" | "CREDIT_NOTE"): FilaDocumento | null {
  const id = txt(d.id);
  if (!id) return null;
  const numero = txt(d.document_number) ?? txt(d.files?.find((f) => f.reference_number)?.reference_number);
  const n = numeroDeDocumento(numero);
  const fecha = txt(d.date) ?? txt(d.document_date) ?? txt(d.creation_date) ?? txt(d.date_created);
  return {
    documento_id: id, tipo: d.document_type === "CREDIT_NOTE" ? "CREDIT_NOTE" : tipo, numero, punto_venta: n?.puntoVenta ?? null, numero_cbte: n?.numero ?? null,
    fecha: fecha ? fecha.slice(0, 10) : null, monto: r2(Math.abs(Number(d.amount) || 0)), moneda: txt(d.currency_id), estado: txt(d.document_status),
    archivos: d.files ?? [], datos: { asociado: txt(d.associated_document_id), vencimiento: txt(d.expiration_date), impago: d.unpaid_amount ?? null },
  };
}

// ── Lectura ───────────────────────────────────────────────

export type Leer = (cuenta: CuentaMl, ruta: string) => Promise<RespuestaMl>;
const POR_PAGINA = 150;

type Opciones = { hastaMs: number; leer?: Leer; periodos?: number; cuentaId?: number; canalId?: number | null };

/** Lee la facturación de las cuentas de ML (de la organización, o de todas
 *  si `org` es null; sólo la del canal `canalId` si viene): los últimos
 *  `periodos` meses de cada grupo. Corta al llegar a `hastaMs` (lo que faltó,
 *  la próxima vez). */
export async function traerFacturacionMl(org: string | null, opts: Opciones) {
  const leer: Leer = opts.leer ?? ((c, r) => ml(c, "GET", r));
  const cuentas = await consulta<{ id: number; organizacion_id: string; canal_id: number | null; meli_user_id: string; nickname: string | null; estado: string }>(`
    select id::int, organizacion_id, canal_id::int, meli_user_id, nickname, estado from meli_cuenta
     where estado = 'activa' and canal_id is not null and ($1::text is null or organizacion_id = $1) and ($2::bigint is null or id = $2)
       and ($3::bigint is null or canal_id = $3)
     order by id`, [org, opts.cuentaId ?? null, opts.canalId ?? null]);
  const informe: Record<string, unknown> = {};
  for (const f of cuentas) {
    if (Date.now() > opts.hastaMs - 3_000) break;
    const cuenta: CuentaMl = { id: f.id, organizacionId: f.organizacion_id, canalId: f.canal_id, meliUserId: Number(f.meli_user_id), nickname: f.nickname, estado: f.estado };
    const r = await leerCuenta(cuenta, leer, opts);
    await consulta(`insert into ml_facturacion_lectura (cuenta_id, organizacion_id, ultimo_ts, resultado) values ($1, $2, now(), $3::jsonb)
                    on conflict (cuenta_id) do update set ultimo_ts = now(), resultado = excluded.resultado`, [cuenta.id, cuenta.organizacionId, JSON.stringify(r)]);
    informe[cuenta.nickname ?? String(cuenta.id)] = r;
  }
  const orgs = [...new Set(cuentas.map((c) => c.organizacion_id))];
  for (const o of orgs) await vincularCargos(o);
  return informe;
}

async function leerCuenta(cuenta: CuentaMl, leer: Leer, opts: Opciones) {
  let ultimo = 0;
  const pedir = async (ruta: string) => {
    const espera = ultimo + RITMO_LECTURA_MS - Date.now();
    if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
    ultimo = Date.now();
    return leer(cuenta, ruta);
  };
  const sinTiempo = () => Date.now() > opts.hastaMs - 2_000;
  const res = { periodos: 0, documentos: 0, cargos: 0, incompleto: false, avisos: [] as string[] };
  const n = Math.max(1, Math.min(opts.periodos ?? 2, 12));
  for (const grupo of ["ML", "MP"] as Grupo[]) {
    if (sinTiempo()) { res.incompleto = true; break; }
    const rp = await pedir(`/billing/integration/monthly/periods?group=${grupo}&document_type=BILL&offset=0&limit=${n}`);
    if (rp.status !== 200) {
      res.avisos.push(`${grupo}: Mercado Libre contestó ${rp.status} a la lista de períodos`);
      continue;
    }
    const periodos = ((rp.datos as { results?: PeriodoMl[] })?.results ?? []).filter((p) => p.key)
      .sort((a, b) => String(b.key).localeCompare(String(a.key))).slice(0, n);
    for (const p of periodos) {
      await consulta(`
        insert into ml_factura_periodo (organizacion_id, cuenta_id, canal_id, grupo, clave, desde, hasta, vencimiento, monto, impago, datos, leido_ts)
        values ($1, $2, $3, $4, $5, $6::date, $7::date, $8::date, $9, $10, $11::jsonb, now())
        on conflict (cuenta_id, grupo, clave) do update set desde = excluded.desde, hasta = excluded.hasta, vencimiento = excluded.vencimiento,
          monto = excluded.monto, impago = excluded.impago, datos = excluded.datos, canal_id = excluded.canal_id, leido_ts = now()`,
        [cuenta.organizacionId, cuenta.id, cuenta.canalId, grupo, p.key, p.period?.date_from?.slice(0, 10) ?? null, p.period?.date_to?.slice(0, 10) ?? null,
          p.expiration_date?.slice(0, 10) ?? null, p.amount ?? null, p.unpaid_amount ?? null, JSON.stringify(p)]);
      res.periodos++;
      let completo = true;
      // Documentos (facturas y notas de crédito de ML).
      for (const tipo of ["BILL", "CREDIT_NOTE"] as const) {
        for (let offset = 0; ; offset += POR_PAGINA) {
          if (sinTiempo()) { completo = false; break; }
          const r = await pedir(`/billing/integration/periods/key/${encodeURIComponent(p.key!)}/documents?group=${grupo}&document_type=${tipo}&offset=${offset}&limit=${POR_PAGINA}`);
          if (r.status !== 200) { if (r.status !== 404) res.avisos.push(`${grupo} ${p.key} documentos ${tipo}: ${r.status}`); break; }
          const d = r.datos as { results?: DocumentoMl[]; total?: number };
          const filas = (d.results ?? []).map((x) => mapearDocumento(x, tipo)).filter((x): x is FilaDocumento => !!x);
          res.documentos += await guardarDocumentos(cuenta, grupo, p.key!, filas);
          if ((d.results ?? []).length < POR_PAGINA || (d.total != null && offset + POR_PAGINA >= d.total)) break;
        }
      }
      // Detalle de cargos.
      for (const tipo of ["BILL", "CREDIT_NOTE"] as const) {
        for (let offset = 0; ; offset += POR_PAGINA) {
          if (sinTiempo()) { completo = false; break; }
          const r = await pedir(`/billing/integration/periods/key/${encodeURIComponent(p.key!)}/group/${grupo}/details?document_type=${tipo}&offset=${offset}&limit=${POR_PAGINA}`);
          if (r.status !== 200) { if (r.status !== 404) res.avisos.push(`${grupo} ${p.key} detalle ${tipo}: ${r.status}`); break; }
          const d = r.datos as { results?: DetalleMl[]; total?: number };
          const filas = (d.results ?? []).map((x) => mapearCargo(x, tipo === "CREDIT_NOTE")).filter((x): x is FilaCargo => !!x);
          res.cargos += await guardarCargos(cuenta, grupo, p.key!, filas, tipo === "CREDIT_NOTE");
          if ((d.results ?? []).length < POR_PAGINA || (d.total != null && offset + POR_PAGINA >= d.total)) break;
        }
      }
      if (completo) await consulta("update ml_factura_periodo set detalle_ts = now() where cuenta_id = $1 and grupo = $2 and clave = $3", [cuenta.id, grupo, p.key]);
      else { res.incompleto = true; break; }
    }
  }
  return res;
}

async function guardarDocumentos(cuenta: CuentaMl, grupo: Grupo, clave: string, filas: FilaDocumento[]) {
  if (!filas.length) return 0;
  await consulta(`
    insert into ml_factura_documento (organizacion_id, cuenta_id, canal_id, grupo, clave, documento_id, tipo, numero, punto_venta, numero_cbte, fecha, monto, moneda, estado, archivos, datos, leido_ts)
    select $1, $2, $6, $3, $4, x.documento_id, x.tipo, x.numero, x.punto_venta, x.numero_cbte, x.fecha::date, x.monto, x.moneda, x.estado, coalesce(x.archivos, '[]'), coalesce(x.datos, '{}'), now()
      from jsonb_to_recordset($5::jsonb) x(documento_id text, tipo text, numero text, punto_venta int, numero_cbte bigint, fecha text, monto numeric, moneda text,
                                            estado text, archivos jsonb, datos jsonb)
    on conflict (cuenta_id, grupo, documento_id) do update set tipo = excluded.tipo, numero = excluded.numero, punto_venta = excluded.punto_venta,
      numero_cbte = excluded.numero_cbte, fecha = excluded.fecha, monto = excluded.monto, moneda = excluded.moneda, estado = excluded.estado,
      archivos = excluded.archivos, datos = excluded.datos, clave = excluded.clave, canal_id = excluded.canal_id, leido_ts = now()`,
    [cuenta.organizacionId, cuenta.id, grupo, clave, JSON.stringify(filas), cuenta.canalId]);
  return filas.length;
}

/** Guarda los cargos (uno por id de detalle: leer dos veces no duplica). Los
 *  del detalle de notas de crédito sólo se suman si no estaban (por si ML no
 *  separa por tipo de documento). */
async function guardarCargos(cuenta: CuentaMl, grupo: Grupo, clave: string, filas: FilaCargo[], notaCredito: boolean) {
  if (!filas.length) return 0;
  await consulta(`
    insert into ml_cargo (organizacion_id, cuenta_id, canal_id, grupo, clave, detalle_id, documento_id, fecha, tipo, impuesto, concepto, subtipo, monto, moneda, order_id, item_id, datos, leido_ts)
    select $1, $2, $3, $4, $5, x.detalle_id, x.documento_id, x.fecha::timestamptz, x.tipo, x.impuesto, x.concepto, x.subtipo, x.monto, x.moneda, x.order_id, x.item_id,
           coalesce(x.datos, '{}'), now()
      from jsonb_to_recordset($6::jsonb) x(detalle_id text, documento_id text, fecha text, tipo text, impuesto text, concepto text, subtipo text, monto numeric,
                                            moneda text, order_id text, item_id text, datos jsonb)
    on conflict (cuenta_id, grupo, detalle_id) do ${notaCredito ? "nothing" : `update set documento_id = excluded.documento_id, fecha = excluded.fecha, tipo = excluded.tipo,
      impuesto = excluded.impuesto, concepto = excluded.concepto, subtipo = excluded.subtipo, monto = excluded.monto, moneda = excluded.moneda,
      order_id = excluded.order_id, item_id = excluded.item_id, datos = excluded.datos, clave = excluded.clave, canal_id = excluded.canal_id, leido_ts = now()`}`,
    [cuenta.organizacionId, cuenta.id, cuenta.canalId, grupo, clave, JSON.stringify(filas)]);
  return filas.length;
}

/** Une cada cargo con su pedido: por el id de la orden (pedido.id_externo, o la
 *  línea del carrito que vino de esa orden) o por el carrito (pack). */
export async function vincularCargos(org: string) {
  const a = await consulta(`
    update ml_cargo c set pedido_id = p.id from pedido p
     where c.organizacion_id = $1 and c.pedido_id is null and c.order_id is not null
       and p.organizacion_id = c.organizacion_id and (c.canal_id is null or p.canal_id = c.canal_id)
       and p.id_externo is not null and p.id_externo in (c.order_id, c.datos ->> 'pack_id')
    returning c.id`, [org]);
  const b = await consulta(`
    update ml_cargo c set pedido_id = l.pedido_id from pedido_linea l join pedido p on p.id = l.pedido_id
     where c.organizacion_id = $1 and c.pedido_id is null and c.order_id is not null
       and l.datos_externos #>> '{ml,order_id}' = c.order_id and p.organizacion_id = c.organizacion_id and (c.canal_id is null or p.canal_id = c.canal_id)
    returning c.id`, [org]);
  return a.length + b.length;
}

/** ¿Hay alguna cuenta que no se leyó en las últimas 20 horas? (para la nocturna) */
export async function facturacionPendiente(): Promise<boolean> {
  return !!(await una(`
    select 1 from meli_cuenta mc where mc.estado = 'activa' and mc.canal_id is not null
       and not exists (select 1 from ml_facturacion_lectura l where l.cuenta_id = mc.id and l.ultimo_ts > now() - interval '20 hours')
     limit 1`));
}

// ── Consultas para las pantallas ───────────────────────────

/** SQL: lo que costó la venta en ML (alias del pedido `p`), sin impuestos; null si no hay cargos leídos. */
export const sqlCargosMl = (p = "p") => `(select sum(c.monto) from ml_cargo c where c.pedido_id = ${p}.id and c.tipo in ${SQL_TIPOS_COSTO})`;

/** Igual, en dólares: cada cargo al dólar de su día (ml_cargo.tc_dia). */
export const sqlCargosMlUsd = (p = "p") => `(select sum(c.monto / nullif(c.tc_dia, 0)) from ml_cargo c where c.pedido_id = ${p}.id and c.tipo in ${SQL_TIPOS_COSTO})`;

/** Los cargos de un pedido, por tipo. */
export function cargosDelPedido(org: string, pedidoId: number) {
  return consulta<{ tipo: TipoCargo; impuesto: Impuesto | null; concepto: string | null; monto: number; tc_dia: number | null; fecha: Date | null; grupo: Grupo; order_id: string | null }>(`
    select tipo, impuesto, concepto, monto::float, tc_dia::float, fecha, grupo, order_id from ml_cargo
     where organizacion_id = $1 and pedido_id = $2 order by tipo, fecha, id`, [org, pedidoId]);
}

// Filtro "Cuenta" (3/10): cada consulta de la pantalla recibe `canal` (el
// canal de ML de la cuenta elegida; null = todas las cuentas). Cada fila trae
// `canal_id` y `cuenta` (el nombre del canal, o el apodo de la cuenta de ML).

/** Las cuentas de ML de la organización (sus canales), para el filtro. */
export function cuentasMl(org: string) {
  return consulta<{ id: number; nombre: string }>(`
    select ca.id::int, ca.nombre from canal ca where ca.organizacion_id = $1 and ca.tipo = 'mercadolibre' order by ca.nombre, ca.id`, [org]);
}

/** El canal pedido por la dirección (?canal=), sólo si es una de las cuentas
 *  de la organización; si no, null (todas las cuentas). */
export function canalElegido(valor: string | null | undefined, cuentas: { id: number }[]): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 && cuentas.some((c) => c.id === n) ? n : null;
}

/** ¿Va la columna "Cuenta"? Con todas las cuentas y más de una conectada. */
export const mostrarCuenta = (canal: number | null, cuentas: unknown[]) => canal == null && cuentas.length > 1;

const SQL_CUENTA = (t: string) => `coalesce((select ca.nombre from canal ca where ca.id = ${t}.canal_id), (select mc.nickname from meli_cuenta mc where mc.id = ${t}.cuenta_id))`;

/** Los períodos leídos (para elegir), del más nuevo al más viejo. */
export function periodosLeidos(org: string, canal: number | null = null) {
  return consulta<{ clave: string; desde: string | null; hasta: string | null; grupos: string[]; monto: number | null }>(`
    select clave, to_char(min(desde), 'YYYY-MM-DD') desde, to_char(max(hasta), 'YYYY-MM-DD') hasta, array_agg(distinct grupo) grupos, sum(monto)::float monto
      from ml_factura_periodo where organizacion_id = $1 and ($2::bigint is null or canal_id = $2) group by clave order by clave desc`, [org, canal]);
}

/** Totales de cargos del período por cuenta, grupo y tipo. */
export function resumenPeriodo(org: string, clave: string, canal: number | null = null) {
  return consulta<{ canal_id: number | null; cuenta: string | null; grupo: Grupo; tipo: TipoCargo; n: number; monto: number; vinculados: number }>(`
    select c.canal_id::int, ${SQL_CUENTA("c")} cuenta, c.grupo, c.tipo, count(*)::int n, sum(c.monto)::float monto, count(c.pedido_id)::int vinculados
      from ml_cargo c
     where c.organizacion_id = $1 and c.clave = $2 and ($3::bigint is null or c.canal_id = $3)
     group by c.canal_id, c.cuenta_id, c.grupo, c.tipo order by cuenta, c.grupo, c.tipo`, [org, clave, canal]);
}

/** Retenciones y percepciones del período (cargos de tipo impuesto). */
export function impuestosPeriodo(org: string, clave: string, canal: number | null = null) {
  return consulta<{ id: number; canal_id: number | null; cuenta: string | null; grupo: Grupo; impuesto: Impuesto | null; concepto: string | null; fecha: Date | null; monto: number;
    order_id: string | null; pedido_id: number | null; documento: string | null }>(`
    select c.id::int, c.canal_id::int, ${SQL_CUENTA("c")} cuenta, c.grupo, c.impuesto, c.concepto, c.fecha, c.monto::float, c.order_id, c.pedido_id::int,
           c.datos ->> 'documento_legal' documento from ml_cargo c
     where c.organizacion_id = $1 and c.clave = $2 and c.tipo = 'impuesto' and ($3::bigint is null or c.canal_id = $3)
     order by c.impuesto, c.fecha, c.id`, [org, clave, canal]);
}

/** Control: cada documento de ML del período contra las facturas de compra
 *  importadas de ARCA con el CUIT de Mercado Libre; y las de ARCA de esas
 *  fechas que la API no trae. Con una cuenta elegida, se ven sus documentos;
 *  "En ARCA y no en la API" descarta igual las facturas que coinciden con un
 *  documento de cualquier cuenta (las facturas de compra no dicen de qué
 *  cuenta son: todas vienen con el mismo CUIT de Mercado Libre). */
export async function controlPeriodo(org: string, clave: string, cuits: string[], canal: number | null = null) {
  const todos = await consulta<{ id: number; canal_id: number | null; cuenta: string | null; grupo: Grupo; tipo: string; numero: string | null; punto_venta: number | null;
    numero_cbte: string | null; fecha: string | null; monto: number; factura_id: number | null; factura_total: number | null }>(`
    select d.id::int, d.canal_id::int, ${SQL_CUENTA("d")} cuenta, d.grupo, d.tipo, d.numero, d.punto_venta, d.numero_cbte::text, to_char(d.fecha, 'YYYY-MM-DD') fecha, d.monto::float,
           f.id::int factura_id, f.total::float factura_total
      from ml_factura_documento d
      left join lateral (
        select f.id, f.total from factura_compra f join proveedor pr on pr.id = f.proveedor_id
         where f.organizacion_id = d.organizacion_id and f.estado <> 'anulada' and regexp_replace(pr.cuit, '\\D', '', 'g') = any($3::text[])
           and f.es_nota_credito = (d.tipo = 'CREDIT_NOTE') and d.numero_cbte is not null and f.numero = d.numero_cbte
           and (d.punto_venta is null or f.punto_venta = d.punto_venta)
         order by f.id limit 1) f on true
     where d.organizacion_id = $1 and d.clave = $2 order by d.fecha, d.numero, cuenta`, [org, clave, cuits]);
  const docs = canal == null ? todos : todos.filter((d) => d.canal_id === canal);
  const rango = await una<{ desde: string | null; hasta: string | null }>(`
    select to_char(min(desde), 'YYYY-MM-DD') desde, to_char(max(hasta) + 10, 'YYYY-MM-DD') hasta from ml_factura_periodo
     where organizacion_id = $1 and clave = $2 and ($3::bigint is null or canal_id = $3)`, [org, clave, canal]);
  const usadas = todos.map((d) => d.factura_id).filter((x): x is number => x != null);
  const sobran = rango?.desde ? await consulta<{ id: number; letra: string; es_nota_credito: boolean; punto_venta: number | null; numero: string | null; fecha: string; total: number }>(`
    select f.id::int, f.letra, f.es_nota_credito, f.punto_venta, f.numero::text, to_char(f.fecha, 'YYYY-MM-DD') fecha, f.total::float
      from factura_compra f join proveedor pr on pr.id = f.proveedor_id
     where f.organizacion_id = $1 and f.estado <> 'anulada' and regexp_replace(pr.cuit, '\\D', '', 'g') = any($2::text[])
       and f.fecha between $3::date and $4::date and not (f.id = any($5::bigint[]))
     order by f.fecha, f.numero`, [org, cuits, rango.desde, rango.hasta, usadas]) : [];
  return { docs, sobran };
}
