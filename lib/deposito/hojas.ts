// Etiqueta + hoja de preparación por pedido (Fer, 3/10): un solo PDF que,
// para cada pedido y en orden, trae primero su etiqueta de envío (la de
// Mercado Libre, bajada de ML; para la web o el local, una nuestra con N.º de
// pedido, cliente, dirección o "retira" y teléfono) y enseguida su hoja de
// preparación: N.º de pedido grande con su código de barras, cliente, canal,
// fecha, logística, "despachar antes de" y las líneas por orden de recorrido
// (ubicación, SKU, título, cantidad grande y un cuadrado para tildar a mano;
// los kits abiertos en sus componentes). Tamaño 10×15 cm (la térmica de las
// etiquetas de ML) o A4.
//
// Acá: juntar los datos (datosHojas) y dibujar el PDF (armarPdf, sin base:
// la etiqueta de ML llega por una función, así los tests la reemplazan).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
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

/** Una página con un aviso (la etiqueta de ML que no vino). */
function paginaAviso(l: Lienzo, titulo: string, texto: string) {
  const [w, h] = PAGINA[l.tam];
  const p = l.doc.addPage([w, h]);
  const ancho = Math.min(w, 100 * MM) - 24;
  p.drawRectangle({ x: 10, y: h - 10 - 150 * MM + 20, width: ancho + 4, height: 150 * MM - 20, borderWidth: 1, borderColor: rgb(0.75, 0.2, 0.15), opacity: 0 });
  let y = h - 40;
  for (const r of renglones(titulo, l.fb, 14, ancho - 10)) { p.drawText(r, { x: 18, y, size: 14, font: l.fb, color: rgb(0.75, 0.2, 0.15) }); y -= 18; }
  y -= 6;
  for (const r of renglones(texto, l.f, 10, ancho - 10)) { p.drawText(r, { x: 18, y, size: 10, font: l.f }); y -= 13; }
}

