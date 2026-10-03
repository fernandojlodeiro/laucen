// El historial del asistente como lista configurable (lib/listas/tipos.ts):
// una fila por conversación, con quién preguntó, la primera pregunta, cuántas
// preguntas, los 👍/👎 y lo que costó. La comparten la pantalla y su Excel.

import Link from "next/link";
import { patronBusqueda, url } from "@/app/componentes/erp";
import { campoFecha, type Campo, type Lista, type SP } from "@/lib/listas/tipos";

export const RUTA_HISTORIAL = "/config/asistente/historial";
const esFecha = (x?: string) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);

export function filtrosHistorial(sp: SP) {
  return {
    q: sp.q?.trim() ?? "",
    comienza: sp.contiene !== "1",
    desde: esFecha(sp.desde) ? sp.desde! : "",
    hasta: esFecha(sp.hasta) ? sp.hasta! : "",
    malas: sp.malas === "1",
  };
}

const MENSAJES = (rol: string) => `(select count(*) from asistente_mensaje m where m.conversacion_id = c.id and m.rol = '${rol}')`;
const VOTOS = (v: number) => `(select count(*) from asistente_mensaje m where m.conversacion_id = c.id and m.voto = ${v})`;
const COSTO = "(select coalesce(sum(m.usd), 0) from asistente_mensaje m where m.conversacion_id = c.id)";

const CAMPOS: Campo[] = [
  { clave: "id", titulo: "N.º", sql: "c.id::int", orden: "c.id", formato: "entero" },
  { ...campoFecha("fecha", "Última pregunta", "c.actualizada_ts", { hora: true }) },
  campoFecha("creada", "Empezó", "c.creada_ts", { hora: true }),
  { clave: "persona", titulo: "Persona", sql: "coalesce(nullif(u.nombre, ''), u.email)", ancho: 24 },
  { clave: "email", titulo: "Mail", sql: "u.email", ancho: 28 },
  {
    clave: "pregunta", titulo: "Primera pregunta", sql: "c.titulo", ancho: 60,
    celda: (f, ctx) => <Link href={url(RUTA_HISTORIAL, { ...ctx.sp, id: f.id })} scroll={false} className="text-[#16577F] hover:underline">{f.pregunta || "—"}</Link>,
  },
  { clave: "pantalla", titulo: "Pantalla", sql: "c.ruta", ancho: 28 },
  { clave: "preguntas", titulo: "Preguntas", sql: `${MENSAJES("usuario")}::int`, orden: MENSAJES("usuario"), formato: "entero" },
  { clave: "utiles", titulo: "👍", sql: `${VOTOS(1)}::int`, orden: VOTOS(1), formato: "entero" },
  { clave: "no_utiles", titulo: "👎", sql: `${VOTOS(-1)}::int`, orden: VOTOS(-1), formato: "entero" },
  { clave: "costo", titulo: "Costo US$", sql: `${COSTO}::float`, orden: COSTO, formato: "usd" },
];

export const LISTA_ASISTENTE_HISTORIAL: Lista = {
  pantalla: "asistente_historial",
  titulo: "Historial del asistente",
  ruta: RUTA_HISTORIAL,
  permiso: "asistente_historial_ver",
  porDefecto: "fecha",
  campos: CAMPOS,
  enPantalla: ["fecha", "persona", "pregunta", "preguntas", "utiles", "no_utiles", "costo"],
  siempre: "c.id::int id",
  consulta: async (ctx, sp) => {
    const f = filtrosHistorial(sp);
    const valores: unknown[] = [ctx.org];
    const donde = ["c.organizacion_id = $1"];
    if (f.q) {
      valores.push(patronBusqueda(f.q, f.comienza));
      const n = valores.length;
      donde.push(`(c.titulo ilike $${n} or u.nombre ilike $${n} or u.email ilike $${n}
        or exists (select 1 from asistente_mensaje m where m.conversacion_id = c.id and m.texto ilike $${n}))`);
    }
    const dia = "(c.actualizada_ts at time zone 'America/Argentina/Buenos_Aires')::date";
    if (f.desde) { valores.push(f.desde); donde.push(`${dia} >= $${valores.length}::date`); }
    if (f.hasta) { valores.push(f.hasta); donde.push(`${dia} <= $${valores.length}::date`); }
    if (f.malas) donde.push("exists (select 1 from asistente_mensaje m where m.conversacion_id = c.id and m.voto = -1)");
    return {
      desde: "asistente_conversacion c join usuarios u on u.id = c.usuario_id",
      donde: donde.join(" and "),
      valores,
      orden: "c.actualizada_ts desc, c.id desc",
    };
  },
};
