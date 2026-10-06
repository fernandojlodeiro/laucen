// WSFEv1 de ARCA: último número autorizado, pedir CAE y consultar un
// comprobante. SOAP a mano (pocas operaciones, sin dependencias).

import { ErrorErp } from "@/lib/erp/base";
import { ticket, extraer, type Ticket } from "@/lib/arca/wsaa";
import type { Ambiente } from "@/lib/arca/credenciales";
import { postXml, motivoRed } from "@/lib/arca/http";

const URL_WSFE: Record<Ambiente, string> = {
  homologacion: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  produccion: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
};
const NS = "http://ar.gov.afip.dif.FEV1/";

const esc = (s: string | number) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function soap(ambiente: Ambiente, metodo: string, cuerpo: string): Promise<string> {
  const sobre = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}">` +
    `<soap:Header/><soap:Body><ar:${metodo}>${cuerpo}</ar:${metodo}></soap:Body></soap:Envelope>`;
  let texto: string;
  try {
    texto = (await postXml(URL_WSFE[ambiente], sobre, { "content-type": "text/xml; charset=utf-8", soapaction: `${NS}${metodo}` }, 45_000)).texto;
  } catch (e) {
    console.error("[arca] wsfe", metodo, e);
    throw new ErrorErp(`ARCA no responde (facturación): ${motivoRed(e)}. Probá en un rato.`, "sin_respuesta");
  }
  const falla = extraer(texto, "faultstring");
  if (falla) throw new ErrorErp(`ARCA: ${falla}`);
  return texto;
}

const auth = (t: Ticket, cuit: string) => `<ar:Auth><ar:Token>${t.token}</ar:Token><ar:Sign>${t.sign}</ar:Sign><ar:Cuit>${cuit.replace(/\D/g, "")}</ar:Cuit></ar:Auth>`;

/** Los mensajes de error de una respuesta (Errors/Err). */
function errores(xml: string): string[] {
  return [...xml.matchAll(/<Err>\s*<Code>(\d+)<\/Code>\s*<Msg>([\s\S]*?)<\/Msg>\s*<\/Err>/g)].map((m) => `${m[1]}: ${m[2]}`);
}

export async function ultimoAutorizado(emisorId: number, ambiente: Ambiente, cuit: string, puntoVenta: number, tipo: number): Promise<number> {
  const t = await ticket(emisorId, ambiente, "wsfe");
  const xml = await soap(ambiente, "FECompUltimoAutorizado", `${auth(t, cuit)}<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${tipo}</ar:CbteTipo>`);
  const e = errores(xml);
  if (e.length) throw new ErrorErp(`ARCA: ${e.join(" · ")}`);
  return Number(extraer(xml, "CbteNro") ?? 0);
}

export type DatosCae = {
  puntoVenta: number; tipo: number; numero: number; fecha: string; concepto: number; docTipo: number; docNro: string;
  total: number; neto: number; iva: number; condicionIvaReceptor: number;
  alicuotas: { id: number; base: number; importe: number }[];
  asociado?: { tipo: number; puntoVenta: number; numero: number; cuit: string; fecha: string } | null;
};

export type RespuestaCae = { resultado: "A" | "R"; cae: string | null; vto: string | null; observaciones: string[]; errores: string[]; pedido: string; respuesta: string };

const n2 = (x: number) => x.toFixed(2);

