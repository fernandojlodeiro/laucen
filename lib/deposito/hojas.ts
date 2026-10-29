// Etiqueta + hoja de preparación por pedido (Fer, 3/10): un solo PDF que,
// para cada pedido y en orden, trae primero su etiqueta de envío (la de
// Mercado Libre, bajada de ML; para la web o el local, una nuestra con N.º de
// pedido, cliente, dirección o "retira" y teléfono) y enseguida su hoja de
// preparación: N.º de pedido grande con su código de barras, cliente, canal,
// fecha, logística, "despachar antes de" y las líneas por orden de recorrido
// (ubicación, SKU, título, cantidad grande y un cuadrado para tildar a mano;
// los kits abiertos en sus componentes). Tamaño 10×15 cm (la térmica de las
// etiquetas de ML) o A4; en A4, todo en una hoja por pedido (Fer, 3/10): la
// etiqueta arriba a la izquierda, el encabezado al costado y las líneas abajo.
//
// Lo que retira el cliente en el local (web o Mercado Libre sin envío) no lleva etiqueta: en su lugar va el REMITO DE
// ENTREGA (Fer, 29/10): membrete, el detalle de lo que se lleva y el «recibí conforme» para que firme quien retira (el
// titular o un transportista), con aclaración y DNI. Se escanea firmado y se sube al pedido como conforme de retiro.
//
// Acá: juntar los datos (datosHojas) y dibujar el PDF (armarPdf, sin base:
// la etiqueta de ML llega por una función, así los tests la reemplazan).

