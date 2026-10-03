// "Descargar Excel" de cualquier lista configurable: /listas/<pantalla>/excel
// con los mismos parámetros de la pantalla (filtros, búsqueda, orden), más
// ?_cfg=<configuración de Excel> o, si no, las columnas de la vista que se
// está viendo (?_vista=) o las de siempre.

import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { configDe } from "@/lib/listas/config";
import { excelDeLista } from "@/lib/listas/excel";
import { LISTAS } from "@/app/listas/registro";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest, { params }: { params: Promise<{ pantalla: string }> }) {
  const { pantalla } = await params;
  const lista = Object.hasOwn(LISTAS, pantalla) ? LISTAS[pantalla] : null;
  if (!lista) return new Response("No existe esa lista.", { status: 404 });
  const s = await entrarErp(lista.permiso);
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const ctx = { org: s.org.id, moneda: s.moneda };
  const cfg = sp._cfg ? await configDe(ctx.org, pantalla, "excel", Number(sp._cfg)) : null;
  const vista = !cfg && lista.vistas && sp._vista ? await configDe(ctx.org, pantalla, "vista", Number(sp._vista)) : null;
  return excelDeLista(lista, ctx, sp, cfg?.columnas ?? vista?.columnas ?? null, cfg?.nombre);
}
