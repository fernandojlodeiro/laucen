"use server";

import { PALETA_CANALES, colorLibre } from "@/lib/canales/colores";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, entero, id } from "@/lib/erp/acciones";
import { asegurarCuentasDeCanalesSinFallar } from "@/lib/administracion/contabilidad";

const BASE = "/config/canales";
const TIPOS = ["mercadolibre", "web_minorista", "web_mayorista", "local", "historico", "otro"];
const ESTADOS = ["activo", "pausado", "archivado"];

function volverDe(fd: FormData) {
  const v = texto(fd, "volver");
  return v && (v === BASE || v.startsWith(`${BASE}?`)) ? v : BASE;
}

/** La lista elegida, verificada contra la organización (vacío = sin lista). */
async function listaDe(org: string, fd: FormData) {
  const l = id(fd, "lista");
  if (!l) return null;
  const r = await una<{ id: number }>("select id::int from lista_precios where id = $2 and organizacion_id = $1", [org, l]);
  if (!r) throw new ErrorErp("La lista de precios no existe.");
  return r.id;
}

async function canalDe(org: string, fd: FormData, k = "id") {
  const r = await una<{ id: number }>("select id::int from canal where id = $2 and organizacion_id = $1", [org, id(fd, k)]);
  if (!r) throw new ErrorErp("El canal no existe.");
  return r.id;
}

/** La razón social elegida para el canal (Fer, 4/10: cada canal elige la
 *  suya, no hay "principal"). Obligatoria si la organización tiene alguna. */
async function razonDe(org: string, fd: FormData): Promise<number | null> {
  const e = id(fd, "emisor");
  if (e) {
    if (!(await una("select 1 from emisor where id = $1 and organizacion_id = $2", [e, org]))) throw new ErrorErp("Esa razón social no existe.");
    return e;
  }
  if (await una("select 1 from emisor where organizacion_id = $1 limit 1", [org])) throw new ErrorErp("Elegí con qué razón social factura el canal.");
  return null;
}

const tipo = (fd: FormData) => {
  const t = String(fd.get("tipo"));
  return TIPOS.includes(t) ? t : "otro";
};

// ── Canales ───────────────────────────────────────────────

export async function accionCrearCanal(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(BASE, async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("El canal necesita un nombre.");
    // Cada canal con su color (Fer, 8/10): el primero de la paleta que no usa otro.
    const usados = (await consulta<{ color: string | null }>("select color from canal where organizacion_id = $1", [s.org.id])).map((x) => x.color);
    const [c] = await consulta<{ id: number }>(
      "insert into canal (organizacion_id, nombre, tipo, lista_precios_id, emisor_id, color) values ($1, $2, $3, $4, $5, $6) returning id::int",
      [s.org.id, nombre, tipo(fd), await listaDe(s.org.id, fd), await razonDe(s.org.id, fd), colorLibre(usados)]);
    // Su cuenta de ventas "Ventas — <canal>" en el plan de cuentas.
    await asegurarCuentasDeCanalesSinFallar(s.org.id);
    revalidatePath(BASE);
    return { ir: `${BASE}?c=${c.id}&ok=${encodeURIComponent("Canal creado. Ahora elegí desde qué depósitos vende.")}` };
  });
}

export async function accionGuardarCanal(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volverDe(fd), async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("El canal necesita un nombre.");
    const umbral = entero(fd, "umbral");
    if (umbral != null && umbral < 0) throw new ErrorErp("El umbral de pausa no puede ser negativo.");
    const estado = String(fd.get("estado"));
    // Razón social con la que factura el canal: obligatoria si hay alguna cargada (no hay "principal").
    const emisor = fd.has("emisor") ? await razonDe(s.org.id, fd) : undefined;
    const color = texto(fd, "color");
    if (color && !(PALETA_CANALES as readonly string[]).includes(color)) throw new ErrorErp("Elegí un color de la paleta.");
    await consulta(`update canal set nombre = $3, tipo = $4, lista_precios_id = $5, estado = $6, umbral_pausa_default = $7,
                           emisor_id = case when $8::boolean then $9::bigint else emisor_id end, color = coalesce($10, color)
                     where id = $2 and organizacion_id = $1`,
      [s.org.id, id(fd), nombre, tipo(fd), await listaDe(s.org.id, fd), ESTADOS.includes(estado) ? estado : "activo", umbral,
        emisor !== undefined, emisor ?? null, color]);
    // El orden para copiar publicaciones entre cuentas de ML (Fer, 9/10).
    if (fd.has("orden_copia")) {
      const orden = entero(fd, "orden_copia");
      if (orden != null && (orden < 1 || orden > 99)) throw new ErrorErp("El orden para copiar va de 1 a 99.");
      await consulta(`update canal set config = case when $3::int is null then config - 'orden_copia' else config || jsonb_build_object('orden_copia', $3::int) end
                       where id = $2 and organizacion_id = $1`, [s.org.id, id(fd), orden]);
    }
    // La cuenta de Mercado Pago del canal es de la razón social que factura el canal.
    if (emisor !== undefined) {
      await consulta("update cuenta_fondos set emisor_id = coalesce($3::bigint, emisor_principal($1)) where canal_id = $2 and organizacion_id = $1", [s.org.id, id(fd), emisor ?? null]);
    }
    revalidatePath(BASE);
    return "Guardado.";
  });
}

