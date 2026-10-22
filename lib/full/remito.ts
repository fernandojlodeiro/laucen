// El remito de un envío a Full para el transportista (Fer, 22/10): membrete de la empresa, de dónde
// sale y a dónde va, quién lo lleva (un proveedor, guardado en el envío), el detalle de la mercadería y el valor declarado. El valor
// declarado se carga en el envío; si queda vacío, va el sugerido: cada unidad al costo sin IVA, en
// pesos (el costo en dólares, al tipo de cambio de hoy; la misma cuenta que el reparto del flete,
// lineasReparto). Los bultos, lo cargado o un aproximado por medidas y peso. Los datos del destino son siempre los mismos y se cargan una vez
// (full_remito_datos, Stock › Envíos a Full › Datos del remito). Hecho con pdf-lib, como el presupuesto.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { una, consulta, ErrorErp } from "@/lib/erp/base";
import { emisorDeCanal } from "@/lib/arca/facturar";
import { cuitLegible } from "@/lib/cuit";
import { enLetras } from "@/lib/letras";
import { IVA, limpio, renglones, imagen } from "@/lib/pedidos/presupuesto-pdf";
import { SQL_CODIGO } from "@/lib/deposito/etiquetas-full";
import { envio as leerEnvio, lineasReparto } from "@/lib/full/envios";

export type DatosRemito = {
  destinatario: string | null; cuit: string | null; direccion: string | null; localidad: string | null; provincia: string | null;
  codigo_postal: string | null; telefono: string | null; horario: string | null; observaciones: string | null;
};
export const CAMPOS_REMITO = ["destinatario", "cuit", "direccion", "localidad", "provincia", "codigo_postal", "telefono", "horario", "observaciones"] as const;

export async function datosRemito(org: string): Promise<DatosRemito> {
  const d = await una<DatosRemito>(`select ${CAMPOS_REMITO.join(", ")} from full_remito_datos where organizacion_id = $1`, [org]);
  return d ?? Object.fromEntries(CAMPOS_REMITO.map((k) => [k, null])) as DatosRemito;
}

export async function guardarDatosRemito(org: string, d: DatosRemito) {
  await consulta(`
    insert into full_remito_datos (organizacion_id, ${CAMPOS_REMITO.join(", ")}, actualizado_ts)
    values ($1, ${CAMPOS_REMITO.map((_, i) => `$${i + 2}`).join(", ")}, now())
    on conflict (organizacion_id) do update set ${CAMPOS_REMITO.map((k) => `${k} = excluded.${k}`).join(", ")}, actualizado_ts = now()`,
    [org, ...CAMPOS_REMITO.map((k) => d[k])]);
}

/** Bultos sugeridos (aproximado, Fer 22/10): un producto grande o pesado (desde CAJA_PROPIA_CM3 o
 *  CAJA_PROPIA_G por unidad) va en su propia caja, un bulto por unidad; los chicos se juntan en cajas
 *  de 60 × 40 × 40 cm llenas al 80 %. Sin medidas, cuenta como chico de 2.000 cm³. Función pura. */
export const CAJA_PROPIA_CM3 = 30_000, CAJA_PROPIA_G = 5_000, CAJA_JUNTA_CM3 = 60 * 40 * 40 * 0.8, CHICO_SIN_MEDIDA_CM3 = 2_000;
export function bultosSugeridos(lineas: { cantidad: number; volumen: number | null; peso: number | null }[]): number {
  let propios = 0, chicos = 0;
  for (const l of lineas) {
    if (!(l.cantidad > 0)) continue;
    const vol = Number(l.volumen) > 0 ? Number(l.volumen) : null, peso = Number(l.peso) > 0 ? Number(l.peso) : null;
    if ((vol ?? 0) >= CAJA_PROPIA_CM3 || (peso ?? 0) >= CAJA_PROPIA_G) propios += l.cantidad;
    else chicos += l.cantidad * (vol ?? CHICO_SIN_MEDIDA_CM3);
  }
  return propios + (chicos > 0 ? Math.ceil(chicos / CAJA_JUNTA_CM3) : 0);
}

