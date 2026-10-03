// Lo que comparten las dos pestañas de Configuración → Asistente.

import Pestanas from "@/app/componentes/Pestanas";
import { tienePermiso, type Permisos } from "@/lib/permisos";
import { una } from "@/lib/erp/base";

export async function PestanasAsistente({ org, permisos, superadmin, activa }: {
  org: string; permisos: Permisos; superadmin: boolean; activa: "config" | "historial" | "pendientes";
}) {
  const n = tienePermiso(permisos, "asistente_historial_ver")
    ? (await una<{ n: number }>("select count(*)::int n from asistente_conversacion where organizacion_id = $1", [org]))?.n ?? 0
    : null;
  // Los pedidos sin resolver los decide el superadministrador: la cuenta es de los nuevos.
  const pendientes = superadmin
    ? (await una<{ n: number }>("select count(*)::int n from asistente_pendiente where organizacion_id = $1 and estado = 'nuevo'", [org]))?.n ?? 0
    : null;
  return (
    <Pestanas items={[
      ...(tienePermiso(permisos, "asistente_config") ? [{ href: "/config/asistente", texto: "Configuración", activa: activa === "config" }] : []),
      ...(n != null ? [{ href: "/config/asistente/historial", texto: "Historial", cuenta: n, activa: activa === "historial" }] : []),
      ...(pendientes != null ? [{ href: "/config/asistente/pendientes", texto: "Pedidos sin resolver", cuenta: pendientes, activa: activa === "pendientes" }] : []),
    ]} />
  );
}
