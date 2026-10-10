// Preguntas de Mercado Libre de todas las cuentas, en una bandeja: se traen
// (notificación "questions" o barrido), la IA propone la respuesta con la
// ficha, el stock y los tiempos de envío, y el operador la aprueba o la
// cambia antes de mandarla. Con el interruptor de Preguntas prendido (Fer,
// 5/10), lo que la IA puede contestar sola lo manda sola.

import { igualALaSugerencia, leerPropuesta, FORMATO_IA, type EstadoIa } from "@/lib/mercadolibre/sugerencia";
import { respuestaAuto } from "@/lib/mercadolibre/respuesta-auto";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { pedirClaude, hayClaude } from "@/lib/claude";
import { textosCanal, instruccionesExtra, conFirma, agregarFirma } from "@/lib/canales/textos";
import { ml, mlOk, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import type { ItemMl } from "@/lib/mercadolibre/publicaciones";

type PreguntaMl = {
  id: number; item_id: string; seller_id: number; status: string; text: string; date_created: string;
  from?: { id: number }; answer?: { text: string; date_created: string } | null;
};

/** ¿La pregunta se hizo antes del corte de la cuenta (el mismo de los
 *  pedidos)? Entonces no entra: ya está en Virtual Seller. */
const anteriorAlCorte = (cuenta: CuentaMl, q: PreguntaMl) => !!cuenta.pedidosCorte && Date.parse(q.date_created) < cuenta.pedidosCorte.getTime();

export async function guardarPregunta(cuenta: CuentaMl, q: PreguntaMl) {
  if (anteriorAlCorte(cuenta, q)) return;
  const org = cuenta.organizacionId;
  await consulta(`
    insert into meli_pregunta (id, organizacion_id, canal_id, item_id, publicacion_id, comprador_id, texto, estado, fecha, respuesta, respondida_ts, datos_externos)
    values ($1, $2, $3, $4, (select id from publicacion where canal_id = $3 and id_externo = $4 order by id limit 1), $5, $6, $7, $8, $9, $10, $11::jsonb)
    on conflict (id) do update set estado = excluded.estado, texto = excluded.texto,
      respuesta = coalesce(excluded.respuesta, meli_pregunta.respuesta), respondida_ts = coalesce(excluded.respondida_ts, meli_pregunta.respondida_ts),
      publicacion_id = coalesce(excluded.publicacion_id, meli_pregunta.publicacion_id), datos_externos = excluded.datos_externos, actualizado_ts = now()`,
    [q.id, org, cuenta.canalId, q.item_id, q.from?.id ?? null, q.text, q.status, q.date_created, q.answer?.text ?? null,
      q.answer?.date_created ?? null, JSON.stringify({ ml: q })]);
}

export async function importarPregunta(cuenta: CuentaMl, id: string | number) {
  const r = await ml<PreguntaMl>(cuenta, "GET", `/questions/${id}?api_version=4`);
  if (r.status === 404) {
    await consulta("update meli_pregunta set estado = 'DELETED', actualizado_ts = now() where id = $1", [id]);
    return;
  }
  if (r.status !== 200) throw new Error(`pregunta ${id}: ML contestó ${r.status}`);
  await guardarPregunta(cuenta, r.datos);
}

/** Trae las preguntas sin responder de la cuenta y re-lee las que Laucen
 *  tenía pendientes y ya no lo están (respondidas desde ML, borradas). */
export async function barrerPreguntas(cuenta: CuentaMl): Promise<number> {
  const r = await ml<{ questions: PreguntaMl[] }>(cuenta, "GET", `/questions/search?seller_id=${cuenta.meliUserId}&status=UNANSWERED&api_version=4&limit=50&sort_fields=date_created&sort_types=DESC`);
  if (r.status !== 200) throw new Error(`questions/search: ML contestó ${r.status}`);
  const vivas = new Set<number>();
  for (const q of r.datos.questions ?? []) { if (anteriorAlCorte(cuenta, q)) continue; await guardarPregunta(cuenta, q); vivas.add(q.id); }
  const viejas = await consulta<{ id: string }>("select id from meli_pregunta where canal_id = $1 and estado = 'UNANSWERED'", [cuenta.canalId]);
  for (const v of viejas) if (!vivas.has(Number(v.id))) await importarPregunta(cuenta, v.id);
  return vivas.size;
}

/** Lo que la IA necesita saber para contestar sobre una publicación. */
async function contexto(cuenta: CuentaMl, itemId: string, publicacionId: number | null) {
  const item = await ml<ItemMl & { shipping?: { free_shipping?: boolean; logistic_type?: string } }>(cuenta, "GET", `/items/${itemId}?include_attributes=all`);
  const desc = await ml<{ plain_text?: string }>(cuenta, "GET", `/items/${itemId}/description`);
  const it = item.status === 200 ? item.datos : null;
  let laucen: Record<string, unknown> | null = null;
  if (publicacionId) {
    laucen = await una(`
      select titulo_variacion(p.variacion_id) titulo, pr.descripcion, pr.marca, pr.peso_g, pr.largo_cm, pr.ancho_cm, pr.alto_cm,
             greatest(stock_disponible_canal(p.organizacion_id, p.variacion_id, p.canal_id), 0) disponible,
             (select string_agg(a.nombre || ': ' || a.valor, '; ') from producto_atributo a where a.producto_id = pr.id) atributos
        from publicacion p join variacion v on v.id = p.variacion_id join producto pr on pr.id = v.producto_id
       where p.id = $1`, [publicacionId]);
  }
  const anteriores = await consulta<{ texto: string; respuesta: string }>(`
    select texto, respuesta from meli_pregunta where item_id = $1 and respuesta is not null order by fecha desc limit 8`, [itemId]);
  return {
    publicacion: it ? {
      titulo: it.title, precio: it.price, disponible_en_ml: it.available_quantity, estado: it.status,
      envio_gratis: it.shipping?.free_shipping ?? null, full: it.shipping?.logistic_type === "fulfillment",
      atributos: (it.attributes ?? []).filter((a) => a.value_name).map((a) => `${a.name ?? a.id}: ${a.value_name}`).slice(0, 60),
      variaciones: (it.variations ?? []).map((v) => ({ atributos: (v.attribute_combinations ?? []).map((a) => a.value_name).join(" / "), disponible: v.available_quantity })),
      descripcion: desc.status === 200 ? (desc.datos.plain_text ?? "").slice(0, 4000) : null,
    } : null,
    ficha_laucen: laucen,
    preguntas_anteriores: anteriores,
  };
}

const INSTRUCCIONES = `Sos quien atiende las preguntas de una tienda argentina en Mercado Libre. Escribí la respuesta a la pregunta del comprador, en castellano rioplatense, cordial y breve (1 a 3 oraciones, nunca más de 600 caracteres), empezando con "Hola" y terminando con un saludo corto ("Saludos!").
Reglas de Mercado Libre que no se pueden romper: nada de teléfonos, mails, direcciones, links, redes sociales ni nombres de otras tiendas; no invitar a comprar por fuera de ML.
Usá SOLO los datos que te paso (publicación, ficha y stock). Si el dato no está, no lo inventes: decí que lo consultás o sugerí ver la descripción. Si preguntan por stock, usá el disponible. Si preguntan por envío, decí lo que figura (envío gratis o Full) sin prometer fechas exactas.
${FORMATO_IA}`;

/** La IA propone una respuesta y queda guardada como sugerencia, con lo que
 *  la IA dice de ella (si se puede mandar sola). */
export async function sugerirRespuesta(org: string, preguntaId: number): Promise<{ texto: string; estado: EstadoIa }> {
  const q = await una<{ id: string; canal_id: string; item_id: string; publicacion_id: string | null; texto: string }>(
    "select id, canal_id, item_id, publicacion_id, texto from meli_pregunta where id = $1 and organizacion_id = $2", [preguntaId, org]);
  if (!q) throw new ErrorErp("La pregunta no existe.");
  if (!hayClaude()) throw new ErrorErp("Falta la llave de Claude: no se puede sugerir la respuesta.");
  const cuenta = await cuentaDelCanal(org, Number(q.canal_id));
  if (!cuenta) throw new ErrorErp("La cuenta de Mercado Libre de esta pregunta ya no está conectada.");
  const ctx = await contexto(cuenta, q.item_id, q.publicacion_id ? Number(q.publicacion_id) : null);
  const textos = await textosCanal(org, q.canal_id);
  const r = await pedirClaude({
    system: INSTRUCCIONES + instruccionesExtra(textos), modelo: "medio", maxTokens: 600,
    contenido: `DATOS:\n${JSON.stringify(ctx, null, 1)}\n\nPREGUNTA DEL COMPRADOR:\n${q.texto}`,
  });
  if ("error" in r) throw new ErrorErp(`La IA no pudo proponer una respuesta (${r.error.slice(0, 120)}).`);
  const p = leerPropuesta(r.texto);
  // La firma del canal la pone Laucen, no la IA (lib/canales/textos.ts).
  const texto = conFirma(p.texto, textos.firma, 1990);
  await consulta("update meli_pregunta set sugerencia = $3, sugerencia_ts = now(), ia_estado = $4 where id = $1 and organizacion_id = $2", [preguntaId, org, texto, p.estado]);
  return { texto, estado: p.estado };
}

/** La IA propone sola la respuesta a las preguntas sin responder que todavía no tienen sugerencia (Fer, 5/10: "no me
 *  hagas apretar el botón proponer"). Cada pregunta se intenta una vez cada 30 minutos como mucho, para no gastar en una
 *  que falla; sin llave de Claude no hace nada. Nunca tira: lo que falla queda para la próxima. Con el interruptor de
 *  Preguntas prendido, la que la IA da por buena ("ok") se manda sola; las demás quedan para una persona. */
export async function sugerirPendientes(opts: { org?: string; max?: number; hastaMs?: number } = {}): Promise<{ propuestas: number; errores: number; enviadas: number }> {
  const res = { propuestas: 0, errores: 0, enviadas: 0 };
  if (!hayClaude()) return res;
  const tomadas = await consulta<{ id: string; organizacion_id: string }>(`
    update meli_pregunta set sugerencia_intento_ts = now()
     where id in (select id from meli_pregunta
                   where estado = 'UNANSWERED' and sugerencia is null and ($1::text is null or organizacion_id = $1)
                     and (sugerencia_intento_ts is null or sugerencia_intento_ts < now() - interval '30 minutes')
                   order by fecha limit $2 for update skip locked)
    returning id, organizacion_id`, [opts.org ?? null, opts.max ?? 5]);
  for (const q of tomadas) {
    if (opts.hastaMs && Date.now() > opts.hastaMs - 8_000) break;
    try {
      const p = await sugerirRespuesta(q.organizacion_id, Number(q.id));
      res.propuestas++;
      if (p.estado === "ok" && (await respuestaAuto(q.organizacion_id)).preguntas) {
        await responder(q.organizacion_id, Number(q.id), p.texto, null, { auto: true });
        res.enviadas++;
      }
    } catch { res.errores++; }
  }
  return res;
}

/** Manda la respuesta a ML. Sin usuario y con `auto`: la mandó la IA sola. */
export async function responder(org: string, preguntaId: number, texto: string, usuarioId: string | null, o: { auto?: boolean } = {}) {
  if (!texto.trim()) throw new ErrorErp("La respuesta está vacía.");
  const q = await una<{ canal_id: string; estado: string; sugerencia: string | null }>("select canal_id, estado, sugerencia from meli_pregunta where id = $1 and organizacion_id = $2", [preguntaId, org]);
  if (!q) throw new ErrorErp("La pregunta no existe.");
  // La firma del canal va siempre, la escriba una persona o la IA (si ya la trae, no se repite).
  const t = agregarFirma(texto, (await textosCanal(org, q.canal_id)).firma);
  if (t.length > 2000) throw new ErrorErp(`Mercado Libre acepta hasta 2.000 caracteres${t !== texto.trim() ? " (contando la firma)" : ""}.`);
  if (q.estado !== "UNANSWERED") throw new ErrorErp("Esa pregunta ya no está pendiente (se respondió o se borró).");
  const cuenta = await cuentaDelCanal(org, Number(q.canal_id));
  if (!cuenta) throw new ErrorErp("La cuenta de Mercado Libre de esta pregunta ya no está conectada.");
  await mlOk(cuenta, "POST", "/answers", { question_id: preguntaId, text: t });
  await consulta(`update meli_pregunta set estado = 'ANSWERED', respuesta = $3, respondida_ts = now(), respondida_por = $4, respondida_con_ia = $5,
                          respondida_auto = $6, actualizado_ts = now()
                   where id = $1 and organizacion_id = $2`, [preguntaId, org, t, usuarioId, !!o.auto || igualALaSugerencia(t, q.sugerencia), !!o.auto]);
}
