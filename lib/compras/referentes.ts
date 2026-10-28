// Vendedores referentes, fase 1 (pedido de Fer, 28/10): qué venden los vendedores de la competencia que leímos
// (lib/compras/vendedor-referente.ts) y nosotros no, para pedirle cotización al proveedor. Una fila por publicación, sin
// repetir, en referente_pub (db/compras.sql), cruzada con nuestro catálogo por el parecido del título (sin IA todavía):
//   · «Ya lo tenés» si nuestro producto más parecido comparte la mayoría de las palabras (PARECIDO_TENEMOS);
//   · «Lo venden N»: cuántos referentes venden lo mismo (el mismo catálogo de ML o el mismo título).
// Lo que Fer decide de cada una (cotizar o descartar) queda en referente_decision. No asigna SKU ni cantidades (Fer, 28/10).

import { consulta, una } from "@/lib/erp/base";
import { parecido } from "@/lib/seguimiento";

/** Criterio de entrada (Fer, 14/10): más de 500 vendidas, o desde $ 50.000 con más de 25 vendidas. */
export const VENDIDAS_MINIMO = 500;
export const PRECIO_ALTO = 50000;
export const VENDIDAS_PRECIO_ALTO = 25;
/** Parte de las palabras que tienen que coincidir (en los dos sentidos) para tomarlo como «ya lo tenés». */
export const PARECIDO_TENEMOS = 0.6;
/** Marcas con derechos que no se importan (Fer, 14/10: «sólo fuera las marcas con derechos: Lego, Apple, Dewalt…»). */
export const MARCAS_CON_DERECHOS = ["lego", "apple", "iphone", "ipad", "airpods", "macbook", "dewalt", "disney", "marvel", "nintendo", "playstation"];

/** ¿Pasa el criterio de entrada? Pura. */
export const pasaCriterio = (x: { precio: number | null; vendidos: number | null }) =>
  (x.vendidos ?? 0) > VENDIDAS_MINIMO || ((x.precio ?? 0) >= PRECIO_ALTO && (x.vendidos ?? 0) > VENDIDAS_PRECIO_ALTO);

/** ¿Es de una marca con derechos? Pura. */
export const esMarcaConDerechos = (titulo: string) => {
  const t = ` ${titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()} `;
  return MARCAS_CON_DERECHOS.some((m) => new RegExp(`[^a-z0-9]${m}[^a-z0-9]`).test(t));
};

/** Con qué se agrupa «lo mismo» entre vendedores: el catálogo de ML o el título normalizado. Pura. */
export const grupoDe = (catalogo: string | null | undefined, titulo: string) =>
  catalogo && /^MLA\d+$/.test(catalogo) ? catalogo : titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** El número del vendedor en un link de su listado («_CustId_123») o escrito suelto. Pura. */
export const vendedorDeLink = (texto: string): number | null => {
  const t = texto.trim();
  if (/^\d{4,12}$/.test(t)) return Number(t);
  const m = t.match(/_CustId_(\d+)/i) ?? t.match(/[?&]seller_id=(\d+)/i);
  return m ? Number(m[1]) : null;
};

type Pub = { item_id: string; vendedor_id: number | null; vendedor: string | null; titulo: string; precio: number | null; vendidos: number | null;
  foto: string | null; url: string | null; categoria_id: string | null; grupo: string; lo_venden: number; producto_id: number | null; parecido: number | null; leido_ts: string | null };

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const palabrasDe = (t: string) => new Set(t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1));

