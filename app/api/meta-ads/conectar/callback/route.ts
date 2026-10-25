// La vuelta de «Conectar anuncios de Meta»: guarda las cuentas publicitarias y lee el gasto por primera vez
// (lib/publicidad/meta-ads.ts).

import { NextRequest, NextResponse } from "next/server";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { urlPanel } from "@/lib/tienda/dominios";
import { verificarEstado } from "@/lib/mensajes/meta";
import { appMetaAnuncios, conectarAnunciosMeta } from "@/lib/publicidad/meta-ads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const base = urlPanel();
  const url = new URL(req.url);
  const volver = (motivo: string) => NextResponse.redirect(`${base}/informes/embudo-publicidad?meta=${motivo}`);
  await asegurarEsquemaErp();
  const code = url.searchParams.get("code");
  const datos = verificarEstado(url.searchParams.get("state") ?? "");
  if (url.searchParams.get("error")) return volver("rechazo");
  if (!code) return volver("cancelado");
  if (!datos?.org) return volver("estado");
  const app = await appMetaAnuncios();
  if (!app) return volver("sinapp");
  return volver(await conectarAnunciosMeta(datos.org, app, code, `${base}/api/meta-ads/conectar/callback`).catch((e) => { console.error("[meta-ads]", e); return "canje" as const; }));
}
