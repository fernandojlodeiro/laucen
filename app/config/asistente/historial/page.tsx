// Configuración → Asistente → Historial: las conversaciones de todas las
// personas de la organización con el asistente (permiso «Ver el historial del
// asistente»). Se busca por pregunta, respuesta o persona, por fechas y "sólo
// con 👎"; tocar la pregunta abre la conversación entera abajo de la lista
// (?id=), con qué fuentes usó cada respuesta y lo que costó.

import Link from "next/link";
import { consulta, una } from "@/lib/erp/base";
import { consultaPaginada } from "@/lib/lista";
import { camposDe, elegir, ordenDe, seleccion, type Fila } from "@/lib/listas/tipos";
import BuscadorVivo, { CasillaViva } from "@/app/componentes/BuscadorVivo";
import RangoFechas from "@/app/componentes/RangoFechas";
import { SUAVE } from "@/app/botones";
import { AccionesExcel, TablaVista } from "@/app/listas/piezas";
import { entrarErp, Pantalla, Avisos, TituloSeccion, Estado, url, CAJA } from "@/app/componentes/erp";
import { formatear } from "@/lib/moneda";
import { fechaHora } from "@/app/ventas/formato";
import Texto from "@/app/componentes/asistente/Texto";
import { sosVos } from "@/lib/admin";
import { PestanasAsistente } from "../comun";
import { LISTA_ASISTENTE_HISTORIAL as LISTA, RUTA_HISTORIAL, filtrosHistorial } from "../lista";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const ESTADO_ACCION: Record<string, string> = { propuesta: "Sin confirmar", hecha: "Hecha", cancelada: "Cancelada", error: "No se pudo" };

const FUENTE: Record<string, string> = {
  buscar_manual: "buscó en el manual", leer_manual: "leyó el manual", ver_campos: "miró los campos de una lista",
  consultar_datos: "consultó datos", buscar_codigo: "buscó en el código", leer_codigo: "leyó el código", web_search: "buscó en internet",
  proponer_facturar_pedidos: "preparó una facturación", proponer_crear_cliente: "preparó un cliente", proponer_crear_pedido: "preparó un pedido",
  proponer_cambiar_estado_pedidos: "preparó un cambio de estado", anotar_pedido_sin_resolver: "anotó un pedido sin resolver",
};

