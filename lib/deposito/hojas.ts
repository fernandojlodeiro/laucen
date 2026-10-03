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
// Acá: juntar los datos (datosHojas) y dibujar el PDF (armarPdf, sin base:
// la etiqueta de ML llega por una función, así los tests la reemplazan).

import { PDFDocument, StandardFonts, rgb, type PDFEmbeddedPage, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import bwipjs from "bwip-js/node";
import { consulta } from "@/lib/erp/base";
import { sqlACobrar } from "@/lib/pedidos";
import { cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { bajarEtiquetas } from "@/lib/mercadolibre/envios";

export type TamHoja = "10x15" | "a4";
export const TAMANOS: [TamHoja, string][] = [["10x15", "10 × 15 cm (térmica)"], ["a4", "A4"]];
export const esTamHoja = (x: unknown): x is TamHoja => x === "10x15" || x === "a4";
/** La cookie donde queda el tamaño elegido. */
export const COOKIE_TAM = "hoja_tam";

const MM = 72 / 25.4;
const PAGINA: Record<TamHoja, [number, number]> = { "10x15": [100 * MM, 150 * MM], a4: [595.28, 841.89] };

export const LOGISTICA_TEXTO: Record<string, string> = {
  fulfillment: "Full", self_service: "Flex", cross_docking: "Colecta", xd_drop_off: "Colecta",
  drop_off: "Despacho en correo", custom: "A convenir", not_specified: "A convenir",
};

export type LineaHoja = {
  ubicacion: string | null; orden_recorrido: number | null; sku: string | null; titulo: string; cantidad: number;
  /** Si es componente de un kit: el kit (SKU y título). */
  kit: { sku: string; titulo: string } | null;
};

export type EtiquetaHoja =
  | { tipo: "ml"; canalId: number; envioExterno: string }
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
    a_cobrar: boolean; total_ars: number;
  }>(`
    select p.id::int, p.id_externo, p.fecha, p.notas, p.envio envio_json, ca.nombre canal, ca.tipo canal_tipo,
           ${sqlACobrar("p")} a_cobrar, p.total_ars::float total_ars,
           cl.nombre cliente, cl.apodo_ml, coalesce(cl.telefono_movil, cl.telefono) telefono,
           e.id_externo e_id_externo, e.canal_id::int e_canal, e.logistica, e.despachar_antes, e.receptor, e.direccion e_direccion,
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
  const lineas = await consulta<{ pedido_id: number; sku: string | null; titulo: string; cantidad: number; kit_sku: string | null; kit_titulo: string | null; reservada: boolean }>(`
    select pl.pedido_id::int, coalesce(c.sku, v.sku, pl.sku) sku,
           case when c.id is not null then titulo_variacion(c.id) when v.id is not null then titulo_variacion(v.id) else pl.titulo end titulo,
           (pl.cantidad * coalesce(kc.cantidad, 1))::int cantidad,
           case when c.id is not null then v.sku end kit_sku, case when c.id is not null then titulo_variacion(v.id) end kit_titulo,
           pl.variacion_id is not null reservada
      from pedido_linea pl left join variacion v on v.id = pl.variacion_id
      left join kit_componente kc on kc.variacion_kit_id = v.id left join variacion c on c.id = kc.variacion_componente_id
     where pl.organizacion_id = $1 and pl.pedido_id = any($2::bigint[]) order by pl.orden, pl.id, c.sku`, [org, pedidoIds]);

  return pedidos.map((p) => {
    const res = reservado.filter((r) => r.pedido_id === p.id);
    const propias = lineas.filter((l) => l.pedido_id === p.id);
    const crudas: LineaHoja[] = res.length
      ? [...res.map((r) => ({ ubicacion: r.ubicacion, orden_recorrido: r.orden_recorrido, sku: r.sku, titulo: r.titulo, cantidad: r.cantidad,
          kit: r.kit_sku ? { sku: r.kit_sku, titulo: r.kit_titulo ?? "" } : null })),
        // Lo sin vincular nunca se reserva: va igual, sin ubicación.
        ...propias.filter((l) => !l.reservada).map((l) => ({ ubicacion: null, orden_recorrido: null, sku: l.sku, titulo: l.titulo, cantidad: l.cantidad, kit: null }))]
      : propias.map((l) => ({ ubicacion: null, orden_recorrido: null, sku: l.sku, titulo: l.titulo, cantidad: l.cantidad,
          kit: l.kit_sku ? { sku: l.kit_sku, titulo: l.kit_titulo ?? "" } : null }));
    const env = (p.envio_json ?? {}) as { metodo?: string | null; direccion?: Record<string, unknown> | null; pack_id?: unknown };
    const ml = p.e_id_externo && p.e_canal && p.logistica !== "fulfillment";
    const dirPropia = env.direccion ?? null;
    const etiqueta: EtiquetaHoja = ml
      ? { tipo: "ml", canalId: p.e_canal!, envioExterno: p.e_id_externo! }
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
      logistica: p.logistica ? (LOGISTICA_TEXTO[p.logistica] ?? p.logistica) : etiqueta.tipo === "propia" ? (etiqueta.retiro ? "Retira" : (etiqueta.metodo ?? "Envío propio")) : null,
      despacharAntes: p.despachar_antes, notas: p.notas, reimpresion: p.impreso, etiqueta, lineas: ordenarLineas(crudas),
      aCobrar: p.a_cobrar ? p.total_ars : null,
    };
  });
}

// ── El PDF ───────────────────────────────────────────────

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
 *  lo mismo y además de qué ubicación sale). */
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
  if (etiquetas.length) return l.doc.embedPages(etiquetas, etiquetas.map(() => RECORTE_ML));
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

/** Nuestra etiqueta (web, local): un rectángulo de 10×15 con lo necesario,
 *  con la esquina de abajo a la izquierda en (x0, y0). */
async function etiquetaPropia(l: Lienzo, p: PDFPage, x0: number, y0: number, d: DatosHoja, e: Extract<EtiquetaHoja, { tipo: "propia" }>) {
  const bw = 100 * MM, bh = 150 * MM;
  const m = 14, ancho = bw - 2 * m;
  p.drawRectangle({ x: x0 + 6, y: y0 + 6, width: bw - 12, height: bh - 12, borderWidth: 1.2, borderColor: rgb(0, 0, 0) });
  let y = y0 + bh - m;
  const t = (s: string, size: number, font = l.f) => {
    for (const r of renglones(s, font, size, ancho)) { y -= size; p.drawText(r, { x: x0 + m, y, size, font }); y -= size * 0.3; }
  };
  t(e.retiro ? "RETIRA EN EL LOCAL" : "ENVÍO", 16, l.fb);
  if (e.metodo && !e.retiro) t(e.metodo, 9);
  y -= 4;
  t(`Pedido N.º ${d.pedidoId}`, 22, l.fb);
  if (d.reimpresion) t("REIMPRESIÓN", 9, l.fb);
  y -= 6;
  p.drawLine({ start: { x: x0 + m, y: y + 6 }, end: { x: x0 + bw - m, y: y + 6 }, thickness: 0.6 });
  y -= 6;
  t(e.retiro ? "Retira:" : "Destinatario:", 8);
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

/** Una página con nuestra etiqueta: en 10×15, la página entera; en A4,
 *  arriba a la izquierda. */
async function paginaPropia(l: Lienzo, d: DatosHoja, e: Extract<EtiquetaHoja, { tipo: "propia" }>) {
  const [w, h] = PAGINA[l.tam];
  const p = l.doc.addPage([w, h]);
  await etiquetaPropia(l, p, l.tam === "10x15" ? 0 : 20, l.tam === "10x15" ? 0 : h - 20 - 150 * MM, d, e);
}

const negro = rgb(0, 0, 0), gris = rgb(0.35, 0.38, 0.42);

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
 *  todo en una hoja): N.º grande, código de barras, los datos y «A cobrar».
 *  Si queda lugar arriba de `piso`, también las notas del comprador.
 *  Devuelve hasta dónde llegó y si entraron las notas. */
async function encabezadoAlCostado(l: Lienzo, p: PDFPage, d: DatosHoja, x: number, arriba: number, ancho: number, piso: number): Promise<{ y: number; notas: boolean }> {
  let y = arriba - 9;
  const t = (s: string, size: number, font = l.f, color = negro) => p.drawText(limpio(s), { x, y, size, font, color });
  t("HOJA DE PREPARACIÓN", 8, l.fb, gris);
  if (d.reimpresion) marcaReimpresion(l, p, x + l.fb.widthOfTextAtSize("HOJA DE PREPARACIÓN", 8) + 8, y, 9);
  y -= 34;
  t(`#${d.pedidoId}`, 34, l.fb);
  const img = await codigoBarras(l.doc, String(d.pedidoId));
  y -= 46;
  p.drawImage(img, { x, y, width: Math.min(ancho, 220), height: 38 });
  y -= 8;
  for (const [et, val] of datosEncabezado(d)) {
    y -= 10;
    t(et, 8, l.f, gris);
    for (const r of renglones(val, l.fb, 11, ancho).slice(0, 2)) { y -= 13; t(r, 11, l.fb); }
    y -= 4;
  }
  if (d.aCobrar != null) { y -= 8; y -= recuadroACobrar(p, l.fb, x, y - 34, ancho, d.aCobrar); }
  // Las notas, si entran enteras.
  if (!d.notas?.trim()) return { y, notas: true };
  const rs = renglones(d.notas, l.f, 9, ancho);
  if (y - 22 - rs.length * 11 < piso) return { y, notas: false };
  y -= 18;
  t("Notas del comprador:", 9, l.fb);
  for (const r of rs) { y -= 11; t(r, 9); }
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
    t("Cant.", w - m - (COL.cant + 18) * k, 6.5 * k, l.fb, gris);
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
    // «A cobrar»: el total, bien grande, para cobrarlo al entregar.
    if (d.aCobrar != null) { y -= 4 * k; y -= recuadroACobrar(p, l.fb, m, y - 34 * k, ancho, d.aCobrar, k); y -= 4 * k; }
    y -= 4 * k;
    titulosTabla();
  };

  if (inicio) { p = inicio.p; y = inicio.y; titulosTabla(); } else await nueva(false);
  for (const ln of d.lineas) {
    // Más de una unidad: la fila resaltada (fondo gris, título en negrita y
    // la cantidad en blanco sobre negro), para que no se junte una sola.
    const varias = ln.cantidad > 1;
    const fuente = varias ? l.fb : l.f;
    const indent = ln.kit ? 8 * k : 0;
    const xProd = m + COL.prod * k + indent;
    const anchoProd = w - m - (COL.cant + 22) * k - xProd;
    const tit = renglones(`${ln.sku ?? "s/SKU"} — ${ln.titulo}`, fuente, 7.5 * k, anchoProd).slice(0, 3);
    const kit = ln.kit ? renglones(`kit: ${ln.kit.sku} ${ln.kit.titulo}`, l.f, 6 * k, anchoProd).slice(0, 1) : [];
    const ubic = renglones(ln.ubicacion ?? "—", l.fb, 9 * k, (COL.prod - 4) * k).slice(0, 2);
    const alto = Math.max(tit.length * 9.5 * k + kit.length * 8 * k, ubic.length * 11 * k, 20 * k) + 6 * k;
    if (y - alto < m + 10 * k) await nueva(true);
    const arriba = y;
    if (varias) p.drawRectangle({ x: m, y: arriba - alto, width: w - 2 * m, height: alto, color: rgb(0.88, 0.88, 0.88) });
    p.drawLine({ start: { x: m, y }, end: { x: w - m, y }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
    y = arriba - 11 * k;
    for (const r of ubic) { t(r, m, 9 * k, l.fb); y -= 11 * k; }
    y = arriba - 10 * k;
    for (const r of tit) { t(r, xProd, 7.5 * k, fuente); y -= 9.5 * k; }
    for (const r of kit) { t(r, xProd, 6 * k, l.f, gris); y -= 8 * k; }
    // Cantidad grande y el cuadrado para tildar.
    const cant = String(ln.cantidad), csz = 16 * k, cw = l.fb.widthOfTextAtSize(cant, csz);
    const xCant = w - m - 22 * k - cw;
    if (varias) p.drawRectangle({ x: xCant - 3 * k, y: arriba - 20 * k, width: cw + 6 * k, height: 17 * k, color: negro });
    p.drawText(cant, { x: xCant, y: arriba - 17 * k, size: csz, font: l.fb, color: varias ? rgb(1, 1, 1) : negro });
    p.drawRectangle({ x: w - m - 15 * k, y: arriba - 18 * k, width: 14 * k, height: 14 * k, borderWidth: 1, borderColor: negro, color: rgb(1, 1, 1) });
    y = arriba - alto;
  }
  if (!d.lineas.length) { y -= 12 * k; t("Este pedido no tiene productos para preparar.", m, 8 * k); y -= 4 * k; }
  p.drawLine({ start: { x: m, y }, end: { x: w - m, y }, thickness: 0.8 });
  const unidades = d.lineas.reduce((a, x) => a + x.cantidad, 0);
  const masDeUna = d.lineas.filter((x) => x.cantidad > 1).length;
  y -= 11 * k;
  t(`${unidades} unidad${unidades === 1 ? "" : "es"} en ${d.lineas.length} línea${d.lineas.length === 1 ? "" : "s"}`
    + (masDeUna ? ` · ojo: ${masDeUna === 1 ? "1 línea lleva" : `${masDeUna} líneas llevan`} más de una unidad` : ""), m, 7.5 * k, l.fb);
  if (d.notas?.trim() && inicio?.notas !== true) {
    y -= 14 * k;
    if (y < m + 20 * k) { await nueva(true); y -= 4 * k; }
    t("Notas del comprador:", m, 7.5 * k, l.fb);
    y -= 10 * k;
    for (const r of renglones(d.notas, l.f, 7.5 * k, ancho)) {
      if (y < m) { await nueva(true); }
      t(r, m, 7.5 * k);
      y -= 9.5 * k;
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
  else { ancho = 95 * MM; alto = 90 * MM; aviso(l, p, m, arriba, ancho, alto, "Falta la etiqueta de Mercado Libre", etiqueta.aviso); }
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
export async function armarPdf(hojas: DatosHoja[], o: { tam: TamHoja; bajarEtiquetaMl: BajarEtiquetaMl; soloEtiqueta?: boolean }): Promise<{ pdf: Uint8Array; paginas: string[]; sinEtiqueta: number[] }> {
  const doc = await PDFDocument.create();
  doc.setTitle("Etiquetas y hojas de preparación");
  const l: Lienzo = { doc, f: await doc.embedFont(StandardFonts.Helvetica), fb: await doc.embedFont(StandardFonts.HelveticaBold), tam: o.tam };
  const juntas = o.tam === "a4" && !o.soloEtiqueta;
  const paginas: string[] = [];
  const sinEtiqueta: number[] = [];
  for (const d of hojas) {
    // En A4 la etiqueta se dibuja en la página única; si no, en la suya.
    let unica: Parameters<typeof paginaUnica>[2];
    let tipo: string;
    if (d.etiqueta.tipo === "ml") {
      const r = await o.bajarEtiquetaMl(d.etiqueta.canalId, d.etiqueta.envioExterno);
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
        const texto = `${r.ok ? "Mercado Libre mandó un PDF que no se pudo leer." : r.motivo} Reimprimí la etiqueta de este pedido desde Ventas › Envíos.`;
        unica = { aviso: texto };
        if (!juntas) { paginaAviso(l, `Pedido #${d.pedidoId}: falta la etiqueta de Mercado Libre`, texto); paginas.push(`aviso:${d.pedidoId}`); }
      }
    } else {
      tipo = "etiqueta-propia";
      unica = { propia: d.etiqueta };
      if (!juntas) { await paginaPropia(l, d, d.etiqueta); paginas.push(`etiqueta-propia:${d.pedidoId}`); }
    }
    if (juntas) {
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
