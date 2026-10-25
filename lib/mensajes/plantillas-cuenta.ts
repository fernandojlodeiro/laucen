// Lo que la pantalla de plantillas necesita del servidor: el contexto (las direcciones de los botones),
// el estado de cada plantilla en Meta y mandarla. Aparte de lib/mensajes/plantillas.ts, que es la lista pura.

import { ErrorErp } from "@/lib/erp/base";
import { urlPanel } from "@/lib/tienda/dominios";
import { urlTienda } from "@/lib/tienda/dominios-tienda";
import { PLANTILLAS, type Contexto } from "@/lib/mensajes/plantillas";

export async function contextoDe(org: string): Promise<Contexto> {
  const { tiendaParaPedido } = await import("@/lib/correo/mails");
  const t = await tiendaParaPedido(org, null);
  return { tienda: t ? (await urlTienda(t, "")).replace(/\/$/, "") : urlPanel(), panel: urlPanel() };
}

/** Manda la plantilla a Meta: si no existe, la crea; si está rechazada o pausada, le pone el texto de hoy y la vuelve a mandar. */
export async function mandarPlantilla(org: string, nombre: string): Promise<string> {
  const p = PLANTILLAS.find((x) => x.nombre === nombre);
  if (!p) throw new ErrorErp("Esa plantilla no existe.");
  const { credencialDeOrg } = await import("@/lib/mensajes/chats");
  const cred = await credencialDeOrg(org);
  if (!cred) throw new ErrorErp("No hay una línea de WhatsApp conectada.");
  const { listarPlantillas, crearPlantilla, editarPlantilla } = await import("@/lib/mensajes/meta");
  const armada = p.armar(await contextoDe(org));
  try {
    const ya = (await listarPlantillas(cred.wabaId, cred.token)).find((x) => x.nombre === nombre);
    if (!ya) { await crearPlantilla(cred.wabaId, cred.token, armada); return `«${p.titulo}» mandada a Meta: queda en revisión.`; }
    if (ya.estado === "REJECTED" || ya.estado === "PAUSED") { await editarPlantilla(cred.token, ya.id, armada); return `«${p.titulo}» mandada de nuevo a Meta: queda en revisión.`; }
    return `«${p.titulo}» ya está en Meta: no hay que mandarla.`;
  } catch (e) {
    console.error("[plantillas] mandar", nombre, e instanceof Error ? e.message : e);
    throw new ErrorErp("Meta no recibió la plantilla. Probá de nuevo en un rato.");
  }
}
