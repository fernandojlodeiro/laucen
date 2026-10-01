// Ejecuta una importación: toma las filas pendientes, las procesa según el
// destino y deja en cada `importacion_fila` el resultado (ok o error con el
// motivo en criollo). Corre de a lotes con un tope de tiempo, para no pasar
// el límite de una función de Vercel: si quedan pendientes, "Seguir" vuelve
// a llamar y arranca donde quedó (sólo toma las filas sin resultado).
//
// Cada fila (o cada venta, que puede ser varias filas) va en su propia
// transacción junto con la marca de su resultado: si se corta en el medio,
// nada queda importado sin marcar ni marcado sin importar.

import type { PoolClient } from "pg";
import { pool } from "@/db";
import { consulta, una, enTransaccion, ErrorErp, motivoErp, type Consultor } from "@/lib/erp/base";
import { leerNumero } from "@/lib/numeros";
import { guardarPrecio } from "@/lib/precios";
import { moverStock } from "@/lib/stock";
import { crearPedido, type LineaEntrada } from "@/lib/pedidos";
import type { Moneda } from "@/lib/moneda";
import { esDestino, faltanObligatorios, type Destino } from "@/lib/importar/campos";
import type { Valor } from "@/lib/importar/leer";

/** El canal donde entran las ventas históricas (se crea solo, sin lista). */
export const CANAL_HISTORICO = "Histórico Virtual Seller";

const FILAS_POR_VUELTA = 200;

type Fila = { n: number; datos: Record<string, Valor> };
type Ctx = {
  org: string;
  importacionId: number;
  usuarioId: string;
  mapeo: Record<string, string>;
  cache: Map<string, number>;
  listas: Map<string, { id: number; moneda: Moneda }>;
};

// ── Lectura de valores ───────────────────────────────────

const get = (ctx: Ctx, d: Record<string, Valor>, campo: string): Valor => {
  const col = ctx.mapeo[campo];
  return col ? (d[col] ?? null) : null;
};
const txt = (v: Valor): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
function num(v: Valor, que: string): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : leerNumero(v);
  if (n == null) throw new ErrorErp(`${que}: "${v}" no es un número.`);
  return n;
}
function noNegativo(v: Valor, que: string): number | null {
  const n = num(v, que);
  if (n != null && n < 0) throw new ErrorErp(`${que} no puede ser negativo.`);
  return n;
}
function moneda(v: Valor): Moneda | null {
  const t = txt(v)?.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!t) return null;
  if (["ARS", "$", "PESOS", "PESO", "ARG", "AR$"].includes(t)) return "ARS";
  if (["USD", "US$", "U$S", "U$D", "DOLAR", "DOLARES", "U$"].includes(t)) return "USD";
  throw new ErrorErp(`Moneda desconocida: "${v}" (tiene que ser ARS o USD).`);
}

/** Fecha de la planilla → "2026-03-15" o "2026-03-15T14:30:00" (hora argentina). */
export function leerFecha(v: Valor): string | null {
  if (v == null || v === "") return null;
  const dos = (x: number) => String(x).padStart(2, "0");
  const armar = (a: number, m: number, d: number, h = 0, mi = 0, s = 0) => {
    const f = new Date(Date.UTC(a, m - 1, d, h, mi, s));
    if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d || a < 1990 || a > 2100) return null;
    const dia = `${a}-${dos(m)}-${dos(d)}`;
    return h || mi || s ? `${dia}T${dos(h)}:${dos(mi)}:${dos(s)}` : dia;
  };
  if (typeof v === "number") {
    // Número de serie de Excel (días desde el 30/12/1899).
    if (v < 20000 || v > 80000) return null;
    const f = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400) * 1000);
    return armar(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate(), f.getUTCHours(), f.getUTCMinutes(), f.getUTCSeconds());
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return armar(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return armar(a, +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  return null;
}

const digitos = (s: string | null) => (s ? s.replace(/\D/g, "") : "");

function tipoDocumento(tipo: string | null, numero: string | null): string | null {
  const t = tipo?.toUpperCase().trim();
  if (t) return ["DNI", "CUIT", "CUIL", "PASAPORTE", "OTRO"].includes(t) ? t : t.startsWith("PAS") ? "PASAPORTE" : "OTRO";
  const d = digitos(numero);
  if (!d) return null;
  return d.length === 11 ? "CUIT" : d.length >= 7 && d.length <= 8 ? "DNI" : "OTRO";
}

function condicionIva(v: string | null): string | null {
  const t = v?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[._]/g, " ").trim();
  if (!t) return null;
  if (t.includes("inscripto") || t === "ri" || t === "r i") return "responsable_inscripto";
  if (t.includes("monotrib") || t === "mt" || t === "rs") return "monotributo";
  if (t.includes("exento") || t === "ex") return "exento";
  if (t.includes("no responsable") || t === "nr") return "no_responsable";
  if (t.includes("consumidor") || t === "cf") return "consumidor_final";
  return null;
}

