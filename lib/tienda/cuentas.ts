// Cuentas de la tienda: el comprador puede crear su cuenta "en un clic"
// después de comprar (pone una contraseña; el mail y los datos ya están en el
// pedido). NO son usuarios del sistema (no entran al panel): tabla
// cliente_cuenta, contraseña con scrypt, sesión en una cookie firmada.

import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import type { Tienda } from "@/lib/tienda/tienda";

const DIAS = 60;

async function secreto(): Promise<string> {
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
    select p.cliente_id::int, cl.email from pedido p join cliente cl on cl.id = p.cliente_id
     where p.organizacion_id = $1 and p.canal_id = $2 and p.codigo_seguimiento = $3`, [t.organizacionId, t.canalId, codigo]);
  if (!p?.email) throw new ErrorErp("No encontramos el pedido.");
  const ya = await una("select 1 from cliente_cuenta where organizacion_id = $1 and email = $2", [t.organizacionId, p.email]);
  if (ya) throw new ErrorErp("Ya hay una cuenta con ese mail: ingresá con tu contraseña.");
  const r = await una<{ id: number }>("insert into cliente_cuenta (organizacion_id, cliente_id, email, clave_hash) values ($1, $2, $3, $4) returning id::int",
    [t.organizacionId, p.cliente_id, p.email, hash(clave)]);
  await abrirSesion(t, r!.id);
}

export async function ingresar(t: Tienda, email: string, clave: string) {
  const c = await una<{ id: number; clave_hash: string }>("select id::int, clave_hash from cliente_cuenta where organizacion_id = $1 and email = lower($2)",
    [t.organizacionId, email.trim()]);
  if (!c || !coincide(clave, c.clave_hash)) throw new ErrorErp("El mail o la contraseña no coinciden.");
  await consulta("update cliente_cuenta set ultimo_ingreso = now() where id = $1", [c.id]);
  await abrirSesion(t, c.id);
}
