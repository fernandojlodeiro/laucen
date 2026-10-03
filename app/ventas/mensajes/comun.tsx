// Las pestañas de Ventas › WhatsApp: los chats, el probador y la configuración.

import Pestanas from "@/app/componentes/Pestanas";
import { una } from "@/lib/erp/base";
import { tienePermiso, type Permisos } from "@/lib/permisos";

export async function PestanasMensajes({ org, permisos, superadmin, activa }: {
  org: string; permisos: Permisos; superadmin: boolean; activa: "chats" | "probar" | "config";
}) {
  const n = (await una<{ n: number }>("select count(*)::int n from chat where organizacion_id = $1 and canal = 'whatsapp'", [org]))?.n ?? 0;
  return (
    <Pestanas className="mb-3" items={[
      { href: "/ventas/mensajes", texto: "Chats", cuenta: n, activa: activa === "chats" },
      { href: "/ventas/mensajes/probar", texto: "Probar la IA", activa: activa === "probar" },
      ...(superadmin || tienePermiso(permisos, "mensajes_config") ? [{ href: "/ventas/mensajes/configuracion", texto: "Configuración", activa: activa === "config" }] : []),
    ]} />
  );
}
