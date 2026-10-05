// Publicar en el CATÁLOGO de ML un producto que no está publicado (Fer, 5/10):
// se busca el producto de catálogo que sea el mismo (/products/search por el
// título o lo que se escriba, y por el código de barras si lo tiene), el juez
// (Claude) descarta los que son otra cosa, y se controla la MARCA: el que creó
// el producto de catálogo a veces tiene una marca propia, y publicar con su
// marca trae denuncias. Sólo se puede usar uno de marca nuestra (alguna marca
// de los productos de Laucen) o genérica; con marca de otro, no.
//
// La publicación de catálogo toma de ML el título, las fotos y las
// características: Fer elige la cuenta, el precio, la cantidad, el tipo y la
// garantía. Igual que lo demás: se comprueba con ML (validate) y queda en un
// lote esperando su clic.

import { unstable_cache } from "next/cache";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal, cuentasDe, type CuentaMl } from "@/lib/mercadolibre/api";
import { encolarLoteConBoton } from "@/lib/mercadolibre/cola";
import { comprobarAlta } from "@/lib/mercadolibre/copiar";
import { juzgar, PESO_VEREDICTO, type Juicio } from "@/lib/mercadolibre/juez-similar";
import {
  referenciaDe, datosDelProducto, cuentasDestino, cuentaPropuesta, yaTiene, palabras, TIPOS_PUBLICACION, type CuentaDestino,
} from "@/lib/mercadolibre/publicar-similar";

// ── La marca ────────────────────────────────────────────────

const normal = (t: string | null | undefined) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const GENERICAS = new Set(["generica", "generico", "generic", "sin marca", "s marca", "no aplica", "otra marca", "otras marcas", "sm"]);

export type EstadoMarca = "propia" | "generica" | "ajena" | "sin_dato";
export const TEXTO_MARCA: Record<EstadoMarca, string> = {
  propia: "Marca nuestra", generica: "Genérica", ajena: "Marca de otro: no se puede usar", sin_dato: "Sin marca cargada en ML: revisala",
};

/** ¿Se puede publicar con esta marca? Propia = una marca de los productos de Laucen. */
export function estadoMarca(marca: string | null | undefined, propias: Set<string>): EstadoMarca {
  const m = normal(marca);
  if (!m) return "sin_dato";
  if (GENERICAS.has(m)) return "generica";
  return propias.has(m) ? "propia" : "ajena";
}

/** Las marcas nuestras: las cargadas en los productos de Laucen. */
export async function marcasPropias(org: string): Promise<Set<string>> {
  const filas = await consulta<{ marca: string }>("select distinct marca from producto where organizacion_id = $1 and marca is not null and marca <> ''", [org]);
  return new Set(filas.map((f) => normal(f.marca)).filter((m) => m && !GENERICAS.has(m)));
}

// ── Lo que devuelve ML ──────────────────────────────────────

type AtribCat = { id: string; name?: string; value_id?: string | null; value_name?: string | null };
type ProductoMl = {
  id: string; name?: string; status?: string; domain_id?: string; permalink?: string; parent_id?: string | null; children_ids?: string[];
  pictures?: { id?: string; url?: string }[]; attributes?: AtribCat[]; short_description?: { content?: string } | null;
  buy_box_winner?: { item_id?: string; category_id?: string; price?: number; seller_id?: number } | null;
};
type OfertaMl = { item_id?: string; category_id?: string; price?: number; seller_id?: number; listing_type_id?: string };

const valor = (attrs: AtribCat[] | undefined, id: string) => attrs?.find((a) => a.id === id)?.value_name?.trim() || null;
/** Las características para mostrar (sin las internas de ML). */
const visibles = (attrs: AtribCat[] | undefined) => (attrs ?? [])
  .filter((a) => a.value_name && !/^(SELLER_|PACKAGE_|GTIN|EMPTY_GTIN|IS_|ITEM_CONDITION|PRODUCT_DATA_SOURCE)/.test(a.id))
  .map((a) => ({ nombre: a.name ?? a.id, valor: a.value_name! }));

