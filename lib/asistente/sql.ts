// Cambios en los datos a pedido del superadministrador (pedido de Fer, 3/10):
// lo que no está entre las acciones del asistente (lib/asistente/acciones.ts)
// el superadministrador igual se lo puede pedir, y el asistente lo resuelve
// con una instrucción SQL sobre la base de Laucen. Nunca Mercado Libre.
//
// Resguardos:
//   · Corre con el rol de la base de un usuario común (authenticated) y su
//     identidad: las políticas de fila (RLS) sólo dejan ver y tocar las filas
//     de sus organizaciones. Ninguna otra organización está al alcance.
//   · Una sola instrucción: INSERT, UPDATE o DELETE (las consultas, SELECT/WITH
//     de sólo lectura). Nada de cambiar la estructura de la base.
//   · Tablas prohibidas: Mercado Libre (meli_*, ml_*, publicaciones, canales:
//     su configuración prende o apaga lo que va a ML), usuarios y permisos,
//     llaves y credenciales, el propio asistente, y lo que tiene su circuito
//     (stock, asientos, comprobantes de ARCA, cuentas corrientes, caja,
//     estados de pedidos): eso va por su pantalla o su acción.
//   · Primero se ensaya (se corre y se deshace) para mostrar cuántas filas
//     toca y cómo quedan; recién al Confirmar se hace de verdad, y si en el
//     medio cambió la cantidad de filas, no se hace.

import type { PoolClient } from "pg";
import { pool } from "@/db";
import { ErrorErp } from "@/lib/erp/base";

export const TOPE_FILAS_CAMBIO = 1000;
const TOPE_FILAS_CONSULTA = 200;

/** Las tablas que no se tocan, con por dónde se hace en cambio. */
const PROHIBIDAS: [RegExp, string][] = [
  [/^(meli_|ml_)/, "es de Mercado Libre: eso nunca se toca desde acá"],
  [/^(publicacion|canal|canal_deposito)$/, "maneja lo que va a Mercado Libre: se cambia en su pantalla"],
  [/^(usuarios|organizaciones|roles|membresias)$/, "son usuarios y permisos: se cambian en Configuración › Usuarios y roles"],
  [/(_llave|_credencial|^arca_ticket|^erp_llave)$/, "son llaves o credenciales"],
  [/^asistente_/, "es del propio asistente"],
  [/^(stock|movimiento_stock|stock_cambio_pendiente)$/, "el stock se mueve con un ajuste (Stock › Ajustes), así queda el movimiento y se avisa a los canales"],
  [/^(asiento|asiento_linea)$/, "los asientos se hacen con un asiento manual en Contabilidad"],
  [/^(comprobante|comprobante_linea)$/, "los comprobantes de ARCA no se tocan: se anulan con nota de crédito"],
  [/^(cc_movimiento|cc_imputacion|recibo|movimiento_fondos|pago|pedido_estado_historial)$/, "tiene su circuito (cuentas corrientes, caja, pagos): se hace desde su pantalla"],
];

/** Las tablas en las que un cambio puede terminar en Mercado Libre por un interruptor prendido. */
const AVISO_ML = /^(precio|lista_precios|producto|variacion|regla_comercial|kit_componente)$/;

const limpiar = (sql: string) => sql.trim().replace(/;\s*$/, "");

function unaSola(sql: string) {
  // Sin comentarios ni varias instrucciones (un ";" adentro de un texto se acepta).
  const sinTextos = sql.replace(/'(?:[^']|'')*'/g, "''");
  if (/;/.test(sinTextos)) throw new ErrorErp("Una sola instrucción por vez.");
  if (/--|\/\*/.test(sinTextos)) throw new ErrorErp("Sin comentarios en la instrucción.");
  if (/\b(set_config|set\s+role|reset|copy|dblink|pg_read|pg_write|lo_import|lo_export|net\.|http_)/i.test(sinTextos)) throw new ErrorErp("Esa instrucción usa algo que no está permitido.");
  return sinTextos;
}

