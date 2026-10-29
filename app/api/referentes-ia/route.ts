// Una vuelta de la IA de vendedores referentes (lib/compras/referentes-ia.ts): contesta enseguida y trabaja después
// (after), unos minutos; si queda trabajo, se vuelve a llamar sola. La protege el token de la pasada.

import { after } from "next/server";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { correrIa } from "@/lib/compras/referentes-ia";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = Number(u.searchParams.get("id"));
  const token = u.searchParams.get("token") ?? "";
  if (!Number.isInteger(id) || !/^[0-9a-f-]{36}$/i.test(token)) return new Response("no", { status: 400 });
  after(async () => {
    await asegurarEsquemaErp();
    await correrIa(id, token).catch((e) => console.error("[referentes-ia]", e));
  });
  return Response.json({ ok: true });
}
