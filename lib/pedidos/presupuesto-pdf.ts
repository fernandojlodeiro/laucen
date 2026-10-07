// El PDF del presupuesto (Fer, 7/10): formal, A4, con el logo y los datos de
// la empresa, el cliente, la fecha y hasta cuándo vale, cada producto con su
// foto, cantidad, precio y subtotal, el total en números y en letras, y al
// pie las condiciones. En pesos o en dólares, según la moneda en que se mira
// el panel. Hecho con pdf-lib (sin navegador); las fotos se pasan a JPG con
// sharp (las de Mercado Libre suelen venir en webp, que pdf-lib no lee).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import { una, consulta, ErrorErp } from "@/lib/erp/base";
import { emisorDeCanal } from "@/lib/arca/facturar";
import { cuitLegible } from "@/lib/cuit";
import { enLetras } from "@/lib/letras";
import type { Moneda } from "@/lib/moneda";

const W = 595.28, H = 841.89, M = 36;
const AZUL = rgb(0.086, 0.341, 0.498), GRIS = rgb(0.36, 0.42, 0.46), LINEA = rgb(0.89, 0.91, 0.94), FONDO = rgb(0.97, 0.98, 0.99);
const IVA: Record<string, string> = {
  responsable_inscripto: "IVA Responsable Inscripto", monotributo: "Responsable Monotributo", exento: "IVA Exento",
  consumidor_final: "Consumidor final", no_responsable: "No responsable",
};
const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const plata = (n: number, m: Moneda) => `${m === "USD" ? "US$" : "$"} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Lo que la fuente estándar (WinAnsi) sabe dibujar; lo demás, "?".
const EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const limpio = (s: string) => [...String(s ?? "").normalize("NFC")].map((ch) => {
  const c = ch.charCodeAt(0);
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA.has(ch) ? ch : ch === "\t" || ch === "\n" ? " " : "?";
}).join("");

/** Corta un texto en renglones que entren en `ancho` (como mucho `max`; el último con "…"). */
function renglones(s: string, f: PDFFont, tam: number, ancho: number, max = 99): string[] {
  const out: string[] = [];
  let linea = "";
  for (const palabra of limpio(s).split(/\s+/).filter(Boolean)) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (f.widthOfTextAtSize(prueba, tam) <= ancho) { linea = prueba; continue; }
    if (linea) out.push(linea);
    linea = palabra;
  }
  if (linea) out.push(linea);
  if (out.length > max) {
    const corte = out.slice(0, max);
    let ult = `${corte[max - 1]}…`;
    while (f.widthOfTextAtSize(ult, tam) > ancho && ult.length > 2) ult = `${ult.slice(0, -2)}…`;
    corte[max - 1] = ult;
    return corte;
  }
  return out;
}

/** Una imagen de internet lista para el PDF (achicada a `lado` px, en JPG). null si no se pudo. */
async function imagen(doc: PDFDocument, url: string | null | undefined, lado: number): Promise<PDFImage | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const crudo = Buffer.from(await r.arrayBuffer());
    const jpg = await sharp(crudo).resize(lado, lado, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
    return await doc.embedJpg(jpg);
  } catch {
    return null;
  }
}

type Linea = { cantidad: number; titulo: string; sku: string | null; ars: number; usd: number; foto: string | null };

export async function pdfPresupuesto(org: string, pedidoId: number, moneda: Moneda): Promise<{ pdf: Uint8Array; nombre: string }> {
  const p = await una<{ id: number; fecha: string; vigencia: string | null; estado: string; canal_id: number; total_ars: number; total_usd: number;
    envio_ars: number; notas: string | null; envio: { metodo?: string | null; direccion?: Record<string, string | null> | null } | null;
    cliente: string | null; razon_social: string | null; cuit: string | null; doc_tipo: string | null; doc_nro: string | null; cond_iva: string | null;
    email: string | null; telefono: string | null; cliente_id: number | null }>(`
    select p.id::int, to_char(p.fecha at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') fecha, to_char(p.vigencia, 'YYYY-MM-DD') vigencia, p.estado,
           p.canal_id::int, p.total_ars::float, p.total_usd::float, p.costo_envio_ars::float envio_ars, p.notas, p.envio,
           cl.nombre cliente, cl.razon_social, cl.cuit, cl.documento_tipo doc_tipo, cl.documento_numero doc_nro, cl.condicion_iva cond_iva,
           cl.email, coalesce(cl.telefono_movil, cl.telefono) telefono, cl.id::int cliente_id
      from pedido p left join cliente cl on cl.id = p.cliente_id where p.id = $1 and p.organizacion_id = $2`, [pedidoId, org]);
  if (!p) throw new ErrorErp("El presupuesto no existe.");
  const lineas = await consulta<Linea>(`
    select l.cantidad::int, coalesce(titulo_variacion(v.id), l.titulo) titulo, coalesce(v.sku, l.sku) sku, l.precio_unit_ars::float ars, l.precio_unit_usd::float usd,
           coalesce((select url from variacion_foto where variacion_id = v.id order by orden limit 1),
                    (select url from producto_foto where producto_id = v.producto_id order by orden, id limit 1)) foto
      from pedido_linea l left join variacion v on v.id = l.variacion_id where l.pedido_id = $1 order by l.orden, l.id`, [pedidoId]);
  const emp = await una<{ nombre_fantasia: string | null; logo: string | null; email: string | null; telefono: string | null; whatsapp: string | null; web: string | null;
    direccion: string | null; localidad: string | null; provincia: string | null; codigo_postal: string | null }>(
    "select nombre_fantasia, logo, email, telefono, whatsapp, web, direccion, localidad, provincia, codigo_postal from empresa where organizacion_id = $1", [org]);
  const emisor = await emisorDeCanal(org, p.canal_id).catch(() => null);
  const dirCliente = p.envio?.direccion ?? (p.cliente_id ? await una<Record<string, string | null>>(
    "select calle, numero, piso_depto, localidad, provincia, codigo_postal from cliente_direccion where cliente_id = $1 order by principal desc, id desc limit 1", [p.cliente_id]) : null);

  const doc = await PDFDocument.create();
  const esPresupuesto = p.estado === "presupuesto";
  doc.setTitle(`${esPresupuesto ? "Presupuesto" : "Pedido"} ${p.id}`);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const texto = (pg: PDFPage, s: string, x: number, y: number, tam = 9, fuente: PDFFont = f, color = rgb(0.1, 0.12, 0.15)) =>
    pg.drawText(limpio(s), { x, y, size: tam, font: fuente, color });
  const derecha = (pg: PDFPage, s: string, xDer: number, y: number, tam = 9, fuente: PDFFont = f, color = rgb(0.1, 0.12, 0.15)) =>
    texto(pg, s, xDer - fuente.widthOfTextAtSize(limpio(s), tam), y, tam, fuente, color);

  // Las fotos y el logo, en paralelo.
  const [logo, ...fotos] = await Promise.all([imagen(doc, emp?.logo, 400), ...lineas.map((l) => imagen(doc, l.foto, 160))]);

  // ── Encabezado (sólo en la primera página) ──
  let pg = doc.addPage([W, H]);
  let y = H - M;
  if (logo) {
    const k = Math.min(170 / logo.width, 56 / logo.height, 1);
    pg.drawImage(logo, { x: M, y: y - logo.height * k, width: logo.width * k, height: logo.height * k });
    y -= logo.height * k + 8;
  }
  const nombreEmpresa = emp?.nombre_fantasia || emisor?.razon_social || "";
  if (nombreEmpresa) { texto(pg, nombreEmpresa, M, y - 12, 13, fb, AZUL); y -= 16; }
  const datosEmpresa = [
    emisor ? `${emisor.razon_social} · CUIT ${cuitLegible(emisor.cuit)} · ${IVA[emisor.condicion_iva] ?? emisor.condicion_iva}` : null,
    [emp?.direccion, [emp?.codigo_postal && `(${emp.codigo_postal})`, emp?.localidad].filter(Boolean).join(" "), emp?.provincia].filter(Boolean).join(", ") || emisor?.domicilio || null,
    [emp?.telefono && `Tel. ${emp.telefono}`, emp?.whatsapp && `WhatsApp ${emp.whatsapp}`].filter(Boolean).join(" · ") || null,
    [emp?.email, emp?.web?.replace(/^https?:\/\//, "")].filter(Boolean).join(" · ") || null,
  ].filter((x): x is string => !!x);
  for (const d of datosEmpresa) { texto(pg, d, M, y - 10, 8.5, f, GRIS); y -= 11.5; }

  // A la derecha: qué es, número, fecha y vigencia.
  const xDer = W - M;
  const titulo = esPresupuesto ? "PRESUPUESTO" : "PEDIDO";
  derecha(pg, titulo, xDer, H - M - 18, 20, fb, AZUL);
  derecha(pg, `N.º ${String(p.id).padStart(8, "0")}`, xDer, H - M - 36, 11, fb);
  derecha(pg, `Fecha: ${fecha(p.fecha)}`, xDer, H - M - 52, 9.5);
  if (esPresupuesto) derecha(pg, `Válido hasta: ${fecha(p.vigencia)}`, xDer, H - M - 66, 9.5, fb);
  derecha(pg, moneda === "USD" ? "Importes en dólares estadounidenses" : "Importes en pesos argentinos", xDer, H - M - 80, 8, f, GRIS);
  y = Math.min(y, H - M - 92) - 8;

  // ── Cliente ──
  const ladoCliente: string[] = [];
  const nombreCliente = p.razon_social || p.cliente || "Consumidor final";
  const docCliente = p.cuit ? `CUIT ${cuitLegible(p.cuit)}` : p.doc_nro ? `${p.doc_tipo ?? "Doc."} ${p.doc_nro}` : null;
  ladoCliente.push([docCliente, p.cond_iva ? IVA[p.cond_iva] ?? p.cond_iva : null].filter(Boolean).join(" · "));
  if (dirCliente) {
    const d = dirCliente;
    ladoCliente.push([[d.calle, d.numero].filter(Boolean).join(" "), d.piso_depto, [d.codigo_postal && `(${d.codigo_postal})`, d.localidad].filter(Boolean).join(" "), d.provincia].filter(Boolean).join(", "));
  }
  ladoCliente.push([p.telefono && `Tel. ${p.telefono}`, p.email].filter(Boolean).join(" · "));
  const lineasCliente = ladoCliente.filter(Boolean);
  const altoCliente = 22 + lineasCliente.length * 11.5;
  pg.drawRectangle({ x: M, y: y - altoCliente, width: W - 2 * M, height: altoCliente, color: FONDO, borderColor: LINEA, borderWidth: 1 });
  texto(pg, "CLIENTE", M + 10, y - 13, 7.5, fb, GRIS);
  texto(pg, nombreCliente, M + 60, y - 13, 10, fb);
  lineasCliente.forEach((l, i) => texto(pg, l, M + 60, y - 26 - i * 11.5, 8.5, f, GRIS));
  y -= altoCliente + 14;

  // ── Productos ──
  const COL = { foto: M, cant: M + 52, desc: M + 92, unit: W - M - 92, sub: W - M };
  const anchoDesc = COL.unit - 70 - COL.desc;
  const encabezado = () => {
    pg.drawRectangle({ x: M, y: y - 18, width: W - 2 * M, height: 18, color: AZUL });
    const blanco = rgb(1, 1, 1);
    texto(pg, "Cant.", COL.cant, y - 12.5, 8.5, fb, blanco);
    texto(pg, "Descripción", COL.desc, y - 12.5, 8.5, fb, blanco);
    derecha(pg, "Precio unit.", COL.unit, y - 12.5, 8.5, fb, blanco);
    derecha(pg, "Subtotal", COL.sub - 6, y - 12.5, 8.5, fb, blanco);
    y -= 18;
  };
  const nuevaPagina = () => { pg = doc.addPage([W, H]); y = H - M; encabezado(); };
  encabezado();
  const FILA = 52;
  let subtotal = 0;
  lineas.forEach((l, i) => {
    if (y - FILA < M + 40) nuevaPagina();
    const unit = moneda === "USD" ? l.usd : l.ars;
    const sub = Math.round(unit * l.cantidad * 100) / 100;
    subtotal += sub;
    if (i % 2 === 1) pg.drawRectangle({ x: M, y: y - FILA, width: W - 2 * M, height: FILA, color: FONDO });
    const foto = fotos[i];
    if (foto) {
      const k = Math.min(44 / foto.width, 44 / foto.height);
      pg.drawImage(foto, { x: COL.foto + 4 + (44 - foto.width * k) / 2, y: y - FILA + 4 + (44 - foto.height * k) / 2, width: foto.width * k, height: foto.height * k });
    }
    const medio = y - FILA / 2 - 3;
    texto(pg, String(l.cantidad), COL.cant + 4, medio, 10, fb);
    const rs = renglones(l.titulo, f, 9, anchoDesc, 3);
    const alto = rs.length * 11 + (l.sku ? 10 : 0);
    let yy = y - (FILA - alto) / 2 - 8;
    for (const r of rs) { texto(pg, r, COL.desc, yy, 9); yy -= 11; }
    if (l.sku) texto(pg, l.sku, COL.desc, yy + 1, 7.5, f, GRIS);
    derecha(pg, plata(unit, moneda), COL.unit, medio, 9);
    derecha(pg, plata(sub, moneda), COL.sub - 6, medio, 9, fb);
    pg.drawLine({ start: { x: M, y: y - FILA }, end: { x: W - M, y: y - FILA }, thickness: 0.5, color: LINEA });
    y -= FILA;
  });

  // ── Totales ──
  const total = moneda === "USD" ? Number(p.total_usd) : Number(p.total_ars);
  // El envío: en pesos, el que se cargó; en dólares, lo que queda del total.
  const envio = moneda === "ARS" ? Number(p.envio_ars || 0) : Math.max(0, Math.round((total - subtotal) * 100) / 100);
  if (y - 110 < M + 40) { pg = doc.addPage([W, H]); y = H - M; }
  y -= 10;
  const filaTotal = (t: string, v: string, fuerte = false) => {
    texto(pg, t, W - M - 220, y - 12, fuerte ? 11 : 9.5, fuerte ? fb : f);
    derecha(pg, v, W - M - 6, y - 12, fuerte ? 12 : 9.5, fuerte ? fb : f);
    y -= fuerte ? 20 : 15;
  };
  filaTotal("Subtotal", plata(subtotal, moneda));
  if (envio > 0.004) filaTotal(`Envío${p.envio?.metodo && !/^env[ií]o$/i.test(p.envio.metodo) ? ` (${p.envio.metodo})` : ""}`, plata(envio, moneda));
  pg.drawLine({ start: { x: W - M - 220, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 1, color: AZUL });
  y -= 4;
  filaTotal("TOTAL", plata(total, moneda), true);
  // El total en letras.
  const letras = renglones(enLetras(total, moneda), f, 9, W - 2 * M - 20);
  const altoLetras = 10 + letras.length * 12;
  pg.drawRectangle({ x: M, y: y - altoLetras, width: W - 2 * M, height: altoLetras, color: FONDO, borderColor: LINEA, borderWidth: 1 });
  letras.forEach((r, i) => texto(pg, r, M + 10, y - 15 - i * 12, 9, i === 0 ? fb : f));
  y -= altoLetras + 12;

  // ── Notas y condiciones ──
  const condiciones = [
    ...(p.notas ? [`Observaciones: ${p.notas}`] : []),
    esPresupuesto ? `Presupuesto válido hasta el ${fecha(p.vigencia)}. Pasada esa fecha, los precios pueden cambiar.` : null,
    esPresupuesto ? "Precios sujetos a disponibilidad de stock al momento de confirmar la compra." : null,
    moneda === "ARS" ? "Precios en pesos argentinos, con IVA incluido." : "Precios en dólares estadounidenses, con IVA incluido.",
    "Este documento no es válido como factura.",
  ].filter((x): x is string => !!x);
  for (const c of condiciones) {
    for (const r of renglones(c, f, 8.5, W - 2 * M)) {
      if (y < M + 24) { pg = doc.addPage([W, H]); y = H - M; }
      texto(pg, r, M, y - 10, 8.5, f, GRIS);
      y -= 11;
    }
    y -= 3;
  }

  // Pie de cada página: número de página.
  const paginas = doc.getPages();
  paginas.forEach((x, i) => {
    x.drawLine({ start: { x: M, y: M - 6 }, end: { x: W - M, y: M - 6 }, thickness: 0.5, color: LINEA });
    texto(x, `${esPresupuesto ? "Presupuesto" : "Pedido"} N.º ${String(p.id).padStart(8, "0")}${nombreEmpresa ? ` · ${nombreEmpresa}` : ""}`, M, M - 18, 7.5, f, GRIS);
    derecha(x, `Página ${i + 1} de ${paginas.length}`, W - M, M - 18, 7.5, f, GRIS);
  });

  return { pdf: await doc.save(), nombre: `${esPresupuesto ? "Presupuesto" : "Pedido"}-${String(p.id).padStart(8, "0")}.pdf` };
}
