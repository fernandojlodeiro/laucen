// Vendedores referentes, fase 1 (pedido de Fer, 28/10): qué venden los vendedores de la competencia que leímos
// (lib/compras/vendedor-referente.ts) y nosotros no, para pedirle cotización al proveedor. Una fila por publicación, sin
// repetir, en referente_pub (db/compras.sql), cruzada con nuestro catálogo por el parecido del título (sin IA todavía):
//   · «Ya lo tenés» si nuestro producto más parecido comparte la mayoría de las palabras (PARECIDO_TENEMOS);
//   · «Lo venden N»: cuántos referentes venden lo mismo (el mismo catálogo de ML o el mismo título).
// Lo que Fer decide de cada una (cotizar o descartar) queda en referente_decision. No asigna SKU ni cantidades (Fer, 28/10).

import { consulta, una } from "@/lib/erp/base";
import { parecido } from "@/lib/seguimiento";
import { coincideBusqueda } from "@/lib/busqueda";
import { ordenarEnMemoria } from "@/lib/lista";

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
  // Los grupos que ya armó la IA (lib/compras/referentes-ia.ts) se conservan.
  const grupos = new Map((await consulta<{ item_id: string; grupo_id: number }>(
    "select item_id, grupo_id::float8 grupo_id from referente_pub where organizacion_id = $1 and grupo_id is not null", [org])).map((x) => [x.item_id, x.grupo_id]));
  await consulta("delete from referente_pub where organizacion_id = $1", [org]);
  for (let i = 0; i < pubs.length; i += 1000) {
    await consulta(`
      insert into referente_pub (organizacion_id, item_id, vendedor_id, vendedor, titulo, precio, vendidos, foto, url, categoria_id, grupo, lo_venden, producto_id, parecido, leido_ts, grupo_id)
      select $1, x.item_id, x.vendedor_id, x.vendedor, x.titulo, x.precio, x.vendidos, x.foto, x.url, x.categoria_id, x.grupo, x.lo_venden, x.producto_id, x.parecido, x.leido_ts::timestamptz, x.grupo_id
        from jsonb_to_recordset($2::jsonb) x(item_id text, vendedor_id bigint, vendedor text, titulo text, precio numeric, vendidos int, foto text, url text,
             categoria_id text, grupo text, lo_venden int, producto_id bigint, parecido numeric, leido_ts text, grupo_id bigint)`,
      [org, JSON.stringify(pubs.slice(i, i + 1000).map((p) => ({ ...p, grupo_id: grupos.get(p.item_id) ?? null })))]);
  }
  await consulta("delete from referente_grupo g where g.organizacion_id = $1 and not exists (select 1 from referente_pub p where p.grupo_id = g.id)", [org]);
  return { publicaciones: pubs.length, tenemos };
}

/** Una publicación de un grupo, como se muestra al desplegarlo. */
export type PubDeGrupo = { item_id: string; vendedor: string | null; titulo: string; precio: number | null; vendidos: number | null; foto: string | null; url: string | null; decision: string | null };

/** Un producto de la competencia: las publicaciones que la IA juntó como el mismo producto (lib/compras/referentes-ia.ts) o,
 *  mientras no las juntó, cada publicación sola. La de referencia es la más vendida. */
export type FilaReferente = {
  clave: string; grupo_id: number | null; item_id: string; titulo: string; foto: string | null; url: string | null; vendedor: string | null;
  precio_min: number | null; precio_max: number | null; vendidos: number; lo_venden: number; pubs: PubDeGrupo[];
  producto_id: number | null; nuestro_sku: string | null; nuestro_titulo: string | null; nuestra_foto: string | null; nuestro_estado: string | null;
  /** «ia»: lo comparó la IA; «palabras»: todavía no, es el parecido del título (fase 1). */
  comparado: "ia" | "palabras"; motivo: string | null; parecido: number | null;
  decision: "cotizar" | "descartado" | null; marca_derechos: boolean; pasa_criterio: boolean;
};