export async function accionBorrarCanal(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(BASE, async () => {
    const p = await una<{ n: number }>("select count(*)::int n from pedido where canal_id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    if (p && p.n > 0) throw new ErrorErp(`El canal tiene ${p.n} pedido(s): no se puede borrar. Archivalo con el lápiz.`);
    // Sus depósitos, publicaciones e identidades de clientes se van con él (cascade).
    await consulta("delete from canal where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    revalidatePath(BASE);
    return { ir: `${BASE}?ok=${encodeURIComponent("Canal borrado.")}` };
  });
}

// ── Depósitos del canal ───────────────────────────────────

export async function accionAgregarDeposito(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volverDe(fd), async () => {
    const canal = await canalDe(s.org.id, fd, "canal");
    const d = await una<{ id: number }>("select id::int from deposito where id = $2 and organizacion_id = $1", [s.org.id, id(fd, "deposito")]);
    if (!d) throw new ErrorErp("Elegí el depósito.");
    await consulta(`insert into canal_deposito (organizacion_id, canal_id, deposito_id, prioridad) values ($1, $2, $3, $4)
                    on conflict (canal_id, deposito_id) do update set prioridad = excluded.prioridad`,
      [s.org.id, canal, d.id, entero(fd, "prioridad") ?? 1]);
    revalidatePath(BASE);
    return "Depósito agregado al canal.";
  });
}

export async function accionPrioridadDeposito(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volverDe(fd), async () => {
    await consulta("update canal_deposito set prioridad = $4 where organizacion_id = $1 and canal_id = $2 and deposito_id = $3",
      [s.org.id, id(fd, "canal"), id(fd, "deposito"), entero(fd, "prioridad") ?? 1]);
    revalidatePath(BASE);
    return "Prioridad guardada.";
  });
}

export async function accionQuitarDeposito(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volverDe(fd), async () => {
    await consulta("delete from canal_deposito where organizacion_id = $1 and canal_id = $2 and deposito_id = $3",
      [s.org.id, id(fd, "canal"), id(fd, "deposito")]);
    revalidatePath(BASE);
    return "El canal ya no vende desde ese depósito.";
  });
}

// ── Token de la API ───────────────────────────────────────

/** Genera (o reemplaza) el token. Se muestra completo una sola vez: viaja en
 *  una cookie que dura un minuto (no en la dirección, para que no quede en el
 *  historial del navegador ni en los registros de Vercel). */
export async function accionGenerarToken(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volverDe(fd), async () => {
    const canal = await canalDe(s.org.id, fd, "canal");
    const token = randomBytes(32).toString("hex");
    await consulta("update canal set config = config || jsonb_build_object('token', $3::text) where id = $2 and organizacion_id = $1",
      [s.org.id, canal, token]);
    (await cookies()).set("token_nuevo", `${canal}:${token}`, { httpOnly: true, sameSite: "strict", path: BASE, maxAge: 60, secure: true });
    revalidatePath(BASE);
    return "Llave API nueva: copiala ahora, no se vuelve a mostrar.";
  });
}

export async function accionRevocarToken(fd: FormData) {
  const s = await entrarErp("canales_ver");
  await intentar(volverDe(fd), async () => {
    const canal = await canalDe(s.org.id, fd, "canal");
    await consulta("update canal set config = config - 'token' where id = $2 and organizacion_id = $1", [s.org.id, canal]);
    revalidatePath(BASE);
    return "Llave API revocada: quien la usaba ya no puede entrar a la API.";
  });
}
