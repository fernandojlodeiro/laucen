// Importación de productos desde Virtual Seller + Mercado Libre (Fer, 2/10).
//
// Tres archivos de Virtual Seller y la cuenta base de ML (por la API):
//   1. Stock por empresa (SKU, empresa TV/DE, ubicación, cantidad). Los SKU
//      de DE vienen con "DE-" adelante: se saca y se suma al de TV.
//   2. Maestro de productos (todas las columnas de VS).
//   3. Lista de precios Lista_000 (= precio de las publicaciones Clásicas).
// Reglas:
//   - Con stock → producto activo. Sin stock → inactivo (estado archivado),
//     salvo las notebooks (familia que empieza con NOTEBOOK): se descartan.
//   - Si el SKU tiene publicación en la cuenta base: título, fotos, categoría
//     (= familia), atributos, código de barras, medidas y garantía salen de
//     ML; el IVA, de VS (las diferencias se muestran antes y se corrigen en ML
//     con un botón); la descripción, de ML y si está vacía, de VS. El precio
//     de la lista Clásicas es el de la publicación Clásica (con su precio
//     tachado si está en campaña); si no hay Clásica, el de Lista_000.
//   - Sin publicación: todo de VS.
//   - "Kit" de VS: sólo la marca kit_vs (se arman a mano).
//   - Costo del maestro: costo FOB en USD.
// Se puede correr más de una vez: actualiza, y el stock se lleva al valor del
// archivo (no se suma dos veces).
//
// Pasos: cargarArchivos (en la acción de la pantalla, con la sesión, porque
// lee de Storage) → analizar (trae las publicaciones de ML y arma el resumen)
// → importar (de a lotes). analizar e importar los siguen las tareas
// periódicas en segundo plano.

import type { PoolClient } from "pg";
import { consulta, una, enTransaccion, ErrorErp, motivoErp } from "@/lib/erp/base";
import type { Hoja, Valor } from "@/lib/importar/leer";
import { moverStock } from "@/lib/stock";
import { guardarPrecio } from "@/lib/precios";
import { ml, type CuentaMl, cuentasDe } from "@/lib/mercadolibre/api";
import { guardarItem, type ItemMl } from "@/lib/mercadolibre/publicaciones";

