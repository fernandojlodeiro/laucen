// WSAA de ARCA: el ticket de acceso (token + sign) para un servicio. Se firma
// un "pedido de ticket" (TRA) con el certificado (CMS / PKCS#7) y se manda a
// loginCms. El ticket dura 12 h y ARCA no da otro mientras siga vigente: se
// guarda en arca_ticket y se reusa.

import forge from "node-forge";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import type { Ambiente } from "@/lib/arca/credenciales";

const URL_WSAA: Record<Ambiente, string> = {
  homologacion: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  produccion: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
};

export type Ticket = { token: string; sign: string };

const extraer = (xml: string, tag: string) => xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`))?.[1] ?? null;
const desescapar = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function firmarTra(servicio: string, clavePem: string, certPem: string): string {
  const ahora = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const tra = `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(ahora / 1000)}</uniqueId>` +
    `<generationTime>${iso(ahora - 10 * 60_000)}</generationTime><expirationTime>${iso(ahora + 10 * 60_000)}</expirationTime></header>` +
    `<service>${servicio}</service></loginTicketRequest>`;
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  const cert = forge.pki.certificateFromPem(certPem);
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(clavePem), certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

/** El ticket vigente para un servicio (wsfe, ws_sr_constancia_inscripcion). */
export async function ticket(emisorId: number, ambiente: Ambiente, servicio: string): Promise<Ticket> {
  const guardado = await una<{ token: string; sign: string }>(
    "select token, sign from arca_ticket where emisor_id = $1 and ambiente = $2 and servicio = $3 and vence > now() + interval '5 minutes'",
    [emisorId, ambiente, servicio]);
  if (guardado) return guardado;
  const cred = await una<{ clave_privada: string; certificado: string | null }>(
    "select clave_privada, certificado from arca_credencial where emisor_id = $1 and ambiente = $2", [emisorId, ambiente]);
  if (!cred?.certificado) throw new ErrorErp(`Falta el certificado de ARCA (${ambiente === "produccion" ? "producción" : "homologación"}): cargalo en Configuración → Facturación (ARCA).`);
  const cms = firmarTra(servicio, cred.clave_privada, cred.certificado);
  const sobre = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
    `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
  let texto: string;
  try {
    const r = await fetch(URL_WSAA[ambiente], {
      method: "POST", headers: { "content-type": "text/xml; charset=utf-8", soapaction: "" }, body: sobre,
      cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
    texto = await r.text();
  } catch {
    throw new ErrorErp("ARCA no responde (login). Probá en un rato.");
  }
  const falla = extraer(texto, "faultstring");
  if (falla) {
    if (/ya posee un TA valido/i.test(falla)) throw new ErrorErp("ARCA dice que ya hay un ticket vigente que Laucen no tiene guardado: esperá unos minutos (vence solo) y probá de nuevo.");
    throw new ErrorErp(`ARCA rechazó el login: ${falla}`);
  }
  const ta = desescapar(extraer(texto, "loginCmsReturn") ?? "");
  const token = extraer(ta, "token"), sign = extraer(ta, "sign"), vence = extraer(ta, "expirationTime");
  if (!token || !sign || !vence) throw new ErrorErp("ARCA contestó el login sin ticket.");
  await consulta(`
    insert into arca_ticket (organizacion_id, emisor_id, ambiente, servicio, token, sign, vence)
    values ((select organizacion_id from emisor where id = $1), $1, $2, $3, $4, $5, $6)
    on conflict (emisor_id, ambiente, servicio) do update set token = excluded.token, sign = excluded.sign, vence = excluded.vence`,
    [emisorId, ambiente, servicio, token, sign, vence]);
  return { token, sign };
}

export { extraer, desescapar };
