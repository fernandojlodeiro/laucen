// Cuentas de la tienda: el comprador puede crear su cuenta "en un clic"
// después de comprar (pone una contraseña; el mail y los datos ya están en el
// pedido). NO son usuarios del sistema (no entran al panel): tabla
// cliente_cuenta, contraseña con scrypt, sesión en una cookie firmada.

import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { after } from "next/server";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import type { Tienda } from "@/lib/tienda/tienda";

const DIAS = 60;

/** El secreto de las firmas de la tienda (sesión del comprador, antibot). */
export async function secreto(): Promise<string> {
  const r = await una<{ valor: string }>("select valor #>> '{}' valor from config_org where organizacion_id is null and clave = 'tienda_secreto'");
  if (r?.valor) return r.valor;
  const nuevo = randomBytes(32).toString("hex");
  await consulta(`insert into config_org (organizacion_id, clave, valor) values (null, 'tienda_secreto', to_jsonb($1::text))
                  on conflict (coalesce(organizacion_id, ''), clave) do nothing`, [nuevo]);
  return (await una<{ valor: string }>("select valor #>> '{}' valor from config_org where organizacion_id is null and clave = 'tienda_secreto'"))!.valor;
}

const hash = (clave: string) => {
  const sal = randomBytes(16).toString("hex");
  return `${sal}:${scryptSync(clave, sal, 32).toString("hex")}`;
};
const coincide = (clave: string, guardado: string) => {
  const [sal, h] = guardado.split(":");
  return timingSafeEqual(Buffer.from(h, "hex"), scryptSync(clave, sal, 32));
};

