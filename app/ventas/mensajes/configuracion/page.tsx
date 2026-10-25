// Ventas › WhatsApp › Configuración: el número conectado (alta embebida de
// Meta con coexistencia: sigue andando en el teléfono), el interruptor de la
// IA para todos los chats y su ficha (nombre, lo que sabe para los clientes,
// tope de gasto, límite por hora, marca del teléfono y espera). Abre en
// vista; se edita con el lápiz.

import { entrarErp, Pantalla, Avisos, Dato, BotonesFicha, editandoFicha, CAMPO, ETIQUETA, CAJA, TituloSeccion } from "@/app/componentes/erp";
import CampoNumero from "@/app/componentes/CampoNumero";
import { Interruptor } from "@/app/radar/Piezas";
import { PRIMARIO, SUAVE, BORRAR } from "@/app/botones";
import { formatear } from "@/lib/moneda";
import { configMensajes, gastoMensajesDelMes } from "@/lib/mensajes/config";
import { credencialDeOrg } from "@/lib/mensajes/chats";
import { hayAppDeMeta } from "@/lib/mensajes/meta";
import { PestanasMensajes } from "../comun";
import { accionDesconectar, accionElegirNumero, accionGuardarMensajes, accionIaGeneral } from "./acciones";
import { pendienteDe } from "@/lib/mensajes/alta";

export const dynamic = "force-dynamic";

type SP = { editar?: string; ok?: string; error?: string; wa?: string; alta?: string };
const VOLVER = "/ventas/mensajes/configuracion";
const AYUDA = "block text-[11px] text-[#5C6B76] mt-0.5";

const VUELTA: Record<string, { ok: boolean; texto: string }> = {
  conectado: { ok: true, texto: "¡WhatsApp conectado! Desde ahora los mensajes llegan acá y los contesta la IA." },
  cancelado: { ok: false, texto: "Se canceló la conexión con WhatsApp antes de terminar." },
  rechazo: { ok: false, texto: "Meta no dio el permiso. Probá de nuevo y aceptá todos los pasos." },
  estado: { ok: false, texto: "La conexión tardó demasiado o vino de otro lado. Empezala de nuevo." },
  canje: { ok: false, texto: "Meta no terminó de dar el permiso. Probá de nuevo en un rato." },
  sin_cuenta: { ok: false, texto: "No se eligió ninguna cuenta de WhatsApp en Meta. Probá de nuevo y elegí la del negocio." },
  sin_numero: { ok: false, texto: "La cuenta de WhatsApp no tiene un número. Probá de nuevo." },
  otro_dueno: { ok: false, texto: "Ese número ya está conectado a otra organización." },
  webhooks: { ok: false, texto: "Se conectó, pero Meta no aceptó mandar los mensajes a Laucen. Probá de nuevo; si sigue, avisá." },
  sinpermiso: { ok: false, texto: "Tu rol no puede conectar el WhatsApp." },
  sinapp: { ok: false, texto: "La conexión con Meta todavía no está lista del lado de Laucen." },
  elegir: { ok: true, texto: "Meta dio permiso sobre más de un número: elegí abajo cuál conectar." },
  ocupado: { ok: false, texto: "Ese número está en una cuenta de WhatsApp que ya usa otro sistema: conectarlo le cortaría los mensajes. Hay que pasarlo a una cuenta propia en Meta." },
};

