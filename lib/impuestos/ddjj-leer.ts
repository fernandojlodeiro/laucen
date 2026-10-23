// Leer con la IA el PDF de una declaración jurada que presenta el contador (Fer, 23/10): IVA (F.2002), Ingresos Brutos
// por Convenio Multilateral (CM03 / CM05, una columna por jurisdicción) o la Contribución sobre el comercio y la
// industria de la Municipalidad de Córdoba. La IA devuelve los importes; acá se normalizan (puro) a `datos`, que es lo
// que guarda la tabla ddjj y lo que usan el control y la posición del mes (lib/impuestos/posicion.ts).
//
// Signos: todo importe en positivo, salvo `saldo` (IIBB y municipal), que es positivo si da a pagar y negativo si da
// a favor del contribuyente.

import { pedirClaude, jsonDe } from "@/lib/claude";
import { codigoJurisdiccion } from "@/lib/impuestos/jurisdicciones";

export type Impuesto = "iva" | "iibb" | "municipal";
export const IMPUESTOS: Record<Impuesto, string> = { iva: "IVA", iibb: "Ingresos Brutos (Convenio Multilateral)", municipal: "Municipalidad de Córdoba" };
export const IMPUESTO_CORTO: Record<Impuesto, string> = { iva: "IVA", iibb: "IIBB", municipal: "Municipal" };

export type DatosIva = {
  debito: number;                  // débito fiscal del período
  credito: number;                 // crédito fiscal del período
  saldo_tecnico_anterior: number;  // saldo técnico a favor del período anterior
  saldo_tecnico_favor: number;     // saldo técnico a favor que queda
  pagos_a_cuenta: number;          // retenciones y percepciones del período (y otros pagos a cuenta)
  saldo_libre_anterior: number;    // saldo de libre disponibilidad a favor del período anterior
  saldo_libre_favor: number;       // saldo de libre disponibilidad a favor que queda
  a_pagar: number;                 // saldo de impuesto a pagar
};

export type JurisdiccionDdjj = {
  codigo: number;
  coeficiente: number;             // 0 a 1
  base: number;                    // base imponible atribuida a la jurisdicción
  alicuota: number;                // %
  determinado: number;             // impuesto determinado
  retenciones: number;
  percepciones: number;
  percepciones_aduaneras: number;
  recaudaciones_bancarias: number;
  saldo_anterior: number;          // saldo a favor del período anterior
  saldo: number;                   // > 0 a pagar · < 0 a favor
};
export type DatosIibb = { base_total: number; jurisdicciones: JurisdiccionDdjj[] };

export type DatosMunicipal = {
  base: number; alicuota: number; determinado: number; minimo: number;
  retenciones: number;             // retenciones y percepciones municipales
  saldo_anterior: number;          // saldo a favor del período anterior
  saldo: number;                   // > 0 a pagar · < 0 a favor
};

export type DatosDdjj = DatosIva | DatosIibb | DatosMunicipal;

/** Lo que devuelve la IA. */
export type LecturaDdjj = {
  impuesto: string | null;
  cuit: string | null;
  periodo: string | null;          // AAAA-MM
  rectificativa: number | null;
  fecha_presentacion: string | null;
  iva?: Partial<Record<keyof DatosIva, unknown>> | null;
  iibb?: { base_total?: unknown; jurisdicciones?: Record<string, unknown>[] } | null;
  municipal?: Partial<Record<keyof DatosMunicipal, unknown>> | null;
};

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
/** Un importe: número o texto "1.234,56" / "1234.56"; vacío → 0. */
export function numero(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let t = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}
const pos = (v: unknown) => r2(Math.abs(numero(v)));

/** Datos vacíos de un impuesto (para cargar a mano). */
export function datosVacios(impuesto: Impuesto): DatosDdjj {
  if (impuesto === "iva") return { debito: 0, credito: 0, saldo_tecnico_anterior: 0, saldo_tecnico_favor: 0, pagos_a_cuenta: 0, saldo_libre_anterior: 0, saldo_libre_favor: 0, a_pagar: 0 };
  if (impuesto === "iibb") return { base_total: 0, jurisdicciones: [] };
  return { base: 0, alicuota: 0, determinado: 0, minimo: 0, retenciones: 0, saldo_anterior: 0, saldo: 0 };
}

export function datosIva(x: Record<string, unknown> | null | undefined): DatosIva {
  const d = x ?? {};
  return {
    debito: pos(d.debito), credito: pos(d.credito), saldo_tecnico_anterior: pos(d.saldo_tecnico_anterior), saldo_tecnico_favor: pos(d.saldo_tecnico_favor),
    pagos_a_cuenta: pos(d.pagos_a_cuenta), saldo_libre_anterior: pos(d.saldo_libre_anterior), saldo_libre_favor: pos(d.saldo_libre_favor), a_pagar: pos(d.a_pagar),
  };
}

