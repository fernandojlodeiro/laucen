// El motor de Market Pro (lib/marketpro/motor.ts): contesta enseguida y trabaja después (after) una vuelta de hasta
// ~4 minutos; si queda algo, se vuelve a llamar sola. La protege el token de la llave de la organización. Con plan=1
// (la base lo llama cada mañana) primero suma lo nuevo: el día anterior y el mes que corre.

import { after } from "next/server";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { actualizarTodo, vuelta } from "@/lib/marketpro/motor";
import { una } from "@/lib/erp/base";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const org = u.searchParams.get("org") ?? "";
  const token = u.searchParams.get("token") ?? "";
  if (!org || !/^[0-9a-f-]{36}$/i.test(token)) return new Response("no", { status: 400 });
  after(async () => {
    await asegurarEsquemaErp();
    const ok = await una("select 1 from mpro_llave where organizacion_id = $1 and token = $2::uuid", [org, token]);
    if (!ok) return;
    if (u.searchParams.get("plan") === "1") await actualizarTodo(org).catch((e) => console.error("[marketpro] plan", e));
    await vuelta(org, token).catch((e) => console.error("[marketpro] vuelta", e));
  });
  return Response.json({ ok: true });
}
