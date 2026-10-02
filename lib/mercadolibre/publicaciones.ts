// Publicaciones de Mercado Libre: traer todas las de una cuenta a meli_item
// y vincular cada una (o cada variación) con una variación de Laucen. Lo
// vinculado queda en `publicacion` (del cimiento), que es lo que usan el
// stock, la pausa y los pedidos.

import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { ml, mlOk, type CuentaMl } from "@/lib/mercadolibre/api";

type Atributo = { id: string; value_name: string | null; name?: string };
type Variacion = {
  id: number; available_quantity: number; sold_quantity?: number; price?: number; seller_custom_field?: string | null;
  attribute_combinations?: Atributo[]; attributes?: Atributo[]; picture_ids?: string[];
};
export type ItemMl = {
  id: string; title: string; status: string; price: number; available_quantity: number; sold_quantity?: number;
  listing_type_id?: string; category_id?: string; permalink?: string; thumbnail?: string; secure_thumbnail?: string;
  seller_custom_field?: string | null; attributes?: Atributo[]; variations?: Variacion[];
  shipping?: { logistic_type?: string }; catalog_listing?: boolean; user_product_id?: string | null;
};

const skuDe = (attrs?: Atributo[], custom?: string | null) =>
  attrs?.find((a) => a.id === "SELLER_SKU")?.value_name?.trim() || custom?.trim() || null;

/** Las filas de meli_item de un item (una sola, o una por variación). */
function filasDeItem(it: ItemMl) {
  const base = {
    titulo: it.title, estado: it.status, tipo: it.listing_type_id ?? null, logistica: it.shipping?.logistic_type ?? null,
    categoria: it.category_id ?? null, permalink: it.permalink ?? null, foto: it.secure_thumbnail ?? it.thumbnail ?? null,
  };
  if (!it.variations?.length) {
    return [{ ...base, variation_id: "", atributos: null, sku: skuDe(it.attributes, it.seller_custom_field), precio: it.price, stock: it.available_quantity, vendidos: it.sold_quantity ?? null }];
  }
  return it.variations.map((v) => ({
    ...base, variation_id: String(v.id),
    atributos: (v.attribute_combinations ?? []).map((a) => a.value_name).filter(Boolean).join(" / ") || null,
    sku: skuDe(v.attributes, v.seller_custom_field), precio: v.price ?? it.price, stock: v.available_quantity, vendidos: v.sold_quantity ?? null,
  }));
}

/** Guarda un item en meli_item y, si su SKU coincide con una variación de
 *  Laucen y no estaba vinculado, lo vincula. Devuelve cuántas filas vinculó. */
export async function guardarItem(cuenta: CuentaMl, it: ItemMl): Promise<number> {
  const org = cuenta.organizacionId;
  let vinculadas = 0;
  for (const f of filasDeItem(it)) {
    await consulta(`
      insert into meli_item (organizacion_id, canal_id, item_id, variation_id, titulo, atributos, sku, precio, stock, vendidos, estado, tipo,
                             logistica, categoria, permalink, foto, datos_externos)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
      on conflict (canal_id, item_id, variation_id) do update set titulo = excluded.titulo, atributos = excluded.atributos, sku = excluded.sku,
        precio = excluded.precio, stock = excluded.stock, vendidos = excluded.vendidos, estado = excluded.estado, tipo = excluded.tipo,
        logistica = excluded.logistica, categoria = excluded.categoria, permalink = excluded.permalink, foto = excluded.foto,
        datos_externos = excluded.datos_externos, actualizado_ts = now()`,
      [org, cuenta.canalId, it.id, f.variation_id, f.titulo, f.atributos, f.sku, f.precio, f.stock, f.vendidos, f.estado, f.tipo,
        f.logistica, f.categoria, f.permalink, f.foto, JSON.stringify({ ml: it })]);
    // ¿Ya vinculada? Se actualiza la publicación con lo de ML.
    const pub = await una<{ id: string }>(`select id from publicacion where canal_id = $1 and id_externo = $2 and coalesce(variacion_externa, '') = $3`,
      [cuenta.canalId, it.id, f.variation_id]);
    let pubId = pub ? Number(pub.id) : null;
    if (!pubId && f.sku) {
      // Por SKU, o por una equivalencia (SKU viejo o con otro código en ML → SKU de Laucen).
      const v = await una<{ id: string }>(`
        select id from variacion where organizacion_id = $1 and lower(sku) = lower($2)
        union all
        select v.id from sku_equivalencia e join variacion v on v.organizacion_id = e.organizacion_id and lower(v.sku) = lower(e.sku)
         where e.organizacion_id = $1 and e.alias = upper($2)
        limit 1`, [org, f.sku]);
      if (v) { pubId = await vincular(cuenta, it.id, f.variation_id, Number(v.id)); vinculadas++; }
    }
    if (pubId) await refrescarPublicacion(cuenta, pubId, it, f);
  }
  return vinculadas;
}