// ── Lo que se crea solo (fuera de la transacción de la fila) ─

/** Familia por nombre (sin distinguir mayúsculas); si no existe, se crea. */
async function familia(ctx: Ctx, nombre: string): Promise<number> {
  const k = `familia:${nombre.toLowerCase()}`;
  if (ctx.cache.has(k)) return ctx.cache.get(k)!;
  let r = await una<{ id: number }>("select id::int from familia where organizacion_id = $1 and lower(nombre) = lower($2) order by padre_id nulls first, id limit 1", [ctx.org, nombre]);
  r ??= await una<{ id: number }>("insert into familia (organizacion_id, nombre) values ($1, $2) returning id::int", [ctx.org, nombre]);
  ctx.cache.set(k, r!.id);
  return r!.id;
}

/** Lista por nombre (si no existe, se crea en esa moneda), o la primera. */
async function lista(ctx: Ctx, nombre: string | null, mon: Moneda | null): Promise<{ id: number; moneda: Moneda }> {
  const k = nombre?.toLowerCase() ?? "";
  if (ctx.listas.has(k)) return ctx.listas.get(k)!;
  let r = nombre
    ? await una<{ id: number; moneda: Moneda }>("select id::int, moneda_base moneda from lista_precios where organizacion_id = $1 and lower(nombre) = lower($2)", [ctx.org, nombre])
    : await una<{ id: number; moneda: Moneda }>("select id::int, moneda_base moneda from lista_precios where organizacion_id = $1 and estado = 'activa' order by orden, nombre limit 1", [ctx.org]);
  if (!r && !nombre) throw new ErrorErp("No hay ninguna lista de precios: mapeá la columna de la lista o creá una en Catálogo → Listas de precios.");
  if (!r) {
    await consulta("insert into lista_precios (organizacion_id, nombre, moneda_base) values ($1, $2, $3) on conflict (organizacion_id, nombre) do nothing", [ctx.org, nombre, mon ?? "ARS"]);
    r = await una<{ id: number; moneda: Moneda }>("select id::int, moneda_base moneda from lista_precios where organizacion_id = $1 and nombre = $2", [ctx.org, nombre]);
  }
  ctx.listas.set(k, r!);
  return r!;
}

/** La ubicación de destino del stock: la general del depósito (o la que diga). */
async function ubicacionDestino(ctx: Ctx, deposito: string | null, codigo: string | null): Promise<number> {
  const k = `ubicacion:${deposito?.toLowerCase() ?? ""}:${codigo?.toLowerCase() ?? ""}`;
  if (ctx.cache.has(k)) return ctx.cache.get(k)!;
  const dep = deposito
    ? await una<{ id: number }>("select id::int from deposito where organizacion_id = $1 and lower(nombre) = lower($2)", [ctx.org, deposito])
    : await una<{ id: number }>("select id::int from deposito where organizacion_id = $1 and estado = 'activo' and tipo = 'propio' order by id limit 1", [ctx.org]);
  if (!dep) {
    throw new ErrorErp(deposito ? `No existe el depósito "${deposito}".` : "No hay ningún depósito propio activo. Crealo en Stock → Depósitos y ubicaciones.");
  }
  const u = codigo
    ? await una<{ id: number }>("select id::int from ubicacion where deposito_id = $1 and lower(codigo) = lower($2) and estado = 'activa'", [dep.id, codigo])
    : await una<{ id: number }>("select id::int from ubicacion where deposito_id = $1 and es_default", [dep.id]);
  if (!u) throw new ErrorErp(codigo ? `No existe la ubicación "${codigo}" en ese depósito.` : "El depósito no tiene ubicación general.");
  ctx.cache.set(k, u.id);
  return u.id;
}

