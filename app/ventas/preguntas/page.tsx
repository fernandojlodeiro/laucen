// Preguntas y mensajes de Mercado Libre, de todas las cuentas en una bandeja.
// La IA propone la respuesta (con la ficha y el stock); el operador la
// revisa, la cambia si hace falta y la manda. Con el interruptor "Responde
// sola la IA" de cada pestaña prendido (Fer, 5/10), la IA la manda sola.

import { BotonTarea } from "@/app/componentes/TareasFondo";
import Link from "next/link";
import { consulta, una } from "@/lib/erp/base";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import Pestanas from "@/app/componentes/Pestanas";
import { entrarErp, Pantalla, Avisos, Estado, url, CAJA, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { fechaHora } from "@/app/ventas/formato";
import { Interruptor } from "@/app/radar/Piezas";
import { respuestaAuto } from "@/lib/mercadolibre/respuesta-auto";
import {
  accionTraerPreguntas, accionProponerRespuesta, accionResponder,
  accionActualizarConversacion, accionProponerMensaje, accionEnviarMensaje, accionRespuestaAuto,
} from "./acciones";

export const dynamic = "force-dynamic";
// Las tareas de fondo de sus botones corren hasta este tope.
export const maxDuration = 120;

type SP = { ver?: string; canal?: string; pack?: string; ok?: string; error?: string };

/** "hace 5 min", "hace 3 h", "hace 2 días". */
function haceCuanto(d: Date | string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  return `hace ${dias} día${dias === 1 ? "" : "s"}`;
}

export default async function PreguntasYMensajes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("preguntas_ver");
  const sp = await searchParams;
  const ver = sp.ver === "mensajes" ? "mensajes" : sp.ver === "respondidas" ? "respondidas" : "preguntas";
  // ?canal= viene del tablero de Mercado Libre: sólo las de esa cuenta.
  const canal = Number(sp.canal) || null;
  const cuentas = await consulta<{ pendientes: number; respondidas: number; sin_leer: number }>(`
    select (select count(*) from meli_pregunta where organizacion_id = $1 and estado = 'UNANSWERED' and ($2::bigint is null or canal_id = $2))::int pendientes,
           (select count(*) from meli_pregunta where organizacion_id = $1 and estado = 'ANSWERED' and ($2::bigint is null or canal_id = $2))::int respondidas,
           (select count(*) from meli_conversacion where organizacion_id = $1 and sin_leer > 0 and ($2::bigint is null or canal_id = $2))::int sin_leer`, [s.org.id, canal]);
  const { pendientes, respondidas, sin_leer } = cuentas[0] ?? { pendientes: 0, respondidas: 0, sin_leer: 0 };
  const auto = await respuestaAuto(s.org.id);
  const cual = ver === "mensajes" ? "mensajes" : "preguntas";

  return (
    <Pantalla titulo="Preguntas y mensajes" subtitulo="Lo que preguntan y escriben los compradores de Mercado Libre, de todas las cuentas"
      acciones={(
        <div className="flex flex-wrap items-center gap-3">
          {/* Uno para preguntas y otro para mensajes, generales (todas las cuentas). */}
          <Interruptor accion={accionRespuestaAuto} campos={{ cual }} prendido={auto[cual]}
            etiqueta={cual === "mensajes" ? "La IA contesta sola los mensajes" : "La IA contesta sola las preguntas"} />
          {ver !== "mensajes" && (
            <BotonTarea accion={accionTraerPreguntas} tipo="preguntas-ml" clase={SUAVE} texto="Traer preguntas ahora" />
          )}
        </div>
      )}>
      <Avisos sp={sp} />
      {/* La cuenta de cada pestaña es lo que espera: preguntas sin responder, conversaciones sin leer. */}
      <Pestanas items={[
        { href: url("/ventas/preguntas", { canal }), texto: "Preguntas", activa: ver !== "mensajes", cuenta: pendientes },
        { href: url("/ventas/preguntas", { ver: "mensajes", canal }), texto: "Mensajes", activa: ver === "mensajes", cuenta: sin_leer },
      ]} />
      {ver === "mensajes" ? <Mensajes org={s.org.id} pack={sp.pack} canal={canal} auto={auto.mensajes} />
        : (
          <>
            <Pestanas chica className="mb-3" items={[
              { href: url("/ventas/preguntas", { canal }), texto: "Sin responder", activa: ver === "preguntas", cuenta: pendientes },
              { href: url("/ventas/preguntas", { ver: "respondidas", canal }), texto: "Respondidas", activa: ver === "respondidas", cuenta: respondidas },
            ]} />
            {ver === "preguntas" ? <SinResponder org={s.org.id} canal={canal} auto={auto.preguntas} /> : <Respondidas org={s.org.id} canal={canal} />}
          </>
        )}
    </Pantalla>
  );
}

