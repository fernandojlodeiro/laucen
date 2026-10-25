// La vuelta de «Conectar Google Ads»: guarda las cuentas y lee el gasto por primera vez (lib/publicidad/google-ads.ts).

import { NextRequest, NextResponse } from "next/server";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { urlPanel } from "@/lib/tienda/dominios";
import { verificarEstado } from "@/lib/mensajes/meta";
import { appGoogleAds, conectarGoogleAds } from "@/lib/publicidad/google-ads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const base = urlPanel();
  const url = new URL(req.url);
  const volver = (motivo: string) => NextResponse.redirect(`${base}/informes/embudo-publicidad?google=${motivo}`);
  await asegurarEsquemaErp();
  const code = url.searchParams.get("code");
  const datos = verificarEstado(url.searchParams.get("state") ?? "");
  if (url.searchParams.get("error")) return volver("rechazo");
  if (!code) return volver("cancelado");
  if (!datos?.org) return volver("estado");
  const app = await appGoogleAds();
  if (!app) return volver("sinapp");
  return volver(await conectarGoogleAds(datos.org, app, code, `${base}/api/google-ads/conectar/callback`).catch((e) => { console.error("[google-ads]", e); return "canje" as const; }));
}
