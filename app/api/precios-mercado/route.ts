// Una vuelta de una tanda de «precio de mercado» (lib/compras/precio-mercado.ts): contesta enseguida y trabaja
// después (after), hasta unos minutos; si quedan productos, se vuelve a llamar sola. La protege el token de la tanda.
// Con reanalizar=1, en vez de buscar vuelve a analizar lo ya buscado de la organización de la tanda (sin pagar Apify);
// con antes=<fecha>, rehace también lo analizado antes de esa hora.

import { after } from "next/server";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { procesarTanda, reanalizarDeTanda } from "@/lib/compras/precio-mercado";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const tanda = Number(u.searchParams.get("tanda"));
  const token = u.searchParams.get("token") ?? "";
  if (!Number.isInteger(tanda) || !/^[0-9a-f-]{36}$/i.test(token)) return new Response("no", { status: 400 });
  after(async () => {
    await asegurarEsquemaErp();
    const antes = u.searchParams.get("antes") ? new Date(u.searchParams.get("antes")!) : undefined;
    if (u.searchParams.get("reanalizar") === "1") await reanalizarDeTanda(tanda, token, antes && Number.isFinite(antes.getTime()) ? antes : undefined).catch((e) => console.error("[precios-mercado] reanalizar", e));
    else await procesarTanda(tanda, token).catch((e) => console.error("[precios-mercado]", e));
  });
  return Response.json({ ok: true });
}
