// Configuración › Mis avisos (pedido de Fer, 10/10): cada persona elige cómo
// se entera de lo que entra (lib/avisos.ts). Es sólo de quien la abre.

import { sesionRequerida } from "@/lib/tenancy";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { prefsAvisos } from "@/lib/avisos";
import { Pantalla, Avisos, BotonesFicha, editandoFicha, TituloSeccion, ValorVista, CAJA, CAMPO } from "@/app/componentes/erp";
import CampoNumero from "@/app/componentes/CampoNumero";
import { CADA_MIN_MAX } from "@/lib/avisos-tipos";
import AvisosWindows from "./AvisosWindows";
import { accionEquipo, accionGuardarAvisos } from "./acciones";
import { equiposDelUsuario } from "@/lib/avisos-push";
import { Interruptor } from "@/app/radar/Piezas";
import { SUAVE } from "@/app/botones";
import ProbarSonido from "./ProbarSonido";

export const dynamic = "force-dynamic";

const VOLVER = "/config/avisos";

export default async function MisAvisos({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; editar?: string }> }) {
  await asegurarEsquemaErp();
  const s = await sesionRequerida();
  const sp = await searchParams;
  const editando = editandoFicha(sp);
  const p = await prefsAvisos(s.usuario.id, s.org.id);
  return (
    <Pantalla titulo="Mis avisos" subtitulo="Cómo te enterás de los reclamos, mensajes, preguntas y pedidos que entran. Se aplica sólo a tu usuario" ancho="max-w-xl"
      acciones={<BotonesFicha editando={editando} ver={VOLVER} editar={`${VOLVER}?editar=ficha`} />}>
      <Avisos sp={sp} />
      <form id="ficha" action={accionGuardarAvisos} className={`${CAJA} grid gap-3`}>
        <Opcion nombre="sonido" activa={p.sonido} editando={editando} titulo="Sonar cuando entra algo"
          ayuda="Para todo: suena un aviso corto cuando entra un reclamo para atender, un mensaje, una pregunta, un WhatsApp en espera o un pedido, y cuando la IA deja algo sin contestar." />
        <fieldset className="grid gap-0.5">
          <legend className="px-2 text-xs font-semibold">Avisarme de prepo de…</legend>
          <span className="px-2 text-[11px] text-[#5C6B76] mb-1">Se abre sola una ventana, estés en la pantalla que estés. Los avisos de Windows (abajo) avisan lo mismo.</span>
          <Opcion nombre="ventana_reclamos" activa={p.ventana.reclamos} editando={editando} titulo="Reclamos para atender"
            ayuda="Un reclamo nuevo que espera tu respuesta, o un mensaje nuevo del comprador o de Mercado Libre en uno abierto. Muestra hasta cuándo hay para responder." />
          <Opcion nombre="ventana_mensajes" activa={p.ventana.mensajes} editando={editando} titulo="Mensajes que la IA no contestó"
            ayuda="Mensajes de posventa de Mercado Libre en los que a la IA le falta un dato, o el comprador pide hablar con una persona." />
          <Opcion nombre="ventana_preguntas" activa={p.ventana.preguntas} editando={editando} titulo="Preguntas que la IA no contestó"
            ayuda="Preguntas de Mercado Libre en las que a la IA le falta un dato, o el comprador pide hablar con una persona." />
          <Opcion nombre="ventana_whatsapp" activa={p.ventana.whatsapp} editando={editando} titulo="WhatsApp en espera"
            ayuda="Chats de WhatsApp que la IA dejó en espera para una persona." />
          <Opcion nombre="ventana_pedidos" activa={p.ventana.pedidos} editando={editando} titulo="Pedidos nuevos"
            ayuda="Cada pedido nuevo a preparar." />
          <Opcion nombre="ventana_facturas" activa={p.ventana.facturas} editando={editando} titulo="Facturas retenidas"
            ayuda="Un pedido que no se facturó solo porque el comprador pidió algo para la factura que no está claro, o que pide cambiar una factura ya hecha." />
          <Opcion nombre="ventana_prohibidas" activa={p.ventana.prohibidas} editando={editando} titulo="Publicaciones prohibidas"
            ayuda="Una publicación que Mercado Libre prohíbe o da de baja (en un alta masiva o en una sola), con el motivo que da Mercado Libre. Llega también a los equipos que reciben sólo lo derivado." />
          <div className="pl-6">
            <Opcion nombre="pedidos_detalle" activa={p.pedidoDetalle} editando={editando} titulo="Ver el detalle del pedido"
              ayuda="Tildada: se abre la ventana con el cliente, el total y lo que compró. Destildada: sólo aparece un cartel abajo a la derecha avisando que llegó un pedido, sin abrir ninguna ventana." />
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-2 px-2">
          <span className="text-xs">Como mucho un aviso cada</span>
          {editando
            ? <CampoNumero name="cada_min" valor={p.cadaMin} tipo="entero" className={`${CAMPO} w-16`} />
            : <ValorVista numero className="w-16">{p.cadaMin}</ValorVista>}
          <span className="text-xs">{p.cadaMin === 1 && !editando ? "minuto" : "minutos"}</span>
          <span className="block w-full text-[11px] text-[#5C6B76]">
            De 1 a {CADA_MIN_MAX}. Vale para el sonido y para los avisos de Windows: si entran varias cosas seguidas, suena una vez y el aviso de Windows las junta en uno solo.
          </span>
        </div>
        <div className="flex items-center gap-2 pt-1 px-2">
          <ProbarSonido />
          <span className="text-[11px] text-[#5C6B76]">Para escuchar cómo suena: dos notas cortas, una sola vez.</span>
        </div>
      </form>
      <div className={`${CAJA} mt-4`}>
        <TituloSeccion titulo="Avisos en la computadora y el celular, aunque no tengas Laucen abierto" />
        <p className="text-[11px] text-[#5C6B76] mb-3">
          Cuando entra un reclamo para atender o la IA no contesta algo, aparece un aviso (en la computadora, un cartel de Windows abajo a la derecha; en el
          celular, como el de cualquier app), aunque hayas cerrado Laucen. Tocándolo se abre Laucen ahí. Se activa en cada computadora o celular por
          separado, entrando a esta pantalla desde ese equipo; cada uno elige si recibe todo o sólo lo derivado a una persona. Si tenés Laucen a la
          vista, avisa la pantalla.
        </p>
        <AvisosWindows />
      </div>
      <TusEquipos usuario={s.usuario.id} org={s.org.id} />
      <p className="text-[11px] text-[#5C6B76] mt-3">
        Con las dos destildadas no suena ni se abre nada, pero igual el número de la barra de abajo se pinta de amarillo
        cuando entra algo que todavía no viste, hasta que entrás a esa pantalla.
      </p>
    </Pantalla>
  );
}

