// La vuelta diaria del seguimiento de publicaciones (lib/seguimiento/): Vercel
// Cron (vercel.json), a la madrugada. Lee las seguidas que tocan según
// «Cada cuántos días» de Configuración › Seguimiento de publicaciones (las de
// catálogo por la API; las comunes con Apify, dentro del tope del mes). Si
// CRON_SECRET está cargada en Vercel, se exige (como en el Radar). Antes, reemplaza las MLAU que Cowork resolvió.

import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { aplicarMlauEncontradas, leerSeguidas, orgsConSeguimiento } from "@/lib/seguimiento";
import { seguirTandas } from "@/lib/compras/precio-mercado";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("no autorizado", { status: 401 });
  }
  await asegurarEsquemaErp();
  const informe: Record<string, unknown> = {};
  for (const org of await orgsConSeguimiento()) {
    // Primero, las MLAU a las que Cowork les encontró la MLA: así la MLA ya entra en esta vuelta.
    const mlau = await aplicarMlauEncontradas(org).catch((e) => String(e));
    informe[org] = { mlau, ...(await leerSeguidas(org).catch((e) => ({ error: String(e) }))) };
  }
  informe.preciosMercado = await seguirTandas().catch((e) => String(e));
  return Response.json(informe);
}