/** Pega las páginas del PDF de ML, cada una a su tamaño (achicada si no entra). */
async function paginasMl(l: Lienzo, pdf: Uint8Array): Promise<number> {
  const origen = await PDFDocument.load(pdf, { ignoreEncryption: true });
  // Una página sin contenido no se puede pegar (y rompería al grabar el PDF).
  const conContenido = origen.getPages().filter((pg) => !!pg.node.Contents());
  if (!conContenido.length) return 0;
  const incrustadas = await l.doc.embedPages(conContenido);
  const [w, h] = PAGINA[l.tam];
  for (const e of incrustadas) {
    const p = l.doc.addPage([w, h]);
    const k = Math.min(w / e.width, h / e.height, l.tam === "10x15" ? Infinity : 1);
    const ew = e.width * k, eh = e.height * k;
    // En 10×15 se centra; en A4 va arriba a la izquierda, a su tamaño.
    p.drawPage(e, l.tam === "10x15" ? { x: (w - ew) / 2, y: (h - eh) / 2, width: ew, height: eh } : { x: 20, y: h - 20 - eh, width: ew, height: eh });
  }
  return incrustadas.length;
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

/** Nuestra etiqueta (web, local): un rectángulo de 10×15 con lo necesario. */
async function etiquetaPropia(l: Lienzo, d: DatosHoja, e: Extract<EtiquetaHoja, { tipo: "propia" }>) {
  const [w, h] = PAGINA[l.tam];
  const p = l.doc.addPage([w, h]);
  const bw = 100 * MM, bh = 150 * MM;
  const x0 = l.tam === "10x15" ? 0 : 20, y0 = l.tam === "10x15" ? 0 : h - 20 - bh;
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

/** La hoja de preparación (una o más páginas si tiene muchas líneas). */
async function hoja(l: Lienzo, d: DatosHoja): Promise<number> {
  const [w, h] = PAGINA[l.tam];
  const k = l.tam === "a4" ? 1.45 : 1;
  const m = 12 * k, ancho = w - 2 * m;
  const img = await codigoBarras(l.doc, String(d.pedidoId));
  let paginas = 0;
  let p!: PDFPage;
  let y = 0;
  const negro = rgb(0, 0, 0), gris = rgb(0.35, 0.38, 0.42);
  const t = (s: string, x: number, size: number, font = l.f, color = negro) => p.drawText(limpio(s), { x, y, size, font, color });

  const nueva = (seguida: boolean) => {
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
    if (d.reimpresion) {
      // Al lado del título (a la derecha va el código de barras).
      const s = "REIMPRESIÓN", sz = 8 * k, sw = l.fb.widthOfTextAtSize(s, sz);
      const x = m + l.fb.widthOfTextAtSize("HOJA DE PREPARACIÓN", 7 * k) + 8;
      p.drawRectangle({ x, y: y - 3, width: sw + 6, height: sz + 5, color: negro });
      p.drawText(s, { x: x + 3, y, size: sz, font: l.fb, color: rgb(1, 1, 1) });
    }
    y -= 26 * k;
    const num = `#${d.pedidoId}`;
    t(num, m, 26 * k, l.fb);
    const iw = Math.min(ancho - l.fb.widthOfTextAtSize(num, 26 * k) - 10, 130 * k), ih = 26 * k;
    p.drawImage(img, { x: w - m - iw, y: y - 2, width: iw, height: ih });
    y -= 12 * k;
    const datos: [string, string][] = [
      ["Externo", [d.idExterno, d.pack && `pack ${d.pack}`].filter(Boolean).join(" · ") || "—"],
      ["Cliente", [d.cliente, d.apodo && `(${d.apodo})`].filter(Boolean).join(" ") || "—"],
      ["Canal", d.canal],
      ["Fecha", fechaHora(d.fecha)],
      ["Logística", d.logistica ?? "—"],
      ["Despachar antes de", fechaHora(d.despacharAntes)],
    ];
    const sz = 8 * k;
    for (const [et, val] of datos) {
      t(`${et}:`, m, sz, l.f, gris);
      const x = m + 82 * k;
      const rs = renglones(val, l.fb, sz, ancho - 82 * k);
      for (const r of rs.slice(0, 2)) { t(r, x, sz, l.fb); y -= sz * 1.3; }
    }
    // «A cobrar»: el total, bien grande, para cobrarlo al entregar.
    if (d.aCobrar != null) { y -= 4 * k; y -= recuadroACobrar(p, l.fb, m, y - 34 * k, ancho, d.aCobrar, k); y -= 4 * k; }
    y -= 4 * k;
    // Títulos de la tabla.
    p.drawLine({ start: { x: m, y: y + 2 }, end: { x: w - m, y: y + 2 }, thickness: 0.8 });
    y -= 8 * k;
    t("Ubicación", m, 6.5 * k, l.fb, gris);
    t("Producto", m + COL.prod * k, 6.5 * k, l.fb, gris);
    t("Cant.", w - m - (COL.cant + 18) * k, 6.5 * k, l.fb, gris);
    y -= 4 * k;
  };
  const COL = { prod: 62, cant: 22 };

  nueva(false);
  for (const ln of d.lineas) {
    const indent = ln.kit ? 8 * k : 0;
    const xProd = m + COL.prod * k + indent;
    const anchoProd = w - m - (COL.cant + 22) * k - xProd;
    const tit = renglones(`${ln.sku ?? "s/SKU"} — ${ln.titulo}`, l.f, 7.5 * k, anchoProd).slice(0, 3);
    const kit = ln.kit ? renglones(`kit: ${ln.kit.sku} ${ln.kit.titulo}`, l.f, 6 * k, anchoProd).slice(0, 1) : [];
    const ubic = renglones(ln.ubicacion ?? "—", l.fb, 9 * k, (COL.prod - 4) * k).slice(0, 2);
    const alto = Math.max(tit.length * 9.5 * k + kit.length * 8 * k, ubic.length * 11 * k, 20 * k) + 6 * k;
    if (y - alto < m + 10 * k) nueva(true);
    const arriba = y;
    p.drawLine({ start: { x: m, y }, end: { x: w - m, y }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
    y = arriba - 11 * k;
    for (const r of ubic) { t(r, m, 9 * k, l.fb); y -= 11 * k; }
    y = arriba - 10 * k;
    for (const r of tit) { t(r, xProd, 7.5 * k, l.f); y -= 9.5 * k; }
    for (const r of kit) { t(r, xProd, 6 * k, l.f, gris); y -= 8 * k; }
    // Cantidad grande y el cuadrado para tildar.
    const cant = String(ln.cantidad), csz = 16 * k;
    p.drawText(cant, { x: w - m - 22 * k - l.fb.widthOfTextAtSize(cant, csz), y: arriba - 17 * k, size: csz, font: l.fb });
    p.drawRectangle({ x: w - m - 15 * k, y: arriba - 18 * k, width: 14 * k, height: 14 * k, borderWidth: 1, borderColor: negro });
    y = arriba - alto;
  }
  if (!d.lineas.length) { y -= 12 * k; t("Este pedido no tiene productos para preparar.", m, 8 * k); y -= 4 * k; }
  p.drawLine({ start: { x: m, y }, end: { x: w - m, y }, thickness: 0.8 });
  const unidades = d.lineas.reduce((a, x) => a + x.cantidad, 0);
  y -= 11 * k;
  t(`${unidades} unidad${unidades === 1 ? "" : "es"} en ${d.lineas.length} línea${d.lineas.length === 1 ? "" : "s"}`, m, 7.5 * k, l.fb);
  if (d.notas?.trim()) {
    y -= 14 * k;
    if (y < m + 20 * k) { nueva(true); y -= 4 * k; }
    t("Notas del comprador:", m, 7.5 * k, l.fb);
    y -= 10 * k;
    for (const r of renglones(d.notas, l.f, 7.5 * k, ancho)) {
      if (y < m) { nueva(true); }
      t(r, m, 7.5 * k);
      y -= 9.5 * k;
    }
  }
  return paginas;
}

/** El PDF entero: para cada pedido, su etiqueta y enseguida su hoja (o sólo
 *  la etiqueta, con `soloEtiqueta`). `paginas` dice qué es cada página
 *  ("etiqueta-ml:<pedido>", "etiqueta-propia:<pedido>", "aviso:<pedido>",
 *  "hoja:<pedido>"), para los tests y el registro. */
export async function armarPdf(hojas: DatosHoja[], o: { tam: TamHoja; bajarEtiquetaMl: BajarEtiquetaMl; soloEtiqueta?: boolean }): Promise<{ pdf: Uint8Array; paginas: string[]; sinEtiqueta: number[] }> {
  const doc = await PDFDocument.create();
  doc.setTitle("Etiquetas y hojas de preparación");
  const l: Lienzo = { doc, f: await doc.embedFont(StandardFonts.Helvetica), fb: await doc.embedFont(StandardFonts.HelveticaBold), tam: o.tam };
  const paginas: string[] = [];
  const sinEtiqueta: number[] = [];
  for (const d of hojas) {
    if (d.etiqueta.tipo === "ml") {
      const r = await o.bajarEtiquetaMl(d.etiqueta.canalId, d.etiqueta.envioExterno);
      let n = 0;
      if (r.ok) {
        try { n = await paginasMl(l, r.pdf); } catch { n = 0; }
      }
      if (n) for (let i = 0; i < n; i++) paginas.push(`etiqueta-ml:${d.pedidoId}`);
      else {
        sinEtiqueta.push(d.pedidoId);
        paginaAviso(l, `Pedido #${d.pedidoId}: falta la etiqueta de Mercado Libre`,
          `${r.ok ? "Mercado Libre mandó un PDF que no se pudo leer." : r.motivo} Reimprimí la etiqueta de este pedido desde Ventas → Envíos.`);
        paginas.push(`aviso:${d.pedidoId}`);
      }
    } else {
      await etiquetaPropia(l, d, d.etiqueta);
      paginas.push(`etiqueta-propia:${d.pedidoId}`);
    }
    if (!o.soloEtiqueta) {
      const n = await hoja(l, d);
      for (let i = 0; i < n; i++) paginas.push(`hoja:${d.pedidoId}`);
    }
  }
  return { pdf: await doc.save(), paginas, sinEtiqueta };
}