export default async function ConfigMensajes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("mensajes_config");
  const sp = await searchParams;
  const [c, gasto, cred] = await Promise.all([configMensajes(s.org.id), gastoMensajesDelMes(s.org.id), credencialDeOrg(s.org.id)]);
  const editando = editandoFicha(sp);
  const vuelta = sp.wa ? VUELTA[sp.wa] : null;
  const lista = hayAppDeMeta();
  // Meta dio permiso sobre varios números (bitácora #868): se elige cuál conectar.
  const pendiente = sp.alta ? await pendienteDe(s.org.id, Number(sp.alta) || 0) : null;

  return (
    <Pantalla titulo="WhatsApp" subtitulo="El número conectado y la IA que contesta los mensajes" ancho="max-w-4xl">
      <Avisos sp={sp} />
      {vuelta && <p className={`text-xs rounded-lg px-3 py-2 mb-3 ${vuelta.ok ? "bg-[#E8F5EE] text-[#167655]" : "bg-[#FDF0E6] text-[#8a6100]"}`}>{vuelta.texto}</p>}
      <PestanasMensajes org={s.org.id} permisos={s.permisos} superadmin={s.superadmin} activa="config" />

      {pendiente && (
        <div className={`${CAJA} mb-4 text-xs space-y-2`}>
          <p className="font-semibold">¿Qué número conectás a Laucen?</p>
          <ul className="space-y-1.5">
            {pendiente.opciones.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{o.numero || o.id}</span>{o.nombre && <span>· {o.nombre}</span>}
                {o.ocupado
                  ? <span className="text-[#8a6100]">Ya lo usa otro sistema: no se puede conectar acá.</span>
                  : <form action={accionElegirNumero}>
                      <input type="hidden" name="alta" value={pendiente.id} />
                      <input type="hidden" name="telefono" value={o.id} />
                      <button className={PRIMARIO}>Conectar este número</button>
                    </form>}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-[#5C6B76]">Si el número que querés no está en la lista, empezá de nuevo con «Conectar WhatsApp».</p>
        </div>
      )}

      <TituloSeccion titulo="El número de WhatsApp" />
      <div className={`${CAJA} mb-4 text-xs space-y-2`}>
        {cred ? (
          <>
            <p><b>{cred.numero || cred.phoneNumberId}</b>{cred.nombre ? ` · ${cred.nombre}` : ""} — conectado{cred.coexistencia ? " con coexistencia: sigue andando en el teléfono, y lo que contesten desde ahí también aparece en Chats" : " sólo a Laucen"}.</p>
            <div className="flex flex-wrap gap-2 items-center">
              <a href="/api/whatsapp/conectar/ir" className={SUAVE}>Volver a conectar</a>
              <details className="inline-block">
                <summary className={`${BORRAR} list-none cursor-pointer inline-block`}>Desconectar</summary>
                <form action={accionDesconectar} className="inline-flex items-center gap-2 ml-2">
                  <span>¿Desconectar? Laucen deja de recibir y contestar; el teléfono sigue andando.</span>
                  <button className={BORRAR}>Sí</button>
                </form>
              </details>
            </div>
          </>
        ) : (
          <>
            <p>Todavía no hay un número conectado. Al conectar se abre Meta: elegís la cuenta de WhatsApp Business del negocio y escaneás un código con el teléfono. El número <b>sigue andando en el teléfono</b> (coexistencia) y además los mensajes llegan acá.</p>
            {lista
              ? <a href="/api/whatsapp/conectar/ir" className={`${PRIMARIO} inline-block`}>Conectar WhatsApp</a>
              : <span className={`${PRIMARIO} inline-block opacity-40 cursor-not-allowed`} title="próximamente">Conectar WhatsApp (próximamente)</span>}
          </>
        )}
      </div>

      <TituloSeccion titulo="La IA que contesta">
        <BotonesFicha editando={editando} ver={VOLVER} editar={`${VOLVER}?editar=ficha`} />
      </TituloSeccion>
      <div className={`${CAJA} mb-3`}>
        <Interruptor accion={accionIaGeneral} campos={{}} prendido={c.iaActiva}
          etiqueta={c.iaActiva ? `Prendida: ${c.nombre} contesta todos los chats (salvo los que tome una persona)` : `Apagada: ${c.nombre} no contesta ningún chat`}
          ayuda="Se prende y se apaga con un clic. Cada chat tiene además su propio interruptor." />
      </div>
      {!editando ? (
        <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-4 gap-3 items-start`}>
          <Dato etiqueta="Nombre" ayuda="Así se presenta.">{c.nombre}</Dato>
          <Dato etiqueta="Tope por mes (US$)" numero ayuda={`Este mes van ${formatear(gasto, "USD")}.`}>{formatear(c.topeUsd, "USD")}</Dato>
          <Dato etiqueta="Respuestas por hora y chat" numero ayuda="Pasado eso, deja el chat en espera.">{c.porHora}</Dato>
          <Dato etiqueta="Espera (segundos)" numero ayuda="A que el cliente termine de escribir.">{c.esperaSeg}</Dato>
          <Dato etiqueta="Marca del teléfono" ayuda="Un mensaje desde el teléfono que empieza con esto prende o apaga la IA de ese chat.">{c.marca}</Dato>
          <Dato etiqueta="Lo que sabe para los clientes" largo className="sm:col-span-4"
            ayuda="Envíos, formas de pago, horarios, garantía, preguntas frecuentes… Los productos, precios y stock los consulta sola de la tienda web.">{c.info || "—"}</Dato>
        </div>
      ) : (
        <form id="ficha" action={accionGuardarMensajes} className={`${CAJA} grid grid-cols-1 sm:grid-cols-4 gap-3 items-start`}>
          <label><span className={ETIQUETA}>Nombre</span>
            <input name="nombre" autoFocus defaultValue={c.nombre} maxLength={40} className={`${CAMPO} w-full`} />
            <span className={AYUDA}>Así se presenta.</span></label>
          <label><span className={ETIQUETA}>Tope por mes (US$)</span>
            <CampoNumero name="tope" valor={c.topeUsd} tipo="usd" className={`${CAMPO} w-full`} />
            <span className={AYUDA}>Este mes van {formatear(gasto, "USD")}. 0 la apaga.</span></label>
          <label><span className={ETIQUETA}>Respuestas por hora y chat</span>
            <CampoNumero name="por_hora" valor={c.porHora} tipo="entero" className={`${CAMPO} w-full`} />
            <span className={AYUDA}>Pasado eso, deja el chat en espera.</span></label>
          <label><span className={ETIQUETA}>Espera (segundos)</span>
            <CampoNumero name="espera" valor={c.esperaSeg} tipo="entero" className={`${CAMPO} w-full`} />
            <span className={AYUDA}>A que el cliente termine de escribir.</span></label>
          <label><span className={ETIQUETA}>Marca del teléfono</span>
            <input name="marca" defaultValue={c.marca} maxLength={4} className={`${CAMPO} w-full`} />
            <span className={AYUDA}>Sin letras ni números (ej. *).</span></label>
          <label className="sm:col-span-4"><span className={ETIQUETA}>Lo que sabe para los clientes</span>
            <textarea name="info" defaultValue={c.info} rows={10} className={`${CAMPO} w-full leading-relaxed`}
              placeholder={"Ej.:\n- Enviamos a todo el país por Correo Argentino, llega en 3 a 6 días hábiles.\n- Se puede retirar en el local de lunes a viernes de 9 a 18.\n- Hacemos factura A.\n- Garantía de 6 meses por falla de fábrica."} />
            <span className={AYUDA}>Los productos, precios y stock los consulta sola de la tienda web; acá va lo demás.</span></label>
        </form>
      )}
      <div className="text-[11px] text-[#5C6B76] mt-4 space-y-1">
        <p>La IA contesta siempre; lo que no sabe resolver (un reclamo, una devolución, un precio especial, o si piden hablar con una persona) lo deja <b>En espera</b> en Chats y sigue atendiendo lo demás. Desde el panel o desde el teléfono, cualquiera puede contestar; para que la IA no se meta, se apaga el interruptor del chat (o se escribe desde el teléfono un mensaje que empiece con la marca).</p>
      </div>
    </Pantalla>
  );
}
