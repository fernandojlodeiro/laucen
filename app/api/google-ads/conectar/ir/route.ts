// «Conectar Google Ads» (embudo de publicidad, Fer 25/10): manda al permiso de Google para leer los anuncios.
// El «state» va firmado con la organización.

import { NextResponse } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { urlPanel } from "@/lib/tienda/dominios";
import { firmarEstado } from "@/lib/mensajes/meta";
import { appGoogleAds, urlDeConexion } from "@/lib/publicidad/google-ads";

export const dynamic = "force-dynamic";
const VOLVER = "/informes/embudo-publicidad";

export async function GET() {
  const base = urlPanel();
  const volver = (motivo: string) => NextResponse.redirect(`${base}${VOLVER}?google=${motivo}`);
  const s = await sesionActual();
  if (!s) return NextResponse.redirect(`${base}/login`);
  if (!s.superadmin && !tienePermiso(s.permisos, "publicidad_ver")) return volver("sinpermiso");
  const app = await appGoogleAds();
  if (!app) return volver("sinapp");
  return NextResponse.redirect(urlDeConexion(app, `${base}/api/google-ads/conectar/callback`, firmarEstado({ org: s.org.id, usuario: s.usuario.id })));
}