/** Una cuenta conectada para leer (cualquiera sirve para el catálogo). */
async function cuentaParaLeer(org: string): Promise<CuentaMl> {
  const c = (await cuentasDe(org)).find((x) => x.estado === "activa" && x.canalId);
  if (!c) throw new ErrorErp("No hay ninguna cuenta de Mercado Libre conectada.");
  return c;
}

export type ProductoCatalogo = {
  id: string; nombre: string; foto: string | null; permalink: string; marca: string | null; modelo: string | null;
  estadoMarca: EstadoMarca; caracteristicas: string; precioGanador: number | null; vendedores: number | null;
  juicio: Juicio | null;
};

/** Lee de ML un producto de catálogo y sus ofertas (precio que gana y cuántos venden). */
async function leerProducto(c: CuentaMl, id: string): Promise<{ p: ProductoMl; ofertas: OfertaMl[] } | null> {
  const [r, o] = await Promise.all([ml<ProductoMl>(c, "GET", `/products/${id}`), ml<{ results?: OfertaMl[] }>(c, "GET", `/products/${id}/items?limit=50`)]);
  if (r.status !== 200) return null;
  return { p: r.datos, ofertas: o.status === 200 ? o.datos.results ?? [] : [] };
}

async function buscarSinCache(org: string, cuentaId: number, q: string, gtin: string | null): Promise<{ id: string; p: ProductoMl; ofertas: OfertaMl[] }[]> {
  const c = (await cuentasDe(org)).find((x) => x.id === cuentaId)!;
  const pedidos = [`/products/search?status=active&site_id=MLA&q=${encodeURIComponent(q)}&limit=15`];
  if (gtin) pedidos.unshift(`/products/search?status=active&site_id=MLA&product_identifier=${encodeURIComponent(gtin)}`);
  const ids: string[] = [];
  let contesto = false;
  for (const ruta of pedidos) {
    const r = await ml<{ results?: { id: string }[] }>(c, "GET", ruta);
    if (r.status !== 200) continue;
    contesto = true;
    for (const x of r.datos.results ?? []) if (x.id && !ids.includes(x.id)) ids.push(x.id);
  }
  // Si ML no contestó, se avisa (y no queda guardado como "no hay nada").
  if (!contesto) throw new ErrorErp("Mercado Libre no contestó la búsqueda en el catálogo. Probá de nuevo en un rato.");
  // Se leen de a 5. Un producto "padre" (con variantes de color, etc.) no se publica: se usan sus hijos.
  const salida: { id: string; p: ProductoMl; ofertas: OfertaMl[] }[] = [];
  const leer = async (lista: string[]) => {
    for (let i = 0; i < lista.length; i += 5) {
      const tanda = await Promise.all(lista.slice(i, i + 5).map((id) => leerProducto(c, id).then((x) => (x ? { id, ...x } : null))));
      for (const t of tanda) if (t) salida.push(t);
    }
  };
  await leer(ids.slice(0, 12));
  const hijos = salida.filter((x) => x.p.children_ids?.length).flatMap((x) => x.p.children_ids!.slice(0, 4)).filter((h) => !ids.includes(h));
  if (hijos.length) await leer(hijos.slice(0, 12));
  return salida.filter((x) => !x.p.children_ids?.length && x.p.status !== "inactive");
}

/** Los productos del catálogo de ML que pueden ser el mismo que el de Laucen, con su marca
 *  controlada y lo que dijo el juez (los que son otro producto no se devuelven). */