import { PDFDocument, StandardFonts, rgb, type PDFEmbeddedPage, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import bwipjs from "bwip-js/node";
import { consulta, una } from "@/lib/erp/base";
import { sqlACobrar } from "@/lib/pedidos";
import { cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { bajarEtiquetas } from "@/lib/mercadolibre/envios";
import { recorteEtiquetaMl } from "@/lib/deposito/recorte-ml";
import { emisorDe } from "@/lib/arca/facturar";
import { cuitLegible } from "@/lib/cuit";
import sharp from "sharp";

export type TamHoja = "10x15" | "a4";
export const TAMANOS: [TamHoja, string][] = [["10x15", "10 × 15 cm (térmica)"], ["a4", "A4"]];
export const esTamHoja = (x: unknown): x is TamHoja => x === "10x15" || x === "a4";
/** La cookie donde queda el tamaño elegido. */
export const COOKIE_TAM = "hoja_tam";

const MM = 72 / 25.4;
const PAGINA: Record<TamHoja, [number, number]> = { "10x15": [100 * MM, 150 * MM], a4: [595.28, 841.89] };

export const LOGISTICA_TEXTO: Record<string, string> = {
  fulfillment: "Full", self_service: "Flex", cross_docking: "Colecta", xd_drop_off: "Colecta",
  drop_off: "Despacho en correo", custom: "A convenir", not_specified: "A convenir", oca: "OCA",
};

export type LineaHoja = {
  ubicacion: string | null; orden_recorrido: number | null; sku: string | null; titulo: string; cantidad: number;
  /** Si es componente de un kit: el kit (SKU, título y cuántos kits pidieron). */
  kit: { sku: string; titulo: string; cantidad?: number } | null;
};

export type EtiquetaHoja =
  | { tipo: "ml"; canalId: number; envioExterno: string }
  /** La de OCA (Fer, 6/10): el envío ya dado de alta en OCA; el PDF lo baja OCA. */
  | { tipo: "oca"; envioId: number }
  | { tipo: "propia"; retiro: boolean; metodo: string | null; receptor: string | null; direccion: string[]; telefono: string | null; referencia: string | null };

export type DatosHoja = {
  pedidoId: number; idExterno: string | null; pack: string | null; cliente: string | null; apodo: string | null; canal: string;
  fecha: Date; logistica: string | null; despacharAntes: Date | null; notas: string | null;
  reimpresion: boolean; etiqueta: EtiquetaHoja; lineas: LineaHoja[];
  /** «A cobrar» (efectivo al retirar): el total en pesos que hay que cobrar al entregar; null si no se cobra. */
  aCobrar?: number | null;
};

/** Orden de recorrido: ubicación (orden_recorrido, código), SKU; lo que no
 *  tiene ubicación (sin reserva) va al final. */
export function ordenarLineas<T extends Pick<LineaHoja, "ubicacion" | "orden_recorrido" | "sku"> & { kit?: LineaHoja["kit"] }>(lineas: T[]): T[] {
  return [...lineas].sort((a, b) => {
    if ((a.ubicacion == null) !== (b.ubicacion == null)) return a.ubicacion == null ? 1 : -1;
    return (a.orden_recorrido ?? 0) - (b.orden_recorrido ?? 0)
      || (a.ubicacion ?? "").localeCompare(b.ubicacion ?? "", "es", { numeric: true })
      || (a.sku ?? "").localeCompare(b.sku ?? "", "es", { numeric: true })
      // Lo suelto antes que lo de un kit, y los kits por su SKU.
      || (a.kit ? 1 : 0) - (b.kit ? 1 : 0) || (a.kit?.sku ?? "").localeCompare(b.kit?.sku ?? "", "es", { numeric: true });
  });
}

const textoDireccion = (d: Record<string, unknown> | null | undefined): string[] => {
  if (!d) return [];
  const s = (k: string) => (typeof d[k] === "string" && (d[k] as string).trim()) || (typeof d[k] === "number" ? String(d[k]) : "");
  const calle = s("linea") || [s("calle"), s("numero")].filter(Boolean).join(" ");
  const l1 = [calle, s("piso_depto")].filter(Boolean).join(", ");
  const l2 = [s("codigo_postal") && `(${s("codigo_postal")})`, s("localidad")].filter(Boolean).join(" ");
  return [l1, l2, s("provincia")].filter(Boolean);
};

/** Los datos de las hojas de esos pedidos, en el orden de preparación (lo
 *  que vence antes primero, después lo más viejo). `reimpresion`: la hoja o
 *  la etiqueta de ese pedido ya se imprimió alguna vez. */
export async function datosHojas(org: string, pedidoIds: number[]): Promise<DatosHoja[]> {
  if (!pedidoIds.length) return [];
  const pedidos = await consulta<{
    id: number; id_externo: string | null; fecha: Date; notas: string | null; envio_json: Record<string, unknown>; canal: string; canal_tipo: string;
    cliente: string | null; apodo_ml: string | null; telefono: string | null; e_id_externo: string | null; e_canal: number | null;
    logistica: string | null; despachar_antes: Date | null; receptor: string | null; e_direccion: Record<string, unknown> | null; impreso: boolean;
    e_envio_id: number | null; e_estado: string | null;
    a_cobrar: boolean; total_ars: number;
  }>(`
    select p.id::int, p.id_externo, p.fecha, p.notas, p.envio envio_json, ca.nombre canal, ca.tipo canal_tipo,
           ${sqlACobrar("p")} a_cobrar, p.total_ars::float total_ars,
           cl.nombre cliente, cl.apodo_ml, coalesce(regexp_replace(cl.whatsapp, '^549([0-9]{10})$', '\\1'), cl.telefono) telefono,
           e.id_externo e_id_externo, e.canal_id::int e_canal, e.id::int e_envio_id, e.estado e_estado, e.logistica, e.despachar_antes, e.receptor, e.direccion e_direccion,
           (exists (select 1 from picking_pedido pp where pp.pedido_id = p.id and pp.impreso_ts is not null)
             or exists (select 1 from envio e2 where e2.pedido_id = p.id and e2.etiqueta_impresa_ts is not null)) impreso
      from pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
      left join lateral (select * from envio where pedido_id = p.id order by id desc limit 1) e on true
     where p.organizacion_id = $1 and p.id = any($2::bigint[])
     order by e.despachar_antes nulls last, p.fecha, p.id`, [org, pedidoIds]);

  // Lo reservado (ya dice de qué ubicación sale cada cosa, y abre los kits).
  const reservado = await consulta<{ pedido_id: number; ubicacion: string; orden_recorrido: number; sku: string; titulo: string; cantidad: number; kit_sku: string | null; kit_titulo: string | null }>(`
    select p.id::int pedido_id, u.codigo ubicacion, u.orden_recorrido, v.sku, titulo_variacion(v.id) titulo, r.cantidad,
           k.sku kit_sku, case when k.id is null then null else titulo_variacion(k.id) end kit_titulo
      from pedido p cross join lateral reservado_de(p.organizacion_id, 'pedido', p.id::text) r
      join variacion v on v.id = r.variacion_id left join ubicacion u on u.id = r.ubicacion_id left join variacion k on k.id = r.kit_variacion_id
     where p.organizacion_id = $1 and p.id = any($2::bigint[])`, [org, pedidoIds]);
  // Sin reserva (ya despachado, o el artículo de ML sin vincular): las líneas
  // del pedido, con los kits abiertos en sus componentes y sin ubicación.
  const lineas = await consulta<{ pedido_id: number; sku: string | null; titulo: string; cantidad: number; kit_sku: string | null; kit_titulo: string | null; reservada: boolean; linea_id: number; linea_cantidad: number }>(`
    select pl.pedido_id::int, pl.id::int linea_id, pl.cantidad::int linea_cantidad, coalesce(c.sku, v.sku, pl.sku) sku,
           case when c.id is not null then titulo_variacion(c.id) when v.id is not null then titulo_variacion(v.id) else pl.titulo end titulo,
           (pl.cantidad * coalesce(kc.cantidad, 1))::int cantidad,
           case when c.id is not null then v.sku end kit_sku, case when c.id is not null then titulo_variacion(v.id) end kit_titulo,
           pl.variacion_id is not null reservada
      from pedido_linea pl left join variacion v on v.id = pl.variacion_id
      left join kit_componente kc on kc.variacion_kit_id = v.id and not kc.sobrante left join variacion c on c.id = kc.variacion_componente_id
     where pl.organizacion_id = $1 and pl.pedido_id = any($2::bigint[]) and not pl.datos_externos ? 'concepto' order by pl.orden, pl.id, c.sku`, [org, pedidoIds]);

  return pedidos.map((p) => {
    const res = reservado.filter((r) => r.pedido_id === p.id);
    const propias = lineas.filter((l) => l.pedido_id === p.id);
    // Cuántos de cada kit se pidieron (para la fila del kit en la hoja).
    const kits = new Map<string, number>(), vistas = new Set<number>();
    for (const l of propias) if (l.kit_sku && !vistas.has(l.linea_id)) { vistas.add(l.linea_id); kits.set(l.kit_sku, (kits.get(l.kit_sku) ?? 0) + l.linea_cantidad); }
    const kitDe = (sku: string | null, titulo: string | null) => sku ? { sku, titulo: titulo ?? "", cantidad: kits.get(sku) } : null;
    const crudas: LineaHoja[] = res.length
      ? [...res.map((r) => ({ ubicacion: r.ubicacion, orden_recorrido: r.orden_recorrido, sku: r.sku, titulo: r.titulo, cantidad: r.cantidad,
          kit: kitDe(r.kit_sku, r.kit_titulo) })),
        // Lo sin vincular nunca se reserva: va igual, sin ubicación.
        ...propias.filter((l) => !l.reservada).map((l) => ({ ubicacion: null, orden_recorrido: null, sku: l.sku, titulo: l.titulo, cantidad: l.cantidad, kit: null }))]
      : propias.map((l) => ({ ubicacion: null, orden_recorrido: null, sku: l.sku, titulo: l.titulo, cantidad: l.cantidad,
          kit: kitDe(l.kit_sku, l.kit_titulo) }));
    const env = (p.envio_json ?? {}) as { metodo?: string | null; direccion?: Record<string, unknown> | null; pack_id?: unknown };
    const ml = p.e_id_externo && p.e_canal && p.logistica !== "fulfillment";
    const dirPropia = env.direccion ?? null;
    const oca = p.logistica === "oca" && p.e_envio_id && p.e_estado !== "cancelled";
    const etiqueta: EtiquetaHoja = ml
      ? { tipo: "ml", canalId: p.e_canal!, envioExterno: p.e_id_externo! }
      : oca ? { tipo: "oca", envioId: p.e_envio_id! }
      : {
          tipo: "propia", retiro: !dirPropia || !textoDireccion(dirPropia).length, metodo: env.metodo ?? null,
          receptor: (typeof dirPropia?.receptor === "string" && dirPropia.receptor) || p.cliente,
          direccion: textoDireccion(dirPropia),
          telefono: (typeof dirPropia?.receptor_telefono === "string" && dirPropia.receptor_telefono) || p.telefono,
          referencia: typeof dirPropia?.referencia === "string" ? dirPropia.referencia : null,
        };
    const pack = env.pack_id != null && String(env.pack_id) !== p.id_externo ? String(env.pack_id) : null;
    return {
      pedidoId: p.id, idExterno: p.id_externo, pack, cliente: p.cliente, apodo: p.apodo_ml, canal: p.canal, fecha: p.fecha,
      logistica: p.logistica && p.e_estado !== "cancelled" ? (LOGISTICA_TEXTO[p.logistica] ?? p.logistica) : etiqueta.tipo === "propia" ? (etiqueta.retiro ? RETIRA_LOCAL : (etiqueta.metodo ?? "Envío propio")) : null,
      despacharAntes: p.despachar_antes, notas: p.notas, reimpresion: p.impreso, etiqueta, lineas: ordenarLineas(crudas),
      aCobrar: p.a_cobrar ? p.total_ars : null,
    };
  });
}

/** El membrete del remito de entrega: la razón social principal y su logo (o el de la empresa). */
export type Membrete = { nombre: string; cuit: string | null; domicilio: string | null; logo: Uint8Array | null };

/** El membrete de la organización. Sin logo si no hay o no se puede bajar: el remito sale igual. */
export async function membreteDe(org: string): Promise<Membrete | null> {
  const e = await emisorDe(org).catch(() => null);
  const empresa = await una<{ nombre: string | null; logo: string | null }>("select nombre, logo from empresa where organizacion_id = $1", [org]).catch(() => null);
  if (!e && !empresa?.nombre) return null;
  let logo: Uint8Array | null = null;
  const url = e?.logo || empresa?.logo;
  if (url && /^https:\/\//.test(url)) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (r.ok) logo = await sharp(Buffer.from(await r.arrayBuffer())).trim({ threshold: 25 }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    } catch (err) { console.error("[hojas] sin logo para el remito:", err instanceof Error ? err.message : err); }
  }
  return { nombre: e?.razon_social || empresa?.nombre || "", cuit: e?.cuit ?? null, domicilio: e?.domicilio ?? null, logo };
}

// ── El PDF ───────────────────────────────────────────────

/** La etiqueta de OCA de un envío (por el id del envío en Laucen). */
export type BajarEtiquetaOca = (envioId: number) => Promise<{ ok: true; pdf: Uint8Array } | { ok: false; motivo: string }>;

/** La etiqueta de ML de un envío: el PDF de ML, o por qué no vino. */
export type BajarEtiquetaMl = (canalId: number, envioExterno: string) => Promise<{ ok: true; pdf: Uint8Array } | { ok: false; motivo: string }>;

/** La de verdad: pide a ML (/shipment_labels, PDF) de a un envío, así cada
 *  etiqueta queda pegada a su hoja. Sólo lee de ML. */
export function bajarEtiquetaMlDe(org: string): BajarEtiquetaMl {
  const cuentas = new Map<number, Promise<CuentaMl | null>>();
  return async (canalId, envio) => {
    if (!cuentas.has(canalId)) cuentas.set(canalId, cuentaDelCanal(org, canalId));
    const cuenta = await cuentas.get(canalId)!;
    if (!cuenta) return { ok: false, motivo: "El canal no tiene una cuenta de Mercado Libre conectada." };
    try {
      const r = await bajarEtiquetas(cuenta, [envio], "pdf");
      if (!r.ok) return r;
      if (!r.tipo.includes("pdf")) return { ok: false, motivo: "Mercado Libre no devolvió un PDF." };
      return { ok: true, pdf: new Uint8Array(r.datos) };
    } catch {
      return { ok: false, motivo: "No se pudo hablar con Mercado Libre." };
    }
  };
}

const ZONA = "America/Argentina/Buenos_Aires";
const fechaHora = (d: Date | string | null) => d ? new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d)) : "—";