/** Pide el CAE de un comprobante. */
export async function solicitarCae(emisorId: number, ambiente: Ambiente, cuit: string, d: DatosCae): Promise<RespuestaCae> {
  const t = await ticket(emisorId, ambiente, "wsfe");
  const det = `<ar:Concepto>${d.concepto}</ar:Concepto><ar:DocTipo>${d.docTipo}</ar:DocTipo><ar:DocNro>${esc(d.docNro)}</ar:DocNro>` +
    `<ar:CbteDesde>${d.numero}</ar:CbteDesde><ar:CbteHasta>${d.numero}</ar:CbteHasta><ar:CbteFch>${d.fecha.replace(/-/g, "")}</ar:CbteFch>` +
    `<ar:ImpTotal>${n2(d.total)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${n2(d.neto)}</ar:ImpNeto>` +
    `<ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${n2(d.iva)}</ar:ImpIVA>` +
    `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>${d.condicionIvaReceptor}</ar:CondicionIVAReceptorId>` +
    (d.asociado ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${d.asociado.tipo}</ar:Tipo><ar:PtoVta>${d.asociado.puntoVenta}</ar:PtoVta><ar:Nro>${d.asociado.numero}</ar:Nro>` +
      `<ar:Cuit>${d.asociado.cuit.replace(/\D/g, "")}</ar:Cuit><ar:CbteFch>${d.asociado.fecha.replace(/-/g, "")}</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>` : "") +
    (d.alicuotas.length ? `<ar:Iva>${d.alicuotas.map((a) => `<ar:AlicIva><ar:Id>${a.id}</ar:Id><ar:BaseImp>${n2(a.base)}</ar:BaseImp><ar:Importe>${n2(a.importe)}</ar:Importe></ar:AlicIva>`).join("")}</ar:Iva>` : "");
  const cuerpo = `${auth(t, cuit)}<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${d.puntoVenta}</ar:PtoVta><ar:CbteTipo>${d.tipo}</ar:CbteTipo></ar:FeCabReq>` +
    `<ar:FeDetReq><ar:FECAEDetRequest>${det}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`;
  const xml = await soap(ambiente, "FECAESolicitar", cuerpo);
  const detalle = extraer(xml, "FECAEDetResponse") ?? "";
  const obs = [...detalle.matchAll(/<Obs>\s*<Code>(\d+)<\/Code>\s*<Msg>([\s\S]*?)<\/Msg>\s*<\/Obs>/g)].map((m) => `${m[1]}: ${m[2]}`);
  const resultado = (extraer(detalle, "Resultado") ?? extraer(xml, "Resultado") ?? "R") as "A" | "R";
  const cae = extraer(detalle, "CAE");
  const vto = extraer(detalle, "CAEFchVto");
  return {
    resultado, cae: cae || null, vto: vto ? `${vto.slice(0, 4)}-${vto.slice(4, 6)}-${vto.slice(6, 8)}` : null,
    observaciones: obs, errores: errores(xml), pedido: cuerpo.replace(/<ar:Token>[^<]*<\/ar:Token><ar:Sign>[^<]*<\/ar:Sign>/, ""), respuesta: xml,
  };
}

/** Consulta un comprobante ya emitido (para no duplicar si una respuesta se perdió). */
export async function consultarComprobante(emisorId: number, ambiente: Ambiente, cuit: string, puntoVenta: number, tipo: number, numero: number) {
  const t = await ticket(emisorId, ambiente, "wsfe");
  const xml = await soap(ambiente, "FECompConsultar",
    `${auth(t, cuit)}<ar:FeCompConsReq><ar:CbteTipo>${tipo}</ar:CbteTipo><ar:CbteNro>${numero}</ar:CbteNro><ar:PtoVta>${puntoVenta}</ar:PtoVta></ar:FeCompConsReq>`);
  if (errores(xml).length) return null;
  const vto = extraer(xml, "FchVto");
  return {
    total: Number(extraer(xml, "ImpTotal") ?? 0), docNro: extraer(xml, "DocNro") ?? "", cae: extraer(xml, "CodAutorizacion"),
    vto: vto ? `${vto.slice(0, 4)}-${vto.slice(4, 6)}-${vto.slice(6, 8)}` : null,
  };
}

export type FacturaArca = {
  tipo: number; puntoVenta: number; numero: number; fecha: string; docTipo: number; docNro: string;
  total: number; neto: number; iva: number; condicionIvaReceptor: number | null; cae: string | null;
  alicuotas: { id: number; base: number; importe: number }[];
};

/** Un comprobante ya emitido, con todos sus datos (para hacerle una nota de
 *  crédito aunque no lo haya emitido Laucen). null = ARCA no lo tiene. */
export async function consultarFactura(emisorId: number, ambiente: Ambiente, cuit: string, puntoVenta: number, tipo: number, numero: number): Promise<FacturaArca | null> {
  const t = await ticket(emisorId, ambiente, "wsfe");
  const xml = await soap(ambiente, "FECompConsultar",
    `${auth(t, cuit)}<ar:FeCompConsReq><ar:CbteTipo>${tipo}</ar:CbteTipo><ar:CbteNro>${numero}</ar:CbteNro><ar:PtoVta>${puntoVenta}</ar:PtoVta></ar:FeCompConsReq>`);
  return leerFactura(xml, tipo, puntoVenta, numero);
}

/** Lee la respuesta de FECompConsultar (aparte, para probarla sin ARCA). */
export function leerFactura(xml: string, tipo: number, puntoVenta: number, numero: number): FacturaArca | null {
  if (errores(xml).length) return null;
  const r = extraer(xml, "ResultGet");
  if (!r) return null;
  const f = extraer(r, "CbteFch") ?? "";
  const cond = extraer(r, "CondicionIVAReceptorId");
  return {
    tipo, puntoVenta, numero, fecha: f.length === 8 ? `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}` : "",
    docTipo: Number(extraer(r, "DocTipo") ?? 99), docNro: extraer(r, "DocNro") ?? "0",
    total: Number(extraer(r, "ImpTotal") ?? 0), neto: Number(extraer(r, "ImpNeto") ?? 0), iva: Number(extraer(r, "ImpIVA") ?? 0),
    condicionIvaReceptor: cond ? Number(cond) : null, cae: extraer(r, "CodAutorizacion"),
    alicuotas: [...r.matchAll(/<AlicIva>([\s\S]*?)<\/AlicIva>/g)].map((m) => ({
      id: Number(extraer(m[1], "Id") ?? 5), base: Number(extraer(m[1], "BaseImp") ?? 0), importe: Number(extraer(m[1], "Importe") ?? 0),
    })),
  };
}
