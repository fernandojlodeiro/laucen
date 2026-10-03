// La carpeta de mensajes pregunta acá cada pocos segundos; si el sello no
// cambió, contesta {igual: true} y no baja nada.

import type { NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { fotoBandeja, selloDe } from "@/lib/mensajes/bandeja";
import { esFiltro } from "@/lib/mensajes/bandeja-tipos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await asegurarEsquemaErp();
  const s = await sesionActual();
  if (!s || !tienePermiso(s.permisos, "mensajes_ver")) return Response.json({ error: "Sin permiso." }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const sello = p.get("sello");
  if (sello && sello === (await selloDe(s.org.id))) return Response.json({ igual: true });
  const filtro = esFiltro(p.get("filtro")) ? p.get("filtro") as "todos" : "todos";
  return Response.json(await fotoBandeja(s.org.id, filtro, p.get("q") ?? "", Number(p.get("con")) || null));
}