// Lo que la fuente estándar (WinAnsi) sabe dibujar; lo demás, "?".
const EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const limpio = (s: string) => [...s.normalize("NFC")].map((ch) => {
  const c = ch.charCodeAt(0);
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA.has(ch) ? ch : ch === "\t" ? " " : "?";
}).join("");

/** Corta un texto en renglones que entren en `ancho`. */
function renglones(s: string, f: PDFFont, tam: number, ancho: number): string[] {
  const out: string[] = [];
  for (const parrafo of s.split(/\r?\n/).map(limpio)) {
    let linea = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (f.widthOfTextAtSize(prueba, tam) <= ancho) { linea = prueba; continue; }
      if (linea) out.push(linea);
      // Una palabra más ancha que el renglón se corta a lo bruto.
      let resto = palabra;
      while (f.widthOfTextAtSize(resto, tam) > ancho && resto.length > 1) {
        let n = resto.length - 1;
        while (n > 1 && f.widthOfTextAtSize(resto.slice(0, n), tam) > ancho) n--;
        out.push(resto.slice(0, n));
        resto = resto.slice(n);
      }
      linea = resto;
    }
    out.push(linea);
  }
  return out;
}

type Lienzo = { doc: PDFDocument; f: PDFFont; fb: PDFFont; tam: TamHoja };

function codigoBarras(doc: PDFDocument, texto: string): Promise<PDFImage> {
  const png = bwipjs.toBuffer({ bcid: "code128", text: texto, scale: 3, height: 10, includetext: false });
  return png.then((b) => doc.embedPng(b));
}

/** El aviso de la etiqueta de ML que no vino, en un recuadro con la esquina
 *  de arriba a la izquierda en (x, arriba). */
function aviso(l: Lienzo, p: PDFPage, x: number, arriba: number, ancho: number, alto: number, titulo: string, texto: string) {
  const rojo = rgb(0.75, 0.2, 0.15);
  p.drawRectangle({ x, y: arriba - alto, width: ancho, height: alto, borderWidth: 1, borderColor: rojo, opacity: 0 });
  let y = arriba - 30;
  for (const r of renglones(titulo, l.fb, 14, ancho - 16)) { p.drawText(r, { x: x + 8, y, size: 14, font: l.fb, color: rojo }); y -= 18; }
  y -= 6;
  for (const r of renglones(texto, l.f, 10, ancho - 16)) { p.drawText(r, { x: x + 8, y, size: 10, font: l.f }); y -= 13; }
}

/** Una página con el aviso (la etiqueta de ML que no vino). */
function paginaAviso(l: Lienzo, titulo: string, texto: string) {
  const [w, h] = PAGINA[l.tam];
  aviso(l, l.doc.addPage([w, h]), 10, h - 10, Math.min(w, 100 * MM) - 20, 150 * MM - 20, titulo, texto);
}

/** Dónde está la etiqueta en el PDF de ML (A4 apaisado, medido el 3/10): a
 *  la izquierda de la línea de puntos, la etiqueta de 10 × 15 a su tamaño; a
 *  la derecha, un resumen de productos que no hace falta (nuestra hoja dice
 *  lo mismo y además de qué ubicación sale). La etiqueta no cae siempre en el
 *  mismo lugar (5/10: a algunas se les cortaba el QR), así que se mide en cada
 *  página (recorteEtiquetaMl); éste es el de reserva si no se puede medir. */
const RECORTE_ML = { left: 22, bottom: 138, right: 290, top: 575 };
const esA4Apaisada = (w: number, h: number) => Math.abs(w - 841.89) < 4 && Math.abs(h - 595.28) < 4;

/** Las etiquetas del PDF de ML, recortadas. Si vienen en el A4 apaisado de
 *  siempre, sólo la etiqueta (sin el resumen de al lado ni la página con la
 *  lista de productos que ML agrega); si viene en otro formato, las páginas
 *  enteras. */
