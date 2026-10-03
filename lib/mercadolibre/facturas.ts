// Subir la factura (el PDF del comprobante) a la venta de Mercado Libre.
// ML le pide al vendedor que adjunte el documento fiscal de cada venta:
//   POST /packs/{pack_id}/fiscal_documents, multipart/form-data, campo
//   `fiscal_document` = el PDF. Una venta sin carrito usa el id de la orden
//   como pack (es lo que guarda pedido.id_externo en los dos casos). ML acepta
//   varios documentos por venta: la factura y, si la hay, su nota de crédito.
//
// Como todo lo que va a ML (AGENTS.md → "Cambios en Mercado Libre: siempre por
// un clic de Fer"), pasa por la cola (lib/mercadolibre/cola.ts, tipo 'factura'):
//   · solo, al autorizarse el comprobante, si el canal tiene prendido
//     "Subir facturas a Mercado Libre" (canal.config.subir_facturas; prenderlo
//     es el clic de Fer);
//   · con el botón de la ficha del comprobante o del pedido (origen 'boton',
//     aunque el interruptor esté apagado);
//   · en lote, "Subir a ML las facturas que faltan": queda preparado y sale
//     cuando Fer aprieta "Mandar a Mercado Libre" en la cola.
// Lo que contestó ML queda en el comprobante (ml_documento_id, ml_subida_ts):
// uno subido no se vuelve a subir.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { encolar, encolarLoteConBoton, PRIORIDAD, type CambioMl } from "@/lib/mercadolibre/cola";
import { mlArchivo, type ArchivoMl, type CuentaMl, type RespuestaMl } from "@/lib/mercadolibre/api";
import { sqlCarritoEnEspera, carritoEnEspera } from "@/lib/pedidos";
import { TIPOS_CBTE } from "@/lib/arca/facturar";

export const TIPO_FACTURA = "factura" as const;
export const CAMPO_ARCHIVO = "fiscal_document";
export const itemFactura = (comprobanteId: number) => `cbte:${comprobanteId}`;
export const rutaFactura = (packId: string) => `/packs/${packId}/fiscal_documents`;

/** Cómo se sube el archivo: por defecto, la API de ML. Los tests pasan otro. */
export type SubirArchivo = (cuenta: CuentaMl, ruta: string, campo: string, archivo: ArchivoMl) => Promise<RespuestaMl>;
export const subirDeVerdad: SubirArchivo = (c, r, campo, a) => mlArchivo(c, r, campo, a);

const numeroCbte = (pv: number, n: string | number | null) => `${String(pv).padStart(5, "0")}-${String(n ?? 0).padStart(8, "0")}`;

/** SQL: el estado en ML del comprobante (alias `cb`): 'subida', o el de su
 *  último envío en la cola ('preparado', 'pendiente', 'enviando', 'error',
 *  'descartado', 'ok'), o null si nunca se intentó. */
export const sqlEstadoFacturaMl = (cb = "cb") => `(case when ${cb}.ml_subida_ts is not null then 'subida' else
  (select q.estado from ml_cola q where q.tipo = 'factura' and q.item_id = 'cbte:' || ${cb}.id order by q.id desc limit 1) end)`;

/** SQL: para un pedido (alias `p`) de ML, el estado en ML de su última
 *  factura autorizada: 'subida' / un estado de la cola / 'falta' (no se
 *  intentó) / null (no tiene factura o no es de ML). */
export const sqlFacturaMlDelPedido = (p = "p") => `(select coalesce(${sqlEstadoFacturaMl("fx")}, 'falta')
    from comprobante fx join canal cx on cx.id = ${p}.canal_id and cx.tipo = 'mercadolibre'
   where fx.pedido_id = ${p}.id and fx.estado = 'autorizado' and fx.tipo_cbte in (1, 6, 11) and ${p}.id_externo is not null
   order by fx.id desc limit 1)`;

/** Cómo se muestra cada estado (para pantallas). */
export const ESTADO_FACTURA_ML: Record<string, { texto: string; tono: "verde" | "gris" | "amarillo" | "rojo" | "azul" }> = {
  subida: { texto: "Subida a ML", tono: "verde" },
  ok: { texto: "Subida a ML", tono: "verde" },
  preparado: { texto: "Preparada, falta tu clic", tono: "amarillo" },
  pendiente: { texto: "Pendiente de subir", tono: "azul" },
  enviando: { texto: "Subiendo", tono: "azul" },
  error: { texto: "Con error", tono: "rojo" },
  descartado: { texto: "No se subió (descartada)", tono: "gris" },
  falta: { texto: "Falta subirla", tono: "gris" },
};