function Opcion({ nombre, activa, editando, titulo, ayuda }: { nombre: string; activa: boolean; editando: boolean; titulo: string; ayuda: string }) {
  return (
    <label className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs ${editando ? "hover:bg-[#F7F9FB] cursor-pointer" : "cursor-default"}`}>
      <input type="checkbox" name={nombre} value="1" defaultChecked={activa} disabled={!editando} className="h-4 w-4 mt-px shrink-0 accent-[#16577F]" />
      <span>
        <span className="font-semibold">{titulo}</span>
        <span className="block text-[11px] text-[#5C6B76]">{ayuda}</span>
      </span>
    </label>
  );
}

/** Los equipos con avisos activados (Fer, 25/10): de cada uno, si recibe todo o sólo lo derivado, y prenderlo,
 *  apagarlo o silenciarlo un rato. Se maneja desde cualquier equipo (por ejemplo, silenciar el celular desde la PC). */
async function TusEquipos({ usuario, org }: { usuario: string; org: string }) {
  const equipos = await equiposDelUsuario(usuario, org).catch(() => []);
  if (!equipos.length) return null;
  const hora = (d: Date) => new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className={`${CAJA} mt-4`}>
      <TituloSeccion titulo={`Tus equipos (${equipos.length})`} />
      <p className="text-[11px] text-[#5C6B76] mb-2">
        Cada computadora o celular donde activaste los avisos. Los que reciben <b>sólo lo derivado a una persona</b> avisan siempre, aunque tengas Laucen
        abierto en otro lado; para que no suenen un rato, silencialos acá (también desde otro equipo).
      </p>
      <div className="grid gap-3">
        {equipos.map((e) => (
          <div key={e.id} className="border border-[#E3E9F0] rounded-lg p-2 grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold">{e.equipo || "Equipo"} <span className="font-normal text-[11px] text-[#5C6B76]">· desde {new Date(e.creado_ts).toLocaleDateString("es-AR")}</span></span>
              <Interruptor compacto accion={accionEquipo} campos={{ id: String(e.id), que: "interruptor" }} prendido={!e.apagado}
                etiqueta={e.apagado ? "Avisos apagados" : e.silenciado_hasta ? `Silenciado hasta el ${hora(e.silenciado_hasta)}` : "Avisos prendidos"} />
            </div>
            <Interruptor compacto accion={accionEquipo} campos={{ id: String(e.id), que: e.solo ? "todo" : "solo" }} prendido={e.solo}
              etiqueta="Sólo lo derivado a una persona" ayuda="Mensajes de Mercado Libre que la IA derivó, WhatsApp en espera y reclamos. Apagado, recibe todo (como la computadora)." />
            {!e.apagado && (
              <div className="flex flex-wrap gap-2">
                {e.silenciado_hasta
                  ? <form action={accionEquipo}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="que" value="prender" /><button className={SUAVE}>Que vuelva a avisar ya</button></form>
                  : <>
                      <form action={accionEquipo}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="que" value="hora" /><button className={SUAVE}>Silenciar 1 hora</button></form>
                      <form action={accionEquipo}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="que" value="manana" /><button className={SUAVE}>Silenciar hasta mañana 8 h</button></form>
                    </>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