/** Todos los productos de la competencia, con la decisión y nuestro producto (el filtro y el orden van en memoria). */
export async function publicacionesReferentes(org: string): Promise<FilaReferente[]> {
  const pubs = await consulta<PubDeGrupo & { grupo_id: number | null; producto_palabras: number | null; parecido: number | null }>(`
    select rp.item_id, rp.vendedor, rp.titulo, rp.precio::float8 precio, rp.vendidos, rp.foto, rp.url, d.estado decision,
           rp.grupo_id::float8 grupo_id, rp.producto_id::float8 producto_palabras, rp.parecido::float8 parecido
      from referente_pub rp left join referente_decision d on d.organizacion_id = rp.organizacion_id and d.item_id = rp.item_id
     where rp.organizacion_id = $1 order by rp.vendidos desc nulls last, rp.item_id`, [org]);
  const grupos = new Map((await consulta<{ id: number; producto_id: number | null; motivo: string | null; juzgado: boolean }>(
    "select id::float8 id, producto_id::float8 producto_id, motivo, juzgado_ts is not null juzgado from referente_grupo where organizacion_id = $1", [org])).map((g) => [g.id, g]));
  const porClave = new Map<string, typeof pubs>();
  for (const x of pubs) { const k = x.grupo_id != null ? `g${x.grupo_id}` : `i${x.item_id}`; porClave.set(k, [...(porClave.get(k) ?? []), x]); }
  const filas: Omit<FilaReferente, "nuestro_sku" | "nuestro_titulo" | "nuestra_foto" | "nuestro_estado">[] = [...porClave].map(([clave, xs]) => {
    const ref = xs[0]; // la más vendida
    const g = ref.grupo_id != null ? grupos.get(ref.grupo_id) : undefined;
    const precios = xs.map((x) => x.precio).filter((x): x is number => x != null);
    const decisiones = new Set(xs.map((x) => x.decision));
    const ia = !!g?.juzgado;
    return {
      clave, grupo_id: ref.grupo_id, item_id: ref.item_id, titulo: ref.titulo, foto: ref.foto, url: ref.url, vendedor: ref.vendedor,
      precio_min: precios.length ? Math.min(...precios) : null, precio_max: precios.length ? Math.max(...precios) : null,
      vendidos: xs.reduce((t, x) => t + (x.vendidos ?? 0), 0), lo_venden: new Set(xs.map((x) => x.vendedor)).size,
      pubs: xs.map(({ item_id, vendedor, titulo, precio, vendidos, foto, url, decision }) => ({ item_id, vendedor, titulo, precio, vendidos, foto, url, decision }))
        .sort((a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity)),
      producto_id: ia ? g!.producto_id : ref.producto_palabras, comparado: ia ? "ia" : "palabras", motivo: ia ? g!.motivo : null, parecido: ref.parecido,
      decision: decisiones.has("cotizar") ? "cotizar" : decisiones.has("descartado") ? "descartado" : null,
      marca_derechos: xs.some((x) => esMarcaConDerechos(x.titulo)), pasa_criterio: xs.some((x) => pasaCriterio(x)),
    };
  });
  const ids = [...new Set(filas.map((x) => x.producto_id).filter((x): x is number => x != null))];
  const nuestros = new Map((await consulta<{ id: number; sku: string | null; titulo: string; foto: string | null; estado: string }>(`
    select p.id::float8 id, (select v.sku from variacion v where v.producto_id = p.id order by v.id limit 1) sku, p.titulo, p.estado,
           (select pf.url from producto_foto pf where pf.producto_id = p.id order by pf.orden limit 1) foto
      from producto p where p.id = any($1::bigint[])`, [ids])).map((x) => [x.id, x]));
  return filas.map((x) => {
    const n = x.producto_id != null ? nuestros.get(x.producto_id) : undefined;
    return { ...x, nuestro_sku: n?.sku ?? null, nuestro_titulo: n?.titulo ?? null, nuestra_foto: n?.foto ?? null, nuestro_estado: n?.estado ?? null };
  });
}