/** Lo sugerido del remito de un envío: el valor declarado y los bultos. */
export async function sugeridosRemito(org: string, envioId: number) {
  const lineas = await lineasReparto(org, envioId);
  const total = lineas.reduce((t, l) => t + l.cantidad * (Number(l.valor) > 0 ? Number(l.valor) : 0), 0);
  return { valor: Math.round(total * 100) / 100, sinCosto: lineas.filter((l) => !(Number(l.valor) > 0)).map((l) => l.sku), bultos: bultosSugeridos(lineas) };
}

/** Los proveedores para elegir el transportista (los activos y el que ya tenga el envío). */
export async function proveedoresTransporte(org: string, actual: number | null) {
  return consulta<{ id: number; texto: string; detalle: string }>(`
    select id::int, nombre texto, concat_ws(' · ', nullif(razon_social, nombre), cuit) detalle from proveedor
     where organizacion_id = $1 and (estado = 'activo' or id = $2) order by nombre`, [org, actual]);
}

export async function guardarRemitoEnvio(org: string, id: number, d: { transportista: number | null; bultos: number | null; valor: number | null }) {
  if (d.transportista && !(await una("select 1 from proveedor where id = $1 and organizacion_id = $2", [d.transportista, org]))) throw new ErrorErp("Ese proveedor no existe.");
  if (d.bultos != null && (!Number.isInteger(d.bultos) || d.bultos < 0)) throw new ErrorErp("Los bultos son una cantidad entera.");
  if (d.valor != null && d.valor < 0) throw new ErrorErp("El valor declarado no puede ser negativo.");
  const r = await consulta("update full_envio set transportista_id = $3, bultos = $4, valor_declarado_ars = $5 where organizacion_id = $1 and id = $2 returning id",
    [org, id, d.transportista, d.bultos, d.valor]);
  if (!r.length) throw new ErrorErp("Ese envío no existe.");
}

const W = 595.28, H = 841.89, M = 36;
const AZUL = rgb(0.086, 0.341, 0.498), GRIS = rgb(0.36, 0.42, 0.46), LINEA = rgb(0.89, 0.91, 0.94), FONDO = rgb(0.97, 0.98, 0.99), NEGRO = rgb(0.1, 0.12, 0.15);
const pesos = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dia = (iso: string) => iso.split("-").reverse().join("/");

