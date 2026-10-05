// Publicar en ML un producto que no está publicado, copiando una publicación
// parecida (Fer, 5/10). Desde la lista de productos "con stock y sin publicación
// activa en ML", el botón "Buscar en ML" abre /catalogo/productos/[id]/publicar-ml:
//   1. busca publicaciones parecidas entre TODAS las de las cuentas de Fer que
//      Laucen tiene guardadas (meli_item, en cualquier estado: cerradas, pausadas,
//      inactivas): por SKU y por palabras del título se eligen hasta 30, y el
//      juez (Claude, lib/mercadolibre/juez-similar.ts) saca las que son otro producto;
//      (la otra pestaña, el catálogo de ML, está en catalogo-similar.ts);
//   2. Fer elige una y Laucen arma el borrador con todos sus datos (título,
//      precio, cantidad, tipo, fotos, atributos, garantía, descripción) para
//      que los cambie;
//   3. "Preparar publicación" lo comprueba con ML (validate, no publica nada) y
//      deja el lote "Preparado, falta tu clic" en la cola: nada sale a ML sin el
//      clic de Fer (AGENTS.md).
//
// Las publicaciones de OTROS vendedores no se pueden leer por la API de ML
// (/sites/MLA/search y /items/{id} ajeno dan 403, bitácora #105 y #143).

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";
import { encolarLoteConBoton, type PedidoMl } from "@/lib/mercadolibre/cola";
import { armarCuerpoCopia, claveProducto, comprobarAlta, modeloDeLaucen, NO_MODIFICABLE, type ItemGuardado } from "@/lib/mercadolibre/copiar";
import { canalesMl } from "@/lib/precios-ml/datos";
import { juzgar, PESO_VEREDICTO, type Juicio, type Referencia } from "@/lib/mercadolibre/juez-similar";

// ── Buscar parecidas ────────────────────────────────────────

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "y", "o", "a", "en", "con", "para", "por", "sin", "x", "un", "una", "al"]);

