// Ventas › WhatsApp (pedido de Fer, 3/10): la carpeta de mensajes de los
// clientes, tipo WhatsApp Web, copiada de la Bandeja de CadaMes. Los contesta
// la IA de la tienda (lib/mensajes/estela.ts) y una persona puede tomar
// cualquier chat apagando su interruptor.

import { entrarErp, Pantalla } from "@/app/componentes/erp";
import { fotoBandeja } from "@/lib/mensajes/bandeja";
import { esFiltro } from "@/lib/mensajes/bandeja-tipos";
import { PestanasMensajes } from "./comun";
import Bandeja from "./Bandeja";

export const dynamic = "force-dynamic";

export default async function Mensajes({ searchParams }: { searchParams: Promise<{ filtro?: string; con?: string }> }) {
  const s = await entrarErp("mensajes_ver");
  const sp = await searchParams;
  const filtro = esFiltro(sp.filtro) ? sp.filtro : "todos";
  const con = Number(sp.con) || null;
  const foto = await fotoBandeja(s.org.id, filtro, "", con);
  return (
    <Pantalla titulo="WhatsApp" subtitulo="Los mensajes de los clientes: los contesta la IA y, cuando no sabe, quedan en espera para una persona" ancho="max-w-7xl">
      <PestanasMensajes org={s.org.id} permisos={s.permisos} superadmin={s.superadmin} activa="chats" />
      <Bandeja inicial={foto} filtroInicial={filtro} abiertoInicial={con} />
    </Pantalla>
  );
}