async function etiquetasMl(l: Lienzo, pdf: Uint8Array): Promise<PDFEmbeddedPage[]> {
  const origen = await PDFDocument.load(pdf, { ignoreEncryption: true });
  // Una página sin contenido no se puede pegar (y rompería al grabar el PDF).
  const conContenido = origen.getPages().filter((pg) => !!pg.node.Contents());
  const etiquetas = conContenido.filter((pg) => { const { width, height } = pg.getSize(); return esA4Apaisada(width, height); });
  if (etiquetas.length) return l.doc.embedPages(etiquetas, etiquetas.map((pg) => recorteEtiquetaMl(pg) ?? RECORTE_ML));
  return conContenido.length ? l.doc.embedPages(conContenido) : [];
}

/** Pega una etiqueta de ML con la esquina de arriba a la izquierda en (x,
 *  arriba), achicada si no entra en ancho × alto (nunca agrandada). */
function pegarEtiqueta(p: PDFPage, e: PDFEmbeddedPage, x: number, arriba: number, ancho: number, alto: number): { ancho: number; alto: number } {
  const k = Math.min(ancho / e.width, alto / e.height, 1);
  const ew = e.width * k, eh = e.height * k;
  p.drawPage(e, { x, y: arriba - eh, width: ew, height: eh });
  return { ancho: ew, alto: eh };
}

/** Cada etiqueta de ML en su página: en 10×15 centrada (agrandada si hace
 *  falta); en A4, arriba a la izquierda, a su tamaño. */
function paginasMl(l: Lienzo, etiquetas: PDFEmbeddedPage[]) {
  const [w, h] = PAGINA[l.tam];
  for (const e of etiquetas) {
    const p = l.doc.addPage([w, h]);
    if (l.tam === "10x15") {
      const k = Math.min(w / e.width, h / e.height);
      p.drawPage(e, { x: (w - e.width * k) / 2, y: (h - e.height * k) / 2, width: e.width * k, height: e.height * k });
    } else pegarEtiqueta(p, e, 20, h - 20, w - 40, h - 40);
  }
}

const pesosPdf = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** El recuadro grande «A COBRAR $ total» (fondo ámbar, borde negro). Lo
 *  dibuja con la base en `y` (de abajo) y devuelve su alto. */
function recuadroACobrar(p: PDFPage, fb: PDFFont, x: number, y: number, ancho: number, total: number, k = 1): number {
  const alto = 34 * k;
  p.drawRectangle({ x, y, width: ancho, height: alto, color: rgb(1, 0.85, 0.45), borderWidth: 2, borderColor: rgb(0, 0, 0) });
  const titulo = "A COBRAR", importe = pesosPdf(total);
  let tam = 18 * k;
  while (tam > 8 && fb.widthOfTextAtSize(`${titulo}  ${importe}`, tam) > ancho - 12) tam -= 1;
  const texto = limpio(`${titulo}  ${importe}`);
  p.drawText(texto, { x: x + (ancho - fb.widthOfTextAtSize(texto, tam)) / 2, y: y + (alto - tam * 0.72) / 2, size: tam, font: fb, color: rgb(0, 0, 0) });
  return alto;
}

/** Nuestra etiqueta (web, local, con envío; lo que se retira lleva el remito de entrega): un rectángulo de 10×15 con lo necesario,
 *  con la esquina de abajo a la izquierda en (x0, y0). */
async function etiquetaPropia(l: Lienzo, p: PDFPage, x0: number, y0: number, d: DatosHoja, e: Extract<EtiquetaHoja, { tipo: "propia" }>) {
  const bw = 100 * MM, bh = 150 * MM;
  const m = 14, ancho = bw - 2 * m;
  p.drawRectangle({ x: x0 + 6, y: y0 + 6, width: bw - 12, height: bh - 12, borderWidth: 1.2, borderColor: rgb(0, 0, 0) });
  let y = y0 + bh - m;
  const t = (s: string, size: number, font = l.f) => {
    for (const r of renglones(s, font, size, ancho)) { y -= size; p.drawText(r, { x: x0 + m, y, size, font }); y -= size * 0.3; }
  };
  t("ENVÍO", 16, l.fb);
  if (e.metodo) t(e.metodo, 9);
  y -= 4;
  t(`Pedido N.º ${d.pedidoId}`, 22, l.fb);
  if (d.reimpresion) t("REIMPRESIÓN", 9, l.fb);
  y -= 6;
  p.drawLine({ start: { x: x0 + m, y: y + 6 }, end: { x: x0 + bw - m, y: y + 6 }, thickness: 0.6 });
  y -= 6;
  t("Destinatario:", 8);
  t(e.receptor ?? d.cliente ?? "—", 14, l.fb);
  if (e.direccion.length) { y -= 2; for (const r of e.direccion) t(r, 12); }
  if (e.referencia) t(`Ref.: ${e.referencia}`, 9);
  y -= 4;
  t(`Teléfono: ${e.telefono ?? "—"}`, 11);
  t(`Canal: ${d.canal}`, 9);
  // «A cobrar»: el total, bien grande, para cobrarlo al entregar.
  if (d.aCobrar != null) { y -= 8; y -= recuadroACobrar(p, l.fb, x0 + m, y - 34, ancho, d.aCobrar); }
  // El código del pedido abajo.
  const img = await codigoBarras(l.doc, String(d.pedidoId));
  const iw = Math.min(ancho, 160), ih = 42;
  p.drawImage(img, { x: x0 + (bw - iw) / 2, y: y0 + m + 12, width: iw, height: ih });
  const n = String(d.pedidoId);
  p.drawText(n, { x: x0 + (bw - l.f.widthOfTextAtSize(n, 9)) / 2, y: y0 + m + 1, size: 9, font: l.f });
}

/** Lo que se entrega, como se vendió: un kit es una sola línea (no sus componentes). Pura. */
export function lineasRemito(lineas: LineaHoja[]): { cantidad: number; texto: string }[] {
  const out: { cantidad: number; texto: string }[] = [];
  const kits = new Set<string>();
  for (const ln of lineas) {
    if (!ln.kit) { out.push({ cantidad: ln.cantidad, texto: `${ln.sku ? `${ln.sku} — ` : ""}${ln.titulo}` }); continue; }
    if (kits.has(ln.kit.sku)) continue;
    kits.add(ln.kit.sku);
    out.push({ cantidad: ln.kit.cantidad ?? 1, texto: `${ln.kit.sku} — ${ln.kit.titulo}` });
  }
  return out;
}

/** El remito de entrega de lo que se retira en el local (una página del tamaño elegido; si el detalle es largo, sigue
 *  en otra). Membrete, N.º de pedido con su código, los datos de la compra, el detalle y el «recibí conforme» con los
 *  renglones para firma, aclaración, DNI y fecha. */
