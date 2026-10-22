// Destinatarios de las transferencias del espacio personal (pedido de Fer, 18/10).
// Mercado Pago no informa a qué cuenta fue una transferencia a CBU/CVU; el mail
// «Tu transferencia fue enviada» sí (nombre, banco y número de cuenta). Cada mail
// es un aviso (personal.transferencia_aviso, lo carga una sesión de Claude que lee
// el Gmail del dueño) y se empareja con su movimiento por importe y hora: salen con
// segundos de diferencia, y nunca un aviso con dos movimientos.
//
// La cuenta destino de un movimiento: el CBU/CVU del mail; si no hay, el usuario
// de Mercado Pago que lo recibió («mp:<número>»); si tampoco, nombre y banco del
// mail. Cada cuenta destino se asigna a un proveedor (personal.proveedor_cuenta),
// con su tipo de gasto: toda transferencia a esa cuenta se clasifica sola
// (lib/mercadopago/gastos.ts). Un proveedor puede tener varias cuentas.

import { consulta } from "@/lib/erp/base";
import { RETIROS } from "@/lib/mercadopago/normalizar";
import type { Clasificado } from "@/lib/mercadopago/gastos";

export type Aviso = { id: number; fecha: Date; importe: number; nombre: string | null; entidad: string | null; cuenta: string | null };
export type Proveedor = { id: number; nombre: string; categoria: string | null; ambito_gasto: string | null; recurrencia: string | null };

/** Diferencia máxima entre el mail y el movimiento. */
const VENTANA_MS = 30 * 60_000;

/** Empareja cada movimiento de salida con el mail de su transferencia: mismo importe y la hora más cercana
 *  dentro de la ventana; cada mail y cada movimiento, una sola vez (primero los pares más cercanos). Pura. */
export function emparejarAvisos<M extends { clave: string; fecha: Date | null; importe_neto: number }>(movs: M[], avisos: Aviso[]): Map<string, Aviso> {
  const porImporte = new Map<string, Aviso[]>();
  for (const a of avisos) {
    const k = Number(a.importe).toFixed(2);
    const l = porImporte.get(k);
    if (l) l.push(a); else porImporte.set(k, [a]);
  }
  const pares: { m: M; a: Aviso; dif: number }[] = [];
  for (const m of movs) {
    if (!m.fecha || !(Number(m.importe_neto) < 0)) continue;
    for (const a of porImporte.get((-Number(m.importe_neto)).toFixed(2)) ?? []) {
      const dif = Math.abs(new Date(a.fecha).getTime() - new Date(m.fecha).getTime());
      if (dif <= VENTANA_MS) pares.push({ m, a, dif });
    }
  }
  pares.sort((x, y) => x.dif - y.dif);
  const salida = new Map<string, Aviso>(), usados = new Set<number>();
  for (const { m, a } of pares) {
    if (salida.has(m.clave) || usados.has(a.id)) continue;
    salida.set(m.clave, a);
    usados.add(a.id);
  }
  return salida;
}

/** La cuenta destino de un movimiento (ver arriba). */
export function cuentaDestino(aviso: Aviso | undefined, contraparte: string | null): string | null {
  if (aviso?.cuenta) return aviso.cuenta;
  if (contraparte) return `mp:${contraparte}`;
  if (aviso?.nombre) return `${aviso.nombre} · ${aviso.entidad ?? "sin banco"}`;
  return null;
}

/** Cómo se muestra una cuenta destino. */
export function textoCuenta(cuenta: string) {
  if (cuenta.startsWith("mp:")) return `Usuario de Mercado Pago ${cuenta.slice(3)}`;
  if (/^\d{22}$/.test(cuenta)) return `${cuenta.startsWith("000") ? "CVU" : "CBU"} ${cuenta}`;
  return `Sin número (${cuenta})`;
}

export async function avisosDelEspacio(espacioId: number): Promise<Aviso[]> {
  return consulta<Aviso>("select id::int, fecha, importe::float8 importe, nombre, entidad, cuenta from personal.transferencia_aviso where espacio_id = $1", [espacioId]);
}

/** Los nombres de los titulares de las cuentas personales del espacio (del último inventario). */
export async function titularesDelEspacio(espacioId: number): Promise<string[]> {
  const f = await consulta<{ nombre: string | null }>(`
    select (select s.datos->'usuario'->>'nombre' from personal.mp_sonda s where s.conexion_id = c.id order by s.ts desc limit 1) nombre
      from personal.mp_conexion c where c.espacio_id = $1`, [espacioId]);
  return f.map((x) => x.nombre).filter((x): x is string => !!x);
}

export async function proveedoresDelEspacio(espacioId: number): Promise<Proveedor[]> {
  return consulta<Proveedor>("select id::int, nombre, categoria, ambito_gasto, recurrencia from personal.proveedor where espacio_id = $1 order by nombre", [espacioId]);
}

/** Cuenta destino → proveedor. */
export async function asignacionesDelEspacio(espacioId: number): Promise<Map<string, Proveedor>> {
  const f = await consulta<Proveedor & { cuenta: string }>(`
    select pc.cuenta, p.id::int, p.nombre, p.categoria, p.ambito_gasto, p.recurrencia
      from personal.proveedor_cuenta pc join personal.proveedor p on p.id = pc.proveedor_id where pc.espacio_id = $1`, [espacioId]);
  return new Map(f.map(({ cuenta, ...p }) => [cuenta, p]));
}

