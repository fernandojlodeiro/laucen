// Ver un comprobante de pago que llegó por WhatsApp (lib/pagos/comprobante-whatsapp.ts): el archivo quedó
// guardado en WhatsApp y se le pide a Meta en el momento. Lo abre el link del comprobante en la ficha.

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";
import { credencialDeOrg } from "@/lib/mensajes/chats";
import { bajarDeWhatsapp } from "@/lib/pagos/comprobante-whatsapp";

export const dynamic = "force-dynamic";

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const sesion = await sesionActual();
  if (!sesion) return texto("Tenés que entrar a Laucen para ver el comprobante.", 401);
  if (!tienePermiso(sesion.permisos, "pedidos_ver")) return texto("No tenés permiso para ver pedidos.", 403);
  const { id, cid } = await params;
  const c = await una<{ ruta: string }>("select ruta from pedido_comprobante_pago where id = $1 and pedido_id = $2 and organizacion_id = $3",
    [Number(cid) || 0, Number(id) || 0, sesion.org.id]);
  if (!c?.ruta.startsWith("wa/")) return texto("Ese comprobante no existe.", 404);
  const cred = await credencialDeOrg(sesion.org.id);
  const a = cred ? await bajarDeWhatsapp(cred.token, c.ruta.slice(3)) : null;
  if (!a) return texto("WhatsApp ya no tiene este archivo (los guarda unos 30 días).", 404);
  return new Response(new Uint8Array(a.datos), { headers: { "content-type": a.tipo || "application/octet-stream", "cache-control": "private, no-store" } });
}
