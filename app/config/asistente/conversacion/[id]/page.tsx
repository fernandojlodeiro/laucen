// Una conversación con el asistente lista para imprimir o guardar en PDF
// (pedido de Fer, 3/10; orden #269): con el mismo formato del chat —
// preguntas, respuestas con sus tablas y las tarjetas de las acciones con su
// resultado—. La ve quien la tuvo, o quien tiene «Ver el historial del
// asistente». Al imprimir no sale nada del marco del sistema.

import { redirect } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { tienePermiso } from "@/lib/permisos";
import { configAsistente } from "@/lib/asistente/config";
import { entrarErp, Pantalla } from "@/app/componentes/erp";
import Carita from "@/app/componentes/asistente/Carita";
import Texto from "@/app/componentes/asistente/Texto";
import { fechaHora } from "@/app/ventas/formato";
import Imprimir from "./Imprimir";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, [string, string]> = {
  propuesta: ["Sin confirmar", "text-[#5C6B76]"], hecha: ["Hecho", "text-[#167655]"],
  cancelada: ["Cancelado", "text-[#5C6B76]"], error: ["No se pudo", "text-[#C03420]"],
};

export default async function ConversacionImprimible({ params }: { params: Promise<{ id: string }> }) {
  const s = await entrarErp("asistente_usar");
  const { id } = await params;
  const conv = await una<{ id: number; usuario_id: string; persona: string; creada_ts: Date }>(`
    select c.id::int, c.usuario_id, coalesce(nullif(u.nombre, ''), u.email) persona, c.creada_ts
      from asistente_conversacion c join usuarios u on u.id = c.usuario_id where c.id = $1 and c.organizacion_id = $2`, [Number(id) || 0, s.org.id]);
  if (!conv || (conv.usuario_id !== s.usuario.id && !tienePermiso(s.permisos, "asistente_historial_ver"))) redirect("/panel");
  const [config, mensajes, acciones] = await Promise.all([
    configAsistente(s.org.id),
    consulta<{ id: number; rol: string; texto: string; ts: Date }>(
      "select id::int, rol, texto, ts from asistente_mensaje where conversacion_id = $1 order by id", [conv.id]),
    consulta<{ id: number; mensaje_id: number | null; resumen: string; detalle: string[]; estado: string; resultado: string | null }>(
      "select id::int, mensaje_id::int, resumen, detalle, estado, resultado from asistente_accion where conversacion_id = $1 order by id", [conv.id]),
  ]);
  // Los avisos de resultado ("✅ …") ya salen dentro de su tarjeta.
  const conTarjeta = new Set(acciones.filter((a) => a.resultado).map((a) => a.resultado!));
  const visibles = mensajes.filter((m) => !(m.rol === "asistente" && conTarjeta.has(m.texto.replace(/^(✅|⚠️|✖️)\s*/u, ""))));

  return (
    <Pantalla titulo={`Conversación con ${config.nombre}`} subtitulo={`${conv.persona} · ${fechaHora(conv.creada_ts)}`} ancho="max-w-3xl"
      camino={[{ texto: "Historial", href: "/config/asistente/historial" }, { texto: `Conversación N.º ${conv.id}` }]}
      acciones={<Imprimir />}>
      <div className="bg-white border border-[#E3E9F0] rounded-2xl p-4 space-y-3 text-xs leading-relaxed print:border-0 print:p-0">
        <div className="flex items-center gap-2 pb-2 border-b border-[#E3E9F0]">
          <Carita tamano={36} carita={config.carita} />
          <div>
            <p className="text-sm font-bold text-[#16577F] leading-tight">{config.nombre}</p>
            <p className="text-[10px] text-[#5C6B76] leading-tight">Asistente de {s.org.nombre}</p>
          </div>
        </div>
        {visibles.map((m) => m.rol === "usuario" ? (
          <div key={m.id} className="flex justify-end break-inside-avoid">
            <div className="max-w-[85%]">
              <p className="text-[10px] text-right text-[#5C6B76] mb-0.5">{conv.persona} · {fechaHora(m.ts)}</p>
              <div className="rounded-2xl rounded-tr-sm bg-[#16577F] text-white px-3 py-2 whitespace-pre-wrap break-words print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]">{m.texto}</div>
            </div>
          </div>
        ) : (
          <div key={m.id} className="flex gap-2 break-inside-avoid">
            <Carita tamano={24} carita={config.carita} />
            <div className="max-w-[85%]">
              <div className="rounded-2xl rounded-tl-sm px-3 py-2 bg-[#EEF3F8] print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]"><Texto texto={m.texto} /></div>
              {acciones.filter((a) => a.mensaje_id === m.id).map((a) => {
                const [texto, tono] = ESTADO[a.estado] ?? [a.estado, ""];
                return (
                  <div key={a.id} className="mt-2 rounded-xl border border-[#16577F] bg-white px-3 py-2 break-inside-avoid">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#16577F]">Para confirmar</p>
                    <p className="font-semibold">{a.resumen}</p>
                    {a.detalle.length > 0 && <ul className="mt-1 list-disc pl-4 text-[11px] text-[#334155] space-y-0.5">{a.detalle.map((d, i) => <li key={i}>{d}</li>)}</ul>}
                    <p className={`mt-1 text-[11px] font-semibold ${tono}`}>{texto}</p>
                    {a.resultado && <div className="mt-1 text-[11px]"><Texto texto={a.resultado} /></div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {visibles.length === 0 && <p className="text-[#5C6B76]">La conversación está vacía.</p>}
      </div>
    </Pantalla>
  );
}
