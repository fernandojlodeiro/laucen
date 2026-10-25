// La vuelta del inicio de sesión de Instagram: conecta la cuenta (lib/mensajes/instagram.ts) y vuelve a la
// configuración con el resultado.

import { NextRequest, NextResponse } from "next/server";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { urlPanel } from "@/lib/tienda/dominios";
import { anotarEvento } from "@/lib/mensajes/chats";
import { verificarEstado } from "@/lib/mensajes/meta";
import { appInstagram, conectarCuenta, hayAppInstagram } from "@/lib/mensajes/instagram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const base = urlPanel();
  const url = new URL(req.url);
  const volver = (motivo: string) => NextResponse.redirect(`${base}/ventas/mensajes/configuracion?ig=${motivo}`);
  await asegurarEsquemaErp();
  const code = url.searchParams.get("code");
  const datos = verificarEstado(url.searchParams.get("state") ?? "");
  await anotarEvento("ig_alta_vuelta", { hayCode: !!code, estadoValido: !!datos, error: url.searchParams.get("error"), error_reason: url.searchParams.get("error_reason") }, datos?.org ?? null);
  if (url.searchParams.get("error")) return volver("rechazo");
  if (!code) return volver("cancelado");
  if (!datos?.org) return volver("estado");
  const app = await appInstagram();
  if (!hayAppInstagram(app)) return volver("sinapp");
  // Instagram a veces agrega «#_» al final del código.
  const r = await conectarCuenta(datos.org, app, code.replace(/#_$/, ""), `${base}/api/instagram/conectar/callback`).catch((e) => { console.error("[ig-alta]", e); return "canje" as const; });
  return volver(r);
}