/** El saldo con signo: si viene aparte "a favor", negativo. */
function saldoConSigno(d: Record<string, unknown>): number {
  if (d.saldo != null && d.saldo !== "") return r2(numero(d.saldo));
  const pagar = pos(d.a_pagar), favor = pos(d.a_favor);
  return r2(pagar - favor);
}

export function datosIibb(x: { base_total?: unknown; jurisdicciones?: Record<string, unknown>[] } | null | undefined): DatosIibb {
  const js: JurisdiccionDdjj[] = [];
  for (const j of x?.jurisdicciones ?? []) {
    const codigo = codigoJurisdiccion(j.codigo) ?? codigoJurisdiccion(j.jurisdiccion) ?? codigoJurisdiccion(j.provincia);
    if (!codigo) continue;
    let coef = Math.abs(numero(j.coeficiente));
    if (coef > 1) coef = coef / 100;   // vino en porcentaje
    const fila: JurisdiccionDdjj = {
      codigo, coeficiente: Math.round(coef * 1e8) / 1e8, base: pos(j.base), alicuota: Math.abs(numero(j.alicuota)), determinado: pos(j.determinado),
      retenciones: pos(j.retenciones), percepciones: pos(j.percepciones), percepciones_aduaneras: pos(j.percepciones_aduaneras),
      recaudaciones_bancarias: pos(j.recaudaciones_bancarias), saldo_anterior: pos(j.saldo_anterior), saldo: saldoConSigno(j),
    };
    const ya = js.find((y) => y.codigo === codigo);
    if (ya) Object.assign(ya, fila); else js.push(fila);
  }
  js.sort((a, b) => a.codigo - b.codigo);
  const base = pos(x?.base_total) || r2(js.reduce((s, j) => s + j.base, 0));
  return { base_total: base, jurisdicciones: js };
}

export function datosMunicipal(x: Record<string, unknown> | null | undefined): DatosMunicipal {
  const d = x ?? {};
  return {
    base: pos(d.base), alicuota: Math.abs(numero(d.alicuota)), determinado: pos(d.determinado), minimo: pos(d.minimo),
    retenciones: pos(d.retenciones), saldo_anterior: pos(d.saldo_anterior), saldo: saldoConSigno(d),
  };
}

export function datosDe(impuesto: Impuesto, x: unknown): DatosDdjj {
  if (impuesto === "iva") return datosIva(x as Record<string, unknown>);
  if (impuesto === "iibb") return datosIibb(x as DatosIibb);
  return datosMunicipal(x as Record<string, unknown>);
}

/** "2026-09", "202609", "09/2026" → "2026-09"; null si no es un mes. */
export function periodoNormal(v: unknown): string | null {
  const p = String(v ?? "").trim();
  const m = p.match(/^(\d{4})-?(\d{1,2})$/), n = p.match(/^(\d{1,2})[/-](\d{4})$/);
  const [a, mes] = m ? [m[1], m[2]] : n ? [n[2], n[1]] : [null, null];
  if (!a || !mes) return null;
  const r = `${a}-${mes.padStart(2, "0")}`;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(r) ? r : null;
}

/** La lectura → impuesto, período y datos (o el motivo por el que no sirve). Pura. */
export function aDdjj(l: LecturaDdjj): { impuesto: Impuesto; periodo: string; cuit: string | null; rectificativa: number; fecha: string | null; datos: DatosDdjj } | { error: string } {
  const imp = String(l.impuesto ?? "").toLowerCase();
  const impuesto: Impuesto | null = imp === "iva" ? "iva" : imp === "iibb" ? "iibb" : imp === "municipal" ? "municipal" : null;
  if (!impuesto) return { error: "No se reconoce de qué impuesto es la declaración (IVA, Ingresos Brutos o la municipal de Córdoba)." };
  const periodo = periodoNormal(l.periodo);
  if (!periodo) return { error: "No se leyó el período de la declaración." };
  const cuit = String(l.cuit ?? "").replace(/\D/g, "") || null;
  const datos = impuesto === "iva" ? datosIva(l.iva as Record<string, unknown>) : impuesto === "iibb" ? datosIibb(l.iibb) : datosMunicipal(l.municipal as Record<string, unknown>);
  if (impuesto === "iibb" && !(datos as DatosIibb).jurisdicciones.length) return { error: "No se leyó ninguna jurisdicción de la declaración de Ingresos Brutos." };
  const fecha = l.fecha_presentacion && /^\d{4}-\d{2}-\d{2}$/.test(l.fecha_presentacion) ? l.fecha_presentacion : null;
  return { impuesto, periodo, cuit: cuit && cuit.length === 11 ? cuit : null, rectificativa: Math.max(0, Math.trunc(numero(l.rectificativa))), fecha, datos };
}

