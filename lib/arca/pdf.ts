// El PDF de un comprobante (factura o nota de crédito) con el QR de ARCA
// (RG 4892). Hecho con pdf-lib (sin navegador): sirve para bajarlo,
// mandarlo por mail o subirlo a Mercado Libre.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import bwipjs from "bwip-js/node";
import { una, consulta, ErrorErp } from "@/lib/erp/base";
import { TIPOS_CBTE, DOC_TIPOS, CONDICION_RECEPTOR_TEXTO, emisorDe } from "@/lib/arca/facturar";

const IVA_EMISOR: Record<string, string> = { responsable_inscripto: "IVA Responsable Inscripto", monotributo: "Responsable Monotributo", exento: "IVA Exento" };
const pesos = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso: string) => iso.split("-").reverse().join("/");

/** Para que las fuentes estándar (WinAnsi) no rompan con caracteres raros. */
const limpio = (s: string) => s.normalize("NFC").replace(/[^\x20-\x7E -ÿ]/g, "?");

const cuitConGuiones = (c: string) => { const d = c.replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : c; };

/** El logo de la empresa (link público de Supabase Storage), listo para
 *  dibujar. PNG o JPG; cualquier otra cosa o una falla de red → sin logo. */
async function logoDe(doc: PDFDocument, org: string): Promise<PDFImage | null> {
  try {
    const fila = await una<{ logo: string | null }>("select logo from empresa where organizacion_id = $1", [org]);
    if (!fila?.logo || !/^https:\/\//.test(fila.logo)) return null;
    const r = await fetch(fila.logo, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return await doc.embedPng(b);
    if (b[0] === 0xff && b[1] === 0xd8) return await doc.embedJpg(b);
    return null;
  } catch (err) {
    console.error("[pdf] no se pudo poner el logo:", err);
    return null;
  }
}

export async function pdfComprobante(org: string, id: number): Promise<Uint8Array> {
  const c = await una<{ tipo_cbte: number; punto_venta: number; numero: string; fecha: string; doc_tipo: number; doc_nro: string; receptor_nombre: string | null;
    receptor_condicion_iva: number | null; receptor_domicilio: string | null; importe_total: string; importe_neto: string; importe_iva: string;
    iva_detalle: { pct: number; base: number; importe: number }[]; cae: string | null; cae_vto: string | null; estado: string; pedido_id: string | null; ambiente: string; emisor_id: string | null }>(`
    select tipo_cbte, punto_venta, numero, to_char(fecha, 'YYYY-MM-DD') fecha, doc_tipo, doc_nro, receptor_nombre, receptor_condicion_iva,
           receptor_domicilio, importe_total, importe_neto, importe_iva, iva_detalle, cae, to_char(cae_vto, 'YYYY-MM-DD') cae_vto, estado,
           pedido_id, ambiente, emisor_id
      from comprobante where id = $1 and organizacion_id = $2`, [id, org]);
  if (!c) throw new ErrorErp("El comprobante no existe.");
  if (c.estado !== "autorizado") throw new ErrorErp("El comprobante todavía no tiene CAE.");
  const e = await emisorDe(org, c.emisor_id ? Number(c.emisor_id) : null);
  if (!e) throw new ErrorErp("Faltan los datos del emisor.");
  const lineas = await consulta<{ descripcion: string; cantidad: string; precio_unit: string; iva_pct: string; neto: string; total: string }>(
    "select descripcion, cantidad, precio_unit, iva_pct, neto, total from comprobante_linea where comprobante_id = $1 order by orden, id", [id]);
  const tipo = TIPOS_CBTE[c.tipo_cbte];
  const discrimina = tipo.letra === "A";

  const doc = await PDFDocument.create();
  const pagina = doc.addPage([595.28, 841.89]); // A4
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const gris = rgb(0.35, 0.4, 0.45);
  const texto = (p: PDFPage, s: string, x: number, y: number, size = 9, font: PDFFont = f, color = rgb(0, 0, 0)) => p.drawText(limpio(s), { x, y, size, font, color });
  const derecha = (p: PDFPage, s: string, xDer: number, y: number, size = 9, font: PDFFont = f) => texto(p, s, xDer - font.widthOfTextAtSize(limpio(s), size), y, size, font);

  // Encabezado: emisor a la izquierda, tipo/número a la derecha, letra en el medio.
  pagina.drawRectangle({ x: 30, y: 700, width: 535, height: 112, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  pagina.drawLine({ start: { x: 297, y: 700 }, end: { x: 297, y: 772 }, thickness: 1 });
  pagina.drawRectangle({ x: 277, y: 772, width: 40, height: 40, borderWidth: 1, borderColor: rgb(0, 0, 0), color: rgb(1, 1, 1) });
  texto(pagina, tipo.letra, 289, 785, 24, fb);
  texto(pagina, `COD. ${String(c.tipo_cbte).padStart(3, "0")}`, 283, 775, 6, f);
  // Con logo (Configuración → Empresa), va arriba a la izquierda y los datos
  // del emisor bajan un poco y se aprietan.
  const logo = await logoDe(doc, org);
  if (logo) {
    const k = Math.min(150 / logo.width, 34 / logo.height, 1);
    pagina.drawImage(logo, { x: 40, y: 806 - logo.height * k, width: logo.width * k, height: logo.height * k });
  }
  const y0 = logo ? [762, 750, 740, 730, 720, 710] : [790, 760, 748, 736, 724, 712];
  texto(pagina, e.razon_social, 40, y0[0], logo ? 11 : 13, fb);
  texto(pagina, `Domicilio: ${e.domicilio ?? "-"}`, 40, y0[1], 8);
  texto(pagina, IVA_EMISOR[e.condicion_iva], 40, y0[2], 8);
  texto(pagina, `CUIT: ${cuitConGuiones(e.cuit)}`, 40, y0[3], 8);
  if (e.iibb) texto(pagina, `Ingresos Brutos: ${e.iibb}`, 40, y0[4], 8);
  if (e.inicio_actividades) texto(pagina, `Inicio de actividades: ${fecha(e.inicio_actividades)}`, 40, y0[5], 8);
  texto(pagina, tipo.nombre.toUpperCase(), 330, 790, 13, fb);
  texto(pagina, `Punto de venta: ${String(c.punto_venta).padStart(5, "0")}   Comp. Nro: ${String(c.numero).padStart(8, "0")}`, 330, 760, 9, fb);
  texto(pagina, `Fecha de emisión: ${fecha(c.fecha)}`, 330, 746, 9);
  if (c.ambiente !== "produccion") texto(pagina, "HOMOLOGACIÓN - SIN VALIDEZ FISCAL", 330, 716, 8, fb, rgb(0.75, 0.1, 0.1));

  // Receptor.
  pagina.drawRectangle({ x: 30, y: 640, width: 535, height: 54, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  texto(pagina, `${DOC_TIPOS[c.doc_tipo] ?? "Doc."}: ${c.doc_tipo === 99 ? "-" : c.doc_nro}`, 40, 678, 9);
  texto(pagina, `Apellido y nombre / Razón social: ${c.receptor_nombre ?? "-"}`, 200, 678, 9);
  texto(pagina, `Condición frente al IVA: ${CONDICION_RECEPTOR_TEXTO[c.receptor_condicion_iva ?? 5] ?? "-"}`, 40, 662, 9);
  texto(pagina, `Domicilio: ${(c.receptor_domicilio ?? "-").slice(0, 70)}`, 40, 648, 9);
  if (c.pedido_id) derecha(pagina, `Pedido ${c.pedido_id}`, 555, 662, 8);

  // Detalle.
  let y = 620;
  pagina.drawRectangle({ x: 30, y: y - 4, width: 535, height: 16, color: rgb(0.9, 0.92, 0.94) });
  texto(pagina, "Descripción", 36, y, 8, fb);
  derecha(pagina, "Cant.", 360, y, 8, fb);
  derecha(pagina, discrimina ? "P. unit. s/IVA" : "P. unitario", 440, y, 8, fb);
  if (discrimina) derecha(pagina, "IVA", 480, y, 8, fb);
  derecha(pagina, discrimina ? "Subtotal s/IVA" : "Subtotal", 559, y, 8, fb);
  y -= 18;
  for (const l of lineas) {
    if (y < 190) break; // una página alcanza para los pedidos de hoy; si no, se corta (TODO: más páginas)
    const cant = Number(l.cantidad);
    const desc = limpio(l.descripcion);
    const corte = desc.length > 62 ? desc.slice(0, 62) + "…" : desc;
    texto(pagina, corte, 36, y, 8);
    derecha(pagina, cant.toLocaleString("es-AR"), 360, y, 8);
    derecha(pagina, pesos(discrimina ? Number(l.neto) / cant : Number(l.precio_unit)), 440, y, 8);
    if (discrimina) derecha(pagina, `${Number(l.iva_pct)}%`, 480, y, 8);
    derecha(pagina, pesos(discrimina ? Number(l.neto) : Number(l.total)), 559, y, 8);
    y -= 14;
  }

  // Totales.
  let yt = 170;
  pagina.drawLine({ start: { x: 30, y: 185 }, end: { x: 565, y: 185 }, thickness: 0.5, color: gris });
  if (discrimina) {
    derecha(pagina, `Importe neto gravado: ${pesos(Number(c.importe_neto))}`, 559, yt, 9); yt -= 13;
    for (const a of c.iva_detalle ?? []) { derecha(pagina, `IVA ${Number(a.pct)}%: ${pesos(Number(a.importe))}`, 559, yt, 9); yt -= 13; }
  } else if (tipo.letra === "B" && Number(c.importe_iva) > 0) {
    // Ley 27.743 (transparencia fiscal): el IVA contenido se informa en B.
    texto(pagina, `Régimen de Transparencia Fiscal al Consumidor (Ley 27.743) - IVA contenido: ${pesos(Number(c.importe_iva))}`, 36, yt, 7, f, gris);
    yt -= 13;
  }
  derecha(pagina, `TOTAL: ${pesos(Number(c.importe_total))}`, 559, yt - 4, 12, fb);

  // CAE y QR.
  const qrDatos = {
    ver: 1, fecha: c.fecha, cuit: Number(e.cuit.replace(/\D/g, "")), ptoVta: c.punto_venta, tipoCmp: c.tipo_cbte, nroCmp: Number(c.numero),
    importe: Number(c.importe_total), moneda: "PES", ctz: 1, tipoDocRec: c.doc_tipo, nroDocRec: Number(c.doc_nro) || 0, tipoCodAut: "E", codAut: Number(c.cae),
  };
  const qrUrl = `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(qrDatos)).toString("base64")}`;
  const png = await bwipjs.toBuffer({ bcid: "qrcode", text: qrUrl, scale: 3 });
  const qr = await doc.embedPng(png);
  pagina.drawImage(qr, { x: 36, y: 40, width: 90, height: 90 });
  texto(pagina, "Comprobante autorizado por ARCA", 140, 110, 9, fb);
  texto(pagina, `CAE: ${c.cae}`, 140, 95, 9);
  texto(pagina, `Vencimiento del CAE: ${c.cae_vto ? fecha(c.cae_vto) : "-"}`, 140, 82, 9);
  return doc.save();
}
