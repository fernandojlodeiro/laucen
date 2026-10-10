// Configuración › Mis avisos (pedido de Fer, 10/10): cada persona elige cómo
// se entera de lo que entra (lib/avisos.ts). Es sólo de quien la abre.

import { sesionRequerida } from "@/lib/tenancy";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { prefsAvisos } from "@/lib/avisos";
import { Pantalla, Avisos, BotonesFicha, editandoFicha, TituloSeccion, ValorVista, CAJA, CAMPO } from "@/app/componentes/erp";
import CampoNumero from "@/app/componentes/CampoNumero";
import { CADA_MIN_MAX } from "@/lib/avisos-tipos";
import AvisosWindows from "./AvisosWindows";
import { accionGuardarAvisos } from "./acciones";
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
    <Pantalla titulo="Mis avisos" subtitulo="Cómo te enterás de los pedidos, preguntas y mensajes que entran. Se aplica sólo a tu usuario" ancho="max-w-xl"
      acciones={<BotonesFicha editando={editando} ver={VOLVER} editar={`${VOLVER}?editar=ficha`} />}>
      <Avisos sp={sp} />
      <form id="ficha" action={accionGuardarAvisos} className={`${CAJA} grid gap-3`}>
        <Opcion nombre="sonido" activa={p.sonido} editando={editando} titulo="Sonar cuando entra algo"
          ayuda="Suena un aviso corto cuando entra un pedido, una pregunta, un mensaje o un WhatsApp en espera, y cuando la IA deja algo sin contestar." />
        <Opcion nombre="ventana" activa={p.ventana} editando={editando} titulo="Abrirme una ventana con lo que la IA no contestó"
          ayuda="Cuando la IA no contesta una pregunta o un mensaje porque le falta un dato, o porque el cliente pide hablar con una persona, se abre sola una ventana con lo que escribió el cliente y el botón «Ir a responder»." />
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
        <TituloSeccion titulo="Avisos de Windows, aunque no tengas Laucen abierto" />
        <p className="text-[11px] text-[#5C6B76] mb-3">
          Cuando la IA no contesta algo, aparece un cartel de Windows abajo a la derecha (con el sonido de Windows), aunque hayas cerrado
          Laucen. Tocándolo se abre Laucen ahí. Se activa en cada computadora o celular por separado. Si tenés Laucen a la vista, avisa la
          pantalla y no Windows.
        </p>
        <AvisosWindows />
      </div>
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
