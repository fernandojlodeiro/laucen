// Padrón de ARCA (constancia de inscripción, servicio
// ws_sr_constancia_inscripcion): razón social, domicilio fiscal y condición
// frente al IVA de un CUIT. Sirve para validar los datos fiscales del
// cliente antes de facturar.

import { ErrorErp } from "@/lib/erp/base";
import { postXml, motivoRed } from "@/lib/arca/http";
import { ticket, extraer } from "@/lib/arca/wsaa";
import type { Ambiente } from "@/lib/arca/credenciales";

const URL_PADRON: Record<Ambiente, string> = {
  homologacion: "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5",
  produccion: "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5",
};

export type Persona = {
  cuit: string; razonSocial: string; condicionIva: "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final";
  domicilio: string | null; localidad: string | null; provincia: string | null; codigoPostal: string | null; estado: string | null;
};

export async function consultarCuit(emisorId: number, ambiente: Ambiente, cuitEmisor: string, cuit: string): Promise<Persona> {
  const c = cuit.replace(/\D/g, "");
  if (c.length !== 11) throw new ErrorErp("El CUIT tiene que tener 11 dígitos.");
  const t = await ticket(emisorId, ambiente, "ws_sr_constancia_inscripcion");
  const sobre = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/"><soapenv:Header/><soapenv:Body>` +
    `<a5:getPersona_v2><token>${t.token}</token><sign>${t.sign}</sign><cuitRepresentada>${cuitEmisor.replace(/\D/g, "")}</cuitRepresentada><idPersona>${c}</idPersona></a5:getPersona_v2>` +
    `</soapenv:Body></soapenv:Envelope>`;
  let xml: string;
  try {
    xml = (await postXml(URL_PADRON[ambiente], sobre, { "content-type": "text/xml; charset=utf-8", soapaction: "" }, 30_000)).texto;
  } catch (e) {
    console.error("[arca] padrón", e);
    throw new ErrorErp(`El padrón de ARCA no responde (${motivoRed(e)}). Probá en un rato.`);
  }
  const falla = extraer(xml, "faultstring");
  if (falla) throw new ErrorErp(/no existe/i.test(falla) ? "Ese CUIT no figura en el padrón de ARCA." : `Padrón de ARCA: ${falla}`);
  const generales = extraer(xml, "datosGenerales") ?? "";
  const razon = extraer(generales, "razonSocial") ?? [extraer(generales, "apellido"), extraer(generales, "nombre")].filter(Boolean).join(", ");
  if (!razon) {
    const err = extraer(xml, "errorConstancia");
    throw new ErrorErp(err ? `Padrón de ARCA: ${(extraer(err, "error") ?? "sin datos").trim()}` : "El padrón de ARCA no devolvió datos de ese CUIT.");
  }
  const dom = extraer(generales, "domicilioFiscal") ?? "";
  const impuestos = [...xml.matchAll(/<idImpuesto>(\d+)<\/idImpuesto>/g)].map((m) => Number(m[1]));
  const condicionIva = xml.includes("<datosMonotributo>") ? "monotributo" : impuestos.includes(30) ? "responsable_inscripto" : impuestos.includes(32) ? "exento" : "consumidor_final";
  return {
    cuit: `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`, razonSocial: razon, condicionIva,
    domicilio: extraer(dom, "direccion"), localidad: extraer(dom, "localidad"), provincia: extraer(dom, "descripcionProvincia"),
    codigoPostal: extraer(dom, "codPostal"), estado: extraer(generales, "estadoClave"),
  };
}