type Candidato = { comprobante_id: number; canal_id: number; pack_id: string; tipo_cbte: number; punto_venta: number; numero: string | null; sube_solo: boolean };

/** Los comprobantes autorizados de pedidos de ML que todavía no están en ML
 *  ni en camino (sin otro envío preparado o pendiente en la cola), salvo los
 *  de un carrito en espera. */
async function candidatos(org: string, ids: number[] | null, limite = 2000): Promise<Candidato[]> {
  return consulta<Candidato>(`
    select cb.id::int comprobante_id, p.canal_id::int, p.id_externo pack_id, cb.tipo_cbte, cb.punto_venta, cb.numero::text,
           coalesce((ca.config ->> 'subir_facturas')::boolean, false) sube_solo
      from comprobante cb
      join pedido p on p.id = cb.pedido_id
      join canal ca on ca.id = p.canal_id and ca.tipo = 'mercadolibre'
     where cb.organizacion_id = $1 and cb.estado = 'autorizado' and cb.ml_subida_ts is null
       and coalesce(p.id_externo, '') ~ '^[0-9]+$'
       and ($2::bigint[] is null or cb.id = any($2::bigint[]))
       and not ${sqlCarritoEnEspera("p")}
       and not exists (select 1 from ml_cola q where q.canal_id = p.canal_id and q.tipo = 'factura' and q.item_id = 'cbte:' || cb.id
                          and q.estado in ('preparado', 'pendiente', 'enviando'))
     order by cb.id limit $3`, [org, ids, limite]);
}

function cambioDe(c: Candidato): CambioMl {
  const nombre = TIPOS_CBTE[c.tipo_cbte]?.nombre ?? "Comprobante";
  return {
    canalId: c.canal_id, itemId: itemFactura(c.comprobante_id), tipo: TIPO_FACTURA,
    payload: { comprobante_id: c.comprobante_id, pack_id: c.pack_id, descripcion: `Subir ${nombre} ${numeroCbte(c.punto_venta, c.numero)} a la venta ${c.pack_id}` },
    prioridad: PRIORIDAD.normal,
  };
}

/** Al autorizarse un comprobante (lo llama `emitir`): si es de un pedido de
 *  ML y el canal tiene prendido "Subir facturas a Mercado Libre", entra a la
 *  cola. Devuelve cuántos encoló (0 o 1). */
export async function alAutorizarComprobante(org: string, comprobanteId: number): Promise<number> {
  const c = (await candidatos(org, [comprobanteId])).filter((x) => x.sube_solo);
  if (!c.length) return 0;
  const r = await encolar(org, c.map(cambioDe), { origen: "automatico" });
  return r.encoladas + r.reemplazadas;
}

/** El botón "Subir factura a Mercado Libre" (clic de Fer): entra a la cola
 *  aunque el interruptor del canal esté apagado. Tira ErrorErp en criollo si
 *  no corresponde. */
export async function subirFacturaConBoton(org: string, comprobanteId: number, usuario: string | null): Promise<string> {
  const [c] = await candidatos(org, [comprobanteId]);
  if (!c) throw new ErrorErp(await porQueNo(org, comprobanteId));
  await encolar(org, [cambioDe(c)], { origen: "boton", usuarioId: usuario });
  return "La factura quedó en la cola para subirse a Mercado Libre; sale en un momento.";
}

/** La última factura (o nota de crédito) del pedido que se puede subir. */
export async function subirFacturaDelPedidoConBoton(org: string, pedidoId: number, usuario: string | null): Promise<string> {
  const ids = (await consulta<{ id: number }>(
    "select id::int from comprobante where organizacion_id = $1 and pedido_id = $2 and estado = 'autorizado' order by id", [org, pedidoId])).map((x) => x.id);
  if (!ids.length) throw new ErrorErp("El pedido no tiene ninguna factura autorizada.");
  const c = await candidatos(org, ids);
  if (!c.length) throw new ErrorErp(await porQueNo(org, ids[ids.length - 1]));
  await encolar(org, c.map(cambioDe), { origen: "boton", usuarioId: usuario });
  return c.length === 1 ? "La factura quedó en la cola para subirse a Mercado Libre; sale en un momento."
    : `${c.length} comprobantes quedaron en la cola para subirse a Mercado Libre.`;
}

/** "Subir a ML las facturas que faltan": un lote preparado por canal, que
 *  sale con el clic en "Mandar a Mercado Libre" de la cola. */