/** Qué tabla toca un INSERT/UPDATE/DELETE (y que no sea de las prohibidas). */
export function tablaDelCambio(sqlCrudo: string): { tabla: string; tipo: "insert" | "update" | "delete"; aviso: string | null } {
  const sql = limpiar(sqlCrudo);
  const sinTextos = unaSola(sql);
  const m = sinTextos.match(/^\s*(insert\s+into|update|delete\s+from)\s+(?:only\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?(\s*\.)?/i);
  if (!m) throw new ErrorErp("Tiene que ser una sola instrucción INSERT INTO, UPDATE o DELETE FROM sobre una tabla de Laucen.");
  if (m[3]) throw new ErrorErp("Sólo tablas de Laucen (esquema público).");
  const tabla = m[2].toLowerCase();
  const tipo = m[1].toLowerCase().startsWith("insert") ? "insert" : m[1].toLowerCase().startsWith("update") ? "update" : "delete";
  for (const [re, motivo] of PROHIBIDAS) if (re.test(tabla)) throw new ErrorErp(`La tabla ${tabla} ${motivo}.`);
  if (tabla === "pedido" && tipo === "update" && /\bestado(_pago)?\s*=/i.test(sinTextos)) throw new ErrorErp("El estado de un pedido se cambia con la acción de cambiar estado (reserva y libera el stock).");
  if (tipo === "update" && !/\bwhere\b/i.test(sinTextos)) throw new ErrorErp("Un UPDATE sin WHERE cambiaría toda la tabla: poné la condición.");
  if (tipo === "delete" && !/\bwhere\b/i.test(sinTextos)) throw new ErrorErp("Un DELETE sin WHERE borraría toda la tabla: poné la condición.");
  return { tabla, tipo, aviso: AVISO_ML.test(tabla) ? "Ojo: si en un canal de Mercado Libre está prendido el interruptor de precios o de stock, este cambio se va a reflejar en Mercado Libre." : null };
}

/** Corre `fn` como el usuario (rol authenticated + su identidad), con tope de tiempo. Siempre deshace salvo `confirmar`. */
async function comoUsuario<T>(authId: string, soloLectura: boolean, confirmar: boolean, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  if (!authId) throw new ErrorErp("No encuentro tu identidad de usuario: volvé a entrar al sistema.");
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: authId, role: "authenticated" })]);
    await c.query("set local role authenticated");
    await c.query("set local statement_timeout = '15s'");
    if (soloLectura) await c.query("set transaction read only");
    const r = await fn(c);
    await c.query(confirmar && !soloLectura ? "commit" : "rollback");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof ErrorErp) throw e;
    throw new ErrorErp(`La base no lo aceptó: ${msg.slice(0, 300)}`);
  } finally {
    c.release();
  }
}

const valor = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "object" && v !== null ? JSON.stringify(v) : v);
const filasLimpias = (filas: Record<string, unknown>[], n: number) =>
  filas.slice(0, n).map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, valor(v)])));

/** Consulta de sólo lectura (SELECT o WITH … SELECT), hasta 200 filas. */
export async function consultarSql(sqlCrudo: string, authId: string): Promise<string> {
  const sql = limpiar(sqlCrudo);
  const sinTextos = unaSola(sql);
  if (!/^\s*(select|with)\b/i.test(sinTextos)) throw new ErrorErp("Para consultar, una sola instrucción SELECT (o WITH … SELECT).");
  return comoUsuario(authId, true, false, async (c) => {
    const r = await c.query(`select * from (${sql}) q limit ${TOPE_FILAS_CONSULTA + 1}`);
    return JSON.stringify({ filas: filasLimpias(r.rows, TOPE_FILAS_CONSULTA), mas: r.rows.length > TOPE_FILAS_CONSULTA });
  });
}

/** Ensaya el cambio (lo corre y lo deshace): cuántas filas toca y cómo quedan. */
export async function ensayarCambio(sqlCrudo: string, authId: string) {
  const sql = limpiar(sqlCrudo);
  const t = tablaDelCambio(sql);
  const conReturning = /\breturning\b/i.test(sql.replace(/'(?:[^']|'')*'/g, "''")) ? sql : `${sql} returning *`;
  const r = await comoUsuario(authId, false, false, (c) => c.query(conReturning));
  const n = r.rowCount ?? 0;
  if (n > TOPE_FILAS_CAMBIO) throw new ErrorErp(`Tocaría ${n} filas: de a ${TOPE_FILAS_CAMBIO} por vez.`);
  if (n === 0) throw new ErrorErp("No toca ninguna fila (o no son de tu organización): revisá la condición.");
  return { ...t, sql, filas: n, muestra: filasLimpias(r.rows, 15) };
}

/** Hace el cambio de verdad, sólo si toca la misma cantidad de filas que en el ensayo. */
export async function hacerCambio(sql: string, esperado: number, authId: string): Promise<number> {
  tablaDelCambio(sql);
  return comoUsuario(authId, false, true, async (c) => {
    const r = await c.query(sql);
    if ((r.rowCount ?? 0) !== esperado) throw new ErrorErp(`Ahora tocaría ${r.rowCount} filas y al prepararlo eran ${esperado}: no hice nada, pedímelo de nuevo.`);
    return esperado;
  });
}