async function refrescarPublicacion(cuenta: CuentaMl, pubId: number, it: ItemMl, f: ReturnType<typeof filasDeItem>[number]) {
  const estado = it.status === "active" ? "activa" : it.status === "paused" ? "pausada" : "cerrada";
  await consulta(`
    update publicacion set titulo = $3, categoria_externa = $4, tipo_publicacion = $5, precio_canal = $7,
           cantidad_publicada = $8, ultima_sincronizacion_ts = now(),
           -- Una variación "pausada" por Laucen sigue activa en ML con 0 unidades.
           estado = case when pausada_por_stock and variacion_externa is not null and $8 = 0 and $6 = 'activa' then 'pausada' else $6 end,
           pausada_por_stock = pausada_por_stock and ($6 = 'pausada' or (variacion_externa is not null and $8 = 0)),
           datos_externos = jsonb_build_object('logistica', $9::text, 'permalink', $10::text, 'catalogo', $11::boolean, 'user_product_id', $12::text)
     where id = $2 and organizacion_id = $1`,
    [cuenta.organizacionId, pubId, f.titulo, f.categoria, f.tipo, estado, f.precio, f.stock, f.logistica, f.permalink, !!it.catalog_listing, it.user_product_id ?? null]);
  await consulta("update meli_item set publicacion_id = $3 where canal_id = $1 and item_id = $2 and variation_id = $4", [cuenta.canalId, it.id, pubId, f.variation_id]);
}

/** Vincula un item (o una variación) de ML con una variación de Laucen. */
export async function vincular(cuenta: CuentaMl, itemId: string, variationId: string, variacionId: number): Promise<number> {
  const org = cuenta.organizacionId;
  const v = await una("select 1 from variacion where id = $1 and organizacion_id = $2", [variacionId, org]);
  if (!v) throw new ErrorErp("La variación no existe.");
  const r = await una<{ id: string }>(`
    insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo, variacion_externa, estado)
    values ($1, $2, $3, $4, nullif($5, ''), 'activa')
    on conflict (canal_id, id_externo, coalesce(variacion_externa, '')) where id_externo is not null
      do update set variacion_id = excluded.variacion_id
    returning id`, [org, variacionId, cuenta.canalId, itemId, variationId]);
  const id = Number(r!.id);
  await consulta("update meli_item set publicacion_id = $3 where canal_id = $1 and item_id = $2 and variation_id = $4", [cuenta.canalId, itemId, id, variationId]);
  return id;
}

/** Crea en Laucen el producto de una publicación de ML que no tiene (simple,
 *  o con variaciones si el item las tiene) y lo deja vinculado. El SKU sale
 *  del de ML; si no tiene, se arma con el número de publicación. */