/** Las palabras de un texto, sin tildes ni signos, en minúscula y sin las que no dicen nada. */
export function palabras(texto: string | null | undefined): string[] {
  const t = (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return [...new Set(t.split(" ").filter((p) => p.length >= 2 && !VACIAS.has(p)))];
}

/** El SKU para comparar: sin "DE-" adelante, en mayúscula. */
export const skuComparable = (sku: string | null | undefined) => (sku ?? "").trim().replace(/^DE-/i, "").toUpperCase();

/** La raíz del SKU, sin el sufijo de pack o unidad: SKU00715-U y SKU00715-100 → SKU00715. */
export const skuRaiz = (sku: string | null | undefined) => skuComparable(sku).replace(/-[A-Z0-9]{1,4}$/, "");

export const MISMO_SKU = 1000, SKU_PARECIDO = 500;

/** Qué tan parecida es una publicación: 1000 si tiene uno de los SKU del producto; 500 si
 *  tiene la misma raíz (el pack de la unidad, o al revés: SKU00715 ~ SKU00715-U); si no,
 *  el porcentaje de las palabras buscadas que aparecen en su título (una palabra del título
 *  que empieza igual que la buscada, de 4 letras o más, cuenta: "resistencia" ~ "resistencias"). */
export function puntaje(cand: { sku: string | null; titulo: string | null }, skus: Set<string>, buscadas: string[]): number {
  if (cand.sku && skus.has(skuComparable(cand.sku))) return MISMO_SKU;
  if (cand.sku && [...skus].some((s) => skuRaiz(s) === skuRaiz(cand.sku))) return SKU_PARECIDO;
  if (!buscadas.length) return 0;
  const del = palabras(cand.titulo);
  const esta = (p: string) => del.some((d) => d === p || (p.length >= 4 && d.length >= 4 && (d.startsWith(p) || p.startsWith(d))));
  const n = buscadas.filter(esta).length;
  return Math.round((100 * n) / buscadas.length);
}

export type Parecida = {
  item_id: string; canal_id: number; cuenta: string; titulo: string | null; sku: string | null; estado: string | null;
  precio: number | null; vendidos: number | null; foto: string | null; permalink: string | null; actualizado: string | null;
  puntaje: number; noSirve: string | null; juicio: Juicio | null;
};

/** Por qué una publicación guardada no sirve de modelo (o null si sirve). */
export function motivoNoSirve(it: { catalogo: boolean; variaciones: number; fotos: number; categoria: string | null }): string | null {
  if (it.catalogo) return "es de catálogo";
  if (it.variaciones > 0) return "tiene variaciones (todavía no)";
  if (!it.fotos) return "no tiene fotos";
  if (!it.categoria) return "le faltan datos: traé las publicaciones de nuevo";
  return null;
}

/** Lo que se le pasa al juez del producto de Laucen: título, marca, modelo y sus características de ML. */
export async function referenciaDe(org: string, productoId: number): Promise<Referencia & { sku_base: string; skus: string[]; codigo_barras: string | null }> {
  const p = await una<{ titulo: string; sku_base: string; marca: string | null; modelo: string | null; codigo_barras: string | null; atributos_ml: { name?: string; value_name?: string | null }[] | null; skus: string[] }>(`
    select p.titulo, p.sku_base, p.marca, p.modelo, p.codigo_barras, p.atributos_ml, coalesce(array_agg(v.sku) filter (where v.sku is not null), '{}') skus
      from producto p left join variacion v on v.producto_id = p.id
     where p.organizacion_id = $1 and p.id = $2 group by p.id`, [org, productoId]);
  if (!p) throw new ErrorErp("Ese producto no existe.");
  const datos = (Array.isArray(p.atributos_ml) ? p.atributos_ml : [])
    .filter((a) => a.name && a.value_name && !/paquete|SKU|IVA|impuesto/i.test(a.name)).slice(0, 15).map((a) => `${a.name}: ${a.value_name}`).join("; ");
  return { titulo: p.titulo, marca: p.marca, modelo: p.modelo, datos: datos || null, sku_base: p.sku_base, skus: p.skus, codigo_barras: p.codigo_barras };
}

/** Las publicaciones de las cuentas de Fer parecidas al producto (o a lo que se busca en `q`):
 *  por SKU y por palabras se eligen hasta 30 y el juez (Claude) descarta las que son otro
 *  producto. `conJuez` = false si no se le pudo preguntar (queda sólo el orden por palabras). */
export async function parecidas(org: string, productoId: number, q: string | null, max = 30): Promise<{ lista: Parecida[]; conJuez: boolean }> {
  const ref = await referenciaDe(org, productoId);
  const skus = new Set([ref.sku_base, ...ref.skus].map(skuComparable).filter(Boolean));
  const buscadas = palabras(q ?? ref.titulo);
  const filas = await consulta<Omit<Parecida, "puntaje" | "noSirve" | "juicio"> & { catalogo: boolean; variaciones: number; fotos: number; categoria: string | null }>(`
    select distinct on (m.item_id) m.item_id, m.canal_id::int, c.nombre cuenta, m.titulo, m.sku, m.estado, m.precio::float8 precio, m.vendidos,
           m.foto, m.permalink, to_char(m.actualizado_ts at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') actualizado,
           coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false) catalogo,
           coalesce(jsonb_array_length(case when jsonb_typeof(m.datos_externos -> 'ml' -> 'variations') = 'array' then m.datos_externos -> 'ml' -> 'variations' end), 0) variaciones,
           coalesce(jsonb_array_length(case when jsonb_typeof(m.datos_externos -> 'ml' -> 'pictures') = 'array' then m.datos_externos -> 'ml' -> 'pictures' end), 0) fotos,
           m.datos_externos -> 'ml' ->> 'category_id' categoria
      from meli_item m join canal c on c.id = m.canal_id
     where m.organizacion_id = $1 and m.datos_externos ? 'ml'
     order by m.item_id, m.variation_id`, [org]);
  const candidatas = filas
    .map((f) => ({ ...f, puntaje: puntaje(f, skus, buscadas), noSirve: motivoNoSirve(f), juicio: null as Juicio | null }))
    .filter((f) => f.puntaje >= (buscadas.length > 2 ? 34 : 50))
    .sort((a, b) => b.puntaje - a.puntaje || (b.vendidos ?? 0) - (a.vendidos ?? 0))
    .slice(0, max)
    .map(({ catalogo: _c, variaciones: _v, fotos: _f, categoria: _g, ...r }) => r);
  // El mismo título en varias cuentas se pregunta una sola vez.
  const titulos = [...new Set(candidatas.filter((c) => c.puntaje < MISMO_SKU).map((c) => c.titulo ?? ""))];
  const juicios = await juzgar({ titulo: q ?? ref.titulo, marca: ref.marca, modelo: ref.modelo, datos: q ? null : ref.datos },
    titulos.map((t, i) => ({ id: String(i), titulo: t, datos: null })));
  const porTitulo = new Map(titulos.map((t, i) => [t, juicios?.[String(i)] ?? null]));
  for (const c of candidatas) c.juicio = c.puntaje >= MISMO_SKU ? { veredicto: "mismo", motivo: "Tiene el mismo SKU." } : porTitulo.get(c.titulo ?? "") ?? null;
  const lista = (juicios ? candidatas.filter((c) => c.juicio?.veredicto !== "distinto") : candidatas)
    // Primero las que sirven; después lo que dijo el juez (mismo, parecido), el parecido por palabras y las más vendidas.
    .sort((a, b) => Number(!!a.noSirve) - Number(!!b.noSirve)
      || PESO_VEREDICTO[a.juicio?.veredicto ?? "parecido"] - PESO_VEREDICTO[b.juicio?.veredicto ?? "parecido"]
      || b.puntaje - a.puntaje || (b.vendidos ?? 0) - (a.vendidos ?? 0));
  return { lista, conJuez: !!juicios };
}

// ── El borrador ─────────────────────────────────────────────

type Av = { id: string; name?: string; value_id?: string | null; value_name?: string | null };
export type DatoMl = { id: string; nombre: string; valor: string };
export type CuentaDestino = { canal: number; nombre: string; yaTiene: string | null; precios: Record<number, number | null> };
export type Borrador = {
  origen: { item_id: string; canal: number; cuenta: string; estado: string | null; precio: number | null; permalink: string | null };
  titulo: string; categoria: string; precio: number | null; cantidad: number; tipo: string; condicion: string;
  fotos: { url: string; deLaucen: boolean }[]; atributos: DatoMl[]; garantia: DatoMl[];
  descripcion: string; descripcionLeida: boolean;
  variaciones: { id: number; sku: string; titulo: string | null }[]; variacion: number;
  cuentas: CuentaDestino[]; cuenta: number | null;
};

/** El item guardado de una publicación (cualquier cuenta de la organización). */
async function itemGuardado(org: string, itemId: string) {
  return una<{ canal_id: number; cuenta: string; estado: string | null; precio: number | null; permalink: string | null; sku: string | null; ml: ItemGuardado & { attributes?: Av[]; sale_terms?: Av[] } }>(`
    select m.canal_id::int, c.nombre cuenta, m.estado, m.precio::float8 precio, m.permalink, m.sku, m.datos_externos -> 'ml' ml
      from meli_item m join canal c on c.id = m.canal_id
     where m.organizacion_id = $1 and m.item_id = $2 and m.datos_externos ? 'ml' order by m.variation_id limit 1`, [org, itemId]);
}

const fotosDe = (it: ItemGuardado) => (it.pictures ?? []).map((f) => f.secure_url ?? f.url).filter((u): u is string => !!u);
/** Los atributos que se muestran para editar: ni el SKU (va el de la variación) ni lo que fija ML. */
const editables = (lista: Av[] | undefined) => (lista ?? [])
  .filter((a) => a.id !== "SELLER_SKU" && !NO_MODIFICABLE(a.id) && (a.value_name != null || (a.value_id != null && a.value_id !== "-1")))
  .map((a) => ({ id: a.id, nombre: a.name ?? a.id, valor: a.value_name ?? "" }));

/** Las variaciones (no archivadas), las fotos y el stock disponible del producto. */
export async function datosDelProducto(org: string, productoId: number) {
  const [variaciones, fotos, disp] = await Promise.all([
    consulta<{ id: number; sku: string; titulo: string | null }>(
      "select id::int, sku, titulo from variacion where organizacion_id = $1 and producto_id = $2 and estado <> 'archivada' order by es_default desc, orden, id", [org, productoId]),
    consulta<{ url: string }>("select url from producto_foto where organizacion_id = $1 and producto_id = $2 order by orden, id", [org, productoId]),
    una<{ n: number }>(`select coalesce(sum(stock_disponible_deposito($1, v.id, d.id)), 0)::int n from variacion v cross join deposito d
                         where v.producto_id = $2 and v.organizacion_id = $1 and d.organizacion_id = $1 and d.estado = 'activo'`, [org, productoId]),
  ]);
  if (!variaciones.length) throw new ErrorErp("El producto no tiene variaciones activas.");
  return { variaciones, fotosLaucen: fotos.map((f) => f.url), disponible: disp?.n ?? 0 };
}

/** Las cuentas de ML conectadas, con el precio de su Clásica para cada variación y si ya
 *  tienen el producto (por SKU o, si se pasa, por el producto de catálogo). */
export async function cuentasDestino(org: string, variaciones: { id: number; sku: string }[], catalogoId?: string): Promise<CuentaDestino[]> {
  const cuentas: CuentaDestino[] = [];
  for (const c of await canalesMl(org)) {
    const cuenta = await cuentaDelCanal(org, c.id);
    if (!cuenta || cuenta.estado !== "activa") continue;
    const precios: Record<number, number | null> = {};
    if (c.listaId) {
      const filas = await consulta<{ v: number; p: number | null }>(
        `select v.id::int v, (select pr.lista_ars::float8 from precio_de($1, v.id, $3::bigint, (now() at time zone 'America/Argentina/Buenos_Aires')::date) pr) p
           from variacion v where v.organizacion_id = $1 and v.id = any($2::bigint[])`, [org, variaciones.map((v) => v.id), c.listaId]);
      for (const f of filas) precios[f.v] = f.p && f.p > 0 ? f.p : null;
    }
    cuentas.push({ canal: c.id, nombre: c.nombre, yaTiene: await yaTiene(org, c.id, variaciones.map((v) => v.sku), catalogoId), precios });
  }
  return cuentas;
}

/** La cuenta que se propone: la preferida si no tiene ya el producto; si no, la primera libre. */
export function cuentaPropuesta(cuentas: CuentaDestino[], preferida?: number | null): number | null {
  const libre = (x: CuentaDestino) => !x.yaTiene;
  return (cuentas.find((x) => x.canal === preferida && libre(x)) ?? cuentas.find(libre) ?? cuentas[0])?.canal ?? null;
}

/** Todo lo que necesita el formulario: los datos de la publicación elegida, las fotos
 *  (las de ella y las del producto en Laucen), la descripción (se lee de ML), las cuentas
 *  donde se puede publicar con el precio de la Clásica de cada una, y el stock. */
export async function armarBorrador(org: string, productoId: number, itemId: string): Promise<Borrador> {
  const g = await itemGuardado(org, itemId);
  if (!g?.ml) throw new ErrorErp("Laucen no tiene los datos de esa publicación: traé las publicaciones de nuevo.");
  const it = g.ml;
  const no = motivoNoSirve({ catalogo: !!it.catalog_listing, variaciones: it.variations?.length ?? 0, fotos: it.pictures?.length ?? 0, categoria: it.category_id ?? null });
  if (no) throw new ErrorErp(`Esa publicación no sirve de modelo: ${no}.`);

  const { variaciones, fotosLaucen, disponible } = await datosDelProducto(org, productoId);
  // Las características de ML que el producto de Laucen tiene cargadas mandan sobre las copiadas
  // (Fer, 5/10: copiar la de 8 GB para publicar la de 12 GB, con la RAM del producto).
  const propias = await una<{ a: { id?: string; value_name?: string | null }[] | null }>(
    "select atributos_ml a from producto where organizacion_id = $1 and id = $2", [org, productoId]);
  const deLaucen = new Map((Array.isArray(propias?.a) ? propias.a : []).filter((x) => x.id && x.value_name?.trim()).map((x) => [x.id!, x.value_name!.trim()]));
  const variacion = variaciones.find((v) => skuComparable(v.sku) === skuComparable(g.sku))?.id ?? variaciones[0].id;
  const deMl = fotosDe(it);
  const fotos = [...deMl.map((url) => ({ url, deLaucen: false })), ...fotosLaucen.filter((u) => !deMl.includes(u)).map((url) => ({ url, deLaucen: true }))];
  const cuentas = await cuentasDestino(org, variaciones);
  const cuenta = cuentaPropuesta(cuentas, g.canal_id);
  const precioLaucen = cuentas.find((x) => x.canal === cuenta)?.precios[variacion] ?? null;

  // La descripción no se guarda en Laucen: se lee de ML con la cuenta de la publicación.
  let descripcion = "", descripcionLeida = false;
  const cOrigen = await cuentaDelCanal(org, g.canal_id);
  if (cOrigen && cOrigen.estado === "activa") {
    const d = await ml<{ plain_text?: string }>(cOrigen, "GET", `/items/${itemId}/description`);
    if (d.status === 200) { descripcion = d.datos.plain_text?.trim() ?? ""; descripcionLeida = true; }
    else if (d.status === 404) descripcionLeida = true; // no tiene
  }

  return {
    origen: { item_id: itemId, canal: g.canal_id, cuenta: g.cuenta, estado: g.estado, precio: g.precio, permalink: g.permalink },
    titulo: ((it.family_name ?? it.title) ?? "").trim(), categoria: it.category_id ?? "",
    precio: precioLaucen ?? it.price ?? g.precio, cantidad: Math.max(1, disponible),
    tipo: it.listing_type_id ?? "gold_special", condicion: it.condition ?? "new",
    fotos, atributos: editables(it.attributes).map((x) => deLaucen.has(x.id) ? { ...x, valor: deLaucen.get(x.id)! } : x), garantia: editables(it.sale_terms), descripcion, descripcionLeida,
    variaciones, variacion, cuentas, cuenta,
  };
}

/** La publicación (no cerrada) que la cuenta ya tiene con alguno de estos SKU (o en ese
 *  producto de catálogo), para no duplicar. */
export async function yaTiene(org: string, canal: number, skus: string[], catalogoId?: string): Promise<string | null> {
  const claves = new Set(skus.map((s) => claveProducto(s, null)));
  const filas = await consulta<{ item_id: string; sku: string | null; estado: string; catalogo: string | null }>(
    `select item_id, sku, estado, datos_externos -> 'ml' ->> 'catalog_product_id' catalogo from meli_item
      where organizacion_id = $1 and canal_id = $2 and estado <> 'closed' and (sku is not null or datos_externos -> 'ml' ->> 'catalog_product_id' = $3)`,
    [org, canal, catalogoId ?? ""]);
  const f = filas.find((x) => (x.sku && claves.has(claveProducto(x.sku, null))) || (catalogoId && x.catalogo === catalogoId));
  return f ? `${f.item_id} (${ESTADOS_ML[f.estado] ?? f.estado})` : null;
}

export const ESTADOS_ML: Record<string, string> = {
  active: "activa", paused: "pausada", closed: "cerrada", inactive: "inactiva", under_review: "en revisión",
};
export const TIPOS_PUBLICACION: Record<string, string> = { gold_special: "Clásica", gold_pro: "Premium" };
export const CONDICIONES: Record<string, string> = { new: "Nuevo", used: "Usado" };

// ── Preparar el lote ────────────────────────────────────────

export type Entrada = {
  productoId: number; itemId: string; canal: number; variacion: number;
  titulo: string; precio: number | null; cantidad: number | null; tipo: string; condicion: string;
  fotos: string[]; atributos: Record<string, string>; garantia: Record<string, string>; descripcion: string;
};

/** Los atributos de la publicación con lo que cambió Fer: un valor igual queda con su
 *  código de ML; uno cambiado va sólo como texto; uno vaciado no se manda. */
export function aplicarCambios(lista: Av[] | undefined, nuevos: Record<string, string>): Av[] {
  return (lista ?? []).flatMap((a) => {
    if (!Object.hasOwn(nuevos, a.id)) return [a];
    const v = nuevos[a.id].trim();
    if (!v) return [];
    if (v === (a.value_name ?? "")) return [a];
    return [{ id: a.id, name: a.name, value_id: null, value_name: v }];
  });
}

const LARGO_TITULO = 60;

/** Arma el alta con lo que dejó Fer en el formulario, la comprueba con ML y la deja en un
 *  lote esperando su clic. Devuelve el id del lote y los avisos de ML (si hubo). */
export async function prepararPublicacion(org: string, e: Entrada, usuarioId: string): Promise<{ loteId: number; avisos: string | null }> {
  const g = await itemGuardado(org, e.itemId);
  if (!g?.ml) throw new ErrorErp("Laucen no tiene los datos de esa publicación: traé las publicaciones de nuevo.");
  const titulo = e.titulo.replace(/\s+/g, " ").trim();
  if (!titulo) throw new ErrorErp("Falta el título.");
  if (titulo.length > LARGO_TITULO) throw new ErrorErp(`El título tiene ${titulo.length} letras; Mercado Libre acepta hasta ${LARGO_TITULO}.`);
  if (!e.precio || e.precio <= 0) throw new ErrorErp("Falta el precio.");
  if (!e.cantidad || e.cantidad < 1) throw new ErrorErp("La cantidad tiene que ser 1 o más.");
  if (!Object.hasOwn(TIPOS_PUBLICACION, e.tipo)) throw new ErrorErp("Elegí el tipo de publicación.");
  if (!Object.hasOwn(CONDICIONES, e.condicion)) throw new ErrorErp("Elegí la condición.");

  const v = await una<{ sku: string; modelo: string | null; no_publicable: boolean }>(
    `select v.sku, p.modelo, p.no_publicable from variacion v join producto p on p.id = v.producto_id
      where v.organizacion_id = $1 and v.id = $2 and v.producto_id = $3`, [org, e.variacion, e.productoId]);
  if (!v) throw new ErrorErp("Elegí la variación del producto que se publica.");
  if (v.no_publicable) throw new ErrorErp("El producto está marcado como No publicable.");
  const cuenta = await cuentaDelCanal(org, e.canal);
  if (!cuenta || cuenta.estado !== "activa") throw new ErrorErp("Esa cuenta de Mercado Libre no está conectada.");
  const nombreCuenta = (await una<{ nombre: string }>("select nombre from canal where id = $2 and organizacion_id = $1", [org, e.canal]))?.nombre ?? `canal ${e.canal}`;
  const ya = await yaTiene(org, e.canal, [v.sku]);
  if (ya) throw new ErrorErp(`${nombreCuenta} ya tiene este producto publicado: ${ya}. Reactivá esa en vez de crear otra.`);

  // Sólo fotos de la publicación o del producto en Laucen (nada que llegue de afuera).
  const permitidas = new Set([...fotosDe(g.ml), ...(await consulta<{ url: string }>(
    "select url from producto_foto where organizacion_id = $1 and producto_id = $2", [org, e.productoId])).map((f) => f.url)]);
  const fotos = [...new Set(e.fotos)].filter((u) => permitidas.has(u));
  if (!fotos.length) throw new ErrorErp("Elegí al menos una foto.");

  const item: ItemGuardado = {
    ...g.ml,
    ...(g.ml.family_name ? { family_name: titulo } : { title: titulo }),
    price: Math.round(e.precio), available_quantity: Math.trunc(e.cantidad), listing_type_id: e.tipo, condition: e.condicion,
    pictures: fotos.map((u) => ({ secure_url: u })),
    attributes: aplicarCambios(g.ml.attributes, e.atributos),
    sale_terms: aplicarCambios(g.ml.sale_terms, e.garantia),
  };
  const modelo = v.modelo?.trim() || (await modeloDeLaucen(org, v.sku));
  const c = await comprobarAlta(cuenta, (x) => armarCuerpoCopia(item, v.sku, { variarTitulo: false, rotarFotos: false }, { modelo, ...x }));
  if (!c.ok) throw new ErrorErp(`Mercado Libre no la acepta: ${c.motivo}`);

  const texto = e.descripcion.trim();
  const pedidos: PedidoMl[] = [
    { metodo: "POST", ruta: "/items", cuerpo: c.cuerpo },
    ...(texto ? [{ metodo: "POST" as const, ruta: "/items/{id}/description", cuerpo: { plain_text: texto } }] : []),
  ];
  const loteId = await encolarLoteConBoton(org, e.canal, [{
    canalId: e.canal, itemId: `nueva:${v.sku}`, tipo: "crear",
    antes: { estado: "no existe en esta cuenta" },
    payload: { descripcion: `Crear en ${nombreCuenta}: ${titulo} (${v.sku}, sobre ${e.itemId})`, origen: { canal: g.canal_id, item_id: e.itemId }, pedidos },
  }], `Publicar ${v.sku} en ${nombreCuenta} (copia de ${e.itemId})`, usuarioId);
  return { loteId, avisos: c.avisos };
}
