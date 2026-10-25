// Corregir a la IA (pedido de Fer, 25/10): en una respuesta que mandó la IA (pregunta o mensaje de posventa de Mercado
// Libre, WhatsApp), una persona escribe qué estuvo mal. La IA propone qué cambiar para que no se repita —los datos
// técnicos del producto de esa conversación, una regla nueva para la IA de la empresa, o las dos cosas— y la persona
// lo ve antes de grabarlo. Nada se graba sin ese «Grabar». Cada corrección queda en ia_correccion.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { pedirClaude, hayClaude, jsonDe } from "@/lib/claude";
import { reglasIaEmpresa, guardarReglasIa } from "@/lib/canales/textos";

export type OrigenCorreccion = "pregunta" | "mensaje" | "whatsapp";
export const ORIGENES: OrigenCorreccion[] = ["pregunta", "mensaje", "whatsapp"];

/** Lo que se le muestra a la persona antes de grabar. */
export type Propuesta = {
  id: number; resumen: string;
  producto: { id: number; titulo: string; antes: string; despues: string } | null;
  regla: string | null;
};

type Contexto = { cliente: string; respuesta: string; producto: { id: number; titulo: string; notas_ia: string | null } | null };

const PRODUCTO = `select pr.id::int, pr.titulo, pr.notas_ia from producto pr where pr.id = $1 and pr.organizacion_id = $2`;

/** La conversación, lo que contestó la IA y el producto del que se habla (si se sabe). */
async function contextoDe(org: string, origen: OrigenCorreccion, id: string): Promise<Contexto> {
  if (origen === "pregunta") {
    const q = await una<{ texto: string; respuesta: string | null; producto_id: number | null }>(`
      select q.texto, q.respuesta, v.producto_id::int from meli_pregunta q
        left join publicacion pu on pu.id = q.publicacion_id left join variacion v on v.id = pu.variacion_id
       where q.id = $1::bigint and q.organizacion_id = $2`, [id, org]);
    if (!q?.respuesta) throw new ErrorErp("Esa pregunta no tiene respuesta.");
    return { cliente: q.texto, respuesta: q.respuesta, producto: q.producto_id ? await una(PRODUCTO, [q.producto_id, org]) : null };
  }
  if (origen === "mensaje") {
    const m = await una<{ pack_id: string; texto: string | null; fecha: Date; producto_id: number | null }>(`
      select m.pack_id, m.texto, m.fecha,
             (select v.producto_id::int from meli_conversacion c join pedido_linea l on l.pedido_id = c.pedido_id join variacion v on v.id = l.variacion_id
               where c.organizacion_id = m.organizacion_id and c.pack_id = m.pack_id order by l.id limit 1) producto_id
        from meli_mensaje m where m.id = $1 and m.organizacion_id = $2 and m.de_vendedor`, [id, org]);
    if (!m?.texto) throw new ErrorErp("Ese mensaje no existe.");
    const antes = await consulta<{ texto: string | null }>(`
      select texto from meli_mensaje where organizacion_id = $1 and pack_id = $2 and not de_vendedor and fecha < $3 order by fecha desc limit 3`, [org, m.pack_id, m.fecha]);
    return { cliente: antes.reverse().map((x) => x.texto ?? "(adjunto)").join("\n"), respuesta: m.texto,
      producto: m.producto_id ? await una(PRODUCTO, [m.producto_id, org]) : null };
  }
  const w = await una<{ chat_id: number; texto: string; herramientas: { nombre?: string; entrada?: { producto?: unknown } }[] | null }>(
    "select chat_id::int, texto, herramientas from chat_mensaje where id = $1::bigint and organizacion_id = $2 and clase = 'ia'", [id, org]);
  if (!w) throw new ErrorErp("Ese mensaje no existe.");
  const antes = await consulta<{ texto: string }>(`
    select texto from chat_mensaje where chat_id = $1 and clase = 'entrante' and id < $2::bigint order by id desc limit 3`, [w.chat_id, id]);
  // El producto: el último que miró la IA para contestar (ver_producto o buscar_en_internet).
  const pid = [...(w.herramientas ?? [])].reverse().map((h) => Number(h.entrada?.producto)).find((n) => Number.isInteger(n) && n > 0);
  return { cliente: antes.reverse().map((x) => x.texto).join("\n"), respuesta: w.texto, producto: pid ? await una(PRODUCTO, [pid, org]) : null };
}

