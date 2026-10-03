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

/** Un interruptor dibujado en modo vista (no se toca). */
export function InterruptorVista({ prendido, etiqueta }: { prendido: boolean; etiqueta: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" aria-label={`${etiqueta}: ${prendido ? "prendido" : "apagado"}`}>
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full opacity-70 ${prendido ? "bg-[#167655]" : "bg-[#C9D3DD]"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow ${prendido ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
      {etiqueta}
    </span>
  );
}
