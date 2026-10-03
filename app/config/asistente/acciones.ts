"use server";

// Configuración → Asistente: graba el nombre, la carita, las preguntas fuera
// del sistema y el tope de gasto (lib/asistente/config.ts). Y los pedidos
// sin resolver: mandarlos a programar (a la bitácora) o descartarlos.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, tildado, id } from "@/lib/erp/acciones";
import { sosVos } from "@/lib/admin";
import { guardarConfigAsistente } from "@/lib/asistente/config";

const VOLVER = "/config/asistente";

export async function accionGuardarAsistente(fd: FormData) {
  const s = await entrarErp("asistente_config");
  await intentar(`${VOLVER}?editar=ficha`, async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("El asistente necesita un nombre.");
    if (nombre.length > 40) throw new ErrorErp("El nombre es muy largo (hasta 40 letras).");
    const tope = numero(fd, "tope");
    if (tope == null || tope < 0) throw new ErrorErp("Poné el tope de gasto por mes en dólares (0 lo apaga).");
    await guardarConfigAsistente(s.org.id, { nombre, carita: tildado(fd, "carita"), fueraDelSistema: tildado(fd, "fuera"), topeUsd: tope });
    revalidatePath("/", "layout");
    return { ir: `${VOLVER}?ok=${encodeURIComponent("Grabado.")}` };
  });
}

// ── Pedidos sin resolver (lo que le pidieron hacer al asistente y no sabe) ──

const PENDIENTES = "/config/asistente/pendientes";

/** Sólo el superadministrador decide qué se programa (o Fer). */
async function entrarPendientes() {
  const s = await entrarErp("asistente_config");
  if (!s.superadmin && !(await sosVos())) redirect(`${PENDIENTES}?error=${encodeURIComponent("Esto lo decide un superadministrador.")}`);
  return s;
}

async function pendienteDeLaOrg(org: string, id: number) {
  const p = await una<{ id: number; pedido: string; estado: string; persona: string; email: string; conversacion_id: number | null; creado: string }>(`
    select p.id::int, p.pedido, p.estado, coalesce(nullif(u.nombre, ''), u.email) persona, u.email, p.conversacion_id::int,
           to_char(p.creado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') creado
      from asistente_pendiente p join usuarios u on u.id = p.usuario_id where p.id = $1 and p.organizacion_id = $2`, [id, org]);
  if (!p) throw new ErrorErp("Ese pedido no existe.");
  return p;
}

/** "Mandar a programar": queda como orden en la bitácora para una sesión de Code. */
export async function accionMandarAProgramar(fd: FormData) {
  const s = await entrarPendientes();
  await intentar(PENDIENTES, async () => {
    const p = await pendienteDeLaOrg(s.org.id, id(fd));
    if (p.estado !== "nuevo") throw new ErrorErp("Ese pedido ya se resolvió.");
    const nota = texto(fd, "nota");
    const b = await una<{ id: number }>(`
      insert into coordinacion.bitacora (autor, tipo, titulo, detalle, pide_lectura, pedido_por_usuario)
      values ('laucen', 'orden', $1, $2, true, $3) returning id::int`, [
      `Para Code: que el asistente sepa hacer esto — ${p.pedido.slice(0, 90)}`,
      `Lo pidió ${p.persona} (${p.email}) al asistente el ${p.creado} (organización «${s.org.nombre}», conversación N.º ${p.conversacion_id ?? "—"}) y no estaba entre sus acciones:\n\n${p.pedido}${nota ? `\n\nNota de quien lo mandó: ${nota}` : ""}\n\nLo mandó a programar ${s.usuario.nombre || s.usuario.email} desde Configuración › Asistente › Pedidos sin resolver. Antes de programarlo, Fer decide si se hace. Hacerlo como una acción nueva de lib/asistente/acciones.ts (prepara y se confirma con un botón).`,
      `${p.persona} <${p.email}> · ${s.org.nombre}`,
    ]);
    await consulta("update asistente_pendiente set estado = 'mandado', bitacora_id = $3, resuelto_ts = now() where id = $1 and organizacion_id = $2", [p.id, s.org.id, b!.id]);
    revalidatePath(PENDIENTES);
    return `Mandado a programar: quedó en la bitácora como orden N.º ${b!.id}.`;
  });
}

export async function accionDescartarPendiente(fd: FormData) {
  const s = await entrarPendientes();
  await intentar(PENDIENTES, async () => {
    const p = await pendienteDeLaOrg(s.org.id, id(fd));
    if (p.estado !== "nuevo") throw new ErrorErp("Ese pedido ya se resolvió.");
    await consulta("update asistente_pendiente set estado = 'descartado', resuelto_ts = now() where id = $1 and organizacion_id = $2", [p.id, s.org.id]);
    revalidatePath(PENDIENTES);
    return "Descartado.";
  });
}
