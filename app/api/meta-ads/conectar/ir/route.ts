// «Conectar anuncios de Meta» (embudo de publicidad, Fer 25/10): manda al inicio de sesión de Facebook para empresas,
// para compartir las cuentas publicitarias con permiso de lectura. El «state» va firmado con la organización.

import { NextResponse } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { urlPanel } from "@/lib/tienda/dominios";
import { firmarEstado } from "@/lib/mensajes/meta";
import { appMetaAnuncios, urlDeConexion } from "@/lib/publicidad/meta-ads";

export const dynamic = "force-dynamic";
const VOLVER = "/informes/embudo-publicidad";

export async function GET() {
  const base = urlPanel();
  const volver = (motivo: string) => NextResponse.redirect(`${base}${VOLVER}?meta=${motivo}`);
  const s = await sesionActual();
  if (!s) return NextResponse.redirect(`${base}/login`);
  if (!s.superadmin && !tienePermiso(s.permisos, "publicidad_ver")) return volver("sinpermiso");
  const app = await appMetaAnuncios();
  if (!app) return volver("sinapp");
  return NextResponse.redirect(urlDeConexion(app, `${base}/api/meta-ads/conectar/callback`, firmarEstado({ org: s.org.id, usuario: s.usuario.id })));
}
