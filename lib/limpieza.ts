// Limpieza de la base (pedido de Fer, 3/10): tareas de una sola vez que arman la
// base "perfecta" tras la carga de Virtual Seller. Se disparan con botones de
// /admin/limpieza (sólo Fer). Todo lo que se borra son datos de prueba.

import type { PoolClient } from "pg";
import { consulta, enTransaccion, una } from "@/lib/erp/base";
import { ml, tokenML } from "@/lib/radar/base";

/** Pedidos, picking, reservas y movimientos de prueba. Los movimientos de la
 *  carga inicial de stock (referencia 'carga_inicial') se conservan. */
export async function borrarPruebas(org: string) {
  return enTransaccion(async (c) => {
    const n = async (sql: string) => (await c.query(sql, [org])).rowCount ?? 0;
    const hecho = {
      picking: await n("delete from picking_item where organizacion_id = $1")
        + await n("delete from picking_pedido where organizacion_id = $1")
        + await n("delete from picking_lote where organizacion_id = $1"),
      envios: await n("delete from envio where organizacion_id = $1"),
      pagos: await n("delete from pago where organizacion_id = $1"),
      reclamos: await n("delete from reclamo where organizacion_id = $1"),
      cargos: await n("delete from ml_cargo where organizacion_id = $1"),
      mensajes: await n("delete from meli_mensaje where organizacion_id = $1 and pedido_id is not null")
        + await n("delete from meli_conversacion where organizacion_id = $1 and pedido_id is not null"),
      pedidos: await n("delete from pedido_estado_historial where organizacion_id = $1")
        + await n("delete from pedido_linea where organizacion_id = $1"),
      movimientos: await n("delete from movimiento_stock where organizacion_id = $1 and referencia_tipo is distinct from 'carga_inicial'"),
    };
    const p = await n("delete from pedido where organizacion_id = $1");
    await c.query("update stock set reservado = 0 where organizacion_id = $1 and reservado <> 0", [org]);
    return { ...hecho, pedidos: p };
  });
}

export async function resumenPruebas(org: string) {
  const f = await una<{ pedidos: string; lotes: string; movs: string }>(`
    select (select count(*) from pedido where organizacion_id = $1) pedidos,
           (select count(*) from picking_lote where organizacion_id = $1) lotes,
           (select count(*) from movimiento_stock where organizacion_id = $1 and referencia_tipo is distinct from 'carga_inicial') movs`, [org]);
  return { pedidos: Number(f?.pedidos ?? 0), lotes: Number(f?.lotes ?? 0), movimientos: Number(f?.movs ?? 0) };
}

// ── Notebooks que quedaron sin stock ─────────────────────────────────────
// Notebook = categoría de ML "Notebooks", familia "Notebook(s)" o título que
// empieza con "Notebook". Sin stock = disponible 0 (un kit, según su componente).
const NOTEBOOKS = `
  from producto p
 where p.organizacion_id = $1
   and (p.categoria_ml = 'MLA1652'
        or p.titulo ~* '^notebook\\M'
        or p.familia_id in (select id from familia where organizacion_id = $1 and nombre ~* '^notebooks?$'))
   and not exists (select 1 from variacion v where v.producto_id = p.id and upper(v.sku) in ('PRUEBA1','AAA2','PRUEBA-NOTEBOOK-BASE','9999'))
   and not exists (select 1 from variacion v where v.producto_id = p.id and stock_disponible_deposito(p.organizacion_id, v.id, 1) > 0)
   and not exists (select 1 from variacion v join stock s on s.variacion_id = v.id where v.producto_id = p.id and s.cantidad > 0)`;

export async function notebooksSinStock(org: string) {
  const [n] = await consulta<{ n: string }>(`select count(*) n ${NOTEBOOKS}`, [org]);
  const ejemplos = await consulta<{ sku: string; titulo: string }>(`select p.sku_base sku, left(p.titulo, 60) titulo ${NOTEBOOKS} order by p.sku_base limit 8`, [org]);
  return { cantidad: Number(n.n), ejemplos };
}

export async function borrarNotebooksSinStock(org: string) {
  return enTransaccion(async (c) => {
    // Primero los kits (sus componentes no se pueden borrar mientras haya un kit que los use).
    const kits = await c.query(`delete from producto where id in (select p.id ${NOTEBOOKS} and p.tipo = 'kit')`, [org]);
    const simples = await c.query(`delete from producto where id in (select p.id ${NOTEBOOKS})`, [org]);
    return { kits: kits.rowCount ?? 0, simples: simples.rowCount ?? 0 };
  });
}

