// Clave privada, pedido de certificado (CSR) y certificado de ARCA, por
// razón social (emisor) y ambiente (homologación / producción).
//
// Flujo: Laucen genera la clave y el CSR → quien tiene la clave fiscal sube
// el CSR en ARCA ("Administración de certificados digitales", o WSASS en
// homologación), lo asocia a los servicios wsfe y ws_sr_constancia_inscripcion
// y baja el certificado → se pega en Laucen. La clave nunca sale del servidor.

import forge from "node-forge";
import { consulta, una, ErrorErp } from "@/lib/erp/base";

export type Ambiente = "homologacion" | "produccion";

/** Genera clave y CSR nuevos (reemplaza los anteriores de ese ambiente). Devuelve el CSR en PEM. */
export async function generarCsr(emisorId: number, ambiente: Ambiente, cuit: string, razonSocial: string): Promise<string> {
  const c = cuit.replace(/\D/g, "");
  if (c.length !== 11) throw new ErrorErp("El CUIT tiene que tener 11 dígitos.");
  const claves = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = claves.publicKey;
  csr.setSubject([
    { name: "countryName", value: "AR" },
    { name: "organizationName", value: razonSocial.slice(0, 60) },
    { name: "commonName", value: `laucen${ambiente === "produccion" ? "" : "homo"}` },
    { type: "2.5.4.5", value: `CUIT ${c}` }, // serialNumber
  ]);
  csr.sign(claves.privateKey, forge.md.sha256.create());
  const csrPem = forge.pki.certificationRequestToPem(csr);
  await consulta(`
    insert into arca_credencial (organizacion_id, emisor_id, ambiente, clave_privada, csr, certificado, cert_vence)
    values ((select organizacion_id from emisor where id = $1), $1, $2, $3, $4, null, null)
    on conflict (emisor_id, ambiente) do update set clave_privada = excluded.clave_privada, csr = excluded.csr,
      certificado = null, cert_vence = null, actualizado_ts = now()`,
    [emisorId, ambiente, forge.pki.privateKeyToPem(claves.privateKey), csrPem]);
  await consulta("delete from arca_ticket where emisor_id = $1 and ambiente = $2", [emisorId, ambiente]);
  return csrPem;
}

/** Guarda el certificado que dio ARCA (verifica que sea de la clave guardada). */
export async function guardarCertificado(emisorId: number, ambiente: Ambiente, pem: string): Promise<Date> {
  const fila = await una<{ clave_privada: string }>("select clave_privada from arca_credencial where emisor_id = $1 and ambiente = $2", [emisorId, ambiente]);
  if (!fila) throw new ErrorErp("Primero generá el pedido de certificado (CSR).");
  let cert: forge.pki.Certificate;
  try { cert = forge.pki.certificateFromPem(pem.trim()); }
  catch { throw new ErrorErp("Eso no parece un certificado (.crt / .pem): tiene que empezar con -----BEGIN CERTIFICATE-----."); }
  const clave = forge.pki.privateKeyFromPem(fila.clave_privada) as forge.pki.rsa.PrivateKey;
  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  if (pub.n.compareTo(clave.n) !== 0) throw new ErrorErp("Ese certificado no es del último pedido (CSR) generado en Laucen.");
  await consulta("update arca_credencial set certificado = $3, cert_vence = $4, actualizado_ts = now() where emisor_id = $1 and ambiente = $2",
    [emisorId, ambiente, forge.pki.certificateToPem(cert), cert.validity.notAfter]);
  await consulta("delete from arca_ticket where emisor_id = $1 and ambiente = $2", [emisorId, ambiente]);
  return cert.validity.notAfter;
}

export async function estadoCredencial(emisorId: number, ambiente: Ambiente) {
  return una<{ csr: string; tiene_certificado: boolean; cert_vence: Date | null }>(
    "select csr, certificado is not null tiene_certificado, cert_vence from arca_credencial where emisor_id = $1 and ambiente = $2", [emisorId, ambiente]);
}