/** Rearma referente_pub: la última lectura buena de cada vendedor, sin repetidas, cruzada con nuestros productos. */
export async function armarCruce(org: string): Promise<{ publicaciones: number; tenemos: number }> {
  const lecturas = await consulta<{ vendedor_id: number | null; nombre: string | null; items: Record<string, unknown>[]; ts: string }>(`
    select distinct on (coalesce(vendedor_id::text, url)) vendedor_id::float8 vendedor_id, nombre, items, actualizado_ts::text ts
      from vendedor_referente where organizacion_id = $1 and estado = 'terminada' and jsonb_array_length(items) > 0
     order by coalesce(vendedor_id::text, url), id desc`, [org]);
  const porItem = new Map<string, Pub>();
  for (const l of lecturas) for (const x of l.items) {
    const item = txt(x.itemId) ?? txt(x.id);
    const titulo = txt(x.title) ?? txt(x.name);
    if (!item || !titulo || porItem.has(item)) continue;
    porItem.set(item, {
      item_id: item, vendedor_id: l.vendedor_id, vendedor: l.nombre ?? txt(x.sellerName), titulo, precio: num(x.price), vendidos: num(x.soldQuantity),
      foto: txt(x.image) ?? txt(x.thumbnail), url: txt(x.url), categoria_id: txt(x.categoryId), grupo: grupoDe(txt(x.catalogProductId), titulo),
      lo_venden: 1, producto_id: null, parecido: null, leido_ts: l.ts,
    });
  }
  const pubs = [...porItem.values()];
  // Cuántos vendedores distintos venden lo mismo.
  const vendedores = new Map<string, Set<string>>();
  for (const p of pubs) vendedores.set(p.grupo, (vendedores.get(p.grupo) ?? new Set()).add(String(p.vendedor_id ?? p.vendedor)));
  for (const p of pubs) p.lo_venden = vendedores.get(p.grupo)!.size;
  // Nuestros productos: un índice de palabras (sin las muy comunes) para comparar sólo con los que comparten alguna.
  const nuestros = await consulta<{ id: number; titulo: string }>("select id::int, titulo from producto where organizacion_id = $1 and titulo is not null", [org]);
  const indice = new Map<string, number[]>();
  nuestros.forEach((p, i) => { for (const w of palabrasDe(p.titulo)) indice.set(w, [...(indice.get(w) ?? []), i]); });
  const comun = Math.max(50, nuestros.length / 20);
  let tenemos = 0;
  for (const p of pubs) {
    const candidatos = new Set<number>();
    for (const w of palabrasDe(p.titulo)) { const l = indice.get(w); if (l && l.length <= comun) l.forEach((i) => candidatos.add(i)); }
    let mejor: { i: number; s: number } | null = null;
    for (const i of candidatos) {
      const s = Math.min(parecido(p.titulo, nuestros[i].titulo), parecido(nuestros[i].titulo, p.titulo));
      if (!mejor || s > mejor.s) mejor = { i, s };
    }
    if (mejor) {
      p.parecido = Math.round(mejor.s * 100) / 100;
      if (mejor.s >= PARECIDO_TENEMOS) { p.producto_id = nuestros[mejor.i].id; tenemos++; }
    }
  }
  await consulta("delete from referente_pub where organizacion_id = $1", [org]);
  for (let i = 0; i < pubs.length; i += 1000) {
    await consulta(`
      insert into referente_pub (organizacion_id, item_id, vendedor_id, vendedor, titulo, precio, vendidos, foto, url, categoria_id, grupo, lo_venden, producto_id, parecido, leido_ts)
      select $1, x.item_id, x.vendedor_id, x.vendedor, x.titulo, x.precio, x.vendidos, x.foto, x.url, x.categoria_id, x.grupo, x.lo_venden, x.producto_id, x.parecido, x.leido_ts::timestamptz
        from jsonb_to_recordset($2::jsonb) x(item_id text, vendedor_id bigint, vendedor text, titulo text, precio numeric, vendidos int, foto text, url text,
             categoria_id text, grupo text, lo_venden int, producto_id bigint, parecido numeric, leido_ts text)`,
      [org, JSON.stringify(pubs.slice(i, i + 1000))]);
  }
  return { publicaciones: pubs.length, tenemos };
}

export type FilaReferente = Pub & { decision: "cotizar" | "descartado" | null; nuestro_sku: string | null; nuestro_titulo: string | null; nuestra_foto: string | null; marca_derechos: boolean };