/** Crea un proveedor (o devuelve el que ya tiene ese nombre). */
export async function crearProveedor(espacioId: number, nombre: string): Promise<Proveedor> {
  const n = nombre.trim().replace(/\s+/g, " ");
  if (!n) throw new Error("Falta el nombre del proveedor.");
  const f = await consulta<Proveedor>(`
    insert into personal.proveedor (espacio_id, nombre) values ($1, $2)
    on conflict (espacio_id, nombre) do update set nombre = excluded.nombre
    returning id::int, nombre, categoria, ambito_gasto, recurrencia`, [espacioId, n]);
  return f[0];
}

/** Asigna una cuenta destino a un proveedor (o la suelta, con proveedorId null) y, si vienen, le pone su tipo de gasto. */
export async function asignarCuenta(espacioId: number, usuarioId: string, cuenta: string, proveedorId: number | null, datos?: { categoria: string | null; ambito: string | null; recurrencia: string | null }) {
  if (!cuenta) throw new Error("Falta la cuenta destino.");
  if (proveedorId == null) {
    await consulta("delete from personal.proveedor_cuenta where espacio_id = $1 and cuenta = $2", [espacioId, cuenta]);
    return;
  }
  const ok = await consulta("select 1 from personal.proveedor where id = $1 and espacio_id = $2", [proveedorId, espacioId]);
  if (!ok.length) throw new Error("Ese proveedor no es de este espacio.");
  await consulta(`insert into personal.proveedor_cuenta (espacio_id, cuenta, proveedor_id, usuario_id) values ($1, $2, $3, $4)
    on conflict (espacio_id, cuenta) do update set proveedor_id = excluded.proveedor_id, usuario_id = excluded.usuario_id, creado_ts = now()`,
    [espacioId, cuenta, proveedorId, usuarioId]);
  if (datos) await editarProveedor(espacioId, proveedorId, datos);
}

/** Cambia el tipo de gasto (y, si viene, el nombre) de un proveedor: vale para todas sus cuentas. */
export async function editarProveedor(espacioId: number, proveedorId: number, datos: { nombre?: string; categoria: string | null; ambito: string | null; recurrencia: string | null }) {
  const nombre = datos.nombre?.trim().replace(/\s+/g, " ");
  if (datos.nombre !== undefined && !nombre) throw new Error("Falta el nombre del proveedor.");
  const f = await consulta(`update personal.proveedor set nombre = coalesce($3, nombre), categoria = $4, ambito_gasto = $5, recurrencia = $6
    where id = $1 and espacio_id = $2 returning id`, [proveedorId, espacioId, nombre ?? null, datos.categoria, datos.ambito, datos.recurrencia]);
  if (!f.length) throw new Error("Ese proveedor no es de este espacio.");
}

export async function borrarProveedor(espacioId: number, proveedorId: number) {
  await consulta("delete from personal.proveedor where id = $1 and espacio_id = $2", [proveedorId, espacioId]);
}

export type Destinatario = {
  cuenta: string; titular: string | null; entidad: string | null; ejemplo: string | null;
  cantidad: number; total: number; ultima: Date | null; proveedor: string | null; categoria: string;
};

/** Las cuentas destino de las salidas personales, con cuántas veces y cuánta plata (de mayor a menor). Las salidas sin
 *  cuenta destino (transferencias sin mail) van aparte. Pura. */
export function agruparDestinatarios(movs: Clasificado[]): { lista: Destinatario[]; sinDestino: { cantidad: number; total: number } } {
  const grupos = new Map<string, Clasificado[]>();
  const sinDestino = { cantidad: 0, total: 0 };
  for (const m of movs) {
    if (m.ambito_cuenta !== "personal" || !(m.importe_neto < 0)) continue;
    if (!m.destino) {
      if (RETIROS.has(m.tipo_original)) { sinDestino.cantidad++; sinDestino.total += -m.importe_neto; }
      continue;
    }
    const l = grupos.get(m.destino);
    if (l) l.push(m); else grupos.set(m.destino, [m]);
  }
  const lista = [...grupos].map(([cuenta, l]) => {
    l.sort((a, b) => +(b.fecha ?? 0) - +(a.fecha ?? 0));
    const conMail = l.find((x) => x.destino_nombre);
    return {
      cuenta, titular: conMail?.destino_nombre ?? null, entidad: conMail?.destino_entidad ?? null,
      ejemplo: (l.find((x) => x.api_descripcion)?.api_descripcion ?? l[0].descripcion ?? null)?.slice(0, 60) ?? null,
      cantidad: l.length, total: Math.round(l.reduce((s, x) => s - x.importe_neto, 0) * 100) / 100, ultima: l[0].fecha,
      proveedor: l[0].proveedor, categoria: l[0].categoria,
    };
  }).sort((a, b) => b.total - a.total);
  sinDestino.total = Math.round(sinDestino.total * 100) / 100;
  return { lista, sinDestino };
}