export async function prepararLoteFacturasFaltantes(org: string, usuario: string | null): Promise<{ lotes: number[]; facturas: number }> {
  const c = await candidatos(org, null);
  if (!c.length) throw new ErrorErp("No falta subir ninguna factura: todas las de Mercado Libre ya están subidas o en la cola.");
  const porCanal = new Map<number, Candidato[]>();
  for (const x of c) porCanal.set(x.canal_id, [...(porCanal.get(x.canal_id) ?? []), x]);
  const lotes: number[] = [];
  for (const [canal, xs] of porCanal) {
    lotes.push(await encolarLoteConBoton(org, canal, xs.map(cambioDe), `Subir ${xs.length} factura${xs.length === 1 ? "" : "s"} a Mercado Libre`, usuario));
  }
  return { lotes, facturas: c.length };
}

/** Por qué un comprobante no se puede subir (para el mensaje del botón). */
async function porQueNo(org: string, comprobanteId: number): Promise<string> {
  const x = await una<{ estado: string; ml_subida_ts: Date | null; canal_tipo: string | null; id_externo: string | null; carrito_ultimo_evento_ts: Date | null; en_cola: boolean }>(`
    select cb.estado, cb.ml_subida_ts, ca.tipo canal_tipo, p.id_externo, p.carrito_ultimo_evento_ts,
           exists (select 1 from ml_cola q where q.tipo = 'factura' and q.item_id = 'cbte:' || cb.id and q.estado in ('preparado', 'pendiente', 'enviando')) en_cola
      from comprobante cb left join pedido p on p.id = cb.pedido_id left join canal ca on ca.id = p.canal_id
     where cb.id = $1 and cb.organizacion_id = $2`, [comprobanteId, org]);
  if (!x) return "El comprobante no existe.";
  if (x.estado !== "autorizado") return "El comprobante todavía no está autorizado por ARCA.";
  if (x.canal_tipo !== "mercadolibre" || !x.id_externo) return "El comprobante no es de una venta de Mercado Libre.";
  if (x.ml_subida_ts) return "Esa factura ya está subida a Mercado Libre.";
  if (x.en_cola) return "Esa factura ya está en la cola para subirse.";
  if (carritoEnEspera(x)) return "El carrito de Mercado Libre todavía está en espera: probá de nuevo en unos minutos.";
  return "Ese comprobante no se puede subir a Mercado Libre.";
}

// ── El envío (lo llama el trabajador de la cola) ─────────────

export type ResultadoEnvioFactura =
  | { tipo: "respuesta"; r: RespuestaMl; mensajeError?: string; enviado: boolean }
  | { tipo: "esperar"; ms: number }
  | { tipo: "error"; mensaje: string };

/** ¿ML dice que esa venta ya tiene ese documento? Entonces está bien. */
export function yaTeniaDocumento(status: number, datos: unknown): boolean {
  if (status < 400 || status >= 500) return false;
  const texto = typeof datos === "string" ? datos : JSON.stringify(datos ?? "");
  return /already|duplicat|ya (tiene|existe|fue|cuenta)/i.test(texto);
}

/** Lo que contestó ML al subir, en criollo. */
export function errorFacturaLegible(status: number, datos: unknown, packId: string): string {
  const d = datos as { message?: string; error?: string; cause?: { message?: string }[] } | string;
  const detalle = typeof d === "string" ? d.slice(0, 200)
    : [d?.message, ...(Array.isArray(d?.cause) ? d.cause.map((c) => c?.message) : [])].filter(Boolean).join(" · ").slice(0, 300);
  const queEs = status === 401 ? "La cuenta está desconectada (hay que volver a conectarla)"
    : status === 403 ? "Mercado Libre no deja subir facturas con esta cuenta"
    : status === 404 ? `Mercado Libre no encuentra la venta ${packId}`
    : status === 413 ? "El PDF es demasiado grande para Mercado Libre"
    : status === 429 ? "Mercado Libre pidió que vayamos más despacio; se reintenta solo"
    : status === 0 ? "Mercado Libre no respondió; se reintenta solo"
    : status >= 500 ? `Mercado Libre tuvo un problema de su lado (${status}); se reintenta solo`
    : `Mercado Libre no aceptó el documento (${status})`;
  return `${queEs}${detalle && status !== 0 ? `: ${detalle}` : ""}`;
}

/** El id que devuelve ML ({ids: [...]}, o {id}). */
function idDocumento(datos: unknown): string | null {
  const d = datos as { ids?: unknown[]; id?: unknown; fiscal_document_id?: unknown } | null;
  if (!d || typeof d !== "object") return null;
  const id = Array.isArray(d.ids) ? d.ids[0] : d.id ?? d.fiscal_document_id;
  return id == null ? null : String(id);
}

