// Antibot de los formularios públicos de la tienda (Fer, 24/10: en el dominio
// viejo hay 300.000 clientes creados por bots). Lo mismo que CadaMes
// (src/lib/anti-bot.ts), en tres capas y en este orden, de la más barata a la
// más cara:
//
//   1. Campo trampa + tiempo mínimo: un campo oculto que una persona no ve (si
//      viene lleno, es un script) y la hora firmada de cuando se dibujó el
//      formulario (si llega antes del mínimo, también). Sin red ni base.
//   2. Límite por IP: cuántos intentos hizo esa conexión en esa ruta en la
//      última hora y en el día (tienda_intento, que también es la auditoría).
//   3. Cloudflare Turnstile, si la organización cargó sus claves
//      (tienda_antibot; Configuración › Tienda web). Si Cloudflare no contesta,
//      se deja pasar: una caída de ellos no puede frenar una compra real.
//
// Se usa en el checkout (crea cliente y pedido, y con efectivo reserva stock),
// al ingresar (probar contraseñas) y al crear la cuenta después de comprar.

import { createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { secreto } from "@/lib/tienda/cuentas";
import type { Tienda } from "@/lib/tienda/tienda";

import { CAMPO_MARCA, CAMPO_TRAMPA, CAMPO_TURNSTILE } from "@/lib/tienda/antibot-campos";

export type Ruta = "checkout" | "ingresar" | "crear_cuenta" | "registro" | "recuperar";

/** Tiempo mínimo entre dibujar y mandar, y topes por IP. Al ingresar, el administrador de
 *  contraseñas del navegador completa en un segundo: por eso ahí el mínimo es corto. */
const REGLAS: Record<Ruta, { minimoMs: number; porHora: number; porDia: number }> = {
  checkout: { minimoMs: 3000, porHora: 15, porDia: 40 },
  ingresar: { minimoMs: 800, porHora: 10, porDia: 40 },
  crear_cuenta: { minimoMs: 1500, porHora: 10, porDia: 30 },
  // Crear la cuenta sin comprar y «Olvidé mi contraseña» (Fer, 25/10): mandan mails, así que topes bajos.
  registro: { minimoMs: 2500, porHora: 5, porDia: 15 },
  recuperar: { minimoMs: 1500, porHora: 5, porDia: 15 },
};
const VIGENCIA_MS = 12 * 3600_000;

const firma = async (texto: string) => createHmac("sha256", await secreto()).update(`antibot.${texto}`).digest("base64url");

/** La hora firmada que viaja oculta en el formulario (firmada: una sin firmar la pone el bot). */
export async function marcaDeTiempo(): Promise<string> {
  const t = String(Date.now());
  return `${t}.${await firma(t)}`;
}

async function leerMarca(valor: unknown): Promise<number | null> {
  const [t, f] = String(valor ?? "").split(".");
  if (!t || !f || !/^\d{12,14}$/.test(t)) return null;
  const esperada = Buffer.from(await firma(t)), vino = Buffer.from(f);
  return esperada.length === vino.length && timingSafeEqual(esperada, vino) ? Number(t) : null;
}

/** La clave pública de Turnstile de la organización (null = sin Turnstile). */
export async function turnstileDe(org: string): Promise<string | null> {
  const r = await una<{ site_key: string | null; secret_key: string | null }>("select site_key, secret_key from tienda_antibot where organizacion_id = $1", [org]);
  return r?.site_key && r.secret_key ? r.site_key : null;
}

async function verificarTurnstile(org: string, token: string, ip: string): Promise<boolean> {
  const r = await una<{ secret_key: string | null }>("select secret_key from tienda_antibot where organizacion_id = $1 and site_key is not null", [org]);
  if (!r?.secret_key) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: r.secret_key, response: token, remoteip: ip }), signal: AbortSignal.timeout(8000),
    });
    const j = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!j.success) console.warn("[antibot] turnstile rechazó:", j["error-codes"]);
    return !!j.success;
  } catch (e) {
    console.error("[antibot] turnstile no contestó, se deja pasar:", e instanceof Error ? e.message : e);
    return true;
  }
}

async function registrar(t: Tienda, ruta: Ruta, ip: string, resultado: string, ua: string | null) {
  try {
    await consulta("insert into tienda_intento (organizacion_id, canal_id, ruta, ip, resultado, user_agent) values ($1, $2, $3, $4, $5, $6)",
      [t.organizacionId, t.canalId, ruta, ip, resultado, ua?.slice(0, 300) || null]);
  } catch (e) {
    console.error("[antibot] no se pudo registrar:", e instanceof Error ? e.message : e);
  }
}

/** Revisa el formulario y, si parece un bot o la conexión pasó su tope, corta con un
 *  mensaje en criollo. Cada intento queda registrado, pase o no. */
export async function controlarBot(t: Tienda, ruta: Ruta, fd: FormData): Promise<void> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";
  const ua = h.get("user-agent");
  const regla = REGLAS[ruta];
  const cortar = async (resultado: string, mensaje: string): Promise<never> => {
    await registrar(t, ruta, ip, resultado, ua);
    throw new ErrorErp(mensaje);
  };

  if (String(fd.get(CAMPO_TRAMPA) ?? "").trim()) await cortar("trampa", "No pudimos procesar el formulario. Recargá la página y probá de nuevo.");
  const desde = await leerMarca(fd.get(CAMPO_MARCA));
  if (desde == null) await cortar("muy_rapido", "No pudimos procesar el formulario. Recargá la página y probá de nuevo.");
  if (Date.now() - desde! > VIGENCIA_MS) await cortar("vencido", "La página quedó abierta mucho tiempo. Recargala y probá de nuevo.");
  if (Date.now() - desde! < regla.minimoMs) await cortar("muy_rapido", "Fue demasiado rápido. Esperá un momento y probá de nuevo.");

  const [n] = await consulta<{ hora: number; dia: number }>(`
    select count(*) filter (where creado_ts > now() - interval '1 hour')::int hora, count(*)::int dia
      from tienda_intento where ruta = $1 and ip = $2 and creado_ts > now() - interval '1 day'`, [ruta, ip]);
  if (n.hora >= regla.porHora || n.dia >= regla.porDia) await cortar("tope_ip", "Hubo demasiados intentos desde esta conexión. Probá de nuevo en un rato.");

  if (!(await verificarTurnstile(t.organizacionId, String(fd.get(CAMPO_TURNSTILE) ?? ""), ip)))
    await cortar("turnstile", "No pudimos verificar que sos una persona. Recargá la página y probá de nuevo.");

  await registrar(t, ruta, ip, "ok", ua);
}