type Pregunta = {
  id: string; canal: string | null; firma: string | null; item_id: string; titulo: string | null; foto: string | null; permalink: string | null;
  texto: string; fecha: Date; sugerencia: string | null; vinculada: boolean; disponible: number | null;
  respuesta: string | null; respondida_ts: Date | null; respondida_por: string | null; respondida_con_ia: boolean;
  ia_estado: string | null; respondida_auto: boolean;
};

/** La publicación de la pregunta: foto y link de meli_item (la primera fila
 *  del item), título de ahí o de la publicación de Laucen, y el stock del canal. */
const DE_PREGUNTA = `
  select q.id::text, ca.nombre canal, nullif(trim(ca.config ->> 'firma'), '') firma, q.item_id, coalesce(mi.titulo, pu.titulo) titulo, mi.foto, mi.permalink, q.texto, q.fecha, q.sugerencia,
         (pu.id is not null) vinculada,
         case when pu.id is not null then greatest(stock_disponible_canal(q.organizacion_id, pu.variacion_id, pu.canal_id), 0)::int end disponible,
         q.respuesta, q.respondida_ts, u.nombre respondida_por, q.respondida_con_ia, q.ia_estado, q.respondida_auto
    from meli_pregunta q
    left join canal ca on ca.id = q.canal_id
    left join publicacion pu on pu.id = q.publicacion_id and pu.organizacion_id = q.organizacion_id
    left join lateral (select titulo, foto, permalink from meli_item m
                        where m.organizacion_id = q.organizacion_id and m.item_id = q.item_id and (q.canal_id is null or m.canal_id = q.canal_id)
                        order by m.variation_id limit 1) mi on true
    left join usuarios u on u.id = q.respondida_por`;

function Publicacion({ q }: { q: Pregunta }) {
  return (
    <div className="flex items-start gap-3">
      {q.foto
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={q.foto} alt="" className="h-14 w-14 rounded-lg object-cover border border-[#E3E9F0] bg-white shrink-0" />
        : <div className="h-14 w-14 rounded-lg border border-[#E3E9F0] bg-[#FAFBFC] shrink-0" />}
      <div className="min-w-0 text-xs">
        <div className="font-semibold truncate">{q.titulo ?? q.item_id}</div>
        <div className="text-[#5C6B76] flex flex-wrap gap-x-2">
          <span>{q.canal ?? "—"}</span>
          {q.permalink
            ? <a href={q.permalink} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline font-mono">{q.item_id} ↗</a>
            : <span className="font-mono">{q.item_id}</span>}
          {q.vinculada
            ? <span>Stock del canal: <b className="tabular-nums">{q.disponible ?? 0}</b></span>
            : <span>Sin vincular a un producto</span>}
        </div>
      </div>
    </div>
  );
}

/** Por qué la IA no la mandó sola (con el interruptor prendido) o qué hay que mirar. */
function AvisoIa({ estado, auto, conversacion }: { estado: string | null; auto: boolean; conversacion?: boolean }) {
  if (estado === "persona") return <Estado texto={conversacion ? "Pidió hablar con una persona: la IA no contesta más sola" : "Pide hablar con una persona"} tono="ambar" />;
  if (estado === "falta_dato" && auto) return <Estado texto="La IA no la mandó sola: le falta un dato" tono="ambar" />;
  return null;
}