export async function buscarEnCatalogo(org: string, productoId: number, q: string | null): Promise<{ lista: ProductoCatalogo[]; conJuez: boolean }> {
  const ref = await referenciaDe(org, productoId);
  const cuenta = await cuentaParaLeer(org);
  const texto = (q ?? ref.titulo).trim();
  if (palabras(texto).length === 0) return { lista: [], conJuez: true };
  const gtin = q ? null : ref.codigo_barras?.replace(/\D/g, "") || null;
  // Lo leído de ML se guarda una hora (escribir en el buscador o volver a la pantalla no lo vuelve a leer).
  const leidos = await unstable_cache(() => buscarSinCache(org, cuenta.id, texto, gtin), ["catalogo-ml", org, texto, gtin ?? ""], { revalidate: 3600 })();
  const propias = await marcasPropias(org);
  if (ref.marca) propias.add(normal(ref.marca));
  const lista: ProductoCatalogo[] = leidos.map(({ id, p, ofertas }) => {
    const marca = valor(p.attributes, "BRAND");
    const precios = ofertas.map((o) => Number(o.price)).filter((n) => n > 0);
    return {
      id, nombre: p.name ?? id, foto: p.pictures?.[0]?.url ?? null, permalink: p.permalink ?? `https://www.mercadolibre.com.ar/p/${id}`,
      marca, modelo: valor(p.attributes, "MODEL"), estadoMarca: estadoMarca(marca, propias),
      caracteristicas: visibles(p.attributes).slice(0, 15).map((a) => `${a.nombre}: ${a.valor}`).join("; "),
      precioGanador: p.buy_box_winner?.price ?? (precios.length ? Math.min(...precios) : null),
      vendedores: new Set(ofertas.map((o) => o.seller_id)).size || null, juicio: null,
    };
  });
  const juicios = await juzgar({ titulo: texto, marca: ref.marca, modelo: ref.modelo, datos: q ? null : ref.datos },
    lista.map((x) => ({ id: x.id, titulo: x.nombre, datos: x.caracteristicas })));
  for (const x of lista) x.juicio = juicios?.[x.id] ?? null;
  const usable = (x: ProductoCatalogo) => x.estadoMarca !== "ajena";
  return {
    lista: (juicios ? lista.filter((x) => x.juicio?.veredicto !== "distinto") : lista)
      .sort((a, b) => PESO_VEREDICTO[a.juicio?.veredicto ?? "parecido"] - PESO_VEREDICTO[b.juicio?.veredicto ?? "parecido"]
        || Number(usable(b)) - Number(usable(a))),
    conJuez: !!juicios,
  };
}

// ── El borrador y el lote ───────────────────────────────────

export type BorradorCatalogo = {
  producto: ProductoCatalogo & { fotos: string[]; todas: { nombre: string; valor: string }[]; categoria: string | null };
  variaciones: { id: number; sku: string; titulo: string | null }[]; variacion: number;
  cuentas: CuentaDestino[]; cuenta: number | null; precio: number | null; cantidad: number;
};

/** La categoría del producto de catálogo: la de quien gana, la de alguna oferta o la que sugiere ML por el nombre. */
async function categoriaDe(c: CuentaMl, p: ProductoMl, ofertas: OfertaMl[]): Promise<string | null> {
  const ya = p.buy_box_winner?.category_id ?? ofertas.find((o) => o.category_id)?.category_id;
  if (ya) return ya;
  const r = await ml<{ category_id?: string; domain_id?: string }[]>(c, "GET", `/sites/MLA/domain_discovery/search?limit=5&q=${encodeURIComponent(p.name ?? "")}`);
  if (r.status !== 200 || !Array.isArray(r.datos)) return null;
  return (r.datos.find((x) => x.domain_id === p.domain_id) ?? r.datos[0])?.category_id ?? null;
}

async function leerParaPublicar(org: string, catalogoId: string) {
  const c = await cuentaParaLeer(org);
  const x = await leerProducto(c, catalogoId);
  if (!x) throw new ErrorErp("Mercado Libre no encuentra ese producto de catálogo.");
  if (x.p.children_ids?.length) throw new ErrorErp("Ese producto de catálogo tiene variantes: elegí una de ellas.");
  const propias = await marcasPropias(org);
  return { c, ...x, propias };
}