// ── Categorías de Mercado Libre ──────────────────────────────────────────

type Cache = Map<string, number | null>;

/** La familia de una categoría de ML, creando el árbol desde la copia local
 *  (meli_categorias) o, si no está, desde la API de ML. */
async function familiaDeCategoria(c: PoolClient, org: string, categoria: string, cache: Cache, token: string | null): Promise<number | null> {
  if (cache.has(categoria)) return cache.get(categoria)!;
  const ya = await c.query<{ id: string }>("select id from familia where organizacion_id = $1 and ml_categoria = $2", [org, categoria]);
  if (ya.rows[0]) { cache.set(categoria, Number(ya.rows[0].id)); return Number(ya.rows[0].id); }
  let camino = (await c.query<{ id: string; nombre: string }>(`
    with recursive arriba as (
      select id, nombre, padre_id, 0 n from meli_categorias where id = $1
      union all
      select m.id, m.nombre, m.padre_id, a.n + 1 from meli_categorias m join arriba a on m.id = a.padre_id where a.n < 12
    ) select id, nombre from arriba order by n desc`, [categoria])).rows;
  if (!camino.length) {
    const r = await ml(`/categories/${categoria}`, token);
    const datos = r.datos as { path_from_root?: { id: string; name: string }[] } | null;
    camino = (datos?.path_from_root ?? []).map((x) => ({ id: x.id, nombre: x.name }));
  }
  let padre: number | null = null;
  for (const n of camino) {
    const f = await c.query<{ id: string }>("select id from familia where organizacion_id = $1 and ml_categoria = $2", [org, n.id]);
    if (f.rows[0]) { padre = Number(f.rows[0].id); continue; }
    const nuevo: { rows: { id: string }[] } = await c.query<{ id: string }>(
      "insert into familia (organizacion_id, padre_id, nombre, ml_categoria) values ($1, $2, $3, $4) returning id", [org, padre, n.nombre, n.id]);
    padre = Number(nuevo.rows[0].id);
  }
  cache.set(categoria, padre);
  return padre;
}

async function asignar(org: string, productoId: number, categoria: string, cache: Cache, token: string | null) {
  await enTransaccion(async (c) => {
    const fam = await familiaDeCategoria(c, org, categoria, cache, token);
    await c.query("update producto set categoria_ml = $2, familia_id = coalesce($3, familia_id) where id = $1", [productoId, categoria, fam]);
  });
}

/** Paso 1: lo que ya tiene publicación en ML (aunque esté pausada) toma la
 *  categoría de su publicación, buscando por SKU, por código base (sin "-U" ni
 *  "-X10") y, en los kits, por el de su componente. */
export async function categoriasPorPublicacion(org: string) {
  const filas = await consulta<{ id: string; categoria: string }>(`
    with mi as (
      select upper(regexp_replace(trim(sku), '^DE-', '', 'i')) k, categoria,
             (estado = 'active') activa
        from meli_item where sku is not null and sku <> '' and categoria is not null),
    sinc as (
      select p.id, upper(v.sku) sku, regexp_replace(regexp_replace(upper(v.sku), '-X\\d+$', ''), '-U$', '') b
        from producto p join variacion v on v.producto_id = p.id
       where p.organizacion_id = $1 and p.categoria_ml is null)
    select distinct on (sinc.id) sinc.id::text, mi.categoria
      from sinc join mi on mi.k in (sinc.sku, sinc.b, sinc.b || '-U')
     order by sinc.id, (mi.k = sinc.sku) desc, mi.activa desc`, [org]);
  const cache: Cache = new Map();
  const token = await tokenML();
  for (const f of filas) await asignar(org, Number(f.id), f.categoria, cache, token);
  // Los que ya traían categoría pero siguen en una familia de Virtual Seller (o sin familia).
  const resto = await consulta<{ id: string; categoria: string }>(`
    select p.id::text, p.categoria_ml categoria from producto p
     where p.organizacion_id = $1 and p.categoria_ml is not null
       and (p.familia_id is null or p.familia_id in (select id from familia where organizacion_id = $1 and ml_categoria is null))`, [org]);
  for (const f of resto) await asignar(org, Number(f.id), f.categoria, cache, token);
  return { porPublicacion: filas.length, reubicados: resto.length };
}

