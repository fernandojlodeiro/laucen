// POST de SOAP a ARCA. Los servidores de facturación de ARCA (servicios1)
// negocian TLS con una clave Diffie-Hellman chica que Node rechaza por
// defecto ("dh key too small"): se baja el nivel de seguridad de los
// cifrados SÓLO para estas conexiones a ARCA.

import https from "node:https";

export type RespuestaHttp = { status: number; texto: string };

export function postXml(url: string, cuerpo: string, encabezados: Record<string, string>, timeoutMs: number): Promise<RespuestaHttp> {
  return new Promise((ok, mal) => {
    const req = https.request(url, {
      method: "POST", ciphers: "DEFAULT@SECLEVEL=0",
      headers: { ...encabezados, "content-length": Buffer.byteLength(cuerpo) },
      timeout: timeoutMs,
    }, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (d: Buffer) => partes.push(d));
      res.on("end", () => ok({ status: res.statusCode ?? 0, texto: Buffer.concat(partes).toString("utf8") }));
      res.on("error", mal);
    });
    req.on("timeout", () => req.destroy(new Error("tardó demasiado")));
    req.on("error", mal);
    req.end(cuerpo);
  });
}

/** El motivo técnico de una falla de red, corto (para el aviso y el comprobante). */
export function motivoRed(e: unknown): string {
  const x = e as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  return [x?.code ?? x?.cause?.code, x?.message ?? x?.cause?.message].filter(Boolean).join(" ").slice(0, 200);
}
