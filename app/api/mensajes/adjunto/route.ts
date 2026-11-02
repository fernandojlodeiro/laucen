// La foto, el PDF, el video o el audio que mandó un cliente por WhatsApp (Fer, 29/10: no se veían en el panel).
// El archivo queda en Meta (chat_mensaje.adjunto.media_id, unos 30 días): se le pide en el momento y no se guarda.
//   ?c=<id del mensaje>

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";
import { credencialDeOrg } from "@/lib/mensajes/chats";
import { bajarDeWhatsapp } from "@/lib/pagos/comprobante-whatsapp";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await sesionActual();
  if (!s) return new Response("sin sesión", { status: 401 });
  if (!tienePermiso(s.permisos, "mensajes_ver")) return new Response("sin permiso", { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("c")) || 0;
  const m = await una<{ media_id: string | null }>(
    "select adjunto ->> 'media_id' media_id from chat_mensaje where id = $1 and organizacion_id = $2", [id, s.org.id]);
  if (!m?.media_id) return new Response("no encontrado", { status: 404 });
  const cred = await credencialDeOrg(s.org.id);
  const a = cred ? await bajarDeWhatsapp(cred.token, m.media_id) : null;
  if (!a) return new Response("WhatsApp ya no tiene el archivo (dura unos 30 días)", { status: 410 });
  return new Response(new Uint8Array(a.datos), { headers: { "content-type": a.tipo || "application/octet-stream", "cache-control": "private, max-age=86400" } });
}