async function remitoEntrega(l: Lienzo, d: DatosHoja, membrete: Membrete | null): Promise<number> {
  const [w, h] = PAGINA[l.tam];
  const k = w / (100 * MM);
  const m = 12 * k, ancho = w - 2 * m;
  let p = l.doc.addPage([w, h]);
  let paginas = 1;
  let y = h - m;
  const t = (s: string, x: number, size: number, font = l.f, color = negro) => p.drawText(limpio(s), { x, y, size, font, color });

  // Membrete: el logo a la izquierda y los datos de la empresa al lado.
  let xDatos = m;
  if (membrete?.logo) {
    try {
      const img = await l.doc.embedJpg(membrete.logo);
      const alto = 24 * k, anchoLogo = Math.min(alto * (img.width / img.height), 70 * k);
      p.drawImage(img, { x: m, y: y - alto, width: anchoLogo, height: anchoLogo * (img.height / img.width) });
      xDatos = m + anchoLogo + 8 * k;
    } catch { /* sin logo */ }
  }
  const datosEmpresa = [membrete?.cuit ? `CUIT ${cuitLegible(membrete.cuit)}` : null, membrete?.domicilio ?? null].filter((x): x is string => !!x);
  y -= 9 * k; t(membrete?.nombre || "", xDatos, 9 * k, l.fb);
  for (const r of datosEmpresa.flatMap((x) => renglones(x, l.f, 6.5 * k, w - m - xDatos)).slice(0, 3)) { y -= 8 * k; t(r, xDatos, 6.5 * k, l.f, gris); }
  y = Math.min(y, h - m - 26 * k) - 8 * k;
  p.drawLine({ start: { x: m, y }, end: { x: w - m, y }, thickness: 0.8 });

  // Título, N.º de pedido y su código de barras.
  y -= 14 * k; t("REMITO DE ENTREGA", m, 12 * k, l.fb);
  if (d.reimpresion) marcaReimpresion(l, p, m + l.fb.widthOfTextAtSize("REMITO DE ENTREGA", 12 * k) + 8, y, 7 * k);
  y -= 18 * k;
  const num = `Pedido N.º ${d.pedidoId}`;
  t(num, m, 15 * k, l.fb);
  const img = await codigoBarras(l.doc, String(d.pedidoId));
  const iw = Math.min(ancho - l.fb.widthOfTextAtSize(num, 15 * k) - 8 * k, 90 * k), ih = 18 * k;
  if (iw > 30) p.drawImage(img, { x: w - m - iw, y: y - 3 * k, width: iw, height: ih });
  y -= 8 * k;
  const datos: [string, string][] = [
    ["Cliente", d.etiqueta.tipo === "propia" ? (d.etiqueta.receptor ?? d.cliente ?? "—") : (d.cliente ?? "—")],
    ["Compra", [fechaHora(d.fecha), d.canal, d.idExterno && `venta ${d.idExterno}`, d.pack && `pack ${d.pack}`].filter(Boolean).join(" · ")],
    ["Entrega", "Retira en el local"],
  ];
  for (const [et, val] of datos) {
    y -= 9 * k;
    t(`${et}:`, m, 7 * k, l.f, gris);
    const rs = renglones(val, l.fb, 7.5 * k, ancho - 36 * k);
    for (const [i, r] of rs.slice(0, 2).entries()) { if (i) y -= 9 * k; t(r, m + 36 * k, 7.5 * k, l.fb); }
  }
  if (d.aCobrar != null) { y -= 8 * k; y -= recuadroACobrar(p, l.fb, m, y - 34 * k, ancho, d.aCobrar, k); }

  // El detalle de lo que se lleva.
  y -= 14 * k;
  t("Cant.", m, 6.5 * k, l.fb, gris);
  t("Detalle", m + 24 * k, 6.5 * k, l.fb, gris);
  y -= 4 * k;
  p.drawLine({ start: { x: m, y }, end: { x: w - m, y }, thickness: 0.6 });
  const firmaAlto = 92 * k;
  for (const ln of lineasRemito(d.lineas)) {
    const rs = renglones(ln.texto, l.f, 7.5 * k, ancho - 24 * k);
    if (y - rs.length * 9.5 * k - 4 * k < m + firmaAlto) {
      p = l.doc.addPage([w, h]); paginas++; y = h - m;
      y -= 10 * k; t(`Remito de entrega · Pedido N.º ${d.pedidoId} (sigue)`, m, 8 * k, l.fb); y -= 6 * k;
    }
    y -= 10 * k;
    t(String(ln.cantidad), m + 4 * k, 9 * k, l.fb);
    for (const [i, r] of rs.entries()) { if (i) y -= 9.5 * k; t(r, m + 24 * k, 7.5 * k); }
    y -= 3 * k;
    p.drawLine({ start: { x: m, y }, end: { x: w - m, y }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
  }
  if (!d.lineas.length) { y -= 10 * k; t("Sin productos.", m, 7.5 * k); }
  const unidades = lineasRemito(d.lineas).reduce((a, x) => a + x.cantidad, 0);
  y -= 9 * k; t(`${unidades} unidad${unidades === 1 ? "" : "es"}`, m, 7 * k, l.fb);

  // El «recibí conforme», abajo de todo.
  let yf = m + firmaAlto;
  p.drawText(limpio("Recibí conforme la mercadería detallada, en buen estado."), { x: m, y: yf - 8 * k, size: 7.5 * k, font: l.fb });
  yf -= 12 * k;
  for (const et of ["Firma", "Aclaración", "DNI", "Fecha"]) {
    yf -= 16 * k;
    p.drawText(limpio(`${et}:`), { x: m, y: yf, size: 7.5 * k, font: l.f });
    p.drawLine({ start: { x: m + 40 * k, y: yf - 1 }, end: { x: w - m, y: yf - 1 }, thickness: 0.6 });
  }
  p.drawText(limpio("Documento no válido como factura."), { x: m, y: m - 2, size: 5.5 * k, font: l.f, color: gris });
  return paginas;
}

/** Una página con nuestra etiqueta: en 10×15, la página entera; en A4,
 *  arriba a la izquierda. */
async function paginaPropia(l: Lienzo, d: DatosHoja, e: Extract<EtiquetaHoja, { tipo: "propia" }>) {
  const [w, h] = PAGINA[l.tam];
  const p = l.doc.addPage([w, h]);
  await etiquetaPropia(l, p, l.tam === "10x15" ? 0 : 20, l.tam === "10x15" ? 0 : h - 20 - 150 * MM, d, e);
}

const negro = rgb(0, 0, 0), gris = rgb(0.35, 0.38, 0.42);
/** La logística de lo que retira el cliente en el local (también va como cartel en la hoja). */
const RETIRA_LOCAL = "RETIRA POR EL LOCAL";

/** Los datos del encabezado de la hoja. */
const datosEncabezado = (d: DatosHoja): [string, string][] => [
  ["Externo", [d.idExterno, d.pack && `pack ${d.pack}`].filter(Boolean).join(" · ") || "—"],
  ["Cliente", [d.cliente, d.apodo && `(${d.apodo})`].filter(Boolean).join(" ") || "—"],
  ["Canal", d.canal],
  ["Fecha", fechaHora(d.fecha)],
  ["Logística", d.logistica ?? "—"],
  ["Despachar antes de", fechaHora(d.despacharAntes)],
];

/** «REIMPRESIÓN» en blanco sobre negro, con la base en (x, y). */
function marcaReimpresion(l: Lienzo, p: PDFPage, x: number, y: number, sz: number) {
  const s = "REIMPRESIÓN", sw = l.fb.widthOfTextAtSize(s, sz);
  p.drawRectangle({ x, y: y - 3, width: sw + 6, height: sz + 5, color: negro });
  p.drawText(s, { x: x + 3, y, size: sz, font: l.fb, color: rgb(1, 1, 1) });
}

/** El encabezado de la hoja en una columna al costado de la etiqueta (A4,
 *  todo en una hoja): N.º grande, código de barras, los datos y «A cobrar»,
 *  todo pegado al margen derecho (así queda aire para cortar la etiqueta).
 *  Si queda lugar arriba de `piso`, también las notas del comprador.
 *  Devuelve hasta dónde llegó y si entraron las notas. */
async function encabezadoAlCostado(l: Lienzo, p: PDFPage, d: DatosHoja, x: number, arriba: number, ancho: number, piso: number): Promise<{ y: number; notas: boolean }> {
  const der = x + ancho;
  let y = arriba - 9;
  /** Texto alineado a la derecha; devuelve su ancho. */
  const t = (s: string, size: number, font = l.f, color = negro) => {
    const tx = limpio(s), tw = font.widthOfTextAtSize(tx, size);
    p.drawText(tx, { x: der - tw, y, size, font, color });
    return tw;
  };
  const tw = t("HOJA DE PREPARACIÓN", 8, l.fb, gris);
  if (d.reimpresion) marcaReimpresion(l, p, der - tw - 8 - l.fb.widthOfTextAtSize("REIMPRESIÓN", 9) - 6, y, 9);
  y -= 34;
  t(`#${d.pedidoId}`, 34, l.fb);
  const img = await codigoBarras(l.doc, String(d.pedidoId));
  const iw = Math.min(ancho, 200);
  y -= 46;
  p.drawImage(img, { x: der - iw, y, width: iw, height: 38 });
  y -= 8;
  for (const [et, val] of datosEncabezado(d)) {
    y -= 10;
    t(et, 8, l.f, gris);
    for (const r of renglones(val, l.fb, 11, ancho).slice(0, 2)) { y -= 13; t(r, 11, l.fb); }
    y -= 4;
  }
  if (d.aCobrar != null) { const ac = Math.min(ancho, 210); y -= 8; y -= recuadroACobrar(p, l.fb, der - ac, y - 34, ac, d.aCobrar); }
  // Las notas, si entran enteras.
  if (!d.notas?.trim()) return { y, notas: true };
  const rs = renglones(d.notas, l.fb, 11, ancho);
  if (y - 22 - rs.length * 13 < piso) return { y, notas: false };
  y -= 18;
  t("Notas del comprador:", 8, l.f, gris);
  for (const r of rs) { y -= 13; t(r, 11, l.fb); }
  return { y, notas: true };
}

/** La hoja de preparación (una o más páginas si tiene muchas líneas). Con
 *  `inicio`, la tabla arranca en esa página y en esa altura (el encabezado
 *  ya está al costado de la etiqueta) y `notas: false` las saltea (ya van
 *  arriba). Devuelve cuántas páginas agregó. */
async function hoja(l: Lienzo, d: DatosHoja, inicio?: { p: PDFPage; y: number; notas: boolean }): Promise<number> {
  const [w, h] = PAGINA[l.tam];
  const k = l.tam === "a4" ? 1.45 : 1;
  const m = (inicio ? 20 : 12 * k), ancho = w - 2 * m;
  let paginas = 0;
  let p!: PDFPage;
  let y = 0;
  const t = (s: string, x: number, size: number, font = l.f, color = negro) => p.drawText(limpio(s), { x, y, size, font, color });
  const COL = { prod: 62, cant: 22 };

  const titulosTabla = () => {
    p.drawLine({ start: { x: m, y: y + 2 }, end: { x: w - m, y: y + 2 }, thickness: 0.8 });
    y -= 8 * k;
    t("Ubicación", m, 6.5 * k, l.fb, gris);
    t("Producto", m + COL.prod * k, 6.5 * k, l.fb, gris);
    t("Cant.", w - m - (COL.cant + 8) * k, 6.5 * k, l.fb, gris);
    y -= 4 * k;
  };
  const nueva = async (seguida: boolean) => {
    p = l.doc.addPage([w, h]);
    paginas++;
    y = h - m;
    if (seguida) {
      y -= 12 * k;
      t(`Pedido N.º ${d.pedidoId} (sigue)`, m, 11 * k, l.fb);
      y -= 8 * k;
      return;
    }
    // Encabezado: título chico, reimpresión, N.º grande y el código de barras.
    y -= 8 * k;
    t("HOJA DE PREPARACIÓN", m, 7 * k, l.fb, gris);
    // Al lado del título (a la derecha va el código de barras).
    if (d.reimpresion) marcaReimpresion(l, p, m + l.fb.widthOfTextAtSize("HOJA DE PREPARACIÓN", 7 * k) + 8, y, 8 * k);
    y -= 26 * k;
    const num = `#${d.pedidoId}`;
    t(num, m, 26 * k, l.fb);
    const img = await codigoBarras(l.doc, String(d.pedidoId));
    const iw = Math.min(ancho - l.fb.widthOfTextAtSize(num, 26 * k) - 10, 130 * k), ih = 26 * k;
    p.drawImage(img, { x: w - m - iw, y: y - 2, width: iw, height: ih });
    y -= 12 * k;
    const sz = 8 * k;
    for (const [et, val] of datosEncabezado(d)) {
      t(`${et}:`, m, sz, l.f, gris);
      const x = m + 82 * k;
      const rs = renglones(val, l.fb, sz, ancho - 82 * k);
      for (const r of rs.slice(0, 2)) { t(r, x, sz, l.fb); y -= sz * 1.3; }
    }
    // Lo retira el cliente en el local (también las ventas de Mercado Libre sin envío, Fer 22/10): bien grande.
    if (d.logistica === RETIRA_LOCAL) { y -= 16 * k; t(RETIRA_LOCAL, m, 14 * k, l.fb); y -= 6 * k; }
    // «A cobrar»: el total, bien grande, para cobrarlo al entregar.
    if (d.aCobrar != null) { y -= 4 * k; y -= recuadroACobrar(p, l.fb, m, y - 34 * k, ancho, d.aCobrar, k); y -= 4 * k; }
    // Las notas del comprador arriba, en negrita: hay que leerlas al preparar.
    if (d.notas?.trim()) {
      y -= 4 * k;
      t("Notas del comprador:", m, 7 * k, l.f, gris);
      y -= 11 * k;
      for (const r of renglones(d.notas, l.fb, 9 * k, ancho)) { t(r, m, 9 * k, l.fb); y -= 11 * k; }
    }
    y -= 4 * k;
    titulosTabla();
  };

  if (inicio) { p = inicio.p; y = inicio.y; titulosTabla(); } else await nueva(false);
  /** Corta un texto para que entre en un renglón: primero achica la letra
   *  (hasta `min`) y si igual no entra, lo corta con "…". */
  const unRenglon = (s: string, f: PDFFont, tam: number, min: number, ancho: number): [string, number] => {
    let tx = limpio(s);
    while (tam > min && f.widthOfTextAtSize(tx, tam) > ancho) tam -= 0.25;
    if (f.widthOfTextAtSize(tx, tam) <= ancho) return [tx, tam];
    while (tx.length > 1 && f.widthOfTextAtSize(`${tx}…`, tam) > ancho) tx = tx.slice(0, -1);
    return [`${tx.trimEnd()}…`, tam];
  };
  /** Una fila de la tabla, siempre de un renglón: ubicación, texto (con un
   *  prefijo en negrita, si va) y, si va, la cantidad con el cuadrado para
   *  tildar. `resaltar`: fondo gris y la cantidad en blanco sobre negro;
   *  `baja`: una fila más petisa (los componentes de un kit). */
  const fila = async (o: { ubic: string | null; texto: string; fuente: PDFFont; prefijo?: string; indent?: number; cantidad?: number; resaltar?: boolean; baja?: boolean }) => {
    const alto = (o.baja ? 11 : 15) * k;
    if (y - alto < m + 10 * k) await nueva(true);
    const arriba = y, medio = arriba - alto / 2;
    const xProd = m + COL.prod * k + (o.indent ?? 0);
    const pre = o.prefijo ? limpio(o.prefijo) : "", psz = 8.5 * k, pw = pre ? l.fb.widthOfTextAtSize(pre, psz) + 4 * k : 0;
    const [tit, tsz] = unRenglon(o.texto, o.fuente, 7.5 * k, 6.25 * k, w - m - (COL.cant + 10) * k - xProd - pw);
    if (o.resaltar) p.drawRectangle({ x: m, y: arriba - alto, width: w - 2 * m, height: alto, color: rgb(0.88, 0.88, 0.88) });
    if (!o.baja) p.drawLine({ start: { x: m, y }, end: { x: w - m, y }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
    if (o.ubic) {
      const [u, usz] = unRenglon(o.ubic, l.fb, 8.5 * k, 6.5 * k, (COL.prod - 4) * k);
      p.drawText(u, { x: m, y: medio - usz * 0.35, size: usz, font: l.fb });
    }
    if (pre) p.drawText(pre, { x: xProd, y: medio - psz * 0.35, size: psz, font: l.fb });
    p.drawText(tit, { x: xProd + pw, y: medio - tsz * 0.35, size: tsz, font: o.fuente });
    if (o.cantidad != null) {
      const cant = String(o.cantidad), csz = 11 * k, cw = l.fb.widthOfTextAtSize(cant, csz);
      const xCant = w - m - 16 * k - cw, base = medio - 4 * k;
      if (o.resaltar) p.drawRectangle({ x: xCant - 2.5 * k, y: base - 2.5 * k, width: cw + 5 * k, height: 12.5 * k, color: negro });
      p.drawText(cant, { x: xCant, y: base, size: csz, font: l.fb, color: o.resaltar ? rgb(1, 1, 1) : negro });
      p.drawRectangle({ x: w - m - 11 * k, y: medio - 5 * k, width: 10 * k, height: 10 * k, borderWidth: 1, borderColor: negro, color: rgb(1, 1, 1) });
    }
    y = arriba - alto;
  };

  // Un kit (pack, combo) va en una fila con lo que se vendió (cuántos kits)
  // y, debajo, una fila petisa por componente con cuántas unidades juntar:
  // "20  SKU — título".
  const kitsHechos = new Set<string>();
  for (const ln of d.lineas) {
    if (!ln.kit) {
      // Más de una unidad: la fila resaltada, para que no se junte una sola.
      const varias = ln.cantidad > 1;
      await fila({ ubic: ln.ubicacion ?? "—", texto: `${ln.sku ?? "s/SKU"} — ${ln.titulo}`, fuente: varias ? l.fb : l.f, cantidad: ln.cantidad, resaltar: varias });
      continue;
    }
    if (kitsHechos.has(ln.kit.sku)) continue;
    kitsHechos.add(ln.kit.sku);
    const comps = d.lineas.filter((x) => x.kit?.sku === ln.kit!.sku);
    const ubics = [...new Set(comps.map((x) => x.ubicacion ?? "—"))];
    const kits = ln.kit.cantidad;
    await fila({ ubic: ubics.length === 1 ? ubics[0] : null, texto: `${ln.kit.sku} — ${ln.kit.titulo}`, fuente: l.fb, cantidad: kits ?? undefined, resaltar: (kits ?? 0) > 1 });
    for (const c of comps) {
      await fila({ ubic: ubics.length === 1 ? null : (c.ubicacion ?? "—"), indent: 8 * k, baja: true, prefijo: String(c.cantidad), fuente: l.f,
        texto: `${c.sku ?? "s/SKU"} — ${c.titulo}` });
    }
  }
  if (!d.lineas.length) { y -= 12 * k; t("Este pedido no tiene productos para preparar.", m, 8 * k); y -= 4 * k; }
  p.drawLine({ start: { x: m, y }, end: { x: w - m, y }, thickness: 0.8 });
  const unidades = d.lineas.reduce((a, x) => a + x.cantidad, 0);
  const masDeUna = d.lineas.filter((x) => !x.kit && x.cantidad > 1).length;
  y -= 11 * k;
  t(`${unidades} unidad${unidades === 1 ? "" : "es"} en ${d.lineas.length} línea${d.lineas.length === 1 ? "" : "s"}`
    + (masDeUna ? ` · ojo: ${masDeUna === 1 ? "1 línea lleva" : `${masDeUna} líneas llevan`} más de una unidad` : ""), m, 7.5 * k, l.fb);
  // Las notas que no entraron al costado de la etiqueta, al final.
  if (d.notas?.trim() && inicio && !inicio.notas) {
    y -= 14 * k;
    if (y < m + 20 * k) { await nueva(true); y -= 4 * k; }
    t("Notas del comprador:", m, 7 * k, l.f, gris);
    y -= 11 * k;
    for (const r of renglones(d.notas, l.fb, 9 * k, ancho)) {
      if (y < m) { await nueva(true); }
      t(r, m, 9 * k, l.fb);
      y -= 11 * k;
    }
  }
  return paginas;
}

/** A4, todo en una hoja (Fer, 3/10): la etiqueta arriba a la izquierda, el
 *  encabezado de la hoja al costado, y abajo las líneas a juntar (si no
 *  entran, siguen en otra página). `etiqueta`: la de ML ya recortada, la
 *  propia, o el aviso de que falta. Devuelve cuántas páginas de más usó. */
async function paginaUnica(l: Lienzo, d: DatosHoja, etiqueta: { ml: PDFEmbeddedPage } | { propia: Extract<EtiquetaHoja, { tipo: "propia" }> } | { aviso: string }): Promise<number> {
  const [w, h] = PAGINA[l.tam];
  const m = 20, arriba = h - m;
  const p = l.doc.addPage([w, h]);
  let ancho: number, alto: number;
  if ("ml" in etiqueta) ({ ancho, alto } = pegarEtiqueta(p, etiqueta.ml, m, arriba, 100 * MM, 160 * MM));
  else if ("propia" in etiqueta) { ancho = 100 * MM; alto = 150 * MM; await etiquetaPropia(l, p, m, arriba - alto, d, etiqueta.propia); }
  else { ancho = 95 * MM; alto = 90 * MM; aviso(l, p, m, arriba, ancho, alto, d.etiqueta.tipo === "oca" ? "Falta la etiqueta de OCA" : "Falta la etiqueta de Mercado Libre", etiqueta.aviso); }
  const x = m + ancho + 16;
  const piso = arriba - Math.max(alto, 120 * MM);
  const enc = await encabezadoAlCostado(l, p, d, x, arriba, w - m - x, piso);
  return hoja(l, d, { p, y: Math.min(arriba - alto, enc.y) - 14, notas: enc.notas });
}

/** El PDF entero: para cada pedido, su etiqueta y enseguida su hoja (o sólo
 *  la etiqueta, con `soloEtiqueta`). En A4 van juntas en la misma página
 *  (paginaUnica). `paginas` dice qué es cada página ("etiqueta-ml:<pedido>",
 *  "etiqueta-propia:<pedido>", "aviso:<pedido>", "hoja:<pedido>", y en A4
 *  "etiqueta-ml+hoja:<pedido>", "etiqueta-propia+hoja:<pedido>",
 *  "aviso+hoja:<pedido>"), para los tests y el registro. */
export async function armarPdf(hojas: DatosHoja[], o: { tam: TamHoja; bajarEtiquetaMl: BajarEtiquetaMl; bajarEtiquetaOca?: BajarEtiquetaOca; soloEtiqueta?: boolean; membrete?: Membrete | null }): Promise<{ pdf: Uint8Array; paginas: string[]; sinEtiqueta: number[] }> {
  const doc = await PDFDocument.create();
  doc.setTitle("Etiquetas, remitos y hojas de preparación");
  const l: Lienzo = { doc, f: await doc.embedFont(StandardFonts.Helvetica), fb: await doc.embedFont(StandardFonts.HelveticaBold), tam: o.tam };
  const juntas = o.tam === "a4" && !o.soloEtiqueta;
  const paginas: string[] = [];
  const sinEtiqueta: number[] = [];
  for (const d of hojas) {
    // En A4 la etiqueta se dibuja en la página única; si no, en la suya.
    let unica: Parameters<typeof paginaUnica>[2];
    let tipo: string;
    let sinEtiquetaPropia = false;
    if (d.etiqueta.tipo === "ml" || d.etiqueta.tipo === "oca") {
      const deOca = d.etiqueta.tipo === "oca";
      const quien = deOca ? "OCA" : "Mercado Libre";
      const r = d.etiqueta.tipo === "ml" ? await o.bajarEtiquetaMl(d.etiqueta.canalId, d.etiqueta.envioExterno)
        : o.bajarEtiquetaOca ? await o.bajarEtiquetaOca(d.etiqueta.envioId) : { ok: false as const, motivo: "No se pudo bajar la etiqueta de OCA." };
      let ml: PDFEmbeddedPage[] = [];
      if (r.ok) {
        try { ml = await etiquetasMl(l, r.pdf); } catch { ml = []; }
      }
      if (ml.length) {
        tipo = "etiqueta-ml";
        unica = { ml: ml[0] };
        // Si ML mandó más de una, en A4 las de más van antes, cada una en su página.
        const sueltas = juntas ? ml.slice(1) : ml;
        paginasMl(l, sueltas);
        for (const _ of sueltas) paginas.push(`etiqueta-ml:${d.pedidoId}`);
      } else {
        tipo = "aviso";
        sinEtiqueta.push(d.pedidoId);
        const texto = `${r.ok ? `${quien} mandó un PDF que no se pudo leer.` : r.motivo} Reimprimí la etiqueta de este pedido desde ${deOca ? "la ficha del pedido" : "Ventas › Envíos"}.`;
        unica = { aviso: texto };
        if (!juntas) { paginaAviso(l, `Pedido #${d.pedidoId}: falta la etiqueta de ${quien}`, texto); paginas.push(`aviso:${d.pedidoId}`); }
      }
    } else if (d.etiqueta.retiro) {
      // Lo que retiran en el local: en lugar de la etiqueta, el remito de entrega (en su propia página, también en A4).
      tipo = "remito";
      unica = { propia: d.etiqueta };
      sinEtiquetaPropia = true;
      const n = await remitoEntrega(l, d, o.membrete ?? null);
      for (let i = 0; i < n; i++) paginas.push(`remito:${d.pedidoId}`);
    } else {
      tipo = "etiqueta-propia";
      unica = { propia: d.etiqueta };
      if (!juntas) { await paginaPropia(l, d, d.etiqueta); paginas.push(`etiqueta-propia:${d.pedidoId}`); }
    }
    if (juntas && !sinEtiquetaPropia) {
      const n = await paginaUnica(l, d, unica);
      paginas.push(`${tipo}+hoja:${d.pedidoId}`);
      for (let i = 0; i < n; i++) paginas.push(`hoja:${d.pedidoId}`);
    } else if (!o.soloEtiqueta) {
      const n = await hoja(l, d);
      for (let i = 0; i < n; i++) paginas.push(`hoja:${d.pedidoId}`);
    }
  }
  return { pdf: await doc.save(), paginas, sinEtiqueta };
}