export async function armarBorradorCatalogo(org: string, productoId: number, catalogoId: string): Promise<BorradorCatalogo> {
  const ref = await referenciaDe(org, productoId);
  const { c, p, ofertas, propias } = await leerParaPublicar(org, catalogoId);
  if (ref.marca) propias.add(normal(ref.marca));
  const marca = valor(p.attributes, "BRAND");
  const precios = ofertas.map((o) => Number(o.price)).filter((n) => n > 0);
  const { variaciones, disponible } = await datosDelProducto(org, productoId);
  const cuentas = await cuentasDestino(org, variaciones, catalogoId);
  const cuenta = cuentaPropuesta(cuentas);
  const variacion = variaciones[0].id;
  return {
    producto: {
      id: catalogoId, nombre: p.name ?? catalogoId, foto: p.pictures?.[0]?.url ?? null, permalink: p.permalink ?? `https://www.mercadolibre.com.ar/p/${catalogoId}`,
      marca, modelo: valor(p.attributes, "MODEL"), estadoMarca: estadoMarca(marca, propias),
      caracteristicas: "", todas: visibles(p.attributes), fotos: (p.pictures ?? []).map((f) => f.url).filter((u): u is string => !!u),
      precioGanador: p.buy_box_winner?.price ?? (precios.length ? Math.min(...precios) : null),
      vendedores: new Set(ofertas.map((o) => o.seller_id)).size || null, juicio: null,
      categoria: await categoriaDe(c, p, ofertas),
    },
    variaciones, variacion, cuentas, cuenta,
    precio: cuentas.find((x) => x.canal === cuenta)?.precios[variacion] ?? null, cantidad: Math.max(1, disponible),
  };
}

export type EntradaCatalogo = {
  productoId: number; catalogoId: string; canal: number; variacion: number; precio: number | null; cantidad: number | null; tipo: string;
  garantiaTipo: string; garantiaTiempo: string;
};
export const TIPOS_GARANTIA: Record<string, string> = { "": "Sin cargar", "Sin garantía": "Sin garantía", "Garantía del vendedor": "Garantía del vendedor", "Garantía de fábrica": "Garantía de fábrica" };

/** El cuerpo de POST /items para publicar en el catálogo: el producto de catálogo pone
 *  título, fotos y características; acá va sólo lo nuestro. */
export function cuerpoCatalogo(e: { catalogoId: string; categoria: string; precio: number; cantidad: number; tipo: string; sku: string; garantiaTipo: string; garantiaTiempo: string },
  extra: { sacar?: string[]; sinEnvio?: boolean; nombre?: string | null } = {}): Record<string, unknown> {
  const condiciones = [
    ...(e.garantiaTipo ? [{ id: "WARRANTY_TYPE", value_name: e.garantiaTipo }] : []),
    ...(e.garantiaTipo && e.garantiaTipo !== "Sin garantía" && e.garantiaTiempo.trim() ? [{ id: "WARRANTY_TIME", value_name: e.garantiaTiempo.trim() }] : []),
  ];
  return {
    ...(extra.nombre ? { family_name: extra.nombre } : {}),
    category_id: e.categoria, price: Math.round(e.precio), currency_id: "ARS", available_quantity: Math.max(1, Math.trunc(e.cantidad)),
    buying_mode: "buy_it_now", condition: "new", listing_type_id: e.tipo,
    catalog_product_id: e.catalogoId, catalog_listing: true,
    attributes: [{ id: "SELLER_SKU", value_name: e.sku }].filter((a) => !(extra.sacar ?? []).includes(a.id)),
    ...(condiciones.length ? { sale_terms: condiciones } : {}),
    ...(extra.sinEnvio ? {} : { shipping: { mode: "me2" } }),
  };
}

