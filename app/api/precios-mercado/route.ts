// Una vuelta de una tanda de «precio de mercado» (lib/compras/precio-mercado.ts): contesta enseguida y trabaja
// después (after), hasta unos minutos; si quedan productos, se vuelve a llamar sola. La protege el token de la tanda.

import { after } from "next/server";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { procesarTanda } from "@/lib/compras/precio-mercado";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const tanda = Number(u.searchParams.get("tanda"));
  const token = u.searchParams.get("token") ?? "";
  if (!Number.isInteger(tanda) || !/^[0-9a-f-]{36}$/i.test(token)) return new Response("no", { status: 400 });
  after(async () => {
    await asegurarEsquemaErp();
    await procesarTanda(tanda, token).catch((e) => console.error("[precios-mercado]", e));
  });
  return Response.json({ ok: true });
}
