// «Conectar Instagram» (Fer, 25/10): manda a la persona al inicio de sesión de Instagram para dar permiso a los mensajes
// de la cuenta del negocio. El «state» va firmado con la organización (lib/mensajes/meta.ts).

import { NextResponse } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { urlPanel } from "@/lib/tienda/dominios";
import { firmarEstado } from "@/lib/mensajes/meta";
import { appInstagram, hayAppInstagram, urlDeConexion } from "@/lib/mensajes/instagram";

export const dynamic = "force-dynamic";
const VOLVER = "/ventas/mensajes/configuracion";

export async function GET() {
  const base = urlPanel();
  const volver = (motivo: string) => NextResponse.redirect(`${base}${VOLVER}?ig=${motivo}`);
  const s = await sesionActual();
  if (!s) return NextResponse.redirect(`${base}/login`);
  if (!s.superadmin && !tienePermiso(s.permisos, "mensajes_config")) return volver("sinpermiso");
  const app = await appInstagram();
  if (!hayAppInstagram(app)) return volver("sinapp");
  return NextResponse.redirect(urlDeConexion(app, `${base}/api/instagram/conectar/callback`, firmarEstado({ org: s.org.id, usuario: s.usuario.id })));
}
