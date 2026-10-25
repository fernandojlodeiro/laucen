// Ventas › Mensajes (Fer, 25/10, como la Bandeja de CadaMes): todo lo que escriben los clientes en una sola bandeja,
// tipo WhatsApp Web —WhatsApp, Instagram, mensajes y preguntas de Mercado Libre, reclamos—. La IA de la tienda
// (lib/mensajes/estela.ts) y la de Mercado Libre contestan solas; lo que derivan a una persona queda «En espera».
// Cada persona ve los canales que su rol puede ver.

import { entrarErp, Pantalla } from "@/app/componentes/erp";
import { tienePermiso } from "@/lib/permisos";
import { fotoBandeja } from "@/lib/mensajes/bandeja";
import { esFiltro, esFiltroOrigen } from "@/lib/mensajes/bandeja-tipos";
import { PestanasMensajes } from "./comun";
import Bandeja from "./Bandeja";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { SUAVE } from "@/app/botones";
import { accionTraerPreguntas } from "./acciones-ml";

export const dynamic = "force-dynamic";
// La tarea de fondo de «Traer preguntas ahora» corre hasta este tope.
export const maxDuration = 120;

export default async function Mensajes({ searchParams }: { searchParams: Promise<{ filtro?: string; origen?: string; con?: string }> }) {
  const s = await entrarErp("mensajes_ver");
  const sp = await searchParams;
  const origen = esFiltroOrigen(sp.origen) ? sp.origen : "todos";
  const con = sp.con ?? null;
  const puede = (p: Parameters<typeof tienePermiso>[1]) => tienePermiso(s.permisos, p);
  // Sin pestaña elegida: «En espera» si hay algo esperando a una persona; si no, «Todos» (Fer, 25/10).
  let filtro = esFiltro(sp.filtro) ? sp.filtro : "en_espera";
  let foto = await fotoBandeja(s.org.id, puede, filtro, origen, "", con);
  if (!esFiltro(sp.filtro) && foto.cuantos.en_espera === 0) {
    filtro = "todos";
    foto = await fotoBandeja(s.org.id, puede, filtro, origen, "", con);
  }
  return (
    <Pantalla titulo="Mensajes" subtitulo="Todo lo que escriben los clientes: WhatsApp, Instagram, Mercado Libre (mensajes y preguntas) y reclamos. Contesta la IA; lo que deriva a una persona queda «En espera»" ancho="max-w-7xl"
      acciones={puede("preguntas_ver") ? <BotonTarea accion={accionTraerPreguntas} tipo="preguntas-ml" clase={SUAVE} texto="Traer preguntas ahora" /> : undefined}>
      <PestanasMensajes org={s.org.id} permisos={s.permisos} superadmin={s.superadmin} activa="chats" />
      <Bandeja inicial={foto} filtroInicial={filtro} origenInicial={origen} abiertoInicial={con} />
    </Pantalla>
  );
}