export async function pdfRemito(org: string, envioId: number): Promise<{ pdf: Uint8Array; nombre: string }> {
  const e = await leerEnvio(org, envioId);
  if (!e) throw new ErrorErp("Ese envío no existe.");
  const lineas = await consulta<{ cantidad: number; sku: string; titulo: string; codigo: string | null }>(`
    select l.cantidad::int, v.sku, titulo_variacion(v.id) titulo,
           (select ${SQL_CODIGO} from meli_item m where m.canal_id = $3 and m.item_id = l.item_id and coalesce(m.variation_id, '') = l.variation_id limit 1) codigo
      from full_envio_linea l join variacion v on v.id = l.variacion_id
     where l.organizacion_id = $1 and l.envio_id = $2 and l.cantidad > 0 order by v.sku`, [org, envioId, e.canal_id]);
  if (!lineas.length) throw new ErrorErp("El envío no tiene productos.");
  const [dest, emp, emisor, origen, hoy, tr] = await Promise.all([
    datosRemito(org),
    una<{ nombre_fantasia: string | null; logo: string | null; email: string | null; telefono: string | null; web: string | null;
      direccion: string | null; localidad: string | null; provincia: string | null; codigo_postal: string | null }>(
      "select nombre_fantasia, logo, email, telefono, web, direccion, localidad, provincia, codigo_postal from empresa where organizacion_id = $1", [org]),
    emisorDeCanal(org, e.canal_id).catch(() => null),
    una<{ direccion: string | null }>("select direccion from deposito where id = $1 and organizacion_id = $2", [e.deposito_origen_id, org]),
    una<{ d: string }>("select to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') d"),
    e.transportista_id ? una<{ nombre: string; razon_social: string | null; cuit: string | null; calle: string | null; localidad: string | null; provincia: string | null; telefono: string | null }>(
      "select nombre, razon_social, cuit, calle, localidad, provincia, coalesce(telefono, telefono_movil) telefono from proveedor where id = $1 and organizacion_id = $2",
      [e.transportista_id, org]) : Promise.resolve(null),
  ]);
  const sug = await sugeridosRemito(org, envioId);
  const valor = e.valor_declarado_ars ?? sug.valor;
  const bultos = e.bultos ?? sug.bultos;
  const unidades = lineas.reduce((t, l) => t + l.cantidad, 0);
  const numero = String(envioId).padStart(8, "0");

  const doc = await PDFDocument.create();
  doc.setTitle(`Remito envío a Full ${envioId}`);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const texto = (pg: PDFPage, s: string, x: number, y: number, tam = 9, fuente: PDFFont = f, color = NEGRO) =>
    pg.drawText(limpio(s), { x, y, size: tam, font: fuente, color });
  const derecha = (pg: PDFPage, s: string, xDer: number, y: number, tam = 9, fuente: PDFFont = f, color = NEGRO) =>
    texto(pg, s, xDer - fuente.widthOfTextAtSize(limpio(s), tam), y, tam, fuente, color);
  const logo = await imagen(doc, emp?.logo, 400);

  // ── Membrete ──
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
    [emp?.telefono && `Tel. ${emp.telefono}`, emp?.email, emp?.web?.replace(/^https?:\/\//, "")].filter(Boolean).join(" · ") || null,
  ].filter((x): x is string => !!x);
  for (const d of datosEmpresa) { texto(pg, d, M, y - 10, 8.5, f, GRIS); y -= 11.5; }
  const xDer = W - M;
  derecha(pg, "REMITO", xDer, H - M - 18, 20, fb, AZUL);
  derecha(pg, `N.º ${numero}`, xDer, H - M - 36, 11, fb);
  derecha(pg, `Fecha: ${dia(hoy!.d)}`, xDer, H - M - 52, 9.5);
  derecha(pg, "Envío de mercadería a Mercado Libre Full", xDer, H - M - 66, 8, f, GRIS);
  derecha(pg, "Documento no válido como factura", xDer, H - M - 78, 8, f, GRIS);
  y = Math.min(y, H - M - 90) - 8;

  // ── Recuadros: origen, destino y transporte ──
  const recuadro = (titulo: string, principal: string | null, otros: (string | null | false | undefined)[]) => {
    const resto = otros.filter((x): x is string => !!x).flatMap((x) => renglones(x, f, 8.5, W - 2 * M - 90, 3));
    const alto = 22 + resto.length * 11.5;
    pg.drawRectangle({ x: M, y: y - alto, width: W - 2 * M, height: alto, color: FONDO, borderColor: LINEA, borderWidth: 1 });
    texto(pg, titulo, M + 10, y - 13, 7.5, fb, GRIS);
    texto(pg, principal || "—", M + 80, y - 13, 10, fb);
    resto.forEach((l, i) => texto(pg, l, M + 80, y - 26 - i * 11.5, 8.5, f, GRIS));
    y -= alto + 8;
  };
  recuadro("SALE DE", e.origen, [origen?.direccion]);
  recuadro("DESTINO", dest.destinatario || "Mercado Libre Full", [
    dest.cuit ? `CUIT ${cuitLegible(dest.cuit)}` : null,
    [dest.direccion, [dest.codigo_postal && `(${dest.codigo_postal})`, dest.localidad].filter(Boolean).join(" "), dest.provincia].filter(Boolean).join(", "),
    [dest.telefono && `Tel. ${dest.telefono}`, dest.horario && `Horario: ${dest.horario}`].filter(Boolean).join(" · "),
    [e.numero_ml && `Envío de Mercado Libre N.º ${e.numero_ml}`, e.fecha_entrega && `Turno: ${dia(e.fecha_entrega)}`, `Cuenta: ${e.canal}`].filter(Boolean).join(" · "),
  ]);
  recuadro("TRANSPORTE", tr ? tr.razon_social || tr.nombre : "", [
    tr?.cuit ? `CUIT ${cuitLegible(tr.cuit)}` : null,
    tr ? [tr.calle, tr.localidad, tr.provincia].filter(Boolean).join(", ") : null,
    tr?.telefono ? `Tel. ${tr.telefono}` : null,
    `Bultos: ${bultos.toLocaleString("es-AR")} · Unidades: ${unidades.toLocaleString("es-AR")}`,
  ]);
  y -= 6;

  // ── Detalle de la mercadería ──
  const COL = { cant: M + 6, sku: M + 50, cod: M + 130, desc: M + 205 };
  const anchoDesc = W - M - 6 - COL.desc;
  const encabezado = () => {
    pg.drawRectangle({ x: M, y: y - 18, width: W - 2 * M, height: 18, color: AZUL });
    const blanco = rgb(1, 1, 1);
    texto(pg, "Cant.", COL.cant, y - 12.5, 8.5, fb, blanco);
    texto(pg, "SKU", COL.sku, y - 12.5, 8.5, fb, blanco);
    texto(pg, "Código ML", COL.cod, y - 12.5, 8.5, fb, blanco);
    texto(pg, "Descripción", COL.desc, y - 12.5, 8.5, fb, blanco);
    y -= 18;
  };
  encabezado();
  lineas.forEach((l, i) => {
    const rs = renglones(l.titulo, f, 9, anchoDesc, 3);
    const alto = Math.max(20, rs.length * 11 + 9);
    if (y - alto < M + 40) { pg = doc.addPage([W, H]); y = H - M; encabezado(); }
    if (i % 2 === 1) pg.drawRectangle({ x: M, y: y - alto, width: W - 2 * M, height: alto, color: FONDO });
    texto(pg, l.cantidad.toLocaleString("es-AR"), COL.cant, y - 13, 10, fb);
    texto(pg, l.sku, COL.sku, y - 13, 8.5);
    texto(pg, l.codigo ?? "—", COL.cod, y - 13, 8.5);
    rs.forEach((r, j) => texto(pg, r, COL.desc, y - 13 - j * 11, 9));
    pg.drawLine({ start: { x: M, y: y - alto }, end: { x: W - M, y: y - alto }, thickness: 0.5, color: LINEA });
    y -= alto;
  });
  if (y - 22 < M + 40) { pg = doc.addPage([W, H]); y = H - M; }
  texto(pg, `Total: ${unidades.toLocaleString("es-AR")} unidades de ${lineas.length.toLocaleString("es-AR")} productos`, M + 6, y - 14, 9.5, fb);
  y -= 26;

  // ── Valor declarado ──
  const letras = renglones(enLetras(valor, "ARS"), f, 8.5, W - 2 * M - 20);
  const altoValor = 26 + letras.length * 11;
  if (y - altoValor < M + 110) { pg = doc.addPage([W, H]); y = H - M; }
  pg.drawRectangle({ x: M, y: y - altoValor, width: W - 2 * M, height: altoValor, color: FONDO, borderColor: AZUL, borderWidth: 1 });
  texto(pg, "VALOR DECLARADO", M + 10, y - 15, 9, fb, AZUL);
  derecha(pg, pesos(valor), W - M - 10, y - 15, 12, fb);
  letras.forEach((r, i) => texto(pg, r, M + 10, y - 28 - i * 11, 8.5, f, GRIS));
  y -= altoValor + 10;

  // ── Observaciones ──
  for (const c of [dest.observaciones, e.notas].filter((x): x is string => !!x?.trim())) {
    for (const r of renglones(`Observaciones: ${c}`, f, 8.5, W - 2 * M)) { texto(pg, r, M, y - 10, 8.5, f, GRIS); y -= 11; }
    y -= 3;
  }

  // ── Firmas ──
  if (y - 90 < M + 10) { pg = doc.addPage([W, H]); y = H - M; }
  y -= 50;
  const ancho = (W - 2 * M - 30) / 2;
  [["Entregó", "Firma y aclaración"], ["Recibió el transportista", "Firma, aclaración y DNI"]].forEach(([t, s], i) => {
    const x = M + i * (ancho + 30);
    pg.drawLine({ start: { x, y }, end: { x: x + ancho, y }, thickness: 0.8, color: GRIS });
    texto(pg, t, x, y - 12, 9, fb);
    texto(pg, s, x, y - 24, 8, f, GRIS);
  });

  const paginas = doc.getPages();
  paginas.forEach((x, i) => {
    x.drawLine({ start: { x: M, y: M - 6 }, end: { x: W - M, y: M - 6 }, thickness: 0.5, color: LINEA });
    texto(x, `Remito N.º ${numero}${nombreEmpresa ? ` · ${nombreEmpresa}` : ""}`, M, M - 18, 7.5, f, GRIS);
    derecha(x, `Página ${i + 1} de ${paginas.length}`, W - M, M - 18, 7.5, f, GRIS);
  });
  return { pdf: await doc.save(), nombre: `Remito-Full-${numero}.pdf` };
}
