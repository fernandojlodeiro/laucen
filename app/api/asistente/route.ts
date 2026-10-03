// El asistente (lib/asistente/motor.ts) para el chat del panel
// (app/componentes/asistente/Asistente.tsx):
//   POST { conversacion?, pregunta, ruta } → respuesta en renglones JSON
//        (NDJSON): {tipo:"estado"} mientras trabaja y al final
//        {tipo:"respuesta"} o {tipo:"error"}. Graba pregunta y respuesta.
//   GET ?conversacion=<id> → los mensajes de una conversación propia.
// Pide sesión y el permiso «Asistente»; respeta el tope de gasto del mes.

import type { NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { sosVos } from "@/lib/admin";
import { monedaVista, type Moneda } from "@/lib/moneda";
import { consulta, una } from "@/lib/erp/base";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { configAsistente, gastoDelMes } from "@/lib/asistente/config";
import { preguntar, type Turno } from "@/lib/asistente/motor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const json = (datos: unknown, status = 200) => Response.json(datos, { status });

async function entrar() {
  await asegurarEsquemaErp();
  const s = await sesionActual();
  if (!s) return null;
  if (!tienePermiso(s.permisos, "asistente_usar")) return null;
  return s;
}

type AccionVista = { id: number; mensaje_id: number | null; resumen: string; detalle: string[]; estado: string; resultado: string | null };

/** Las propuestas de acción (por número o de una conversación) para dibujar sus tarjetas. */
async function accionesDe(org: string, de: { ids?: number[]; conversacion?: number }): Promise<AccionVista[]> {
  return consulta<AccionVista>(`
    select id::int, mensaje_id::int, resumen, detalle, estado, resultado from asistente_accion
     where organizacion_id = $1 and ${de.ids ? "id = any($2::bigint[])" : "conversacion_id = $2"} order by id`, [org, de.ids ?? de.conversacion]);
}

async function conversacionPropia(org: string, usuario: string, id: number) {
  return una<{ id: number }>("select id::int id from asistente_conversacion where id = $1 and organizacion_id = $2 and usuario_id = $3", [id, org, usuario]);
}

export async function GET(req: NextRequest) {
  const s = await entrar();
  if (!s) return json({ error: "Sin permiso." }, 403);
  const id = Number(req.nextUrl.searchParams.get("conversacion"));
  if (!id || !(await conversacionPropia(s.org.id, s.usuario.id, id))) return json({ mensajes: [] });
  const mensajes = await consulta<{ id: number; rol: string; texto: string; voto: number | null }>(
    "select id::int id, rol, texto, voto from asistente_mensaje where conversacion_id = $1 order by id", [id]);
  const acciones = await accionesDe(s.org.id, { conversacion: id });
  return json({ mensajes: mensajes.map((m) => ({ ...m, acciones: acciones.filter((a) => a.mensaje_id === m.id) })) });
}

export async function POST(req: NextRequest) {
  const s = await entrar();
  if (!s) return json({ error: "Sin permiso." }, 403);
  const cuerpo = await req.json().catch(() => ({})) as { conversacion?: number; pregunta?: string; ruta?: string };
  const pregunta = String(cuerpo.pregunta ?? "").trim().slice(0, 4000);
  const ruta = String(cuerpo.ruta ?? "/panel").slice(0, 300);
  if (!pregunta) return json({ error: "Escribí la pregunta." }, 400);

  const org = s.org.id;
  const [config, gasto, esFer, moneda] = await Promise.all([
    configAsistente(org), gastoDelMes(org), sosVos(), monedaVista(s.usuario.id, org).catch(() => "ARS" as Moneda),
  ]);

  // La conversación: la que viene (si es de esta persona) o una nueva.
  let conversacion = cuerpo.conversacion ? (await conversacionPropia(org, s.usuario.id, Number(cuerpo.conversacion)))?.id ?? null : null;
  if (!conversacion) {
    const c = await una<{ id: number }>(
      "insert into asistente_conversacion (organizacion_id, usuario_id, titulo, ruta) values ($1, $2, $3, $4) returning id::int id",
      [org, s.usuario.id, pregunta.slice(0, 120), ruta]);
    conversacion = c!.id;
  }
  const historia = await consulta<{ rol: Turno["rol"]; texto: string }>(
    "select rol, texto from asistente_mensaje where conversacion_id = $1 and error is null order by id desc limit 20", [conversacion]);
  await consulta(
    "insert into asistente_mensaje (organizacion_id, conversacion_id, rol, texto, ruta) values ($1, $2, 'usuario', $3, $4)",
    [org, conversacion, pregunta, ruta]);
  await consulta("update asistente_conversacion set actualizada_ts = now() where id = $1", [conversacion]);

  const codificador = new TextEncoder();
  const flujo = new ReadableStream({
    async start(control) {
      const enviar = (x: unknown) => control.enqueue(codificador.encode(JSON.stringify(x) + "\n"));
      enviar({ tipo: "conversacion", conversacion });

      // Tope de gasto del mes: no se llama a Claude.
      if (gasto >= config.topeUsd) {
        const texto = `Se terminó el cupo de este mes para ${config.nombre} (US$ ${config.topeUsd.toLocaleString("es-AR")}). Quien administra la organización lo puede subir en [Configuración › Asistente](/config/asistente).`;
        const m = await una<{ id: number }>(
          "insert into asistente_mensaje (organizacion_id, conversacion_id, rol, texto, ruta, error) values ($1, $2, 'asistente', $3, $4, 'tope') returning id::int id",
          [org, conversacion, texto, ruta]);
        enviar({ tipo: "respuesta", id: m?.id, texto });
        control.close();
        return;
      }

      const r = await preguntar({
        nombre: config.nombre, fuera: config.fueraDelSistema, ruta, pregunta, conversacionId: conversacion!,
        historia: historia.reverse(),
        q: { org, orgNombre: s.org.nombre, usuario: s.usuario.nombre || s.usuario.email, usuarioId: s.usuario.id, superadmin: s.superadmin, esFer, permisos: s.permisos, moneda },
        alAvanzar: (estado) => enviar({ tipo: "estado", texto: estado }),
      });
      const [motivo, tecnico] = r.error ? r.error.split("|") : [null, null];
      const texto = r.error ? motivo! : r.texto;
      const m = await una<{ id: number }>(`
        insert into asistente_mensaje (organizacion_id, conversacion_id, rol, texto, ruta, herramientas, tokens_in, tokens_out, busquedas, usd, error)
        values ($1, $2, 'asistente', $3, $4, $5::jsonb, $6, $7, $8, $9, $10) returning id::int id`,
      [org, conversacion, texto, ruta, JSON.stringify(r.herramientas), r.tokensIn, r.tokensOut, r.busquedas, r.usd, tecnico ?? null]).catch(() => null);
      // Las propuestas de acción quedan colgadas de esta respuesta (para volver a mostrarlas).
      if (m?.id && r.propuestas.length) await consulta("update asistente_accion set mensaje_id = $1 where id = any($2::bigint[]) and organizacion_id = $3", [m.id, r.propuestas, org]);
      const acciones = r.propuestas.length ? await accionesDe(org, { ids: r.propuestas }) : [];
      enviar(r.error ? { tipo: "error", id: m?.id, texto } : { tipo: "respuesta", id: m?.id, texto, acciones });
      control.close();
    },
  });
  return new Response(flujo, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
