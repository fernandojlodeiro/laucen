// La bandeja de Mensajes pregunta acá cada pocos segundos; si el sello no
// cambió, contesta {igual: true} y no baja nada.

import type { NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { fotoBandeja, selloDe } from "@/lib/mensajes/bandeja";
import { esFiltro, esFiltroOrigen } from "@/lib/mensajes/bandeja-tipos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await asegurarEsquemaErp();
  const s = await sesionActual();
  const puede = (p: Parameters<typeof tienePermiso>[1]) => !!s && tienePermiso(s.permisos, p);
  if (!s || !(puede("mensajes_ver") || puede("preguntas_ver") || puede("reclamos_ver"))) return Response.json({ error: "Sin permiso." }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const sello = p.get("sello");
  if (sello && sello === (await selloDe(s.org.id))) return Response.json({ igual: true });
  const filtro = esFiltro(p.get("filtro")) ? p.get("filtro") as "todos" : "atender";
  const origen = esFiltroOrigen(p.get("origen")) ? p.get("origen") as "todos" : "todos";
  return Response.json(await fotoBandeja(s.org.id, puede, filtro, origen, p.get("q") ?? "", p.get("con")));
}
