// Baja el pedido de certificado (CSR) guardado del ambiente elegido, para
// subirlo en ARCA. Sólo el CSR: la clave privada nunca sale del servidor.

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { estadoCredencial } from "@/lib/arca/credenciales";
import { motivoErp } from "@/lib/erp/base";

export const dynamic = "force-dynamic";

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  const sesion = await sesionActual();
  if (!sesion) return texto("Tenés que entrar a Laucen para bajar el pedido de certificado.", 401);
  if (!tienePermiso(sesion.permisos, "facturacion_ver")) return texto("No tenés permiso de facturación.", 403);
  const ambiente = new URL(req.url).searchParams.get("ambiente") === "produccion" ? "produccion" : "homologacion";
  try {
    const cred = await estadoCredencial(sesion.org.id, ambiente);
    if (!cred) return texto("Todavía no generaste el pedido de certificado para ese ambiente.", 404);
    return new Response(cred.csr, {
      headers: { "content-type": "application/pkcs10", "content-disposition": `attachment; filename="laucen-${ambiente}.csr"` },
    });
  } catch (e) {
    return texto(motivoErp(e), 500);
  }
}