export default async function HistorialAsistente({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("asistente_historial_ver");
  const sp = await searchParams;
  const ctx = { org: s.org.id, moneda: s.moneda };
  const f = filtrosHistorial(sp);
  const filtros = { q: f.q || null, contiene: f.comienza ? null : "1", desde: f.desde || null, hasta: f.hasta || null, malas: f.malas ? "1" : null };

  const todos = await camposDe(LISTA, ctx);
  const campos = elegir(LISTA, todos, null);
  const c = await LISTA.consulta!(ctx, sp);
  const { filas, total } = await consultaPaginada<Fila>({ campos: seleccion(campos, todos, LISTA.siempre), desde: c.desde, donde: c.donde, orden: ordenDe(todos, sp, c.orden) }, c.valores, sp);

  const abierta = Number(sp.id) || 0;
  const conv = abierta ? await una<{ id: number; titulo: string; persona: string; creada_ts: Date }>(`
    select c.id::int id, c.titulo, coalesce(nullif(u.nombre, ''), u.email) persona, c.creada_ts
      from asistente_conversacion c join usuarios u on u.id = c.usuario_id where c.id = $1 and c.organizacion_id = $2`, [abierta, s.org.id]) : null;
  const mensajes = conv ? await consulta<{ id: number; rol: string; texto: string; ruta: string | null; herramientas: { nombre: string }[]; usd: number; voto: number | null; error: string | null; ts: Date }>(
    "select id::int id, rol, texto, ruta, herramientas, usd::float usd, voto, error, ts from asistente_mensaje where conversacion_id = $1 order by id", [conv.id]) : [];
  const acciones = conv ? await consulta<{ id: number; mensaje_id: number | null; resumen: string; estado: string; resultado: string | null }>(
    "select id::int, mensaje_id::int, resumen, estado, resultado from asistente_accion where conversacion_id = $1 order by id", [conv.id]) : [];

  return (
    <Pantalla titulo="Asistente" subtitulo="Las preguntas que le hizo cada persona al asistente y sus respuestas" ancho="max-w-6xl"
      acciones={<AccionesExcel lista={LISTA} org={s.org.id} />}>
      <Avisos sp={sp} />
      <PestanasAsistente org={s.org.id} permisos={s.permisos} superadmin={s.superadmin || (await sosVos())} activa="historial" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={f.q} comienza={f.comienza} placeholder="Buscar por pregunta, respuesta o persona" limpiar={["id", "p"]} />
        <RangoFechas desde={f.desde} hasta={f.hasta} vacio="Todas las fechas" limpiar={["id", "p"]} />
        <CasillaViva parametro="malas" activo={f.malas} etiqueta="Sólo con 👎" />
      </div>
      <TablaVista lista={LISTA} campos={campos} filas={filas} total={total} ctx={{ moneda: s.moneda, sp }}
        vacio={f.q || f.desde || f.malas ? "Ninguna conversación coincide." : "Todavía nadie le preguntó nada al asistente."}
        claseFila={(x) => (x.id === abierta ? "bg-[#EEF3F8]" : "")} />

      {conv && (
        <section className="mt-5">
          <TituloSeccion titulo={`Conversación N.º ${conv.id} — ${conv.persona}`}>
            <Link href={`/config/asistente/conversacion/${conv.id}`} className={SUAVE}>🖨 Imprimir o PDF</Link>
            <Link href={url(RUTA_HISTORIAL, { ...filtros, p: sp.p, orden: sp.orden, dir: sp.dir })} scroll={false} className={SUAVE}>Cerrar</Link>
          </TituloSeccion>
          <div className={`${CAJA} space-y-3 text-xs leading-relaxed`}>
            {mensajes.map((m) => m.rol === "usuario" ? (
              <div key={m.id}>
                <p className="text-[10px] text-[#5C6B76]">{fechaHora(m.ts)} · {conv.persona}{m.ruta ? ` · desde ${m.ruta}` : ""}</p>
                <div className="rounded-xl bg-[#16577F] text-white px-3 py-2 inline-block max-w-full whitespace-pre-wrap break-words">{m.texto}</div>
              </div>
            ) : (
              <div key={m.id}>
                <div className={`rounded-xl px-3 py-2 ${m.error ? "bg-[#FDF0EE] text-[#8A2A1C]" : "bg-[#EEF3F8]"}`}><Texto texto={m.texto} /></div>
                {acciones.filter((a) => a.mensaje_id === m.id).map((a) => (
                  <div key={a.id} className="mt-1 rounded-lg border border-[#16577F] px-2 py-1 text-[11px]">
                    <b>Acción propuesta:</b> {a.resumen} — <Estado texto={ESTADO_ACCION[a.estado] ?? a.estado} tono={a.estado === "hecha" ? "verde" : a.estado === "error" ? "rojo" : "gris"} />
                    {a.resultado && <span className="ml-1 text-[#5C6B76]">{a.resultado.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")}</span>}
                  </div>
                ))}
                <p className="text-[10px] text-[#5C6B76] mt-0.5">
                  {m.voto === 1 ? "👍 Le sirvió · " : m.voto === -1 ? "👎 No le sirvió · " : ""}
                  {fuentes(m.herramientas)}
                  {m.usd > 0 && ` · ${formatear(m.usd, "USD")}`}
                  {m.error && m.error !== "tope" && " · falló por un problema técnico"}
                  {m.error === "tope" && " · tope del mes alcanzado"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </Pantalla>
  );
}

/** "buscó en el manual (2), consultó datos" */
function fuentes(h: { nombre: string }[]): string {
  if (!h?.length) return "contestó sin buscar";
  const cuenta = new Map<string, number>();
  for (const x of h) cuenta.set(x.nombre, (cuenta.get(x.nombre) ?? 0) + 1);
  return [...cuenta].map(([k, n]) => `${FUENTE[k] ?? k}${n > 1 ? ` (${n})` : ""}`).join(", ");
}