/** Sube el PDF de un comprobante a su venta. No vuelve a subir uno ya subido;
 *  un carrito en espera se pospone. Si ML lo acepta (o ya lo tenía), lo
 *  anota en el comprobante. */
export async function enviarFactura(org: string, payload: Record<string, unknown>, cuenta: CuentaMl,
  subir: SubirArchivo = subirDeVerdad): Promise<ResultadoEnvioFactura> {
  const id = Number(payload.comprobante_id);
  const cb = await una<{ estado: string; ml_subida_ts: Date | null; tipo_cbte: number; punto_venta: number; numero: string | null; pack_id: string | null;
    canal_id: string | null; carrito_ultimo_evento_ts: Date | null; ahora: Date }>(`
    select cb.estado, cb.ml_subida_ts, cb.tipo_cbte, cb.punto_venta, cb.numero::text, p.id_externo pack_id, p.canal_id, p.carrito_ultimo_evento_ts, now() ahora
      from comprobante cb left join pedido p on p.id = cb.pedido_id where cb.id = $1 and cb.organizacion_id = $2`, [id, org]);
  if (!cb) return { tipo: "error", mensaje: "El comprobante ya no existe." };
  if (cb.ml_subida_ts) return { tipo: "respuesta", r: { status: 200, datos: { ya_estaba: true } }, enviado: false };
  if (cb.estado !== "autorizado") return { tipo: "error", mensaje: "El comprobante no está autorizado por ARCA." };
  const pack = String(cb.pack_id ?? "");
  if (!/^[0-9]+$/.test(pack) || Number(cb.canal_id) !== cuenta.canalId) return { tipo: "error", mensaje: "El comprobante no es de una venta de esta cuenta de Mercado Libre." };
  const espera = carritoEnEspera(cb, new Date(cb.ahora).getTime());
  if (espera) return { tipo: "esperar", ms: espera.desde.getTime() - new Date(cb.ahora).getTime() + 5_000 };

  const { pdfComprobante } = await import("@/lib/arca/pdf");
  let datos: Uint8Array;
  try {
    datos = await pdfComprobante(org, id);
  } catch (e) {
    return { tipo: "error", mensaje: `No se pudo armar el PDF: ${(e as Error).message}` };
  }
  const letra = TIPOS_CBTE[cb.tipo_cbte]?.nc ? "NC" : "Factura";
  const nombre = `${letra}-${TIPOS_CBTE[cb.tipo_cbte]?.letra ?? ""}-${numeroCbte(cb.punto_venta, cb.numero)}.pdf`;
  const r = await subir(cuenta, rutaFactura(pack), CAMPO_ARCHIVO, { nombre, tipo: "application/pdf", datos });
  const ok = r.status >= 200 && r.status < 300;
  if (ok || yaTeniaDocumento(r.status, r.datos)) {
    await consulta("update comprobante set ml_documento_id = coalesce($3, ml_documento_id), ml_subida_ts = now() where id = $1 and organizacion_id = $2",
      [id, org, ok ? idDocumento(r.datos) : null]);
    return { tipo: "respuesta", r: ok ? r : { status: 200, datos: { ya_estaba: true, ml: r.datos } }, enviado: true };
  }
  return { tipo: "respuesta", r, mensajeError: errorFacturaLegible(r.status, r.datos, pack), enviado: true };
}

/** El estado en ML de un comprobante, para su ficha y la del pedido. */
export async function estadoFacturaMl(org: string, comprobanteId: number) {
  return una<{ es_ml: boolean; estado: string | null; subida_ts: Date | null; documento_id: string | null; error: string | null; cola_id: number | null }>(`
    select (ca.tipo = 'mercadolibre' and p.id_externo is not null) es_ml, ${sqlEstadoFacturaMl("cb")} estado, cb.ml_subida_ts subida_ts,
           cb.ml_documento_id documento_id,
           (select q.ultimo_error from ml_cola q where q.tipo = 'factura' and q.item_id = 'cbte:' || cb.id order by q.id desc limit 1) error,
           (select q.id::int from ml_cola q where q.tipo = 'factura' and q.item_id = 'cbte:' || cb.id order by q.id desc limit 1) cola_id
      from comprobante cb left join pedido p on p.id = cb.pedido_id left join canal ca on ca.id = p.canal_id
     where cb.id = $1 and cb.organizacion_id = $2`, [comprobanteId, org]);
}