const SISTEMA = `Leés declaraciones juradas impositivas argentinas de una empresa y devolvés SÓLO un JSON, sin texto antes ni después.
Primero decidí de qué impuesto es:
 - "iva": F.2002 / F.731 de IVA de ARCA (AFIP).
 - "iibb": Ingresos Brutos por Convenio Multilateral (SIFERE, formulario CM03 mensual o CM05 anual), con una columna o renglón por jurisdicción.
 - "municipal": Contribución que incide sobre el comercio, la industria y las empresas de servicios de la Municipalidad de Córdoba.
Formato:
{"impuesto": "iva" | "iibb" | "municipal", "cuit": "11 dígitos del contribuyente", "periodo": "AAAA-MM" (el período fiscal declarado), "rectificativa": 0 si es original o el número de rectificativa, "fecha_presentacion": "AAAA-MM-DD" o null,
 "iva": {"debito": total del débito fiscal, "credito": total del crédito fiscal computable, "saldo_tecnico_anterior": saldo técnico a favor del contribuyente del período anterior, "saldo_tecnico_favor": saldo técnico a favor del contribuyente que queda para el período siguiente, "pagos_a_cuenta": total de retenciones, percepciones y pagos a cuenta computados en el período, "saldo_libre_anterior": saldo de libre disponibilidad a favor del período anterior, "saldo_libre_favor": saldo de libre disponibilidad a favor que queda, "a_pagar": saldo del impuesto a favor de ARCA (a pagar)} (sólo si es IVA),
 "iibb": {"base_total": base imponible total del país, "jurisdicciones": [{"codigo": 901..924 (código de jurisdicción de la Comisión Arbitral: 901 CABA, 902 Buenos Aires, 904 Córdoba, 921 Santa Fe, etc.), "provincia": "nombre", "coeficiente": coeficiente unificado tal cual figura, "base": base imponible atribuida, "alicuota": alícuota en %, "determinado": impuesto determinado, "retenciones": retenciones sufridas, "percepciones": percepciones sufridas (no aduaneras), "percepciones_aduaneras": percepciones aduaneras, "recaudaciones_bancarias": recaudaciones bancarias (SIRCREB) y de otros regímenes de recaudación (SIRTAC), "saldo_anterior": saldo a favor del período anterior, "a_pagar": saldo a pagar de la jurisdicción (0 si da a favor), "a_favor": saldo a favor de la jurisdicción (0 si da a pagar)}]} (sólo si es Ingresos Brutos; una entrada por cada jurisdicción de la declaración),
 "municipal": {"base": base imponible, "alicuota": alícuota en %, "determinado": contribución determinada, "minimo": mínimo de la actividad, "retenciones": retenciones y percepciones sufridas, "saldo_anterior": saldo a favor anterior, "a_pagar": saldo a pagar, "a_favor": saldo a favor} (sólo si es la municipal)}
Importes en pesos con punto decimal (12345.67), sin signo. Si un dato no está, 0 o null. No inventes nada.`;

/** Manda el archivo (PDF o imagen) a la IA y devuelve lo leído. */
export async function leerDdjjArchivo(datos: ArrayBuffer, tipo: string): Promise<{ lectura: LecturaDdjj } | { error: string }> {
  const b64 = Buffer.from(datos).toString("base64");
  const imagen = /^image\/(png|jpeg|webp|gif)$/.test(tipo) ? (tipo as "image/png" | "image/jpeg" | "image/webp" | "image/gif") : null;
  const r = await pedirClaude({
    system: SISTEMA, modelo: "grande", effort: "medium", maxTokens: 6000,
    contenido: [
      imagen
        ? { type: "image", source: { type: "base64", media_type: imagen, data: b64 } }
        : { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
      { type: "text", text: "Leé esta declaración jurada y devolvé el JSON." },
    ],
  });
  if ("error" in r) return { error: `La IA no pudo leer la declaración (${r.error}).` };
  const l = jsonDe<LecturaDdjj>(r.texto);
  if (!l || typeof l !== "object") return { error: "La IA no devolvió los datos de la declaración: probá de nuevo." };
  return { lectura: l };
}

/** Lo que dejó una declaración: a pagar y a favor (IVA: saldo técnico + libre disponibilidad; IIBB: la suma de las
 *  provincias que dan a pagar y la de las que dan a favor). */
export function resultadoDdjj(impuesto: Impuesto, x: unknown): { aPagar: number; aFavor: number } {
  if (impuesto === "iva") {
    const d = datosIva(x as Record<string, unknown>);
    return { aPagar: d.a_pagar, aFavor: r2(d.saldo_tecnico_favor + d.saldo_libre_favor) };
  }
  if (impuesto === "iibb") {
    const d = datosIibb(x as DatosIibb);
    return { aPagar: r2(d.jurisdicciones.reduce((s, j) => s + Math.max(0, j.saldo), 0)), aFavor: r2(d.jurisdicciones.reduce((s, j) => s + Math.max(0, -j.saldo), 0)) };
  }
  const d = datosMunicipal(x as Record<string, unknown>);
  return { aPagar: Math.max(0, d.saldo), aFavor: Math.max(0, -d.saldo) };
}