/** Una llamada a ML con tope de tiempo: si ML no contesta, no se cuelga todo el lote. */
async function mlConTope(ruta: string, token: string | null, ms = 8000) {
  return Promise.race([
    ml(ruta, token),
    new Promise<{ ruta: string; status: number; datos: unknown }>((r) => setTimeout(() => r({ ruta, status: 0, datos: "sin respuesta de ML" }), ms)),
  ]);
}

/** Las formas de preguntarle a ML por un título, de la más fiel a la más corta. */
function variantesDelTitulo(titulo: string): string[] {
  const limpio = titulo.toLowerCase().replace(/[`´"'()\/+*,;:]+/g, " ").replace(/\s+/g, " ").trim();
  const palabras = limpio.split(" ").filter((w) => w.length > 1);
  const v = [titulo.slice(0, 120).trim(), limpio.slice(0, 120), palabras.slice(0, 4).join(" ")];
  return [...new Set(v.filter((x) => x.length >= 3))];
}

/** Paso 2 (de a lotes): para los que no tienen categoría, el predictor de ML
 *  (domain_discovery) con el título. `desde` = último id procesado. Corta solo
 *  antes de que se acabe el tiempo de la pantalla (devuelve lo que alcanzó). */
export async function categoriasPorPredictor(org: string, desde: number, lote = 20) {
  const inicio = Date.now();
  const token = await tokenML();
  const filas = await consulta<{ id: string; titulo: string }>(
    "select id::text, titulo from producto where organizacion_id = $1 and categoria_ml is null and id > $2 order by id limit $3", [org, desde, lote]);
  const cache: Cache = new Map();
  let asignados = 0, sinResultado = 0, procesados = 0, siguiente = desde;
  const estados: Record<string, number> = {};
  const tanda = 5;
  for (let i = 0; i < filas.length; i += tanda) {
    if (Date.now() - inicio > 35_000) break;
    const grupo = filas.slice(i, i + tanda);
    await Promise.all(grupo.map(async (f) => {
      try {
        // Primero el título tal cual; si ML no dice nada (los títulos viejos en MAYÚSCULAS y con símbolos suelen
        // fallar), en minúsculas y sin símbolos, y por último sólo las primeras palabras.
        let categoria: string | null = null;
        for (const q of variantesDelTitulo(f.titulo)) {
          const r = await mlConTope(`/sites/MLA/domain_discovery/search?q=${encodeURIComponent(q)}&limit=1`, token);
          estados[String(r.status)] = (estados[String(r.status)] ?? 0) + 1;
          const cat = (Array.isArray(r.datos) ? r.datos : [])[0] as { category_id?: string } | undefined;
          if (r.status === 200 && cat?.category_id) { categoria = cat.category_id; break; }
          if (r.status !== 200) break;
        }
        if (categoria) { await asignar(org, Number(f.id), categoria, cache, token); asignados++; }
        else sinResultado++;
      } catch { sinResultado++; estados.error = (estados.error ?? 0) + 1; }
    }));
    procesados += grupo.length;
    siguiente = Number(grupo[grupo.length - 1].id);
  }
  const pendientes = await una<{ n: string }>("select count(*) n from producto where organizacion_id = $1 and categoria_ml is null", [org]);
  return { procesados, asignados, sinResultado, estados, siguiente, hecho: filas.length < lote, pendientes: Number(pendientes?.n ?? 0) };
}

export async function resumenCategorias(org: string) {
  const f = await una<{ sin: string; vs: string; prod_vs: string }>(`
    select (select count(*) from producto where organizacion_id = $1 and categoria_ml is null) sin,
           (select count(*) from familia where organizacion_id = $1 and ml_categoria is null) vs,
           (select count(*) from producto where organizacion_id = $1 and familia_id in (select id from familia where organizacion_id = $1 and ml_categoria is null)) prod_vs`, [org]);
  return { sinCategoria: Number(f?.sin ?? 0), familiasVs: Number(f?.vs ?? 0), productosEnFamiliasVs: Number(f?.prod_vs ?? 0) };
}

/** Saca las familias propias (las de Virtual Seller, sin categoría de ML). Los
 *  productos que sigan en una quedan sin familia. */
export async function borrarFamiliasVs(org: string) {
  return enTransaccion(async (c) => {
    await c.query("update producto set familia_id = null where organizacion_id = $1 and familia_id in (select id from familia where organizacion_id = $1 and ml_categoria is null)", [org]);
    const r = await c.query("delete from familia where organizacion_id = $1 and ml_categoria is null", [org]);
    return { familias: r.rowCount ?? 0 };
  });
}
