// Las pestañas de Ventas › Mensajes: la bandeja, el probador, lo que la IA buscó en internet y la configuración.

import Pestanas from "@/app/componentes/Pestanas";
import { tienePermiso, type Permisos } from "@/lib/permisos";
import { cuentaParaAtender } from "@/lib/erp/contadores";
import { cuentaDatosInternet } from "@/app/componentes/DatosInternet";

export async function PestanasMensajes({ org, permisos, superadmin, activa }: {
  org: string; permisos: Permisos; superadmin: boolean; activa: "chats" | "probar" | "internet" | "config";
}) {
  // La cuenta de la bandeja: lo que espera a una persona (como su pestaña «Para atender» y la barra de abajo).
  const n = await cuentaParaAtender(org, (p) => superadmin || tienePermiso(permisos, p));
  const verMl = superadmin || tienePermiso(permisos, "preguntas_ver");
  const internet = verMl ? await cuentaDatosInternet(org).catch(() => 0) : 0;
  return (
    <Pestanas className="mb-3" items={[
      { href: "/ventas/mensajes", texto: "Conversaciones", cuenta: n, activa: activa === "chats" },
      { href: "/ventas/mensajes/probar", texto: "Probar la IA", activa: activa === "probar" },
      ...(verMl ? [{ href: "/ventas/mensajes/internet", texto: "Datos de internet", cuenta: internet, activa: activa === "internet" }] : []),
      ...(superadmin || tienePermiso(permisos, "mensajes_config") ? [{ href: "/ventas/mensajes/configuracion", texto: "Configuración", activa: activa === "config" }] : []),
    ]} />
  );
}
