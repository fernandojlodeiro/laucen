// Las pestañas de Ventas › Mensajes: la bandeja, el probador y la configuración.

import Pestanas from "@/app/componentes/Pestanas";
import { una } from "@/lib/erp/base";
import { tienePermiso, type Permisos } from "@/lib/permisos";
import { SQL_RECLAMO_A_ATENDER } from "@/lib/erp/contadores";
import { SQL_DERIVADA_ESPERA } from "@/lib/mercadolibre/sql-mensajes";

export async function PestanasMensajes({ org, permisos, superadmin, activa }: {
  org: string; permisos: Permisos; superadmin: boolean; activa: "chats" | "probar" | "config";
}) {
  // La cuenta de la bandeja: lo que espera a una persona (como su pestaña «En espera»).
  const n = (await una<{ n: number }>(`
    select ((select count(distinct chat_id) from chat_caso where organizacion_id = $1 and resuelto_ts is null)
          + (select count(*) from meli_conversacion c where c.organizacion_id = $1 and ${SQL_DERIVADA_ESPERA("c")})
          + (select count(*) from reclamo r where r.organizacion_id = $1 and ${SQL_RECLAMO_A_ATENDER}))::int n`, [org]).catch(() => null))?.n ?? 0;
  return (
    <Pestanas className="mb-3" items={[
      { href: "/ventas/mensajes", texto: "En espera", cuenta: n, activa: activa === "chats" },
      { href: "/ventas/mensajes/probar", texto: "Probar la IA", activa: activa === "probar" },
      ...(superadmin || tienePermiso(permisos, "mensajes_config") ? [{ href: "/ventas/mensajes/configuracion", texto: "Configuración", activa: activa === "config" }] : []),
    ]} />
  );
}