async function SinResponder({ org, canal, auto }: { org: string; canal: number | null; auto: boolean }) {
  const filas = await consulta<Pregunta>(`${DE_PREGUNTA} where q.organizacion_id = $1 and q.estado = 'UNANSWERED' and ($2::bigint is null or q.canal_id = $2) order by q.fecha asc limit 200`, [org, canal]);
  if (filas.length === 0) return <p className={`${CAJA} text-xs text-[#5C6B76]`}>No hay preguntas sin responder.</p>;
  return (
    <div className="space-y-3">
      {filas.map((q) => (
        <section key={q.id} className={CAJA}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Publicacion q={q} />
            <span className="text-[11px] text-[#5C6B76] whitespace-nowrap" title={fechaHora(q.fecha)}>{haceCuanto(q.fecha)}</span>
          </div>
          <p className="mt-2 text-sm rounded-lg bg-[#FAFBFC] border border-[#E3E9F0] px-3 py-2">{q.texto}</p>
          {q.sugerencia && <div className="mt-2"><AvisoIa estado={q.ia_estado} auto={auto} /></div>}
          <form action={accionResponder} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={q.id} />
            <label className="block">
              <span className={ETIQUETA}>Respuesta{q.sugerencia ? " (la propuso la IA: revisala)" : ""}</span>
              <textarea name="texto" defaultValue={q.sugerencia ?? ""} rows={3} maxLength={2000} className={`${CAMPO} w-full`} />
              {q.firma && <span className="text-[11px] text-[#5C6B76]">Al mandarla se agrega al final la firma «{q.firma}» (si no la tiene).</span>}
            </label>
            <div className="flex flex-wrap gap-2">
              <button formAction={accionProponerRespuesta} className={SUAVE}>Proponer con IA</button>
              <BotonEnviar clase={PRIMARIO} corriendo="Enviando…">Responder</BotonEnviar>
            </div>
          </form>
        </section>
      ))}
    </div>
  );
}

async function Respondidas({ org, canal }: { org: string; canal: number | null }) {
  const filas = await consulta<Pregunta>(
    `${DE_PREGUNTA} where q.organizacion_id = $1 and q.estado = 'ANSWERED' and ($2::bigint is null or q.canal_id = $2) order by q.respondida_ts desc nulls last, q.fecha desc limit 100`, [org, canal]);
  if (filas.length === 0) return <p className={`${CAJA} text-xs text-[#5C6B76]`}>Todavía no hay preguntas respondidas.</p>;
  return (
    <div className="space-y-3">
      {filas.map((q) => (
        <section key={q.id} className={CAJA}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Publicacion q={q} />
            <span className="text-[11px] text-[#5C6B76] whitespace-nowrap">{fechaHora(q.fecha)}</span>
          </div>
          <p className="mt-2 text-sm"><span className="text-[#5C6B76]">Pregunta: </span>{q.texto}</p>
          <p className="mt-1 text-sm rounded-lg bg-[#EEF7F1] px-3 py-2">{q.respuesta}</p>
          <p className="mt-1 text-[11px] text-[#5C6B76]">
            {q.respondida_auto ? "Respondió la IA sola" : <>Respondió {q.respondida_por ?? "alguien desde Mercado Libre"}{q.respondida_por && q.respondida_con_ia ? " con la IA" : ""}</>}{q.respondida_ts ? ` · ${fechaHora(q.respondida_ts)}` : ""}
          </p>
        </section>
      ))}
    </div>
  );
}

