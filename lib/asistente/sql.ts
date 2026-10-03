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
//
// Y las consultas libres de sólo lectura (más abajo), para el
// superadministrador y para quien tenga «Consultas libres al asistente».

import type { PoolClient } from "pg";
import { pool } from "@/db";
import { ErrorErp } from "@/lib/erp/base";
import { tienePermiso, type Permisos, type PermisoKey } from "@/lib/permisos";

export const TOPE_FILAS_CAMBIO = 1000;
const TOPE_FILAS_CONSULTA = 200;
/** Lo que baja el Excel de una consulta del asistente. */
export const TOPE_FILAS_EXCEL = 50_000;

/** Las tablas que no se tocan, con por dónde se hace en cambio. */
const PROHIBIDAS: [RegExp, string][] = [
  [/^(meli_|ml_)/, "es de Mercado Libre: eso nunca se toca desde acá"],
  [/^(publicacion|canal|canal_deposito)$/, "maneja lo que va a Mercado Libre: se cambia en su pantalla"],
  [/^(usuarios|organizaciones|roles|membresias)$/, "son usuarios y permisos: se cambian en Configuración › Usuarios y roles"],
  [/(_llave|_credencial|^arca_ticket|^erp_llave)$/, "son llaves o credenciales"],
  [/^asistente_/, "es del propio asistente"],
  [/^(chat|chat_mensaje|chat_caso|chat_espera|wa_evento)$/, "son los mensajes de WhatsApp de los clientes (se manejan desde Ventas › WhatsApp)"],
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

// ── Consultas libres (sólo lectura) ──────────────────────────────────
// Las hace el superadministrador o quien tenga «Consultas libres al
// asistente» (pedido de Fer, 3/10). Las políticas de fila ya cuidan la
// organización, pero no saben de roles: por eso cada tabla está atada al
// permiso de su pantalla y quien no lo tiene no la puede consultar (una
// tabla que no está en la lista, sólo el superadministrador). Las llaves y
// credenciales no las consulta nadie.

type Permiso = PermisoKey | "todos";
const TABLAS_PERMISO: [RegExp, Permiso[]][] = [
  [/^(cliente|cliente_cuenta|cliente_direccion|cliente_identidad)$/, ["clientes_ver", "pedidos_ver"]],
  [/^(pedido|pedido_linea|pedido_estado_historial|envio|pago)$/, ["pedidos_ver"]],
  [/^(producto|producto_atributo|producto_foto|producto_cucarda|producto_costo|variacion|variacion_atributo|variacion_foto|kit_componente|sku_equivalencia|familia|familia_cucarda|familia_costo|cucarda)$/, ["productos_ver"]],
  [/^(precio|lista_precios|regla_comercial)$/, ["precios_ver"]],
  [/^(ml_plan_config|ml_plan_destacado|ml_price_to_win|ml_promo_item|ml_promo_leida|ml_regla_precio|ml_volumen_escala|ml_lote|ml_costos_\w+)$/, ["precios_ml_ver"]],
  [/^(publicacion|meli_item|meli_item_cambio|meli_publicaciones|meli_cuenta|meli_cuentas|ml_cola|ml_cola_canal|ml_barrida|meli_notificacion)$/, ["publicaciones_ver"]],
  [/^(meli_pregunta|meli_conversacion|meli_mensaje)$/, ["preguntas_ver"]],
  [/^(reclamo|reclamo_evento|reclamo_mensaje)$/, ["reclamos_ver"]],
  [/^(stock|movimiento_stock|stock_cambio_pendiente|deposito|ubicacion)$/, ["stock_ver", "depositos_ver"]],
  [/^(picking_item|picking_lote|picking_pedido)$/, ["picking_ver"]],
  [/^(recepcion|recepcion_linea)$/, ["recepcion_ver"]],
  [/^(canal|canal_deposito)$/, ["canales_ver"]],
  [/^metodo_envio$/, ["tienda_config", "envios_ver"]],
  [/^tienda_dominio$/, ["tienda_config"]],
  [/^medio_pago$/, ["medios_pago_ver"]],
  [/^proveedor$/, ["proveedores_ver", "compras_ver"]],
  [/^(factura_compra|factura_compra_linea|arca_mc_lote)$/, ["compras_ver"]],
  [/^(despacho_importacion|despacho_linea)$/, ["despachos_ver"]],
  [/^(comprobante|comprobante_linea|emisor)$/, ["facturacion_ver"]],
  [/^(cc_movimiento|cc_imputacion|recibo)$/, ["cuentas_corrientes_ver"]],
  [/^(cuenta_fondos|movimiento_fondos|extracto_linea)$/, ["tesoreria_ver"]],
  [/^(asiento|asiento_linea|plan_cuenta)$/, ["contabilidad_ver"]],
  [/^(ml_cargo|ml_factura_documento|ml_factura_periodo|ml_facturacion_lectura)$/, ["facturacion_ml_ver"]],
  [/^empresa$/, ["empresa_config"]],
  [/^(importacion|importacion_fila|importacion_mapeo|importacion_vs|importacion_vs_sku)$/, ["importar_ver"]],
  [/^(radar_\w+|meli_tendencias|meli_tendencias_lecturas|meli_busquedas|meli_categorias)$/, ["radar_ver"]],
  [/^(arca_cargas|arca_impo_items|arca_depuracion|agg_\w+|softrade_\w+|rubros|rubro_ncm|ncm_clasificaciones|importacion_arca)$/, ["importaciones_ver"]],
  [/^(asistente_conversacion|asistente_mensaje|asistente_accion|asistente_pendiente)$/, ["asistente_historial_ver"]],
  [/^(chat|chat_mensaje|chat_caso)$/, ["mensajes_ver"]],
  [/^(tipo_cambio|ref_\w+)$/, ["todos"]],
];
const SECRETAS = /(_llave|_credencial|^arca_ticket|^erp_llave|^arca_credencial|^medio_pago_credencial)$/;

let tablasCache: Promise<Set<string>> | null = null;
let funcionesCache: Promise<Set<string>> | null = null;
const nombres = (sql: string) => new Promise<Set<string>>((ok, mal) => {
  pool.query<{ n: string }>(sql).then((r) => ok(new Set(r.rows.map((x) => x.n))), mal);
});
const tablasPublicas = () => (tablasCache ??= nombres("select tablename n from pg_tables where schemaname = 'public'").catch((e) => { tablasCache = null; throw e; }));
let sinPoliticaCache: Promise<Set<string>> | null = null;
const tablasSinPolitica = () => (sinPoliticaCache ??= nombres(`
  select t.tablename n from pg_tables t where t.schemaname = 'public'
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)`).catch((e) => { sinPoliticaCache = null; throw e; }));
const funcionesPublicas = () => (funcionesCache ??= nombres(`select distinct p.proname n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'`).catch((e) => { funcionesCache = null; throw e; }));

/** Controla una consulta: sólo lectura, nada secreto y (si no es superadministrador) sólo tablas de sus permisos. */
export async function revisarConsulta(sqlCrudo: string, permisos: Permisos, superadmin: boolean): Promise<string> {
  const [tablas, funciones, sinPolitica] = await Promise.all([tablasPublicas(), funcionesPublicas(), tablasSinPolitica()]);
  return revisarConsultaCon(sqlCrudo, permisos, superadmin, tablas, funciones, sinPolitica);
}

/** Lo mismo, con las tablas y funciones de la base ya leídas (sin base: se prueba sola).
 *  `sinPolitica`: tablas sin política de fila (datos compartidos, como el Radar o las
 *  importaciones de ARCA): con el rol de usuario darían vacío, así que se avisa. */
export function revisarConsultaCon(sqlCrudo: string, permisos: Permisos, superadmin: boolean, todas: Set<string>, funciones: Set<string>, sinPolitica: Set<string> = new Set()): string {
  const sql = limpiar(sqlCrudo);
  const sinTextos = unaSola(sql);
  if (!/^\s*(select|with)\b/i.test(sinTextos)) throw new ErrorErp("Para consultar, una sola instrucción SELECT (o WITH … SELECT).");
  // Las tablas que nombra (de las que existen en Laucen).
  const tablas = [...new Set(sinTextos.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? [])].filter((p) => todas.has(p));
  const secretas = tablas.filter((t) => SECRETAS.test(t));
  if (secretas.length) throw new ErrorErp("Las llaves y credenciales no se consultan.");
  const compartidas = tablas.filter((t) => sinPolitica.has(t));
  if (compartidas.length) throw new ErrorErp(`Desde acá todavía no se pueden consultar ${compartidas.join(", ")} (son datos compartidos del sistema): mirálos en su pantalla.`);
  if (superadmin) return sql;
  // Las funciones de Laucen leen tablas por dentro: quien no es superadministrador consulta las tablas.
  const llamadas = [...sinTextos.toLowerCase().matchAll(/([a-z_][a-z0-9_]*)\s*\(/g)].map((m) => m[1]).filter((f) => funciones.has(f));
  if (llamadas.length) throw new ErrorErp(`Consultá las tablas directamente (sin funciones del sistema: ${llamadas.join(", ")}).`);
  for (const t of tablas) {
    const regla = TABLAS_PERMISO.find(([re]) => re.test(t));
    if (!regla) throw new ErrorErp(`La tabla ${t} sólo la consulta un superadministrador.`);
    if (!regla[1].some((p) => p === "todos" || tienePermiso(permisos, p))) throw new ErrorErp(`Eso (${t}) es de una pantalla que este rol no tiene: lo maneja otro rol.`);
  }
  return sql;
}

/** Consulta de sólo lectura (SELECT o WITH … SELECT), hasta `tope` filas, como el usuario. */
export async function consultarSql(sqlCrudo: string, authId: string, permisos: Permisos, superadmin: boolean, tope = TOPE_FILAS_CONSULTA) {
  const sql = await revisarConsulta(sqlCrudo, permisos, superadmin);
  return comoUsuario(authId, true, false, async (c) => {
    const r = await c.query(`select * from (${sql}) q limit ${Math.trunc(tope) + 1}`);
    return { sql, columnas: r.fields.map((f) => f.name), filas: filasLimpias(r.rows, tope), mas: r.rows.length > tope };
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
