// "Conectar WhatsApp": manda a la persona al alta embebida de Meta (con
// coexistencia: el número sigue andando en el teléfono). El "state" va
// firmado con la organización y quién lo pidió. Copiado de CadaMes.

import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { urlPanel } from "@/lib/tienda/dominios";
import { esMovil, firmarEstado, hayAppDeMeta, urlDeAlta } from "@/lib/mensajes/meta";

export const dynamic = "force-dynamic";
const VOLVER = "/ventas/mensajes/configuracion";

export async function GET(req: NextRequest) {
  const base = urlPanel();
  const volver = (motivo: string) => NextResponse.redirect(`${base}${VOLVER}?wa=${motivo}`);
  const s = await sesionActual();
  if (!s) return NextResponse.redirect(`${base}/login`);
  if (!s.superadmin && !tienePermiso(s.permisos, "mensajes_config")) return volver("sinpermiso");
  if (!hayAppDeMeta()) return volver("sinapp");
  const coexistencia = req.nextUrl.searchParams.get("modo") !== "solo_laucen";
  const estado = firmarEstado({ org: s.org.id, usuario: s.usuario.id, modo: coexistencia ? "coexistencia" : "solo_laucen" });
  return NextResponse.redirect(urlDeAlta({
    redirectUri: `${base}/api/whatsapp/conectar/callback`, estado, coexistencia, movil: esMovil(req.headers.get("user-agent")),
  }));
}
