// Configuración → Asistente (pedido de Fer, 3/10): cómo se llama el
// asistente de la organización, si se ve la carita o el signo de pregunta,
// si contesta preguntas fuera del sistema (buscando en internet) y el tope de
// gasto por mes. Abre en vista; se edita con el lápiz (?editar=ficha). La
// pestaña Historial tiene las conversaciones (./historial).

import { entrarErp, Pantalla, Avisos, Dato, BotonesFicha, editandoFicha, CAMPO, ETIQUETA, CAJA } from "@/app/componentes/erp";
import CampoNumero from "@/app/componentes/CampoNumero";
import { InterruptorCampo } from "@/app/administracion/contabilidad/piezas";
import { formatear } from "@/lib/moneda";
import { configAsistente, gastoDelMes } from "@/lib/asistente/config";
import Carita from "@/app/componentes/asistente/Carita";
import { PestanasAsistente, InterruptorVista } from "./comun";
import { accionGuardarAsistente } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { editar?: string; ok?: string; error?: string };
const AYUDA = "block text-[11px] text-[#5C6B76] mt-0.5";
const VOLVER = "/config/asistente";

export default async function ConfigAsistente({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("asistente_config");
  const sp = await searchParams;
  const [c, gasto] = await Promise.all([configAsistente(s.org.id), gastoDelMes(s.org.id)]);
  const editando = editandoFicha(sp);

  return (
    <Pantalla titulo="Asistente" subtitulo="La carita de abajo a la derecha: contesta cómo se hace cada cosa, dónde está y datos del sistema" ancho="max-w-4xl"
      acciones={<BotonesFicha editando={editando} ver={VOLVER} editar={`${VOLVER}?editar=ficha`} />}>
      <Avisos sp={sp} />
      <PestanasAsistente org={s.org.id} permisos={s.permisos} activa="config" />

      {!editando ? (
        <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start`}>
          <Dato etiqueta="Nombre" ayuda="Así se presenta y así aparece en el chat.">{c.nombre}</Dato>
          <div>
            <span className={ETIQUETA}>Cómo se ve</span>
            <div className="flex items-center gap-3">
              <Carita tamano={40} carita={c.carita} />
              <InterruptorVista prendido={c.carita} etiqueta="Carita (si no, un signo de pregunta)" />
            </div>
          </div>
          <Dato etiqueta="Tope de gasto por mes (US$)" numero ayuda={`Este mes van ${formatear(gasto, "USD")}. Al llegar al tope deja de contestar hasta el mes que viene.`}>
            {formatear(c.topeUsd, "USD")}
          </Dato>
          <div className="sm:col-span-3">
            <span className={ETIQUETA}>Preguntas fuera del sistema</span>
            <InterruptorVista prendido={c.fueraDelSistema} etiqueta={c.fueraDelSistema
              ? "Prendido: contesta también preguntas generales y busca en internet si hace falta"
              : "Apagado: sólo contesta sobre el sistema y sus datos"} />
          </div>
        </div>
      ) : (
        <form id="ficha" action={accionGuardarAsistente} className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start`}>
          <label><span className={ETIQUETA}>Nombre</span>
            <input name="nombre" autoFocus defaultValue={c.nombre} maxLength={40} className={`${CAMPO} w-full`} />
            <span className={AYUDA}>Así se presenta y así aparece en el chat.</span></label>
          <div>
            <span className={ETIQUETA}>Cómo se ve</span>
            <div className="flex items-center gap-3 min-h-[30px]">
              <Carita tamano={40} carita={c.carita} />
              <InterruptorCampo name="carita" prendido={c.carita} etiqueta="Carita (si no, un signo de pregunta)" />
            </div>
          </div>
          <label><span className={ETIQUETA}>Tope de gasto por mes (US$)</span>
            <CampoNumero name="tope" valor={c.topeUsd} tipo="usd" className={`${CAMPO} w-full`} />
            <span className={AYUDA}>Este mes van {formatear(gasto, "USD")}. 0 lo apaga.</span></label>
          <div className="sm:col-span-3">
            <span className={ETIQUETA}>Preguntas fuera del sistema</span>
            <InterruptorCampo name="fuera" prendido={c.fueraDelSistema} etiqueta="Contestar también preguntas generales (impuestos, comercio, Mercado Libre en general…) y buscar en internet si hace falta" />
            <span className={AYUDA}>Apagado, a lo que no es del sistema contesta que no lo puede responder.</span>
          </div>
        </form>
      )}

      <div className="text-[11px] text-[#5C6B76] mt-4 space-y-1">
        <p>Cada persona lo usa si su rol tiene el permiso «Asistente» (viene prendido). Sólo le explica las pantallas y los datos que su rol le deja ver, y nunca cambia nada: explica cómo hacerlo.</p>
        <p>Sabe lo que dice el manual del sistema, consulta los datos de la organización y, si hace falta, revisa cómo funciona el sistema por dentro para explicar un criterio.</p>
      </div>
    </Pantalla>
  );
}
