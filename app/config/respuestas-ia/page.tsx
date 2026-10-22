// Configuración › Respuestas de la IA (pedido de Fer, 13/10): las reglas que la IA
// respeta al contestar preguntas y mensajes de Mercado Libre y los WhatsApp. Una
// sola para toda la empresa; la firma de cada respuesta sigue siendo de cada canal
// (Configuración › Canales, caja «Textos de …»). Abre en vista; lápiz arriba a la derecha.

import Link from "next/link";
import { reglasIaEmpresa } from "@/lib/canales/textos";
import { entrarErp, Pantalla, Avisos, BotonesFicha, ValorVista, editandoFicha, CAJA, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { accionGuardarReglasIa } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { editar?: string; ok?: string; error?: string };
const VOLVER = "/config/respuestas-ia";
const ALTO = "h-96 !max-h-96";

export default async function RespuestasIa({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("empresa_config");
  const sp = await searchParams;
  const reglas = await reglasIaEmpresa(s.org.id);
  const editando = editandoFicha(sp, "reglas");
  return (
    <Pantalla titulo="Respuestas de la IA" ancho="max-w-4xl"
      subtitulo="Las reglas que la IA respeta al contestar preguntas y mensajes de Mercado Libre y WhatsApp, iguales para todos los canales"
      acciones={<BotonesFicha editando={editando} ver={VOLVER} editar={`${VOLVER}?editar=reglas`} form="reglas" />}>
      <Avisos sp={sp} />
      <section className={CAJA}>
        <span className={ETIQUETA}>Reglas para la IA</span>
        {editando ? (
          <form id="reglas" action={accionGuardarReglasIa}>
            <textarea name="reglas" defaultValue={reglas} autoFocus className={`${CAMPO} w-full leading-relaxed resize-y ${ALTO}`} />
          </form>
        ) : (
          <ValorVista largo className={ALTO}>{reglas}</ValorVista>
        )}
        <p className="text-[11px] text-[#5C6B76] mt-1">
          Una regla por renglón. Valen por encima de las instrucciones de siempre de la IA, en todas las cuentas de Mercado Libre y en WhatsApp.
          Ej.: «Nunca sugerir abrir un reclamo ni una mediación en Mercado Libre». La firma del final de cada respuesta es de cada canal:
          se carga en <Link href="/config/canales" className="text-[#16577F] hover:underline">Canales</Link>, caja «Textos de …».
        </p>
      </section>
    </Pantalla>
  );
}
