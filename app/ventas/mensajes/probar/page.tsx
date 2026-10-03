// Ventas › WhatsApp › Probar la IA: escribile como si fueras un cliente y
// contesta la IA de la tienda con lo mismo que usa por WhatsApp (catálogo,
// precios, stock, lo que sabe), sin mandar nada por WhatsApp. El chat de
// prueba también aparece en Chats (con 🧪).

import { entrarErp, Pantalla } from "@/app/componentes/erp";
import { una } from "@/lib/erp/base";
import { chatAbierto } from "@/lib/mensajes/bandeja";
import { configMensajes } from "@/lib/mensajes/config";
import { PestanasMensajes } from "../comun";
import Probador from "./Probador";

export const dynamic = "force-dynamic";

export default async function Probar() {
  const s = await entrarErp("mensajes_ver");
  const [c, fila] = await Promise.all([
    configMensajes(s.org.id),
    una<{ id: number }>("select id::int from chat where organizacion_id = $1 and canal = 'prueba' and externo = $2", [s.org.id, `prueba:${s.usuario.id}`]),
  ]);
  const chat = fila ? await chatAbierto(s.org.id, fila.id) : null;
  return (
    <Pantalla titulo="WhatsApp" subtitulo="Probá la IA como si fueras un cliente: contesta igual que por WhatsApp, pero no se manda nada" ancho="max-w-7xl">
      <PestanasMensajes org={s.org.id} permisos={s.permisos} superadmin={s.superadmin} activa="probar" />
      <Probador nombreIa={c.nombre} iaActiva={c.iaActiva} mensajes={chat?.mensajes ?? []} casos={chat?.casos ?? []} />
    </Pantalla>
  );
}