const SISTEMA = `Una persona de una tienda revisa una respuesta que la IA de la tienda le mandó a un cliente y te dice qué estuvo mal. Tu trabajo es proponer qué cambiar en lo que la IA sabe para que no se repita. Hay dos lugares:
1. DATOS_TECNICOS del producto (si hay PRODUCTO): características del equipo. Si la corrección es un dato del producto, devolvé el texto COMPLETO nuevo de los datos técnicos: conservá todos los renglones que siguen valiendo, cambiá o sacá el que estaba mal y sumá lo correcto. Un renglón que empieza con «[Internet…]» lo agregó la IA buscando en internet: si la persona lo corrige o lo confirma, dejalo sin esa marca.
2. REGLAS de la IA de la tienda (valen para todas las respuestas): si la corrección es un criterio general (cómo contestar, qué decir o no decir, políticas), devolvé UN renglón nuevo, escrito como instrucción para la IA, que no repita lo que ya dicen las REGLAS.
Puede ser uno, el otro o los dos. Si no hay PRODUCTO, sólo la regla. No inventes nada que la persona no dijo.
Devolvé SOLO un JSON: {"datos_tecnicos": "texto completo nuevo" o null si no cambian, "regla": "renglón nuevo" o null, "resumen": "en una frase, en castellano rioplatense, qué se va a cambiar"}.`;

export async function proponerCorreccion(org: string, usuario: string, origen: OrigenCorreccion, id: string, correccion: string): Promise<Propuesta> {
  const texto = correccion.trim();
  if (!texto) throw new ErrorErp("Escribí qué estuvo mal.");
  if (!hayClaude()) throw new ErrorErp("Falta la llave de Claude: no se puede proponer la corrección.");
  const ctx = await contextoDe(org, origen, id);
  const reglas = (await reglasIaEmpresa(org)).trim();
  const r = await pedirClaude({
    system: SISTEMA, modelo: "medio", maxTokens: 2500,
    contenido: `LO QUE ESCRIBIÓ EL CLIENTE:\n${ctx.cliente || "(nada)"}\n\nLO QUE CONTESTÓ LA IA:\n${ctx.respuesta}\n\n` +
      (ctx.producto ? `PRODUCTO: ${ctx.producto.titulo}\nDATOS_TECNICOS actuales:\n${ctx.producto.notas_ia?.trim() || "(vacíos)"}\n\n` : "PRODUCTO: no se sabe de qué producto habla.\n\n") +
      `REGLAS actuales:\n${reglas || "(ninguna)"}\n\nQUÉ ESTUVO MAL, SEGÚN LA PERSONA:\n${texto.slice(0, 2000)}`,
  });
  if ("error" in r) throw new ErrorErp(`La IA no pudo proponer la corrección (${r.error.slice(0, 120)}).`);
  const o = jsonDe<{ datos_tecnicos?: unknown; regla?: unknown; resumen?: unknown }>(r.texto);
  const despues = ctx.producto && typeof o?.datos_tecnicos === "string" && o.datos_tecnicos.trim() ? o.datos_tecnicos.trim() : null;
  const regla = typeof o?.regla === "string" && o.regla.trim() ? o.regla.trim() : null;
  const cambia = despues != null && despues !== (ctx.producto?.notas_ia ?? "").trim();
  if (!cambia && !regla) throw new ErrorErp("La IA no encontró qué cambiar con eso. Probá decirlo de otra forma (qué está mal y cuál es lo correcto).");
  const propuesta = {
    resumen: typeof o?.resumen === "string" ? o.resumen.trim() : "",
    producto: cambia && ctx.producto ? { id: ctx.producto.id, titulo: ctx.producto.titulo, antes: ctx.producto.notas_ia ?? "", despues: despues! } : null,
    regla,
  };
  const fila = await una<{ id: number }>(`
    insert into ia_correccion (organizacion_id, origen, origen_id, producto_id, correccion, propuesta, usuario_id)
    values ($1, $2, $3, $4, $5, $6::jsonb, $7) returning id::int`,
  [org, origen, id, propuesta.producto?.id ?? null, texto, JSON.stringify(propuesta), usuario]);
  return { id: fila!.id, ...propuesta };
}

/** Graba lo propuesto. Si los datos técnicos cambiaron desde que se propuso (otra persona los tocó), no los pisa. */
export async function grabarCorreccion(org: string, id: number): Promise<string> {
  const c = await una<{ estado: string; propuesta: Omit<Propuesta, "id"> }>("select estado, propuesta from ia_correccion where id = $1 and organizacion_id = $2", [id, org]);
  if (!c) throw new ErrorErp("Esa corrección no existe.");
  if (c.estado === "grabada") return "Esa corrección ya estaba grabada.";
  const p = c.propuesta;
  const hecho: string[] = [];
  if (p.producto) {
    const ok = await consulta(`update producto set notas_ia = $3, actualizado_ts = now()
                                where id = $1 and organizacion_id = $2 and coalesce(notas_ia, '') = $4 returning id`,
    [p.producto.id, org, p.producto.despues, p.producto.antes]);
    if (!ok.length) throw new ErrorErp("Los datos técnicos del producto cambiaron mientras tanto: volvé a pedir la corrección.");
    hecho.push("los datos técnicos del producto");
  }
  if (p.regla) {
    const actuales = (await reglasIaEmpresa(org)).trim();
    await guardarReglasIa(org, actuales ? `${actuales}\n${p.regla}` : p.regla);
    hecho.push("las reglas de la IA");
  }
  await consulta("update ia_correccion set estado = 'grabada', grabado_ts = now() where id = $1 and organizacion_id = $2", [id, org]);
  return `Listo: quedó corregido en ${hecho.join(" y ")}.`;
}