/** Los filtros de la pantalla (la dirección). Pura. */
export function filtrarReferentes(filas: FilaReferente[], sp: Record<string, string | undefined>, coincide: (x: FilaReferente) => boolean): FilaReferente[] {
  const ver = sp.ver ?? "nuevos";
  const vendedor = sp.vendedor ?? "";
  return filas.filter((x) =>
    (ver === "todos" || (ver === "nuevos" && !x.producto_id && x.decision !== "descartado")
      || (ver === "activos" && !!x.producto_id && x.nuestro_estado !== "archivado") || (ver === "archivados" && !!x.producto_id && x.nuestro_estado === "archivado")
      || (ver === "cotizar" && x.decision === "cotizar") || (ver === "descartados" && x.decision === "descartado"))
    && (sp.criterio === "0" || x.pasa_criterio)
    && (sp.marcas === "1" || !x.marca_derechos)
    && (!vendedor || x.pubs.some((p) => p.vendedor === vendedor))
    && coincide(x));
}

/** Las columnas por las que se ordena (lista blanca). */
export const ORDEN_REFERENTES: Record<string, (x: FilaReferente) => string | number | null> = {
  titulo: (x) => x.titulo, precio: (x) => x.precio_min, vendidos: (x) => x.vendidos, lo_venden: (x) => x.lo_venden,
};

/** Lo que se busca en cada fila: los títulos y vendedores de todas sus publicaciones, sus números y nuestro SKU. */
export const textoBuscable = (x: FilaReferente) => [...x.pubs.flatMap((p) => [p.titulo, p.vendedor ?? "", p.item_id]), x.nuestro_sku ?? "", x.nuestro_titulo ?? ""];

/** Marca para cotizar, descarta o deja sin decidir (null) todas las publicaciones de un producto de la competencia. */
export async function decidirVarias(org: string, items: string[], estado: "cotizar" | "descartado" | null, usuarioId: string): Promise<void> {
  const xs = items.filter(Boolean);
  if (!xs.length) return;
  if (!estado) { await consulta("delete from referente_decision where organizacion_id = $1 and item_id = any($2::text[])", [org, xs]); return; }
  await consulta(`insert into referente_decision (organizacion_id, item_id, estado, usuario_id) select $1, x, $3, $4 from unnest($2::text[]) x
                  on conflict (organizacion_id, item_id) do update set estado = excluded.estado, usuario_id = excluded.usuario_id, ts = now()`,
    [org, xs, estado, usuarioId]);
}

/** Lo que se ve en la pantalla con los filtros de la dirección (todas las páginas, en su orden): la pantalla, el Excel y
 *  «Marcar los que se ven» usan esto mismo. */
export async function filasDeLaPantalla(org: string, sp: Record<string, string | undefined>) {
  const todas = await publicacionesReferentes(org);
  const q = sp.q?.trim() ?? "";
  const coincide = (x: FilaReferente) => !q || coincideBusqueda(textoBuscable(x), q, sp.contiene !== "1");
  return { todas, coincide, filas: ordenarEnMemoria(filtrarReferentes(todas, sp, coincide), sp, ORDEN_REFERENTES) };
}

/** «Marcar los que se ven para cotizar» (Fer, 29/10) o desmarcarlos: todas las publicaciones de los productos que deja el
 *  filtro. Los descartados no se tocan. Devuelve cuántos productos. */
export async function marcarLosQueSeVen(org: string, sp: Record<string, string | undefined>, marcar: boolean, usuarioId: string): Promise<number> {
  const { filas } = await filasDeLaPantalla(org, sp);
  const elegidas = filas.filter((x) => x.decision !== "descartado" && (marcar ? x.decision !== "cotizar" : x.decision === "cotizar"));
  await decidirVarias(org, elegidas.flatMap((x) => x.pubs.map((p) => p.item_id)), marcar ? "cotizar" : null, usuarioId);
  return elegidas.length;
}

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