async function Mensajes({ org, pack, canal, auto }: { org: string; pack?: string; canal: number | null; auto: boolean }) {
  // Abrir una conversación la da por leída en Laucen (en ML se marca al
  // contestar o al tocar "Actualizar").
  if (pack) await consulta("update meli_conversacion set sin_leer = 0 where organizacion_id = $1 and pack_id = $2 and sin_leer > 0", [org, pack]);
  const conversaciones = await consulta<{
    pack_id: string; canal: string | null; firma: string | null; pedido_id: number | null; cliente: string | null; sin_leer: number; ultimo_ts: Date | null; ultimo: string | null;
    pidio_persona: boolean;
  }>(`
    select c.pack_id, ca.nombre canal, nullif(trim(ca.config ->> 'firma'), '') firma, c.pedido_id::int, cl.nombre cliente, c.sin_leer, c.ultimo_ts, (c.pidio_persona_ts is not null) pidio_persona,
           (select m.texto from meli_mensaje m where m.organizacion_id = c.organizacion_id and m.pack_id = c.pack_id order by m.fecha desc limit 1) ultimo
      from meli_conversacion c
      left join canal ca on ca.id = c.canal_id
      left join pedido p on p.id = c.pedido_id
      left join cliente cl on cl.id = p.cliente_id
     where c.organizacion_id = $1 and ($2::bigint is null or c.canal_id = $2)
     order by (c.sin_leer > 0) desc, c.ultimo_ts desc nulls last
     limit 100`, [org, canal]);
  const elegida = pack ? conversaciones.find((c) => c.pack_id === pack)
    ?? await una<(typeof conversaciones)[number]>(`
      select c.pack_id, ca.nombre canal, nullif(trim(ca.config ->> 'firma'), '') firma, c.pedido_id::int, cl.nombre cliente, c.sin_leer, c.ultimo_ts, null ultimo, (c.pidio_persona_ts is not null) pidio_persona
        from meli_conversacion c left join canal ca on ca.id = c.canal_id left join pedido p on p.id = c.pedido_id left join cliente cl on cl.id = p.cliente_id
       where c.organizacion_id = $1 and c.pack_id = $2`, [org, pack]) : null;

  return (
    <div className="grid gap-3 md:grid-cols-[18rem_1fr]">
      <div className="bg-white border border-[#E3E9F0] rounded-xl overflow-hidden self-start">
        {conversaciones.length === 0 && <p className="p-3 text-xs text-[#5C6B76]">Todavía no hay mensajes.</p>}
        {conversaciones.map((c) => (
          <Link key={c.pack_id} href={url("/ventas/preguntas", { ver: "mensajes", pack: c.pack_id, canal })}
            className={`block px-3 py-2 border-t first:border-t-0 border-[#E3E9F0] text-xs ${c.pack_id === pack ? "bg-[#EEF3F8]" : "hover:bg-[#FAFBFC]"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`truncate ${c.sin_leer ? "font-bold" : "font-semibold"}`}>{c.cliente ?? `Pack ${c.pack_id}`}</span>
              <span className="flex gap-1">
                {c.pidio_persona && <Estado texto="Pidió una persona" tono="ambar" />}
                {c.sin_leer > 0 && <Estado texto={`${c.sin_leer} sin leer`} tono="azul" />}
              </span>
            </div>
            <div className="text-[#5C6B76] truncate">{c.canal ?? "—"}{c.pedido_id ? ` · pedido ${c.pedido_id}` : ""}{c.ultimo_ts ? ` · ${haceCuanto(c.ultimo_ts)}` : ""}</div>
            {c.ultimo && <div className="text-[#5C6B76] truncate">{c.ultimo}</div>}
          </Link>
        ))}
      </div>
      {elegida ? <Hilo org={org} conv={elegida} auto={auto} /> : (
        <p className={`${CAJA} text-xs text-[#5C6B76] self-start`}>{pack ? "Esa conversación no existe." : "Elegí una conversación para verla y contestar."}</p>
      )}
    </div>
  );
}

async function Hilo({ org, conv, auto }: { org: string; conv: { pack_id: string; canal: string | null; firma: string | null; pedido_id: number | null; cliente: string | null }; auto: boolean }) {
  const mensajes = await consulta<{ id: string; de_vendedor: boolean; texto: string | null; fecha: Date; adjuntos: unknown[]; usuario: string | null; con_ia: boolean; auto: boolean }>(
    `select m.id, m.de_vendedor, m.texto, m.fecha, m.adjuntos, u.nombre usuario, m.con_ia, m.auto from meli_mensaje m left join usuarios u on u.id = m.usuario_id
      where m.organizacion_id = $1 and m.pack_id = $2 order by m.fecha`, [org, conv.pack_id]);
  const sug = await una<{ sugerencia: string | null; ia_estado: string | null; pidio_persona: boolean }>(
    "select sugerencia, ia_estado, (pidio_persona_ts is not null) pidio_persona from meli_conversacion where organizacion_id = $1 and pack_id = $2", [org, conv.pack_id]);

  return (
    <section className={`${CAJA} self-start`}>
      <header className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="text-xs">
          <div className="font-semibold text-sm">{conv.cliente ?? "Comprador"}</div>
          <div className="text-[#5C6B76]">
            {conv.canal ?? "—"} · {conv.pedido_id
              ? <Link href={`/ventas/pedidos/${conv.pedido_id}`} className="text-[#16577F] hover:underline">Pedido {conv.pedido_id}</Link>
              : <span>Pack {conv.pack_id} (sin pedido en Laucen)</span>}
          </div>
        </div>
        <BotonTarea accion={accionActualizarConversacion} tipo={`conversacion:${conv.pack_id}`} campos={{ pack: String(conv.pack_id) }} clase={SUAVE} texto="Actualizar" />
      </header>
      <div className="space-y-2 mb-3">
        {mensajes.length === 0 && <p className="text-xs text-[#5C6B76]">No hay mensajes en esta conversación.</p>}
        {mensajes.map((m) => (
          <div key={m.id} className={`flex ${m.de_vendedor ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.de_vendedor ? "bg-[#EEF3F8] text-[#16577F]" : "bg-[#FAFBFC] border border-[#E3E9F0]"}`}>
              <div className="whitespace-pre-wrap break-words">{m.texto ?? <i className="text-[#5C6B76]">(adjunto)</i>}</div>
              {m.texto && Array.isArray(m.adjuntos) && m.adjuntos.length > 0 && <div className="text-[10px] text-[#5C6B76]">+ {m.adjuntos.length} adjunto{m.adjuntos.length === 1 ? "" : "s"}</div>}
              <div className="text-[10px] text-[#5C6B76] mt-0.5 text-right">{m.de_vendedor ? (m.auto ? "Respondió la IA sola" : m.usuario ? `Respondió ${m.usuario}${m.con_ia ? " con la IA" : ""}` : "Respondió alguien desde Mercado Libre") : "Comprador"} · {fechaHora(m.fecha)}</div>
            </div>
          </div>
        ))}
      </div>
      {(sug?.pidio_persona || sug?.sugerencia) && (
        <div className="mb-2"><AvisoIa estado={sug.pidio_persona ? "persona" : sug.ia_estado} auto={auto} conversacion /></div>
      )}
      <form action={accionEnviarMensaje} className="space-y-2">
        <input type="hidden" name="pack" value={conv.pack_id} />
        <label className="block">
          <span className={ETIQUETA}>Mensaje{sug?.sugerencia ? " (lo propuso la IA: revisalo)" : ""}</span>
          <textarea name="texto" defaultValue={sug?.sugerencia ?? ""} rows={3} maxLength={350} className={`${CAMPO} w-full`} />
          <span className="text-[11px] text-[#5C6B76]">Hasta 350 caracteres (el límite de Mercado Libre). Sin teléfonos, mails ni links.{conv.firma ? ` Al mandarlo se agrega al final la firma «${conv.firma}» (si no la tiene), que también cuenta.` : ""}</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button formAction={accionProponerMensaje} className={SUAVE}>Proponer con IA</button>
          <BotonEnviar clase={PRIMARIO} corriendo="Enviando…">Enviar</BotonEnviar>
        </div>
      </form>
    </section>
  );
}