async function abrirSesion(t: Tienda, cuentaId: number) {
  const vence = Date.now() + DIAS * 86400_000;
  const cuerpo = `${cuentaId}.${vence}`;
  const firma = createHmac("sha256", await secreto()).update(`${t.organizacionId}.${cuerpo}`).digest("base64url");
  (await cookies()).set(`tienda_${t.slug}`, `${cuerpo}.${firma}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: DIAS * 86400, secure: true });
}

export async function cerrarSesion(t: Tienda) {
  (await cookies()).delete(`tienda_${t.slug}`);
}

export type CuentaTienda = { id: number; clienteId: number; email: string; nombre: string; cuentaCorriente: boolean };

/** La cuenta con la que está logueado el comprador en esta tienda, o null. */
export async function cuentaActual(t: Tienda): Promise<CuentaTienda | null> {
  const v = (await cookies()).get(`tienda_${t.slug}`)?.value;
  const m = v?.match(/^(\d+)\.(\d+)\.([\w-]+)$/);
  if (!m || Number(m[2]) < Date.now()) return null;
  const esperado = createHmac("sha256", await secreto()).update(`${t.organizacionId}.${m[1]}.${m[2]}`).digest("base64url");
  if (esperado.length !== m[3].length || !timingSafeEqual(Buffer.from(esperado), Buffer.from(m[3]))) return null;
  const c = await una<{ id: number; cliente_id: number; email: string; nombre: string; cuenta_corriente: boolean }>(`
    select cc.id::int, cc.cliente_id::int, cc.email, cl.nombre, cl.cuenta_corriente from cliente_cuenta cc join cliente cl on cl.id = cc.cliente_id
     where cc.id = $1 and cc.organizacion_id = $2`, [Number(m[1]), t.organizacionId]);
  return c ? { id: c.id, clienteId: c.cliente_id, email: c.email, nombre: c.nombre, cuentaCorriente: c.cuenta_corriente } : null;
}

/** Crear la cuenta después de comprar: con el código del pedido y una contraseña. */
export async function crearCuentaDesdePedido(t: Tienda, codigo: string, clave: string) {
  if (clave.length < 8) throw new ErrorErp("La contraseña tiene que tener al menos 8 caracteres.");
  const p = await una<{ cliente_id: number; email: string | null }>(`
    select p.cliente_id::int, lower(coalesce(p.datos_externos #>> '{tienda,contacto,email}', cl.email)) email from pedido p join cliente cl on cl.id = p.cliente_id
     where p.organizacion_id = $1 and p.canal_id = $2 and p.codigo_seguimiento = $3`, [t.organizacionId, t.canalId, codigo]);
  if (!p?.email) throw new ErrorErp("No encontramos el pedido.");
  const ya = await una("select 1 from cliente_cuenta where organizacion_id = $1 and email = $2", [t.organizacionId, p.email]);
  if (ya) throw new ErrorErp("Ya hay una cuenta con ese mail: ingresá con tu contraseña.");
  const r = await una<{ id: number }>("insert into cliente_cuenta (organizacion_id, cliente_id, email, clave_hash) values ($1, $2, $3, $4) returning id::int",
    [t.organizacionId, p.cliente_id, p.email, hash(clave)]);
  await abrirSesion(t, r!.id);
  // El mail de bienvenida, desde la marca por donde entró (lib/correo/mails.ts), después de contestar.
  const email = p.email;
  after(async () => {
    const { mailBienvenida } = await import("@/lib/correo/mails");
    const n = await una<{ nombre: string | null }>("select coalesce(nombre_pila, nombre) nombre from cliente where id = $1", [p.cliente_id]);
    await mailBienvenida(t, email, n?.nombre ?? null).catch(() => null);
  });
}

export async function ingresar(t: Tienda, email: string, clave: string) {
  const c = await una<{ id: number; clave_hash: string }>("select id::int, clave_hash from cliente_cuenta where organizacion_id = $1 and email = lower($2)",
    [t.organizacionId, email.trim()]);
  if (!c || !coincide(clave, c.clave_hash)) throw new ErrorErp("El mail o la contraseña no coinciden.");
  await consulta("update cliente_cuenta set ultimo_ingreso = now() where id = $1", [c.id]);
  await abrirSesion(t, c.id);
}

// ── Crear la cuenta cuando quiera y recuperar la contraseña (Fer, 25/10) ──
// Los dos van por un link al mail (tabla cuenta_tienda_token: el hash del código, vence, se usa una vez).
// Para no contarle a nadie qué mails tienen cuenta, la pantalla contesta siempre lo mismo.

const sha = (x: string) => createHmac("sha256", "cuenta_tienda").update(x).digest("hex");
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function nuevoToken(t: Tienda, tipo: "registro" | "recuperar", email: string, horas: number, extra: { nombre?: string; claveHash?: string } = {}) {
  const codigo = randomBytes(24).toString("base64url");
  await consulta(`insert into cuenta_tienda_token (organizacion_id, canal_id, tipo, email, nombre, clave_hash, token_hash, vence_ts)
                  values ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(hours => $8))`,
    [t.organizacionId, t.canalId, tipo, email, extra.nombre ?? null, extra.claveHash ?? null, sha(codigo), horas]);
  return codigo;
}

async function tomarToken(t: Tienda, tipo: "registro" | "recuperar", codigo: string) {
  return una<{ id: number; email: string; nombre: string | null; clave_hash: string | null }>(`
    update cuenta_tienda_token set usado_ts = now()
     where token_hash = $1 and organizacion_id = $2 and canal_id = $3 and tipo = $4 and usado_ts is null and vence_ts > now()
    returning id::int, email, nombre, clave_hash`, [sha(codigo), t.organizacionId, t.canalId, tipo]);
}

/** «Crear cuenta»: guarda el pedido de alta y manda el mail para confirmar. Si ya tiene cuenta, le manda
 *  el link para cambiar la contraseña (y la pantalla dice lo mismo en los dos casos). */
export async function pedirRegistro(t: Tienda, nombre: string, email: string, clave: string): Promise<void> {
  const mail = email.trim().toLowerCase();
  if (!nombre.trim()) throw new ErrorErp("Escribí tu nombre.");
  if (!MAIL.test(mail)) throw new ErrorErp("Escribí un mail válido.");
  if (clave.length < 8) throw new ErrorErp("La contraseña tiene que tener al menos 8 caracteres.");
  const { mailConfirmarCuenta, mailRecuperarClave } = await import("@/lib/correo/mails");
  if (await una("select 1 from cliente_cuenta where organizacion_id = $1 and email = $2", [t.organizacionId, mail])) {
    const codigo = await nuevoToken(t, "recuperar", mail, 1);
    after(() => mailRecuperarClave(t, mail, codigo, true).catch((e) => console.error("[cuenta] mail", e)));
    return;
  }
  const codigo = await nuevoToken(t, "registro", mail, 24, { nombre: nombre.trim().slice(0, 120), claveHash: hash(clave) });
  after(() => mailConfirmarCuenta(t, mail, nombre.trim(), codigo).catch((e) => console.error("[cuenta] mail", e)));
}

/** El link del mail de alta: crea la cuenta (con el cliente que ya tenga ese mail, o uno nuevo) y la abre.
 *  Devuelve false si el link venció o ya se usó. */
export async function confirmarRegistro(t: Tienda, codigo: string): Promise<boolean> {
  const r = await tomarToken(t, "registro", codigo);
  if (!r?.clave_hash) return false;
  if (await una("select 1 from cliente_cuenta where organizacion_id = $1 and email = $2", [t.organizacionId, r.email])) return false;
  const cliente = await una<{ id: number }>("select id::int from cliente where organizacion_id = $1 and lower(email) = $2 order by id limit 1", [t.organizacionId, r.email])
    ?? await una<{ id: number }>("insert into cliente (organizacion_id, nombre, email) values ($1, $2, $3) returning id::int", [t.organizacionId, r.nombre ?? r.email, r.email]);
  const c = await una<{ id: number }>("insert into cliente_cuenta (organizacion_id, cliente_id, email, clave_hash) values ($1, $2, $3, $4) returning id::int",
    [t.organizacionId, cliente!.id, r.email, r.clave_hash]);
  await abrirSesion(t, c!.id);
  const nombre = r.nombre;
  after(async () => {
    const { mailBienvenida } = await import("@/lib/correo/mails");
    await mailBienvenida(t, r.email, nombre).catch(() => null);
  });
  return true;
}

/** «Olvidé mi contraseña»: si el mail tiene cuenta, le manda el link (vale una hora). */
export async function pedirRecuperacion(t: Tienda, email: string): Promise<void> {
  const mail = email.trim().toLowerCase();
  if (!MAIL.test(mail)) throw new ErrorErp("Escribí un mail válido.");
  if (!(await una("select 1 from cliente_cuenta where organizacion_id = $1 and email = $2", [t.organizacionId, mail]))) return;
  const codigo = await nuevoToken(t, "recuperar", mail, 1);
  const { mailRecuperarClave } = await import("@/lib/correo/mails");
  after(() => mailRecuperarClave(t, mail, codigo, false).catch((e) => console.error("[cuenta] mail", e)));
}

/** El link del mail de recuperación: pone la contraseña nueva y abre la sesión. */
export async function cambiarClave(t: Tienda, codigo: string, clave: string): Promise<void> {
  if (clave.length < 8) throw new ErrorErp("La contraseña tiene que tener al menos 8 caracteres.");
  const r = await tomarToken(t, "recuperar", codigo);
  if (!r) throw new ErrorErp("El link venció o ya se usó. Pedí uno nuevo con «Olvidé mi contraseña».");
  const c = await una<{ id: number }>("update cliente_cuenta set clave_hash = $3 where organizacion_id = $1 and email = $2 returning id::int",
    [t.organizacionId, r.email, hash(clave)]);
  if (!c) throw new ErrorErp("No encontramos la cuenta.");
  await abrirSesion(t, c.id);
}