export async function prepararPublicacionCatalogo(org: string, e: EntradaCatalogo, usuarioId: string): Promise<{ loteId: number; avisos: string | null }> {
  if (!e.precio || e.precio <= 0) throw new ErrorErp("Falta el precio.");
  if (!e.cantidad || e.cantidad < 1) throw new ErrorErp("La cantidad tiene que ser 1 o más.");
  if (!Object.hasOwn(TIPOS_PUBLICACION, e.tipo)) throw new ErrorErp("Elegí el tipo de publicación.");
  if (!Object.hasOwn(TIPOS_GARANTIA, e.garantiaTipo)) throw new ErrorErp("Elegí el tipo de garantía.");
  const v = await una<{ sku: string; marca: string | null; no_publicable: boolean }>(
    `select v.sku, p.marca, p.no_publicable from variacion v join producto p on p.id = v.producto_id
      where v.organizacion_id = $1 and v.id = $2 and v.producto_id = $3`, [org, e.variacion, e.productoId]);
  if (!v) throw new ErrorErp("Elegí la variación del producto que se publica.");
  if (v.no_publicable) throw new ErrorErp("El producto está marcado como No publicable.");
  const { c, p, ofertas, propias } = await leerParaPublicar(org, e.catalogoId);
  if (v.marca) propias.add(normal(v.marca));
  const marca = valor(p.attributes, "BRAND");
  // El control de la marca se repite acá: nunca se publica con la marca de otro.
  if (estadoMarca(marca, propias) === "ajena") throw new ErrorErp(`Ese producto de catálogo es de la marca ${marca}, que no es nuestra: publicarlo trae denuncias.`);
  const categoria = await categoriaDe(c, p, ofertas);
  if (!categoria) throw new ErrorErp("No se pudo saber la categoría de ese producto de catálogo.");

  const cuenta = await cuentaDelCanal(org, e.canal);
  if (!cuenta || cuenta.estado !== "activa") throw new ErrorErp("Esa cuenta de Mercado Libre no está conectada.");
  const nombreCuenta = (await una<{ nombre: string }>("select nombre from canal where id = $2 and organizacion_id = $1", [org, e.canal]))?.nombre ?? `canal ${e.canal}`;
  const ya = await yaTiene(org, e.canal, [v.sku], e.catalogoId);
  if (ya) throw new ErrorErp(`${nombreCuenta} ya tiene este producto publicado: ${ya}. Reactivá esa en vez de crear otra.`);

  const datos = { catalogoId: e.catalogoId, categoria, precio: e.precio, cantidad: e.cantidad, tipo: e.tipo, sku: v.sku, garantiaTipo: e.garantiaTipo, garantiaTiempo: e.garantiaTiempo };
  let r = await comprobarAlta(cuenta, (x) => cuerpoCatalogo(datos, x));
  // Si ML pide el nombre, se vuelve a comprobar con el del producto de catálogo.
  if (!r.ok && /title|family_name/i.test(r.motivo)) r = await comprobarAlta(cuenta, (x) => cuerpoCatalogo(datos, { ...x, nombre: p.name ?? null }));
  if (!r.ok) throw new ErrorErp(`Mercado Libre no la acepta: ${r.motivo}`);
  const loteId = await encolarLoteConBoton(org, e.canal, [{
    canalId: e.canal, itemId: `nueva:${v.sku}`, tipo: "crear",
    antes: { estado: "no existe en esta cuenta" },
    payload: { descripcion: `Publicar en el catálogo en ${nombreCuenta}: ${p.name ?? e.catalogoId} (${v.sku}, producto ${e.catalogoId})`, catalogo: e.catalogoId, pedidos: [{ metodo: "POST", ruta: "/items", cuerpo: r.cuerpo }] },
  }], `Publicar ${v.sku} en el catálogo en ${nombreCuenta} (${e.catalogoId})`, usuarioId);
  return { loteId, avisos: r.avisos };
}