async function canalHistorico(ctx: Ctx): Promise<number> {
  const k = "canal";
  if (ctx.cache.has(k)) return ctx.cache.get(k)!;
  await consulta("insert into canal (organizacion_id, nombre, tipo) values ($1, $2, 'historico') on conflict (organizacion_id, nombre) do nothing", [ctx.org, CANAL_HISTORICO]);
  const r = await una<{ id: number }>("select id::int from canal where organizacion_id = $1 and nombre = $2", [ctx.org, CANAL_HISTORICO]);
  ctx.cache.set(k, r!.id);
  return r!.id;
}

// ── Una fila por destino ─────────────────────────────────

async function filaProducto(c: PoolClient, ctx: Ctx, d: Record<string, Valor>): Promise<string> {
  const skuBase = txt(get(ctx, d, "sku_base"));
  const titulo = txt(get(ctx, d, "titulo"));
  if (!skuBase) throw new ErrorErp("Falta el SKU base.");
  if (!titulo) throw new ErrorErp("Falta el título.");
  const skuVar = txt(get(ctx, d, "sku_variacion"));
  const conVar = !!skuVar && skuVar !== skuBase;
  const cb = txt(get(ctx, d, "codigo_barras"));
  const pesoN = noNegativo(get(ctx, d, "peso_g"), "El peso");
  const peso = pesoN == null ? null : Math.round(pesoN);
  const largo = noNegativo(get(ctx, d, "largo_cm"), "El largo");
  const ancho = noNegativo(get(ctx, d, "ancho_cm"), "El ancho");
  const alto = noNegativo(get(ctx, d, "alto_cm"), "El alto");
  const precio = noNegativo(get(ctx, d, "precio"), "El precio");
  const mon = moneda(get(ctx, d, "moneda"));
  const nombreFamilia = txt(get(ctx, d, "familia"));
  const familiaId = nombreFamilia ? await familia(ctx, nombreFamilia) : null;
  const lst = precio != null ? await lista(ctx, txt(get(ctx, d, "lista")), mon) : null;

  const ya = (await c.query<{ id: string; tipo: string }>("select id, tipo from producto where organizacion_id = $1 and sku_base = $2 for update", [ctx.org, skuBase])).rows[0];
  let productoId: number;
  let tipo: string;
  if (ya) {
    if (conVar && ya.tipo === "kit") throw new ErrorErp(`${skuBase} es un kit: no puede tener variaciones.`);
    tipo = conVar && ya.tipo === "simple" ? "con_variaciones" : ya.tipo;
    productoId = Number(ya.id);
    await c.query(`
      update producto set titulo = $3, marca = coalesce($4, marca), descripcion = coalesce($5, descripcion),
             familia_id = coalesce($6, familia_id), codigo_barras = coalesce($7, codigo_barras),
             peso_g = coalesce($8, peso_g), largo_cm = coalesce($9, largo_cm), ancho_cm = coalesce($10, ancho_cm),
             alto_cm = coalesce($11, alto_cm), tipo = $12, actualizado_ts = now()
       where id = $2 and organizacion_id = $1`,
      [ctx.org, productoId, titulo, txt(get(ctx, d, "marca")), txt(get(ctx, d, "descripcion")), familiaId,
        conVar ? null : cb, peso, largo, ancho, alto, tipo]);
  } else {
    tipo = conVar ? "con_variaciones" : "simple";
    const r = await c.query<{ id: string }>(`
      insert into producto (organizacion_id, sku_base, titulo, marca, descripcion, familia_id, codigo_barras, peso_g, largo_cm, ancho_cm, alto_cm, tipo)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [ctx.org, skuBase, titulo, txt(get(ctx, d, "marca")), txt(get(ctx, d, "descripcion")), familiaId,
        conVar ? null : cb, peso, largo, ancho, alto, tipo]);
    productoId = Number(r.rows[0].id);
  }

  let variacionId: number | null = null;
  if (conVar) {
    const v = (await c.query<{ id: string; producto_id: string }>("select id, producto_id from variacion where organizacion_id = $1 and sku = $2", [ctx.org, skuVar])).rows[0];
    if (v && Number(v.producto_id) !== productoId) throw new ErrorErp(`El SKU ${skuVar} ya es de otro producto.`);
    if (v) {
      variacionId = Number(v.id);
      if (cb) await c.query("update variacion set codigo_barras = $2 where id = $1", [variacionId, cb]);
    } else {
      const r = await c.query<{ id: string }>(`
        insert into variacion (organizacion_id, producto_id, sku, codigo_barras, orden)
        values ($1, $2, $3, $4, (select count(*) from variacion where producto_id = $2)) returning id`, [ctx.org, productoId, skuVar, cb]);
      variacionId = Number(r.rows[0].id);
    }
    // El nombre del atributo es el de la columna (ej. "Color"); el valor, la celda.
    for (const [orden, k] of ["atributo_1", "atributo_2", "atributo_3"].entries()) {
      const valor = txt(get(ctx, d, k));
      if (!valor) continue;
      await c.query(`
        insert into variacion_atributo (organizacion_id, variacion_id, nombre, valor, orden) values ($1, $2, $3, $4, $5)
        on conflict (variacion_id, nombre) do update set valor = excluded.valor`, [ctx.org, variacionId, ctx.mapeo[k], valor, orden]);
    }
  } else if (tipo !== "con_variaciones") {
    const v = (await c.query<{ id: string }>("select id from variacion where producto_id = $1 and es_default", [productoId])).rows[0];
    variacionId = v ? Number(v.id) : null;
  }

  if (precio != null && lst) {
    if (!variacionId) throw new ErrorErp(`${skuBase} tiene variaciones: para cargar el precio falta el SKU de la variación.`);
    await guardarPrecio(ctx.org, { listaId: lst.id, variacionId, importe: precio, moneda: mon ?? lst.moneda, usuarioId: ctx.usuarioId }, c);
  }
  return ya ? "Actualizado" : "Creado";
}

async function filaCliente(c: PoolClient, ctx: Ctx, d: Record<string, Valor>): Promise<string> {
  const nombre = txt(get(ctx, d, "nombre"));
  if (!nombre) throw new ErrorErp("Falta el nombre.");
  const tipoTxt = txt(get(ctx, d, "tipo"));
  const tipo = tipoTxt ? (tipoTxt.toLowerCase().includes("mayor") ? "mayorista" : "consumidor_final") : null;
  const email = txt(get(ctx, d, "email"))?.toLowerCase() ?? null;
  const docNum = txt(get(ctx, d, "documento_numero"));
  const docTipo = tipoDocumento(txt(get(ctx, d, "documento_tipo")), docNum);
  const ivaTxt = txt(get(ctx, d, "condicion_iva"));
  const iva = condicionIva(ivaTxt);
  const nota = ivaTxt && !iva ? ` (condición IVA "${ivaTxt}" no reconocida: quedó sin cargar)` : "";

  let id: number | null = null;
  const doc = digitos(docNum);
  if (doc) {
    const r = await c.query<{ id: string }>("select id from cliente where organizacion_id = $1 and regexp_replace(documento_numero, '\\D', '', 'g') = $2 order by id limit 1", [ctx.org, doc]);
    if (r.rows[0]) id = Number(r.rows[0].id);
  } else if (email) {
    const r = await c.query<{ id: string }>("select id from cliente where organizacion_id = $1 and lower(email) = $2 order by id limit 1", [ctx.org, email]);
    if (r.rows[0]) id = Number(r.rows[0].id);
  }
  const valores = [ctx.org, nombre, tipo, email, txt(get(ctx, d, "telefono")), docTipo, docNum, iva];
  const creado = !id;
  if (id) {
    await c.query(`
      update cliente set nombre = $2, tipo = coalesce($3, tipo), email = coalesce($4, email), telefono = coalesce($5, telefono),
             documento_tipo = coalesce($6, documento_tipo), documento_numero = coalesce($7, documento_numero),
             condicion_iva = coalesce($8, condicion_iva)
       where id = $9 and organizacion_id = $1`, [...valores, id]);
  } else {
    const r = await c.query<{ id: string }>(`
      insert into cliente (organizacion_id, nombre, tipo, email, telefono, documento_tipo, documento_numero, condicion_iva)
      values ($1, $2, coalesce($3, 'consumidor_final'), $4, $5, $6, $7, $8) returning id`, valores);
    id = Number(r.rows[0].id);
  }

  const dir = ["calle", "numero", "localidad", "provincia", "codigo_postal"].map((k) => txt(get(ctx, d, k)));
  if (dir.some(Boolean)) {
    // No repite una dirección que ya tiene (misma calle, número y localidad).
    await c.query(`
      insert into cliente_direccion (organizacion_id, cliente_id, calle, numero, localidad, provincia, codigo_postal, principal)
      select $1, $2, $3, $4, $5, $6, $7, not exists (select 1 from cliente_direccion where cliente_id = $2)
       where not exists (select 1 from cliente_direccion where cliente_id = $2
                           and lower(coalesce(calle, '')) = lower(coalesce($3, '')) and coalesce(numero, '') = coalesce($4, '')
                           and lower(coalesce(localidad, '')) = lower(coalesce($5, '')))`, [ctx.org, id, ...dir]);
  }
  return (creado ? "Creado" : "Actualizado") + nota;
}

async function filaStock(c: PoolClient, ctx: Ctx, d: Record<string, Valor>): Promise<string> {
  const sku = txt(get(ctx, d, "sku"));
  const cb = txt(get(ctx, d, "codigo_barras"));
  if (!sku && !cb) throw new ErrorErp("Falta el SKU o el código de barras.");
  const cantidad = num(get(ctx, d, "cantidad"), "La cantidad");
  if (cantidad == null) throw new ErrorErp("Falta la cantidad.");
  if (!Number.isInteger(cantidad)) throw new ErrorErp(`La cantidad tiene que ser un número entero (vino ${cantidad}).`);
  if (cantidad < 0) throw new ErrorErp("La cantidad no puede ser negativa.");
  let variacionId: number | null = null;
  if (sku) {
    const r = await c.query<{ id: string }>("select id from variacion where organizacion_id = $1 and sku = $2", [ctx.org, sku]);
    if (r.rows[0]) variacionId = Number(r.rows[0].id);
    else if (!cb) throw new ErrorErp(`No existe el SKU ${sku}.`);
  }
  if (!variacionId && cb) {
    const r = await c.query<{ id: string }>("select id from variacion where organizacion_id = $1 and codigo_barras = $2 order by es_default desc, id", [ctx.org, cb]);
    if (!r.rows.length) throw new ErrorErp(sku ? `No existe el SKU ${sku} ni el código de barras ${cb}.` : `No existe el código de barras ${cb}.`);
    if (r.rows.length > 1) throw new ErrorErp(`El código de barras ${cb} lo tienen ${r.rows.length} variaciones: usá el SKU.`);
    variacionId = Number(r.rows[0].id);
  }
  if (cantidad === 0) return "Cantidad 0: no se movió nada";
  const destino = await ubicacionDestino(ctx, txt(get(ctx, d, "deposito")), txt(get(ctx, d, "ubicacion")));
  await moverStock(ctx.org, {
    variacionId: variacionId!, tipo: "ingreso", cantidad, destinoId: destino,
    referencia: { tipo: "importacion", id: ctx.importacionId }, usuarioId: ctx.usuarioId, nota: "Stock inicial (importado)",
  }, c);
  return `Ingresaron ${cantidad}`;
}

// ── Ventas: varias filas = un pedido ─────────────────────

async function venta(ctx: Ctx, clave: string | null, filas: Fila[]): Promise<void> {
  if (!clave) {
    await marcar(null, ctx, filas.map((f) => f.n), "error", "Falta el nº de venta.");
    return;
  }
  const errores = new Map<number, string>();
  const lineas: (LineaEntrada & { n: number })[] = [];
  let mon: Moneda | null = null;
  for (const f of filas) {
    try {
      const sku = txt(get(ctx, f.datos, "sku"));
      if (!sku) throw new ErrorErp("Falta el SKU.");
      const cantidad = num(get(ctx, f.datos, "cantidad"), "La cantidad");
      if (cantidad == null || !Number.isInteger(cantidad) || cantidad <= 0) throw new ErrorErp("La cantidad tiene que ser un entero mayor que cero.");
      const precio = noNegativo(get(ctx, f.datos, "precio_unitario"), "El precio unitario");
      if (precio == null) throw new ErrorErp("Falta el precio unitario.");
      const m = moneda(get(ctx, f.datos, "moneda"));
      if (m && mon && m !== mon) throw new ErrorErp("La venta tiene filas en pesos y en dólares.");
      mon ??= m;
      lineas.push({ n: f.n, sku, cantidad, precio_unitario: precio });
    } catch (e) {
      errores.set(f.n, motivoErp(e));
    }
  }
  if (lineas.length) {
    const hay = await consulta<{ sku: string }>("select sku from variacion where organizacion_id = $1 and sku = any($2::text[])", [ctx.org, lineas.map((l) => l.sku!)]);
    const existen = new Set(hay.map((h) => h.sku));
    for (const l of lineas) if (!existen.has(l.sku!)) errores.set(l.n, `No existe el SKU ${l.sku}.`);
  }
  const primera = filas[0].datos;
  const fecha = leerFecha(get(ctx, primera, "fecha"));
  if (!fecha) {
    const v = get(ctx, primera, "fecha");
    for (const f of filas) errores.set(f.n, v == null ? "Falta la fecha." : `La fecha "${v}" no se entiende.`);
  }
  if (errores.size) {
    const malas = [...errores.keys()].sort((a, b) => a - b);
    for (const f of filas) {
      await marcar(null, ctx, [f.n], "error", errores.get(f.n) ?? `La venta ${clave} no se importó: la fila ${malas[0]} de la misma venta tiene un error.`);
    }
    return;
  }

  const nombre = txt(get(ctx, primera, "cliente_nombre"));
  const documento = txt(get(ctx, primera, "cliente_documento"));
  const email = txt(get(ctx, primera, "cliente_email"));
  const canalId = await canalHistorico(ctx);
  try {
    await enTransaccion(async (c) => {
      const r = await crearPedido(ctx.org, {
        canalId,
        id_externo: clave,
        // Al mediodía argentino si no trae hora (que no caiga el día anterior).
        fecha: fecha!.length === 10 ? `${fecha}T12:00:00-03:00` : `${fecha}-03:00`,
        moneda: mon ?? "ARS",
        cliente: nombre || documento || email
          ? { nombre, email, documento_numero: documento, documento_tipo: tipoDocumento(null, documento) }
          : null,
        lineas: lineas.map(({ n: _n, ...l }) => l),
        medio_pago: txt(get(ctx, primera, "medio_pago")),
        estado_pago: "pagado",
        afecta_stock: false,
        estado_inicial: "entregado",
        notas: "Venta histórica importada",
      }, ctx.usuarioId, c);
      await marcar(c, ctx, filas.map((f) => f.n), "ok", r.creado ? `Pedido ${r.pedidoId}` : `Ya estaba importada (pedido ${r.pedidoId})`);
    });
  } catch (e) {
    await marcar(null, ctx, filas.map((f) => f.n), "error", motivoErp(e));
  }
}

// ── El lote ──────────────────────────────────────────────

async function marcar(c: Consultor | null, ctx: Ctx, ns: number[], resultado: "ok" | "error", motivo: string | null) {
  const sql = "update importacion_fila set resultado = $3, motivo = $4 where importacion_id = $1 and organizacion_id = $2 and n = any($5::int[])";
  const v = [ctx.importacionId, ctx.org, resultado, motivo, ns];
  if (c) await c.query(sql, v);
  else await consulta(sql, v);
}

/** Recalcula los totales y el estado de la importación. */
export async function actualizarTotales(org: string, importacionId: number) {
  return una<{ pendientes: number }>(`
    with x as (
      select count(*) filter (where resultado = 'ok')::int ok, count(*) filter (where resultado = 'error')::int err,
             count(*) filter (where resultado is null)::int pend
        from importacion_fila where importacion_id = $1 and organizacion_id = $2)
    update importacion i set filas_ok = x.ok, filas_error = x.err,
           estado = case when x.pend > 0 then 'ejecutando' when x.err > 0 then 'con_errores' else 'terminado' end,
           terminado_ts = case when x.pend = 0 then now() end
      from x where i.id = $1 and i.organizacion_id = $2
    returning x.pend pendientes`, [importacionId, org]);
}

/** Procesa filas pendientes hasta terminar o hasta `presupuestoMs`.
 *  Devuelve cuántas procesó y cuántas quedan. */
export async function ejecutarImportacion(org: string, importacionId: number, usuarioId: string, presupuestoMs = 240_000) {
  const imp = await una<{ destino: string; mapeo: Record<string, string> }>(
    "select destino, mapeo from importacion where id = $1 and organizacion_id = $2", [importacionId, org]);
  if (!imp || !esDestino(imp.destino)) throw new ErrorErp("La importación no existe.");
  const destino: Destino = imp.destino;
  const faltan = faltanObligatorios(destino, imp.mapeo);
  if (faltan.length) throw new ErrorErp(`Falta mapear: ${faltan.join(", ")}.`);

  // Un candado por importación: dos pestañas no la procesan a la vez.
  const candado = await pool.connect();
  let procesadas = 0;
  try {
    const ok = await candado.query<{ ok: boolean }>("select pg_try_advisory_lock(hashtext('importacion'), $1::int) ok", [importacionId]);
    if (!ok.rows[0].ok) throw new ErrorErp("Esta importación ya se está ejecutando (¿en otra pestaña?). Esperá que termine.");
    try {
      await consulta("update importacion set estado = 'ejecutando' where id = $1 and organizacion_id = $2", [importacionId, org]);
      const ctx: Ctx = { org, importacionId, usuarioId, mapeo: imp.mapeo, cache: new Map(), listas: new Map() };
      const inicio = Date.now();
      while (Date.now() - inicio < presupuestoMs) {
        if (destino === "ventas") {
          const col = imp.mapeo.id_externo;
          const filas = await consulta<Fila & { clave: string | null }>(`
            with g as (
              select datos ->> $3 clave, min(n) primera from importacion_fila
               where importacion_id = $1 and organizacion_id = $2 and resultado is null
               group by 1 order by 2 limit $4)
            select f.n, f.datos, f.datos ->> $3 clave
              from importacion_fila f join g on g.clave is not distinct from f.datos ->> $3
             where f.importacion_id = $1 and f.organizacion_id = $2 and f.resultado is null
             order by f.n`, [importacionId, org, col, Math.ceil(FILAS_POR_VUELTA / 4)]);
          if (!filas.length) break;
          const grupos = new Map<string | null, Fila[]>();
          for (const f of filas) {
            const k = f.clave?.trim() || null;
            grupos.set(k, [...(grupos.get(k) ?? []), f]);
          }
          for (const [clave, g] of grupos) {
            await venta(ctx, clave, g);
            procesadas += g.length;
            if (Date.now() - inicio >= presupuestoMs) break;
          }
        } else {
          const filas = await consulta<Fila>(`
            select n, datos from importacion_fila where importacion_id = $1 and organizacion_id = $2 and resultado is null
             order by n limit $3`, [importacionId, org, FILAS_POR_VUELTA]);
          if (!filas.length) break;
          const hacer = destino === "productos" ? filaProducto : destino === "clientes" ? filaCliente : filaStock;
          for (const f of filas) {
            try {
              await enTransaccion(async (c) => {
                const nota = await hacer(c, ctx, f.datos);
                await marcar(c, ctx, [f.n], "ok", nota);
              });
            } catch (e) {
              await marcar(null, ctx, [f.n], "error", motivoErp(e));
            }
            procesadas++;
            if (Date.now() - inicio >= presupuestoMs) break;
          }
        }
      }
    } finally {
      await candado.query("select pg_advisory_unlock(hashtext('importacion'), $1::int)", [importacionId]).catch(() => {});
    }
  } finally {
    candado.release();
  }
  const t = await actualizarTotales(org, importacionId);
  return { procesadas, pendientes: t?.pendientes ?? 0 };
}
