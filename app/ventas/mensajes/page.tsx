// Ventas › Mensajes (Fer, 25/10, como la Bandeja de CadaMes): todo lo que escriben los clientes en una sola bandeja,
// tipo WhatsApp Web —WhatsApp, Instagram, mensajes y preguntas de Mercado Libre, reclamos—. La IA de la tienda
// (lib/mensajes/estela.ts) y la de Mercado Libre contestan solas; lo que espera a una persona queda «Para atender».
// Cada persona ve los canales que su rol puede ver.

import { entrarErp, Pantalla } from "@/app/componentes/erp";
import { tienePermiso } from "@/lib/permisos";
import { fotoBandeja } from "@/lib/mensajes/bandeja";
import { esFiltro, esFiltroOrigen, type FiltroBandeja } from "@/lib/mensajes/bandeja-tipos";
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
  // Sin pestaña elegida: «Para atender» si hay algo esperando a una persona; si no, «Todos» (Fer, 25/10).
  let filtro: FiltroBandeja = esFiltro(sp.filtro) ? sp.filtro : "atender";
  let foto = await fotoBandeja(s.org.id, puede, filtro, origen, "", con);
  if (!esFiltro(sp.filtro) && foto.cuantos.atender === 0) {
    filtro = "todos";
    foto = await fotoBandeja(s.org.id, puede, filtro, origen, "", con);
  }
  return (
    <Pantalla titulo="Mensajes" subtitulo="Todo lo que escriben los clientes: WhatsApp, Instagram, Mercado Libre (mensajes y preguntas) y reclamos. Contesta la IA; lo que espera a una persona queda «Para atender»" ancho="max-w-7xl"
      acciones={puede("preguntas_ver") ? <BotonTarea accion={accionTraerPreguntas} tipo="preguntas-ml" clase={SUAVE} texto="Traer preguntas ahora" /> : undefined}>
      <PestanasMensajes org={s.org.id} permisos={s.permisos} superadmin={s.superadmin} activa="chats" />
      {/* La llave: un link de la barra de abajo («Para atender») estando ya en Mensajes vuelve a armar la bandeja con su pestaña. */}
      <Bandeja key={`${sp.filtro ?? ""}|${origen}|${con ?? ""}`} inicial={foto} filtroInicial={filtro} origenInicial={origen} abiertoInicial={con} />
    </Pantalla>
  );
}
