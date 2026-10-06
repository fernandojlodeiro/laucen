// La API de OCA ePak (Fer, 6/10): el servicio web de OCA (Oep_TrackEPak.asmx),
// que contesta XML. Acá sólo las llamadas y la lectura de lo que contesta; qué
// se hace con eso está en lib/oca/envios.ts.
//   · Tarifar_Envio_Corporativo: cuánto sale y en cuántos días llega.
//   · GetCentrosImposicionConServiciosByCP: las sucursales de un código postal.
//   · IngresoORMultiplesRetiros: da de alta el envío (orden de retiro + número de envío).
//   · GetPdfDeEtiquetasPorOrdenOrNumeroEnvio: la etiqueta en PDF.
//   · AnularOrdenGenerada: anula una orden que todavía no se retiró.
//   · Tracking_Pieza: por dónde anda.
// Todo por POST de formulario; ninguna función tira: devuelven { ok: false, motivo }.

const BASES = [
  "https://webservice.oca.com.ar/ePak_tracking/Oep_TrackEPak.asmx",
  "http://webservice.oca.com.ar/ePak_tracking/Oep_TrackEPak.asmx",
];

export type Resultado<T> = { ok: true; datos: T; crudo: string } | { ok: false; motivo: string; crudo?: string };

/** Llama a un método del servicio. Si el https no conecta, prueba por http. */
async function llamar(metodo: string, campos: Record<string, string>): Promise<{ ok: true; texto: string } | { ok: false; motivo: string; texto?: string }> {
  let ultimo = "";
  for (const base of BASES) {
    try {
      const r = await fetch(`${base}/${metodo}`, {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(25_000),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(campos),
      });
      const texto = await r.text();
      if (!r.ok) return { ok: false, motivo: `OCA contestó ${r.status}: ${limpiarError(texto)}`, texto };
      return { ok: true, texto };
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false, motivo: `No se pudo hablar con OCA (${ultimo}).` };
}

/** El error de un servicio .asmx viene como texto o HTML: la primera línea útil. */
function limpiarError(t: string): string {
  const s = t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return s.slice(0, 300) || "sin detalle";
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export function desescapar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

/** Cada bloque <etiqueta>…</etiqueta> del XML, con sus hijos simples como
 *  texto (sin importar mayúsculas). Un hijo que tiene hijos queda con su XML. */
export function bloques(xml: string, etiqueta: string): Record<string, string>[] {
  const re = new RegExp(`<${etiqueta}(?:\\s[^>]*)?>([\\s\\S]*?)</${etiqueta}>`, "gi");
  const out: Record<string, string>[] = [];
  for (const m of xml.matchAll(re)) {
    const fila: Record<string, string> = {};
    for (const h of m[1].matchAll(/<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) fila[h[1].toLowerCase()] = desescapar(h[2].trim());
    for (const h of m[1].matchAll(/<([A-Za-z_][\w.-]*)(?:\s[^>]*)?\/>/g)) if (!(h[1].toLowerCase() in fila)) fila[h[1].toLowerCase()] = "";
    out.push(fila);
  }
  return out;
}

/** El texto de la primera <etiqueta> (para respuestas tipo <string>…</string>). */
export function texto(xml: string, etiqueta: string): string | null {
  const m = xml.match(new RegExp(`<${etiqueta}(?:\\s[^>]*)?>([\\s\\S]*?)</${etiqueta}>`, "i"));
  return m ? desescapar(m[1].trim()) : null;
}

const num = (s: string | undefined) => {
  if (s == null || s === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** El CUIT como lo pide OCA: 30-12345678-9. */
export const cuitOca = (d: string) => {
  const x = d.replace(/\D/g, "");
  return x.length === 11 ? `${x.slice(0, 2)}-${x.slice(2, 10)}-${x.slice(10)}` : d;
};

// ── Tarifar ──────────────────────────────────────────────

export type Tarifa = { total: number; plazoDias: number | null };

export async function tarifar(p: {
  pesoKg: number; volumenM3: number; cpOrigen: string; cpDestino: string; paquetes: number; valor: number; cuit: string; operativa: string;
}): Promise<Resultado<Tarifa>> {
  const r = await llamar("Tarifar_Envio_Corporativo", {
    PesoTotal: p.pesoKg.toFixed(2), VolumenTotal: p.volumenM3.toFixed(6),
    CodigoPostalOrigen: soloCp(p.cpOrigen), CodigoPostalDestino: soloCp(p.cpDestino),
    CantidadPaquetes: String(p.paquetes), ValorDeclarado: p.valor.toFixed(2), Cuit: cuitOca(p.cuit), Operativa: p.operativa,
  });
  if (!r.ok) return { ok: false, motivo: r.motivo, crudo: r.texto };
  const fila = bloques(r.texto, "Table")[0];
  const total = num(fila?.total);
  if (!fila || total == null || total <= 0) return { ok: false, motivo: "OCA no cotizó ese envío (revisá el CUIT, la operativa y los códigos postales).", crudo: r.texto };
  return { ok: true, datos: { total, plazoDias: num(fila.plazoentrega) }, crudo: r.texto };
}

/** El código postal en números (OCA no quiere la letra de provincia ni las del CPA). */
export function soloCp(cp: string): string {
  const s = cp.trim().toUpperCase();
  const cpa = s.match(/^[A-Z](\d{4})[A-Z]{3}$/);
  if (cpa) return cpa[1];
  return s.replace(/\D/g, "").slice(0, 4);
}

// ── Sucursales ───────────────────────────────────────────

export type Sucursal = { id: string; nombre: string; direccion: string; localidad: string; provincia: string; cp: string; entrega: boolean };

export async function sucursales(cp: string): Promise<Resultado<Sucursal[]>> {
  let r = await llamar("GetCentrosImposicionConServiciosByCP", { CodigoPostal: soloCp(cp) });
  // Esta consulta contesta <CentrosDeImposicion><Centro>…; la vieja (sin servicios), filas <Table>.
  let filas = r.ok ? [...bloques(r.texto, "Centro"), ...bloques(r.texto, "Table")] : [];
  if (!filas.length) {
    const vieja = await llamar("GetCentrosImposicionPorCP", { CodigoPostal: soloCp(cp) });
    if (vieja.ok) { r = vieja; filas = [...bloques(vieja.texto, "Table"), ...bloques(vieja.texto, "Centro")]; }
  }
  if (!r.ok) return { ok: false, motivo: r.motivo, crudo: r.texto };
  const lista = filas.map((f) => {
    const servicios = f.servicios ?? "";
    return {
      id: f.idcentroimposicion ?? "", nombre: (f.sucursal || f.descripcion || f.sigla || "").trim(),
      direccion: [f.calle, f.numero].filter(Boolean).join(" ").trim(), localidad: (f.localidad ?? "").trim(), provincia: (f.provincia ?? "").trim(),
      cp: (f.codigopostal ?? "").trim(),
      // Si no vino la lista de servicios se la ofrece igual; si vino, sólo las que entregan paquetes.
      entrega: !servicios || /entrega/i.test(servicios),
    };
  }).filter((s) => s.id);
  return { ok: true, datos: lista, crudo: r.texto };
}

// ── Alta del envío ───────────────────────────────────────

export type Alta = { ordenRetiro: string; numeroEnvio: string };

export async function ingresar(usuario: string, clave: string, xml: string): Promise<Resultado<Alta>> {
  const r = await llamar("IngresoORMultiplesRetiros", { usr: usuario, psw: clave, xml_Datos: xml, ConfirmarRetiro: "true", ArchivoCliente: "", ArchivoProceso: "" });
  if (!r.ok) return { ok: false, motivo: r.motivo, crudo: r.texto };
  const errores = [...bloques(r.texto, "Error"), ...bloques(r.texto, "Errores")].map((e) => e.descripcion || e.mensaje).filter(Boolean);
  const det = bloques(r.texto, "DetalleIngresos")[0];
  const orden = det?.ordenretiro || texto(r.texto, "OrdenRetiro") || "";
  const envio = det?.numeroenvio || texto(r.texto, "NumeroEnvio") || "";
  if (!orden || !envio) {
    const motivo = errores[0] || texto(r.texto, "Mensaje") || limpiarError(r.texto);
    return { ok: false, motivo: `OCA no dio de alta el envío: ${motivo}`, crudo: r.texto };
  }
  return { ok: true, datos: { ordenRetiro: orden, numeroEnvio: envio }, crudo: r.texto };
}

// Sin acentos ni eñes: el XML va declarado iso-8859-1 y viaja en un formulario UTF-8.
const atr = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\r\n\t]+/g, " ").trim();

export type DatosAlta = {
  nroCuenta: string; operativa: string; remito: string; fecha: string; franja: number; centroOrigen: string | null;
  origen: { calle: string; numero: string; piso: string; depto: string; cp: string; localidad: string; provincia: string; contacto: string; email: string; telefono: string };
  destino: { apellido: string; nombre: string; calle: string; numero: string; piso: string; depto: string; localidad: string; provincia: string; cp: string;
    telefono: string; celular: string; email: string; observaciones: string; idci: string | null };
  paquetes: { largoCm: number; anchoCm: number; altoCm: number; pesoKg: number; valor: number }[];
};

/** El XML del alta, como lo pide OCA (medidas en cm, peso en kg). */
export function xmlAlta(d: DatosAlta): string {
  const o = d.origen, t = d.destino;
  const paquetes = d.paquetes.map((p) =>
    `<paquete alto="${p.altoCm.toFixed(0)}" ancho="${p.anchoCm.toFixed(0)}" largo="${p.largoCm.toFixed(0)}" peso="${p.pesoKg.toFixed(2)}" valor="${p.valor.toFixed(2)}" cant="1" />`).join("");
  return `<?xml version="1.0" encoding="iso-8859-1" standalone="yes"?>`
    + `<ROWS><cabecera ver="2.0" nrocuenta="${atr(d.nroCuenta)}" /><origenes>`
    + `<origen calle="${atr(o.calle)}" nro="${atr(o.numero)}" piso="${atr(o.piso)}" depto="${atr(o.depto)}" cp="${atr(soloCp(o.cp))}" localidad="${atr(o.localidad)}" provincia="${atr(o.provincia)}"`
    + ` contacto="${atr(o.contacto)}" email="${atr(o.email)}" solicitante="${atr(o.contacto)}" observaciones="" centrocosto="0" idfranjahoraria="${d.franja}"`
    + ` idcentroimposicionorigen="${atr(d.centroOrigen || "0")}" fecha="${atr(d.fecha)}"><envios>`
    + `<envio idoperativa="${atr(d.operativa)}" nroremito="${atr(d.remito)}">`
    + `<destinatario apellido="${atr(t.apellido)}" nombre="${atr(t.nombre)}" calle="${atr(t.calle)}" nro="${atr(t.numero)}" piso="${atr(t.piso)}" depto="${atr(t.depto)}"`
    + ` localidad="${atr(t.localidad)}" provincia="${atr(t.provincia)}" cp="${atr(soloCp(t.cp))}" telefono="${atr(t.telefono)}" email="${atr(t.email)}"`
    + ` idci="${atr(t.idci || "0")}" celular="${atr(t.celular)}" observaciones="${atr(t.observaciones)}" />`
    + `<paquetes>${paquetes}</paquetes></envio></envios></origen></origenes></ROWS>`;
}

// ── Etiqueta, anular, seguimiento ────────────────────────

export async function etiquetaPdf(ordenRetiro: string, numeroEnvio: string): Promise<Resultado<Uint8Array>> {
  const r = await llamar("GetPdfDeEtiquetasPorOrdenOrNumeroEnvio", { idOrdenRetiro: ordenRetiro, nroEnvio: numeroEnvio, logisticaInversa: "false" });
  if (!r.ok) return { ok: false, motivo: r.motivo, crudo: r.texto };
  const b64 = (texto(r.texto, "string") ?? "").replace(/\s+/g, "");
  const pdf = b64 ? Buffer.from(b64, "base64") : Buffer.alloc(0);
  if (pdf.subarray(0, 4).toString() !== "%PDF") return { ok: false, motivo: "OCA no devolvió la etiqueta (todavía no está lista o el número no corresponde).", crudo: r.texto.slice(0, 2000) };
  return { ok: true, datos: new Uint8Array(pdf), crudo: "" };
}

export async function anular(usuario: string, clave: string, ordenRetiro: string): Promise<Resultado<string>> {
  const r = await llamar("AnularOrdenGenerada", { Usr: usuario, Psw: clave, IdOrdenRetiro: ordenRetiro });
  if (!r.ok) return { ok: false, motivo: r.motivo, crudo: r.texto };
  const f = bloques(r.texto, "Table")[0] ?? {};
  const mensaje = f.mensaje || f.descripcion || texto(r.texto, "Mensaje") || "";
  if (/error|no se pudo|no existe|no puede|inv[aá]lid/i.test(mensaje)) {
    return { ok: false, motivo: `OCA no la anuló: ${mensaje || limpiarError(r.texto)}`, crudo: r.texto };
  }
  return { ok: true, datos: mensaje || "Anulada.", crudo: r.texto };
}

export type PasoSeguimiento = { estado: string; motivo: string; sucursal: string; fecha: string | null };

export async function seguimiento(numeroEnvio: string, cuit: string): Promise<Resultado<PasoSeguimiento[]>> {
  const r = await llamar("Tracking_Pieza", { NroDocumentoCliente: "", Cuit: cuitOca(cuit), Pieza: numeroEnvio });
  if (!r.ok) return { ok: false, motivo: r.motivo, crudo: r.texto };
  const pasos = bloques(r.texto, "Table").map((f) => ({
    // OCA escribe "Desdcripcion_Estado" (sic).
    estado: (f.desdcripcion_estado || f.descripcion_estado || f.estado || "").trim(),
    motivo: (f.descripcion_motivo || f.motivo || "").trim(),
    sucursal: (f.suc || f.sucursal || "").trim(),
    fecha: fechaOca(f.fecha),
  })).filter((p) => p.estado);
  return { ok: true, datos: pasos, crudo: r.texto.slice(0, 4000) };
}

/** Las fechas de OCA vienen "2026-10-06T14:35:00-03:00" o "06/10/2026 14:35". */
export function fechaOca(s: string | undefined): string | null {
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) {
    const [, d, m, a, h = "0", mi = "0", se = "0"] = dmy;
    return new Date(`${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}:${se.padStart(2, "0")}-03:00`).toISOString();
  }
  const t = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}-03:00`);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** Qué quiere decir un paso del seguimiento, en los estados del envío. */
export function hitoDe(estado: string): "entregado" | "devuelto" | "anulado" | "en_camino" | null {
  const e = estado.toLowerCase();
  if (/devuel|devoluci/.test(e)) return "devuelto";
  if (/anulad|cancelad/.test(e)) return "anulado";
  if (/no entregad|sin entregar/.test(e)) return "en_camino";
  if (/entregad/.test(e)) return "entregado";
  if (/pendiente|generad|ingresad[ao] (en|al) sistema|preimpos|orden de retiro/.test(e)) return null;
  return "en_camino";
}
