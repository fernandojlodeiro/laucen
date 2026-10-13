// Corre un pedido de «vendedor referente» (lib/compras/vendedor-referente.ts): contesta enseguida y trabaja después
// (after). La protege el token de la fila.

import { after } from "next/server";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { correrVendedor } from "@/lib/compras/vendedor-referente";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = Number(u.searchParams.get("id"));
  const token = u.searchParams.get("token") ?? "";
  if (!Number.isInteger(id) || !/^[0-9a-f-]{36}$/i.test(token)) return new Response("no", { status: 400 });
  after(async () => {
    await asegurarEsquemaErp();
    await correrVendedor(id, token).catch((e) => console.error("[vendedor-referente]", e));
  });
  return Response.json({ ok: true });
}