export async function crearProductoDesdeItem(cuenta: CuentaMl, itemId: string): Promise<number> {
  const org = cuenta.organizacionId;
  const it = await mlOk<ItemMl>(cuenta, "GET", `/items/${itemId}?include_attributes=all`);
  const filas = filasDeItem(it);
  const desc = await ml<{ plain_text?: string }>(cuenta, "GET", `/items/${itemId}/description`);
  const marca = it.attributes?.find((a) => a.id === "BRAND")?.value_name ?? null;
  const conVar = !!it.variations?.length;
  const productoId = await enTransaccion(async (c) => {
    const skuBase = (conVar ? null : filas[0].sku) || it.id;
    const p = await c.query<{ id: string }>(`
      insert into producto (organizacion_id, sku_base, titulo, descripcion, marca, tipo) values ($1, $2, $3, $4, $5, $6)
      on conflict (organizacion_id, sku_base) do nothing returning id`,
      [org, skuBase, it.title, desc.status === 200 ? desc.datos.plain_text ?? null : null, marca, conVar ? "con_variaciones" : "simple"]);
    if (!p.rows[0]) throw new ErrorErp(`Ya hay un producto con el SKU ${skuBase}: vinculá la publicación a ese.`);
    const id = Number(p.rows[0].id);
    if (it.secure_thumbnail || it.thumbnail) {
      await c.query("insert into producto_foto (organizacion_id, producto_id, orden, url) values ($1, $2, 0, $3)", [org, id, it.secure_thumbnail ?? it.thumbnail]);
    }
    if (conVar) {
      for (const [i, f] of filas.entries()) {
        const v = await c.query<{ id: string }>(`insert into variacion (organizacion_id, producto_id, sku, orden) values ($1, $2, $3, $4) returning id`,
          [org, id, f.sku || `${it.id}-${f.variation_id}`, i]);
        const comb = it.variations![i].attribute_combinations ?? [];
        for (const [j, a] of comb.entries()) {
          if (a.value_name) await c.query("insert into variacion_atributo (organizacion_id, variacion_id, nombre, valor, orden) values ($1, $2, $3, $4, $5) on conflict do nothing",
            [org, v.rows[0].id, a.name ?? a.id, a.value_name, j]);
        }
      }
    }
    return id;
  });
  await guardarItem(cuenta, it); // se vincula solo por SKU
  // Si no tenía SKU en ML, se vincula a mano con lo recién creado.
  const vars = await consulta<{ id: number; sku: string }>("select id::int, sku from variacion where producto_id = $1 order by orden, id", [productoId]);
  for (const [i, f] of filas.entries()) {
    const yaVinc = await una("select 1 from publicacion where canal_id = $1 and id_externo = $2 and coalesce(variacion_externa, '') = $3", [cuenta.canalId, it.id, f.variation_id]);
    if (!yaVinc && vars[i]) await vincular(cuenta, it.id, f.variation_id, vars[i].id);
  }
  return productoId;
}

/** Trae TODAS las publicaciones de la cuenta (activas, pausadas y cerradas
 *  recientes) a meli_item. Devuelve cuántas leyó y cuántas vinculó solas. */
export async function traerPublicaciones(cuenta: CuentaMl, hastaMs: number): Promise<{ leidas: number; vinculadas: number; completo: boolean }> {
  let scroll: string | null = null;
  let leidas = 0, vinculadas = 0;
  for (;;) {
    if (Date.now() > hastaMs) return { leidas, vinculadas, completo: false };
    const r: { status: number; datos: { results: string[]; scroll_id?: string } } = await ml(cuenta, "GET",
      `/users/${cuenta.meliUserId}/items/search?search_type=scan&limit=100${scroll ? `&scroll_id=${scroll}` : ""}`);
    if (r.status !== 200) throw new ErrorErp(`Mercado Libre no dio la lista de publicaciones (${r.status}).`);
    const ids = r.datos.results ?? [];
    if (!ids.length) return { leidas, vinculadas, completo: true };
    scroll = r.datos.scroll_id ?? null;
    for (let i = 0; i < ids.length; i += 20) {
      const m = await ml<{ code: number; body: ItemMl }[]>(cuenta, "GET", `/items?ids=${ids.slice(i, i + 20).join(",")}&include_attributes=all`);
      if (m.status !== 200) continue;
      for (const x of m.datos) {
        if (x.code !== 200) continue;
        vinculadas += await guardarItem(cuenta, x.body);
        leidas++;
      }
    }
    if (!scroll) return { leidas, vinculadas, completo: true };
  }
}