/** Todas las publicaciones con la decisión y nuestro producto parecido (el filtro y el orden van en memoria). */
export async function publicacionesReferentes(org: string): Promise<FilaReferente[]> {
  const r = await consulta<Omit<FilaReferente, "marca_derechos">>(`
    select rp.item_id, rp.vendedor_id::float8 vendedor_id, rp.vendedor, rp.titulo, rp.precio::float8 precio, rp.vendidos, rp.foto, rp.url, rp.categoria_id, rp.grupo, rp.lo_venden,
           rp.producto_id::int producto_id, rp.parecido::float8 parecido, rp.leido_ts::text leido_ts, d.estado decision,
           (select v.sku from variacion v where v.producto_id = rp.producto_id order by v.id limit 1) nuestro_sku, p.titulo nuestro_titulo,
           (select pf.url from producto_foto pf where pf.producto_id = rp.producto_id order by pf.orden limit 1) nuestra_foto
      from referente_pub rp left join referente_decision d on d.organizacion_id = rp.organizacion_id and d.item_id = rp.item_id
      left join producto p on p.id = rp.producto_id
     where rp.organizacion_id = $1`, [org]);
  return r.map((x) => ({ ...x, marca_derechos: esMarcaConDerechos(x.titulo) }));
}

/** Los filtros de la pantalla (la dirección). Pura. */
export function filtrarReferentes(filas: FilaReferente[], sp: Record<string, string | undefined>, coincide: (x: FilaReferente) => boolean): FilaReferente[] {
  const ver = sp.ver ?? "nuevos";
  const vendedor = sp.vendedor ?? "";
  return filas.filter((x) =>
    (ver === "todos" || (ver === "nuevos" && !x.producto_id && x.decision !== "descartado") || (ver === "tenemos" && !!x.producto_id)
      || (ver === "cotizar" && x.decision === "cotizar") || (ver === "descartados" && x.decision === "descartado"))
    && (sp.criterio === "0" || pasaCriterio(x))
    && (sp.marcas === "1" || !x.marca_derechos)
    && (!vendedor || x.vendedor === vendedor)
    && coincide(x));
}

/** Las columnas por las que se ordena (lista blanca). */
export const ORDEN_REFERENTES: Record<string, (x: FilaReferente) => string | number | null> = {
  titulo: (x) => x.titulo, precio: (x) => x.precio, vendidos: (x) => x.vendidos, lo_venden: (x) => x.lo_venden, vendedor: (x) => x.vendedor,
};

/** Marca una publicación para cotizar, la descarta o la deja sin decidir (null). */
export async function decidir(org: string, itemId: string, estado: "cotizar" | "descartado" | null, usuarioId: string): Promise<void> {
  if (!estado) { await consulta("delete from referente_decision where organizacion_id = $1 and item_id = $2", [org, itemId]); return; }
  await consulta(`insert into referente_decision (organizacion_id, item_id, estado, usuario_id) values ($1, $2, $3, $4)
                  on conflict (organizacion_id, item_id) do update set estado = excluded.estado, usuario_id = excluded.usuario_id, ts = now()`,
    [org, itemId, estado, usuarioId]);
}

/** Los vendedores leídos (la última lectura de cada uno). */
export async function vendedoresLeidos(org: string) {
  return consulta<{ id: number; vendedor_id: number | null; nombre: string | null; url: string | null; estado: string; publicaciones: number; costo: number | null; ts: string; error: string | null }>(`
    select distinct on (coalesce(vendedor_id::text, url)) id::int, vendedor_id::float8 vendedor_id, nombre, url, estado, jsonb_array_length(items) publicaciones,
           costo_usd::float8 costo, actualizado_ts::text ts, error
      from vendedor_referente where organizacion_id = $1 order by coalesce(vendedor_id::text, url), id desc`, [org]);
}

/** Cuándo se armó el cruce por última vez. */
export const ultimoCruce = (org: string) =>
  una<{ n: number; ts: string | null }>("select count(*)::int n, max(leido_ts)::text ts from referente_pub where organizacion_id = $1", [org]);