export const DEPOSITO_VS = "CORDOBA CENTRAL";
export const LISTA_BASE = "Clásicas";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const txt = (v: Valor | undefined) => (v == null ? null : String(v).trim() || null);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Un número de VS: "1.234,56", "10,50%", 2.49. */
export function numeroVs(v: Valor | undefined): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[%$\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** La columna cuyo nombre contiene alguno de los textos (en ese orden de preferencia). */
function columna(cols: string[], ...buscar: string[]): string | null {
  for (const b of buscar) {
    const c = cols.find((x) => norm(x) === norm(b)) ?? cols.find((x) => norm(x).includes(norm(b)));
    if (c) return c;
  }
  return null;
}

export const skuLimpio = (s: string) => s.trim().replace(/^DE-/i, "").toUpperCase();

type Archivos = { stock: Hoja; maestro: Hoja; precios: Hoja; nombres: { stock: string; maestro: string; precios: string } };

/** Lee los tres archivos ya parseados y crea la corrida con un renglón por SKU. */
export async function cargarArchivos(org: string, usuarioId: string, a: Archivos): Promise<number> {
  // Stock: SKU sin "DE-", sumado por ubicación.
  const cs = a.stock.columnas;
  const cSku = columna(cs, "código / sku", "codigo", "sku"), cUbi = columna(cs, "ubicacion", "ubicación"), cCant = columna(cs, "cantidad", "cant");
  if (!cSku || !cCant) throw new ErrorErp("En el archivo de stock no encuentro las columnas de SKU y cantidad.");
  const stock = new Map<string, Map<string, number>>();
  for (const f of a.stock.filas) {
    const sku = txt(f.datos[cSku]);
    const cant = numeroVs(f.datos[cCant]);
    if (!sku || !cant) continue;
    const ubi = (cUbi && txt(f.datos[cUbi])) || "GENERAL";
    const k = skuLimpio(sku);
    const porUbi = stock.get(k) ?? new Map<string, number>();
    porUbi.set(ubi, (porUbi.get(ubi) ?? 0) + cant);
    stock.set(k, porUbi);
  }
  // Maestro: una fila por SKU.
  const cm = a.maestro.columnas;
  const mSku = columna(cm, "código / sku", "codigo", "sku");
  if (!mSku) throw new ErrorErp("En el maestro de productos no encuentro la columna de SKU.");
  const maestro = new Map<string, Record<string, Valor>>();
  for (const f of a.maestro.filas) {
    const sku = txt(f.datos[mSku]);
    if (sku && sku !== "-") maestro.set(skuLimpio(sku), f.datos);
  }
  // Precios.
  const cp = a.precios.columnas;
  const pSku = columna(cp, "código / sku", "codigo", "sku"), pPrecio = columna(cp, "precio");
  if (!pSku || !pPrecio) throw new ErrorErp("En la lista de precios no encuentro las columnas de SKU y precio.");
  const precios = new Map<string, number>();
  for (const f of a.precios.filas) {
    const sku = txt(f.datos[pSku]);
    const p = numeroVs(f.datos[pPrecio]);
    if (sku && sku !== "-" && p != null) precios.set(skuLimpio(sku), p);
  }
  if (!maestro.size) throw new ErrorErp("El maestro de productos no tiene filas con SKU.");

  return enTransaccion(async (c) => {
    const r = await c.query<{ id: string }>(`insert into importacion_vs (organizacion_id, archivos, usuario_id, resumen)
      values ($1, $2::jsonb, $3, $4::jsonb) returning id`,
      [org, JSON.stringify(a.nombres), usuarioId, JSON.stringify({ columnas_maestro: cm })]);
    const id = Number(r.rows[0].id);
    const skus = new Set([...maestro.keys(), ...stock.keys()]);
    const filas = [...skus].map((sku) => ({
      sku, stock: [...(stock.get(sku)?.entries() ?? [])].map(([ubicacion, cantidad]) => ({ ubicacion, cantidad })),
      maestro: maestro.get(sku) ?? null, precio: precios.get(sku) ?? null,
    }));
    for (let i = 0; i < filas.length; i += 500) {
      await c.query(`insert into importacion_vs_sku (importacion_id, organizacion_id, sku, stock, maestro, precio)
        select $1, $2, x.sku, x.stock, x.maestro, x.precio from jsonb_to_recordset($3::jsonb) x(sku text, stock jsonb, maestro jsonb, precio numeric)`,
        [id, org, JSON.stringify(filas.slice(i, i + 500))]);
    }
    return id;
  });
}

/** La cuenta base de Mercado Libre: la que tiene canal (hoy TIENDAVIRTUAL.BAIRES). */
async function cuentaBase(org: string): Promise<CuentaMl> {
  const cs = (await cuentasDe(org)).filter((x) => x.canalId && x.estado === "activa");
  if (!cs.length) throw new ErrorErp("No hay una cuenta de Mercado Libre conectada y asociada a un canal.");
  return cs[0];
}

/** Trae a meli_item las publicaciones activas y pausadas de la cuenta (las
 *  cerradas no: son años de historia que no se importan). */
async function traerActivas(cuenta: CuentaMl, hastaMs: number): Promise<{ leidas: number; completo: boolean }> {
  let leidas = 0;
  for (const estado of ["active", "paused"]) {
    let scroll: string | null = null;
    for (;;) {
      if (Date.now() > hastaMs) return { leidas, completo: false };
      const r: { status: number; datos: { results?: string[]; scroll_id?: string } } = await ml(cuenta, "GET",
        `/users/${cuenta.meliUserId}/items/search?status=${estado}&search_type=scan&limit=100${scroll ? `&scroll_id=${scroll}` : ""}`);
      if (r.status !== 200) throw new ErrorErp(`Mercado Libre no dio la lista de publicaciones (${r.status}).`);
      const ids = r.datos.results ?? [];
      if (!ids.length) break;
      scroll = r.datos.scroll_id ?? null;
      for (let i = 0; i < ids.length; i += 20) {
        const m = await ml<{ code: number; body: ItemMl }[]>(cuenta, "GET", `/items?ids=${ids.slice(i, i + 20).join(",")}&include_attributes=all`);
        if (m.status !== 200) continue;
        for (const x of m.datos) if (x.code === 200) { await guardarItem(cuenta, x.body); leidas++; }
      }
      if (!scroll) break;
    }
  }
  return { leidas, completo: true };
}

const ivaDe = (it: ItemMl) => numeroVs(it.attributes?.find((x) => x.id === "VALUE_ADDED_TAX")?.value_name ?? null);

type Corrida = { id: number; estado: string; resumen: Record<string, unknown> };

/** Paso de análisis: trae las publicaciones de la cuenta base (puede llevar
 *  varias vueltas) y arma el resumen. Devuelve true si terminó. */
export async function analizar(org: string, id: number, hastaMs: number): Promise<boolean> {
  const imp = await una<Corrida>("select id::int, estado, resumen from importacion_vs where id = $1 and organizacion_id = $2", [id, org]);
  if (!imp || imp.estado !== "cargando") return true;
  const cuenta = await cuentaBase(org);
  if (!imp.resumen.ml_completo) {
    const t = await traerActivas(cuenta, hastaMs);
    if (!t.completo) {
      await consulta("update importacion_vs set resumen = resumen || $3::jsonb where id = $1 and organizacion_id = $2",
        [id, org, JSON.stringify({ ml_leidas: (Number(imp.resumen.ml_leidas) || 0) + t.leidas })]);
      return false;
    }
    await consulta("update importacion_vs set resumen = resumen || '{\"ml_completo\": true}'::jsonb where id = $1", [id]);
  }
  // Cruce por SKU con las publicaciones activas o pausadas de la cuenta base.
  await consulta(`
    update importacion_vs_sku s set ml_items = coalesce((
      select jsonb_agg(distinct m.item_id) from meli_item m
       where m.canal_id = $3 and m.estado in ('active', 'paused') and upper(trim(m.sku)) = s.sku), '[]')
     where s.importacion_id = $1 and s.organizacion_id = $2`, [id, org, cuenta.canalId]);
  // Destino de cada SKU y los IVA para comparar.
  const columnas = (imp.resumen.columnas_maestro as string[]) ?? [];
  const cFam = columna(columnas, "familia"), cIva = columna(columnas, "tasa de iva", "iva");
  const filas = await consulta<{ sku: string; stock: { cantidad: number }[]; maestro: Record<string, Valor> | null; ml_items: string[] }>(
    "select sku, stock, maestro, ml_items from importacion_vs_sku where importacion_id = $1 and organizacion_id = $2", [id, org]);
  const ivaMl = new Map<string, { iva: number | null; item: string; titulo: string }>();
  const idsMl = [...new Set(filas.flatMap((f) => f.ml_items))];
  if (idsMl.length) {
    const its = await consulta<{ item_id: string; titulo: string; d: ItemMl }>(
      "select distinct on (item_id) item_id, titulo, datos_externos -> 'ml' d from meli_item where canal_id = $1 and item_id = any($2::text[]) order by item_id, variation_id",
      [cuenta.canalId, idsMl]);
    for (const x of its) ivaMl.set(x.item_id, { iva: ivaDe(x.d), item: x.item_id, titulo: x.titulo });
  }
  const cuenta_ = { con_stock: 0, publicados: 0, sin_publicar: 0, inactivos: 0, notebooks_descartadas: 0, stock_sin_maestro: [] as string[], kits: 0 };
  const difIva: { sku: string; titulo: string; vs: number; ml: number; items: string[] }[] = [];
  const cTipo = columna(columnas, "tipo de producto");
  await enTransaccion(async (c) => {
    for (const f of filas) {
      const total = f.stock.reduce((s, x) => s + x.cantidad, 0);
      const fam = cFam && f.maestro ? norm(String(f.maestro[cFam] ?? "")) : "";
      let destino: string;
      if (!f.maestro) { destino = "sin_maestro"; if (total > 0) cuenta_.stock_sin_maestro.push(f.sku); }
      else if (total > 0) { destino = "activo"; cuenta_.con_stock++; if (f.ml_items.length) cuenta_.publicados++; else cuenta_.sin_publicar++; }
      else if (fam.startsWith("notebook")) { destino = "descartado"; cuenta_.notebooks_descartadas++; }
      else { destino = "inactivo"; cuenta_.inactivos++; }
      if (f.maestro && cTipo && /kit|config/i.test(String(f.maestro[cTipo] ?? ""))) cuenta_.kits++;
      const vs = f.maestro && cIva ? numeroVs(f.maestro[cIva]) : null;
      const mls = f.ml_items.map((i) => ivaMl.get(i)).filter(Boolean) as { iva: number | null; item: string; titulo: string }[];
      const mlIva = mls.find((m) => m.iva != null)?.iva ?? null;
      const distintos = vs != null ? mls.filter((m) => m.iva !== vs) : [];
      if (destino !== "descartado" && vs != null && distintos.length) {
        difIva.push({ sku: f.sku, titulo: mls[0].titulo, vs, ml: distintos[0].iva ?? 0, items: distintos.map((m) => m.item) });
      }
      await c.query("update importacion_vs_sku set destino = $3, iva_vs = $4, iva_ml = $5 where importacion_id = $1 and sku = $2",
        [id, f.sku, destino, vs, mlIva]);
    }
  });
  const pubs = await una<{ total: number; sin_sku: number; sin_producto: number }>(`
    select count(*)::int total, count(*) filter (where sku is null)::int sin_sku,
           count(*) filter (where sku is not null and not exists (select 1 from importacion_vs_sku s where s.importacion_id = $1 and s.sku = upper(trim(m.sku)) and s.maestro is not null))::int sin_producto
      from meli_item m where m.canal_id = $2 and m.estado in ('active', 'paused')`, [id, cuenta.canalId]);
  await consulta("update importacion_vs set estado = 'analizado', resumen = resumen || $3::jsonb where id = $1 and organizacion_id = $2",
    [id, org, JSON.stringify({ ...cuenta_, iva_diferencias: difIva, columna_iva: cIva, publicaciones: pubs })]);
  return true;
}

/** Corrige en ML el IVA de las publicaciones que no coinciden con VS. */
export async function corregirIvaMl(org: string, id: number): Promise<{ ok: number; errores: string[] }> {
  const imp = await una<Corrida>("select id::int, estado, resumen from importacion_vs where id = $1 and organizacion_id = $2", [id, org]);
  if (!imp) throw new ErrorErp("La importación no existe.");
  const difs = (imp.resumen.iva_diferencias as { sku: string; vs: number; items: string[] }[]) ?? [];
  const cuenta = await cuentaBase(org);
  let ok = 0;
  const errores: string[] = [];
  const corregidos: string[] = [];
  for (const d of difs) {
    for (const item of d.items) {
      const valor = `${d.vs} %`;
      const r = await ml<{ message?: string; cause?: { message?: string }[] }>(cuenta, "PUT", `/items/${item}`,
        { attributes: [{ id: "VALUE_ADDED_TAX", value_name: valor }] });
      if (r.status >= 200 && r.status < 300) { ok++; corregidos.push(item); }
      else errores.push(`${item} (${d.sku}): ${r.datos?.cause?.[0]?.message ?? r.datos?.message ?? `error ${r.status}`}`);
    }
  }
  await consulta("update importacion_vs set resumen = resumen || $3::jsonb where id = $1 and organizacion_id = $2",
    [id, org, JSON.stringify({ iva_corregido: { ok, errores: errores.slice(0, 50), items: corregidos } })]);
  return { ok, errores };
}

// ── Importar ───────────────────────────────────────────────

type Ctx = {
  org: string; usuarioId: string; cuenta: CuentaMl; listaBase: number; depositoId: number; columnas: string[];
  ubicaciones: Map<string, number>; categorias: Map<string, number | null>; familias: Map<string, number>;
};

function dimension(it: ItemMl, id: string): number | null {
  const v = it.attributes?.find((a) => a.id === id)?.value_name;
  if (!v) return null;
  const n = numeroVs(v.replace(/[a-z]+$/i, ""));
  if (n == null) return null;
  if (/kg$/i.test(v)) return n * 1000;
  if (/mm$/i.test(v)) return n / 10;
  if (/m$/i.test(v) && !/cm$/i.test(v)) return n * 100;
  return n;
}

const IVAS = [0, 2.5, 5, 10.5, 21, 27];

async function ubicacion(c: PoolClient, ctx: Ctx, codigo: string): Promise<number> {
  const k = codigo.toUpperCase();
  const ya = ctx.ubicaciones.get(k);
  if (ya) return ya;
  const r = await c.query<{ id: string }>(`
    insert into ubicacion (organizacion_id, deposito_id, codigo) values ($1, $2, $3)
    on conflict (deposito_id, codigo) do update set codigo = excluded.codigo returning id`, [ctx.org, ctx.depositoId, codigo]);
  const id = Number(r.rows[0].id);
  ctx.ubicaciones.set(k, id);
  return id;
}

/** La familia de una categoría de ML, creando el árbol (Computación → Notebooks). */
async function familiaMl(ctx: Ctx, categoria: string | null | undefined): Promise<number | null> {
  if (!categoria) return null;
  if (ctx.categorias.has(categoria)) return ctx.categorias.get(categoria)!;
  const ya = await una<{ id: string }>("select id from familia where organizacion_id = $1 and ml_categoria = $2", [ctx.org, categoria]);
  if (ya) { ctx.categorias.set(categoria, Number(ya.id)); return Number(ya.id); }
  const r = await ml<{ path_from_root?: { id: string; name: string }[] }>(ctx.cuenta, "GET", `/categories/${categoria}`);
  const camino = r.status === 200 ? r.datos.path_from_root ?? [] : [];
  let padre: number | null = null;
  for (const n of camino) {
    const f = await una<{ id: string }>("select id from familia where organizacion_id = $1 and ml_categoria = $2", [ctx.org, n.id]);
    if (f) { padre = Number(f.id); continue; }
    const nuevo: { id: string } | null = await una<{ id: string }>(
      "insert into familia (organizacion_id, padre_id, nombre, ml_categoria) values ($1, $2, $3, $4) on conflict do nothing returning id",
      [ctx.org, padre, n.name, n.id]);
    padre = nuevo ? Number(nuevo.id) : Number((await una<{ id: string }>("select id from familia where organizacion_id = $1 and ml_categoria = $2", [ctx.org, n.id]))!.id);
  }
  ctx.categorias.set(categoria, padre);
  return padre;
}

/** La familia de VS (para los no publicados), por nombre, en la raíz. */
async function familiaVs(ctx: Ctx, nombre: string | null): Promise<number | null> {
  if (!nombre) return null;
  const k = norm(nombre);
  if (ctx.familias.has(k)) return ctx.familias.get(k)!;
  const ya = await una<{ id: string }>("select id from familia where organizacion_id = $1 and lower(nombre) = lower($2) order by padre_id nulls first, id limit 1", [ctx.org, nombre]);
  const id = ya ? Number(ya.id) : Number((await una<{ id: string }>("insert into familia (organizacion_id, nombre) values ($1, $2) returning id", [ctx.org, nombre]))!.id);
  ctx.familias.set(k, id);
  return id;
}

async function importarSku(ctx: Ctx, f: { sku: string; stock: { ubicacion: string; cantidad: number }[]; maestro: Record<string, Valor>; precio: string | null;
  ml_items: string[]; destino: string; iva_vs: string | null }) {
  const m = f.maestro, cols = ctx.columnas;
  const val = (...nombres: string[]) => { const c = columna(cols, ...nombres); return c ? txt(m[c]) : null; };
  const items = f.ml_items.length ? await consulta<{ item_id: string; estado: string; tipo: string | null; precio: string | null; d: ItemMl & {
    pictures?: { secure_url?: string; url?: string }[]; condition?: string; original_price?: number | null; sale_terms?: { id: string; value_name: string | null }[] } }>(
    "select distinct on (item_id) item_id, estado, tipo, precio, datos_externos -> 'ml' d from meli_item where canal_id = $1 and item_id = any($2::text[]) order by item_id, variation_id",
    [ctx.cuenta.canalId, f.ml_items]) : [];
  // La publicación principal: la Clásica activa más barata; si no, la primera activa.
  const clasicas = items.filter((i) => i.tipo === "gold_special" && i.estado === "active").sort((a, b) => Number(a.precio) - Number(b.precio));
  const principal = clasicas[0] ?? items.find((i) => i.estado === "active") ?? items[0] ?? null;
  const it = principal?.d ?? null;
  const at = (id: string) => it?.attributes?.find((a) => a.id === id)?.value_name?.trim() || null;

  let descripcion: string | null = null;
  if (principal) {
    const d = await ml<{ plain_text?: string }>(ctx.cuenta, "GET", `/items/${principal.item_id}/description`);
    descripcion = d.status === 200 ? d.datos.plain_text?.trim() || null : null;
  }
  descripcion = descripcion || val("descripcion ml", "descripcion");
  const titulo = it?.title || val("titulo de la publicacion ml") || val("producto: denominacion", "denominacion") || f.sku;
  const ivaVs = f.iva_vs != null ? Number(f.iva_vs) : null;
  const iva = [ivaVs, numeroVs(at("VALUE_ADDED_TAX"))].find((x): x is number => x != null && IVAS.includes(x)) ?? 21;
  const familia = it ? await familiaMl(ctx, it.category_id) : await familiaVs(ctx, val("familia"));
  const garantia = it?.sale_terms?.filter((t) => /WARRANTY/.test(t.id)).map((t) => t.value_name).filter(Boolean).join(" · ") || null;
  const condicion = it?.condition === "used" ? "usado" : it?.condition === "refurbished" ? "reacondicionado" : it ? "nuevo" : null;
  const tipoVs = val("tipo de producto") ?? "";
  const kit = /kit|config/i.test(tipoVs);
  const costo = numeroVs(m[columna(cols, "costo") ?? ""] ?? null);
  const fotos = (it?.pictures ?? []).map((p) => p.secure_url || p.url).filter(Boolean).slice(0, 12) as string[];
  const atributos = (it?.attributes ?? []).filter((a) => a.value_name).map((a) => ({ id: a.id, name: a.name ?? a.id, value_name: a.value_name }));
  const estado = f.destino === "activo" ? "activo" : "archivado";
  const peso = it ? dimension(it, "PACKAGE_WEIGHT") : null;

  const variacionId = await enTransaccion(async (c) => {
    const p = await c.query<{ id: string }>(`
      insert into producto (organizacion_id, sku_base, titulo, descripcion, familia_id, marca, modelo, linea, garantia, condicion, categoria_ml,
                            atributos_ml, kit_vs, iva_pct, codigo_barras, peso_g, largo_cm, ancho_cm, alto_cm, estado)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18, $19, $20)
      on conflict (organizacion_id, sku_base) do update set titulo = excluded.titulo, descripcion = coalesce(excluded.descripcion, producto.descripcion),
        familia_id = coalesce(excluded.familia_id, producto.familia_id), marca = coalesce(excluded.marca, producto.marca),
        modelo = coalesce(excluded.modelo, producto.modelo), linea = coalesce(excluded.linea, producto.linea),
        garantia = coalesce(excluded.garantia, producto.garantia), condicion = coalesce(excluded.condicion, producto.condicion),
        categoria_ml = coalesce(excluded.categoria_ml, producto.categoria_ml),
        atributos_ml = case when excluded.atributos_ml = '[]'::jsonb then producto.atributos_ml else excluded.atributos_ml end,
        kit_vs = excluded.kit_vs, iva_pct = excluded.iva_pct, codigo_barras = coalesce(excluded.codigo_barras, producto.codigo_barras),
        peso_g = coalesce(excluded.peso_g, producto.peso_g), largo_cm = coalesce(excluded.largo_cm, producto.largo_cm),
        ancho_cm = coalesce(excluded.ancho_cm, producto.ancho_cm), alto_cm = coalesce(excluded.alto_cm, producto.alto_cm),
        estado = excluded.estado, actualizado_ts = now()
      returning id`,
      [ctx.org, f.sku, titulo.slice(0, 300), descripcion, familia, at("BRAND") ?? val("marca"), at("MODEL") ?? val("modelo"), at("LINE"), garantia, condicion,
        it?.category_id ?? null, JSON.stringify(atributos), kit, iva, at("GTIN") ?? val("codigo upc", "codigo ean", "codigo de barra"),
        peso != null ? Math.round(peso) : null, it ? dimension(it, "PACKAGE_LENGTH") : null, it ? dimension(it, "PACKAGE_WIDTH") : null, it ? dimension(it, "PACKAGE_HEIGHT") : null, estado]);
    const productoId = Number(p.rows[0].id);
    const v = await c.query<{ id: string }>("select id from variacion where producto_id = $1 and es_default", [productoId]);
    const vid = Number(v.rows[0].id);
    if (costo != null) await c.query("update variacion set costo_fob = $2, costo_moneda = 'USD' where id = $1", [vid, costo]);
    if (fotos.length) {
      await c.query("delete from producto_foto where producto_id = $1 and ruta_storage is null", [productoId]);
      for (const [i, u] of fotos.entries()) await c.query("insert into producto_foto (organizacion_id, producto_id, orden, url) values ($1, $2, $3, $4)", [ctx.org, productoId, i, u]);
    }
    // Precio de la lista Clásicas: el de la publicación Clásica; si no hay, Lista_000.
    const precio = clasicas[0] ? Number(clasicas[0].precio) : f.precio != null ? Number(f.precio) : null;
    if (precio != null && precio >= 0) {
      const ya = await c.query<{ lista_ars: string }>("select lista_ars from precio_de($1, $2, $3)", [ctx.org, vid, ctx.listaBase]);
      if (!ya.rows[0] || Number(ya.rows[0].lista_ars) !== r2(precio)) {
        await guardarPrecio(ctx.org, { listaId: ctx.listaBase, variacionId: vid, importe: r2(precio), moneda: "ARS", usuarioId: ctx.usuarioId }, c);
      }
    }
    // Stock: se lleva cada ubicación al valor del archivo.
    for (const s of f.stock) {
      const u = await ubicacion(c, ctx, s.ubicacion);
      const actual = Number((await c.query<{ n: string }>("select coalesce(sum(cantidad), 0) n from stock where variacion_id = $1 and ubicacion_id = $2", [vid, u])).rows[0].n);
      const dif = Math.round(s.cantidad) - actual;
      if (dif) await moverStock(ctx.org, { variacionId: vid, tipo: "ajuste", cantidad: Math.abs(dif), destinoId: dif > 0 ? u : null, origenId: dif < 0 ? u : null,
        referencia: { tipo: "importacion_vs", id: f.sku }, usuarioId: ctx.usuarioId, nota: "Stock inicial de Virtual Seller" }, c);
    }
    return vid;
  });
  // Publicaciones: guardarItem las vincula por SKU y las refresca; después el precio tachado.
  for (const i of items) {
    await guardarItem(ctx.cuenta, i.d);
    await consulta("update publicacion set precio_tachado = $3 where canal_id = $1 and id_externo = $2",
      [ctx.cuenta.canalId, i.item_id, i.d.original_price && i.d.original_price > Number(i.precio) ? i.d.original_price : null]);
  }
  return variacionId;
}

/** Importa los SKU pendientes hasta `hastaMs`. Devuelve true si terminó. */
export async function importar(org: string, id: number, hastaMs: number): Promise<boolean> {
  const imp = await una<Corrida & { usuario_id: string | null }>("select id::int, estado, resumen, usuario_id from importacion_vs where id = $1 and organizacion_id = $2", [id, org]);
  if (!imp || imp.estado !== "importando") return true;
  const dep = await una<{ id: string }>("select id from deposito where organizacion_id = $1 and nombre = $2", [org, DEPOSITO_VS]);
  if (!dep) throw new ErrorErp(`No existe el depósito ${DEPOSITO_VS}.`);
  const lista = await una<{ id: string }>("select id from lista_precios where organizacion_id = $1 and nombre = $2", [org, LISTA_BASE]);
  if (!lista) throw new ErrorErp(`No existe la lista de precios ${LISTA_BASE}.`);
  const ctx: Ctx = {
    org, usuarioId: imp.usuario_id ?? "sistema", cuenta: await cuentaBase(org), listaBase: Number(lista.id), depositoId: Number(dep.id),
    columnas: (imp.resumen.columnas_maestro as string[]) ?? [], ubicaciones: new Map(), categorias: new Map(), familias: new Map(),
  };
  await consulta("update deposito set usa_ubicaciones = true where id = $1", [ctx.depositoId]);
  for (;;) {
    if (Date.now() > hastaMs) return false;
    const filas = await consulta<Parameters<typeof importarSku>[1]>(`
      select sku, stock, maestro, precio, ml_items, destino, iva_vs from importacion_vs_sku
       where importacion_id = $1 and organizacion_id = $2 and resultado is null and destino in ('activo', 'inactivo')
       order by (destino = 'activo') desc, sku limit 50`, [id, org]);
    if (!filas.length) break;
    for (const f of filas) {
      if (Date.now() > hastaMs) return false;
      try {
        await importarSku(ctx, f);
        await consulta("update importacion_vs_sku set resultado = 'ok', motivo = null where importacion_id = $1 and sku = $2", [id, f.sku]);
      } catch (e) {
        await consulta("update importacion_vs_sku set resultado = 'error', motivo = $3 where importacion_id = $1 and sku = $2", [id, f.sku, motivoErp(e)]);
      }
    }
  }
  const t = await una<{ ok: number; err: number }>(`select count(*) filter (where resultado = 'ok')::int ok, count(*) filter (where resultado = 'error')::int err
    from importacion_vs_sku where importacion_id = $1`, [id]);
  await consulta("update importacion_vs set estado = 'terminado', terminado_ts = now(), resumen = resumen || $2::jsonb where id = $1",
    [id, JSON.stringify({ importados: t?.ok ?? 0, con_error: t?.err ?? 0 })]);
  return true;
}

/** Un paso de la corrida (lo llaman las tareas periódicas y la pantalla). */
export async function avanzar(org: string, id: number, hastaMs: number) {
  const imp = await una<{ estado: string }>("select estado from importacion_vs where id = $1 and organizacion_id = $2", [id, org]);
  if (!imp) return;
  try {
    if (imp.estado === "cargando") await analizar(org, id, hastaMs);
    else if (imp.estado === "importando") await importar(org, id, hastaMs);
  } catch (e) {
    await consulta("update importacion_vs set error = $2 where id = $1", [id, motivoErp(e)]);
  }
}
