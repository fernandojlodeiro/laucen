// Publicar en ML un producto desde cero, con los datos de Laucen (Fer, 5/10):
// para lo que no está en el catálogo de ML (con marca que se pueda usar) ni se
// publicó nunca. Pestaña "Nueva desde Laucen" de /catalogo/productos/[id]/publicar-ml.
//
//   · Categoría: la de ML del producto (categoria_ml), la de su familia o, si no
//     hay o no es una hoja, la que sugiere ML por el título (domain_discovery).
//   · Atributos: los que pide ML para esa categoría (/categories/{id}/attributes).
//     Se llenan con lo de Laucen (atributos importados, marca, modelo, línea,
//     código de barras, medidas del paquete) y lo que falta lo PROPONE la IA
//     (Claude, el modelo del medio), igual que el título y, si el producto no
//     tiene, la descripción. Lo propuesto se marca "IA" para que Fer lo revise. Sin
//     marca, Daitom (la propia).
//   · "Preparar publicación": se comprueba con ML (validate) y queda en un lote
//     esperando el clic de Fer, como todo lo que va a ML.

import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal, cuentasDe, type CuentaMl } from "@/lib/mercadolibre/api";
import { encolarLoteConBoton, type CambioMl, type PedidoMl } from "@/lib/mercadolibre/cola";
import { comprobarAlta, NO_MODIFICABLE } from "@/lib/mercadolibre/copiar";
import { pedirClaude, jsonDe } from "@/lib/claude";
import { cuentasDestino, yaTiene, TIPOS_PUBLICACION, CONDICIONES, type CuentaDestino } from "@/lib/mercadolibre/publicar-similar";
import { TIPOS_GARANTIA } from "@/lib/mercadolibre/catalogo-similar";

// ── Lo que dice ML de la categoría ──────────────────────────

type AtributoCategoria = {
  id: string; name: string; value_type?: string; tags?: Record<string, boolean>; values?: { id: string; name: string }[];
  allowed_units?: { id: string; name: string }[]; default_unit?: string; hint?: string; tooltip?: string; value_max_length?: number;
};
export type AtributoForm = {
  id: string; nombre: string; requerido: boolean; tipo: string; opciones: string[]; unidades: string[]; ayuda: string | null;
  valor: string; origen: "laucen" | "ia" | "";
};

/** Una cuenta conectada para leer (cualquiera sirve). */
async function cuentaParaLeer(org: string): Promise<CuentaMl> {
  const c = (await cuentasDe(org)).find((x) => x.estado === "activa" && x.canalId);
  if (!c) throw new ErrorErp("No hay ninguna cuenta de Mercado Libre conectada.");
  return c;
}

/** Los atributos que se cargan a mano: ni ocultos, ni de sólo lectura, ni los que fija ML, ni el SKU (va el de la variación). */
export function atributosCargables(lista: AtributoCategoria[]): AtributoCategoria[] {
  return lista.filter((a) => !a.tags?.hidden && !a.tags?.read_only && !a.tags?.fixed && !a.tags?.others
    && a.id !== "SELLER_SKU" && !NO_MODIFICABLE(a.id));
}
export const esRequerido = (a: AtributoCategoria) => !!(a.tags?.required || a.tags?.catalog_required || a.tags?.conditional_required || a.tags?.new_required);

type Categoria = { id: string; nombre: string; camino: string; hoja: boolean };

/** Lo de ML que no cambia seguido (categoría y sus atributos) se guarda un día. */
const leerCategoria = (org: string, cat: string) => unstable_cache(async () => {
  const c = await cuentaParaLeer(org);
  const [info, attrs] = await Promise.all([
    ml<{ id: string; name: string; path_from_root?: { name: string }[]; children_categories?: unknown[] }>(c, "GET", `/categories/${cat}`),
    ml<AtributoCategoria[]>(c, "GET", `/categories/${cat}/attributes`),
  ]);
  if (info.status !== 200) throw new ErrorErp(`Mercado Libre no encuentra la categoría ${cat}.`);
  const categoria: Categoria = {
    id: cat, nombre: info.datos.name, camino: (info.datos.path_from_root ?? []).map((x) => x.name).join(" › ") || info.datos.name,
    hoja: !(info.datos.children_categories?.length),
  };
  return { categoria, atributos: attrs.status === 200 && Array.isArray(attrs.datos) ? attrs.datos : [] };
}, ["ml-categoria", cat], { revalidate: 86_400 })();

/** Las categorías que sugiere ML para un título (las hojas). */
const sugerirCategorias = (org: string, titulo: string) => unstable_cache(async () => {
  const c = await cuentaParaLeer(org);
  const r = await ml<{ category_id?: string; category_name?: string }[]>(c, "GET", `/sites/MLA/domain_discovery/search?limit=5&q=${encodeURIComponent(titulo)}`);
  return r.status === 200 && Array.isArray(r.datos) ? r.datos.filter((x) => x.category_id).map((x) => ({ id: x.category_id!, nombre: x.category_name ?? x.category_id! })) : [];
}, ["ml-sugerir-categoria", titulo], { revalidate: 86_400 })();

// ── Lo que sabe Laucen del producto ─────────────────────────

type ProductoLaucen = {
  titulo: string; descripcion: string | null; marca: string | null; modelo: string | null; linea: string | null; codigo_barras: string | null;
  garantia: string | null; peso_g: number | null; largo_cm: number | null; ancho_cm: number | null; alto_cm: number | null;
  categoria_ml: string | null; categoria_familia: string | null; atributos_ml: { id?: string; name?: string; value_name?: string | null }[] | null;
  no_publicable: boolean;
};

async function productoLaucen(org: string, productoId: number): Promise<ProductoLaucen> {
  const p = await una<ProductoLaucen>(`
    select p.titulo, p.descripcion, p.marca, p.modelo, p.linea, p.codigo_barras, p.garantia, p.peso_g, p.largo_cm::float8, p.ancho_cm::float8, p.alto_cm::float8,
           p.categoria_ml, f.ml_categoria categoria_familia, p.atributos_ml, p.no_publicable
      from producto p left join familia f on f.id = p.familia_id
     where p.organizacion_id = $1 and p.id = $2`, [org, productoId]);
  if (!p) throw new ErrorErp("Ese producto no existe.");
  return p;
}

const num = (n: number | null) => (n == null ? null : String(Number(n)).replace(".", ","));

/** Los valores que Laucen ya tiene, por id de atributo de ML. */
export function valoresDeLaucen(p: Pick<ProductoLaucen, "atributos_ml" | "marca" | "modelo" | "linea" | "codigo_barras" | "peso_g" | "largo_cm" | "ancho_cm" | "alto_cm">): Record<string, string> {
  const v: Record<string, string> = {};
  for (const a of Array.isArray(p.atributos_ml) ? p.atributos_ml : []) if (a.id && a.value_name?.trim()) v[a.id] = a.value_name.trim();
  const poner = (id: string, valor: string | null | undefined) => { if (valor?.trim()) v[id] = valor.trim(); };
  poner("BRAND", p.marca); poner("MODEL", p.modelo); poner("LINE", p.linea);
  if (p.codigo_barras && /^\d{8,14}$/.test(p.codigo_barras.trim())) poner("GTIN", p.codigo_barras);
  if (p.peso_g) poner("SELLER_PACKAGE_WEIGHT", `${p.peso_g} g`);
  if (p.largo_cm) poner("SELLER_PACKAGE_LENGTH", `${num(p.largo_cm)} cm`);
  if (p.ancho_cm) poner("SELLER_PACKAGE_WIDTH", `${num(p.ancho_cm)} cm`);
  if (p.alto_cm) poner("SELLER_PACKAGE_HEIGHT", `${num(p.alto_cm)} cm`);
  return v;
}

/** La marca de lo que no tiene marca: la propia (Fer, 5/10). Nunca la de otro. */
export const MARCA_POR_DEFECTO = "Daitom";
const MARCA_POR_DEFECTO_RE = /^(daitom|gen[eé]ric[ao])$/i;

// ── Lo que propone la IA ────────────────────────────────────

type Propuesta = { titulos: string[]; descripcion: string | null; atributos: Record<string, string> };

const SISTEMA = `Armás publicaciones de Mercado Libre Argentina para una tienda de electrónica, componentes e insumos.
Te paso el producto (título interno, descripción y datos que ya tiene) y los atributos de la categoría que FALTAN completar, con sus opciones o unidades.
Devolvé SOLO un JSON: {"titulos": ["...", ...], "descripcion": "..." o null, "atributos": {"ID": "valor", ...}}.
Reglas:
- titulos: los que te pida (uno por cuenta de Mercado Libre donde se publica), TODOS DISTINTOS entre sí pero del mismo producto: cambiá el orden de las palabras, usá sinónimos o el dato clave que va primero. Cada uno, como lo buscaría un comprador: qué es + marca (si tiene) + modelo + 1 a 3 datos clave (tensión, capacidad, medida, cantidad si es pack). Hasta 60 letras. Sin palabras de promoción ("oferta", "envío gratis", "original", "el mejor"), sin signos raros, sin todo en mayúsculas.
- atributos: sólo los que se puedan deducir con seguridad del título, la descripción o los datos. Si hay opciones, usá exactamente una de ellas. Si lleva unidad, poné número y unidad ("5 V", "10 mm").
- NUNCA inventes una marca: si el producto no tiene marca, BRAND = "Daitom" (la marca propia de la tienda). NUNCA inventes un código de barras (GTIN): dejalo afuera.
- Lo que no se sabe, no lo pongas.
- descripcion: sólo si te digo que falta. Texto plano en castellano rioplatense, claro, con las características en renglones, sin emojis ni datos de contacto ni links. Si no falta, null.`;

async function proponerSinCache(entrada: string): Promise<Propuesta> {
  const r = await pedirClaude({ system: SISTEMA, contenido: entrada, maxTokens: 3000, modelo: "medio", effort: "low" });
  if ("error" in r) throw new Error(r.error);
  const j = jsonDe<{ titulos?: unknown; titulo?: string; descripcion?: string | null; atributos?: Record<string, unknown> }>(r.texto);
  if (!j) throw new Error("la IA no devolvió un JSON");
  const atributos: Record<string, string> = {};
  for (const [k, v] of Object.entries(j.atributos ?? {})) if (typeof v === "string" || typeof v === "number") atributos[k] = String(v).trim();
  const titulos = (Array.isArray(j.titulos) ? j.titulos : [j.titulo]).filter((t): t is string => typeof t === "string" && !!t.trim()).map((t) => t.trim());
  return { titulos, descripcion: j.descripcion?.trim() || null, atributos };
}

/** Lo que propone la IA (o null si no se pudo). Se guarda un día por producto + categoría. */
async function proponer(p: ProductoLaucen, faltan: AtributoCategoria[], faltaDescripcion: boolean, ya: Record<string, string>, cuantos: number): Promise<Propuesta | null> {
  const entrada = [
    `TÍTULOS QUE NECESITO: ${Math.max(1, cuantos)}`,
    `PRODUCTO: ${p.titulo}`,
    p.marca ? `Marca: ${p.marca}` : "Marca: (no tiene)",
    p.modelo ? `Modelo: ${p.modelo}` : null,
    p.descripcion ? `Descripción:\n${p.descripcion.slice(0, 3000)}` : "Descripción: (no tiene)",
    Object.keys(ya).length ? `Datos que ya tiene: ${Object.entries(ya).map(([k, v]) => `${k}=${v}`).join("; ")}` : null,
    `FALTA LA DESCRIPCIÓN: ${faltaDescripcion ? "sí" : "no"}`,
    "ATRIBUTOS QUE FALTAN:",
    ...faltan.slice(0, 50).map((a) => `- ${a.id} (${a.name})${esRequerido(a) ? " [obligatorio]" : ""}`
      + (a.values?.length ? `: opciones ${a.values.slice(0, 40).map((v) => v.name).join(" | ")}` : "")
      + (a.allowed_units?.length ? `: unidades ${a.allowed_units.map((u) => u.name).join(", ")}` : "")),
  ].filter(Boolean).join("\n");
  const clave = createHash("sha1").update(entrada).digest("hex");
  try {
    return await unstable_cache(() => proponerSinCache(entrada), ["ml-nueva-ia", clave], { revalidate: 86_400 })();
  } catch (e) {
    console.error("[publicar nueva: IA]", e instanceof Error ? e.message : e);
    return null;
  }
}

// ── El borrador ─────────────────────────────────────────────

/** Lo de cada cuenta: si se publica ahí, su título y el orden de sus fotos (lo demás es igual en todas). */
export type CuentaNueva = CuentaDestino & { elegida: boolean; titulo: string; fotos: string[] };
export type BorradorNueva = {
  categoria: Categoria | null; sugeridas: { id: string; nombre: string }[];
  tituloIa: boolean; descripcion: string; descripcionIa: boolean; conIa: boolean;
  atributos: AtributoForm[]; fotos: string[];
  variaciones: { id: number; sku: string; titulo: string | null }[]; variacion: number;
  cuentas: CuentaNueva[]; cantidad: number; condicion: string; garantia: string;
};

/** Un título distinto para la cuenta n (sin IA): la primera palabra queda y las demás se corren n lugares. */
export function variarTitulo(t: string, n: number): string {
  const p = t.trim().split(/\s+/);
  if (p.length < 4) return t.trim();
  const [primera, ...resto] = p;
  return [primera, ...rotar(resto, n)].join(" ");
}

/** Las fotos empezando por la n-ésima: cada cuenta arranca con otra foto principal. */
export function rotar<T>(lista: T[], n: number): T[] {
  if (lista.length < 2) return [...lista];
  const k = ((n % lista.length) + lista.length) % lista.length;
  return [...lista.slice(k), ...lista.slice(0, k)];
}

/** Arma el borrador. `cat` = la categoría elegida a mano (si no, la del producto o su familia). */
export async function armarBorradorNueva(org: string, productoId: number, cat: string | null): Promise<BorradorNueva> {
  const p = await productoLaucen(org, productoId);
  if (p.no_publicable) throw new ErrorErp("El producto está marcado como No publicable.");
  const [variaciones, fotos, disp] = await Promise.all([
    consulta<{ id: number; sku: string; titulo: string | null }>(
      "select id::int, sku, titulo from variacion where organizacion_id = $1 and producto_id = $2 and estado <> 'archivada' order by es_default desc, orden, id", [org, productoId]),
    consulta<{ url: string }>(`
      select url from (select url, orden, id, 0 o from producto_foto where organizacion_id = $1 and producto_id = $2
                       union all
                       select f.url, f.orden, f.id, 1 from variacion_foto f join variacion v on v.id = f.variacion_id where f.organizacion_id = $1 and v.producto_id = $2) x
       order by o, orden, id`, [org, productoId]),
    una<{ n: number }>(`select coalesce(sum(stock_disponible_deposito($1, v.id, d.id)), 0)::int n from variacion v cross join deposito d
                         where v.producto_id = $2 and v.organizacion_id = $1 and d.organizacion_id = $1 and d.estado = 'activo'`, [org, productoId]),
  ]);
  if (!variaciones.length) throw new ErrorErp("El producto no tiene variaciones activas.");

  // La categoría: la elegida, la del producto o la de la familia; si no es una hoja, las sugeridas por ML.
  const sugeridas = await sugerirCategorias(org, p.titulo).catch(() => []);
  let categoria: Categoria | null = null, atributosMl: AtributoCategoria[] = [];
  for (const c of [cat, p.categoria_ml, p.categoria_familia, sugeridas[0]?.id]) {
    if (!c || !/^MLA\d+$/.test(c)) continue;
    try {
      const r = await leerCategoria(org, c);
      if (!r.categoria.hoja) continue;
      categoria = r.categoria; atributosMl = r.atributos;
      break;
    } catch { /* se prueba la próxima */ }
  }

  const deLaucen = valoresDeLaucen(p);
  const cargables = atributosCargables(atributosMl);
  const valores: Record<string, { valor: string; origen: AtributoForm["origen"] }> = {};
  for (const a of cargables) if (deLaucen[a.id]) valores[a.id] = { valor: deLaucen[a.id], origen: "laucen" };
  // Sin código de barras: el motivo que pide ML ("no tiene código registrado").
  const motivoGtin = cargables.find((a) => a.id === "EMPTY_GTIN_REASON")?.values?.find((v) => /no tiene c[oó]digo/i.test(v.name));
  if (!valores.GTIN && motivoGtin) valores.EMPTY_GTIN_REASON = { valor: motivoGtin.name, origen: "laucen" };
  if (!valores.ITEM_CONDITION && cargables.some((a) => a.id === "ITEM_CONDITION")) valores.ITEM_CONDITION = { valor: "Nuevo", origen: "laucen" };

  const faltan = cargables.filter((a) => !valores[a.id] && a.id !== "GTIN");
  const faltaDescripcion = !p.descripcion?.trim();
  const destinos = await cuentasDestino(org, variaciones);
  const ia = categoria ? await proponer(p, faltan, faltaDescripcion, Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v.valor])), destinos.length) : null;
  for (const a of faltan) {
    const v = ia?.atributos[a.id];
    // Nunca una marca ni un código de barras de la IA (la marca, si falta, es la propia: abajo).
    if (!v || a.id === "GTIN" || a.id === "BRAND") continue;
    valores[a.id] = { valor: v, origen: "ia" };
  }
  // Sin marca en Laucen ni propuesta: la marca propia (Fer, 5/10).
  if (!valores.BRAND && cargables.some((a) => a.id === "BRAND")) valores.BRAND = { valor: MARCA_POR_DEFECTO, origen: "ia" };

  const atributos: AtributoForm[] = cargables.map((a) => ({
    id: a.id, nombre: a.name, requerido: esRequerido(a), tipo: a.value_type ?? "string",
    opciones: (a.values ?? []).map((v) => v.name), unidades: (a.allowed_units ?? []).map((u) => u.name),
    ayuda: a.hint ?? a.tooltip ?? null, valor: valores[a.id]?.valor ?? "", origen: valores[a.id]?.origen ?? "",
  }))
    // Primero los obligatorios, después los que tienen valor, después el resto.
    .sort((x, y) => Number(y.requerido) - Number(x.requerido) || Number(!!y.valor) - Number(!!x.valor));

  // Cada cuenta con su título (los de la IA en orden; si faltan, el primero con las palabras cambiadas
  // de lugar) y sus fotos empezando por otra. Se proponen todas las que no tienen ya el producto.
  const lasFotos = [...new Set(fotos.map((f) => f.url))];
  const base = (ia?.titulos[0] ?? p.titulo).slice(0, 120);
  const cuentas: CuentaNueva[] = destinos.map((c, i) => ({
    ...c, elegida: !c.yaTiene,
    titulo: (ia?.titulos[i] ?? (i === 0 ? base : variarTitulo(base, i))).slice(0, 120),
    fotos: rotar(lasFotos, i),
  }));
  const garantia = Object.keys(TIPOS_GARANTIA).find((g) => g && p.garantia && p.garantia.toLowerCase().includes(g.toLowerCase().replace("garantía ", ""))) ?? "";
  return {
    categoria, sugeridas: sugeridas.filter((s) => s.id !== categoria?.id),
    tituloIa: !!ia?.titulos.length,
    descripcion: p.descripcion?.trim() || ia?.descripcion || "", descripcionIa: faltaDescripcion && !!ia?.descripcion,
    conIa: !!ia, atributos, fotos: lasFotos,
    variaciones, variacion: variaciones[0].id, cuentas, cantidad: Math.max(1, disp?.n ?? 0),
    condicion: "new", garantia,
  };
}

// ── Preparar el lote ────────────────────────────────────────

/** Lo de cada cuenta elegida en el formulario. */
export type CuentaEntrada = { canal: number; titulo: string; precio: number | null; fotos: string[] };
export type EntradaNueva = {
  productoId: number; categoria: string; variacion: number; cantidad: number | null;
  tipo: string; condicion: string; atributos: Record<string, string>; garantiaTipo: string; garantiaTiempo: string; descripcion: string;
  cuentas: CuentaEntrada[];
};

/** Los atributos para ML: uno de una lista con su código si coincide con una opción; si no, como texto. */
export function atributosParaMl(meta: AtributoCategoria[], valores: Record<string, string>): { id: string; value_id?: string; value_name: string }[] {
  const porId = new Map(meta.map((a) => [a.id, a]));
  return Object.entries(valores).flatMap(([id, v]) => {
    const valor = v.trim();
    const a = porId.get(id);
    if (!valor || !a || id === "SELLER_SKU" || NO_MODIFICABLE(id)) return [];
    const op = a.values?.find((x) => x.name.toLowerCase() === valor.toLowerCase());
    return [op ? { id, value_id: op.id, value_name: op.name } : { id, value_name: valor }];
  });
}

/** El cuerpo de POST /items. `nombre`: family_name (modelo de productos de usuario, el de estas cuentas) o title. */
export function cuerpoNueva(e: { titulo: string; categoria: string; precio: number; cantidad: number; tipo: string; condicion: string; fotos: string[]; sku: string; garantiaTipo: string; garantiaTiempo: string },
  atributos: { id: string; value_id?: string; value_name: string }[], extra: { sacar?: string[]; sinEnvio?: boolean; conTitle?: boolean } = {}): Record<string, unknown> {
  const condiciones = [
    ...(e.garantiaTipo ? [{ id: "WARRANTY_TYPE", value_name: e.garantiaTipo }] : []),
    ...(e.garantiaTipo && e.garantiaTipo !== "Sin garantía" && e.garantiaTiempo.trim() ? [{ id: "WARRANTY_TIME", value_name: e.garantiaTiempo.trim() }] : []),
  ];
  return {
    ...(extra.conTitle ? { title: e.titulo } : { family_name: e.titulo }),
    category_id: e.categoria, price: Math.round(e.precio), currency_id: "ARS", available_quantity: Math.max(1, Math.trunc(e.cantidad)),
    buying_mode: "buy_it_now", condition: e.condicion, listing_type_id: e.tipo,
    pictures: e.fotos.map((source) => ({ source })),
    attributes: [...atributos.filter((a) => !(extra.sacar ?? []).includes(a.id)), { id: "SELLER_SKU", value_name: e.sku }],
    ...(condiciones.length ? { sale_terms: condiciones } : {}),
    ...(extra.sinEnvio ? {} : { shipping: { mode: "me2" } }),
  };
}

const LARGO_TITULO = 60;

export type ResultadoNueva = { loteId: number; preparadas: string[]; rechazadas: { cuenta: string; motivo: string }[]; avisos: string[] };

/** Prepara UN lote con una publicación por cuenta elegida: lo común (categoría, atributos,
 *  cantidad, tipo, garantía, descripción) es igual en todas; cambian el título, el precio y el
 *  orden de las fotos. Cada una se comprueba con su cuenta; la que ML rechaza no entra y se
 *  avisa por qué. Si no entra ninguna, no se prepara nada. */
export async function prepararPublicacionNueva(org: string, e: EntradaNueva, usuarioId: string): Promise<ResultadoNueva> {
  if (!e.cuentas.length) throw new ErrorErp("Elegí al menos una cuenta donde publicar.");
  if (!e.cantidad || e.cantidad < 1) throw new ErrorErp("La cantidad tiene que ser 1 o más.");
  if (!Object.hasOwn(TIPOS_PUBLICACION, e.tipo)) throw new ErrorErp("Elegí el tipo de publicación.");
  if (!Object.hasOwn(CONDICIONES, e.condicion)) throw new ErrorErp("Elegí la condición.");
  if (!Object.hasOwn(TIPOS_GARANTIA, e.garantiaTipo)) throw new ErrorErp("Elegí el tipo de garantía.");
  if (!/^MLA\d+$/.test(e.categoria)) throw new ErrorErp("Falta la categoría de Mercado Libre.");

  const v = await una<{ sku: string; no_publicable: boolean }>(
    `select v.sku, p.no_publicable from variacion v join producto p on p.id = v.producto_id
      where v.organizacion_id = $1 and v.id = $2 and v.producto_id = $3`, [org, e.variacion, e.productoId]);
  if (!v) throw new ErrorErp("Elegí la variación del producto que se publica.");
  if (v.no_publicable) throw new ErrorErp("El producto está marcado como No publicable.");

  const { categoria, atributos: meta } = await leerCategoria(org, e.categoria);
  if (!categoria.hoja) throw new ErrorErp("Esa categoría tiene subcategorías: elegí una más específica.");
  // La marca nunca es la de otro: la del producto, Daitom o genérica (Fer: las marcas ajenas traen denuncias).
  const marca = e.atributos.BRAND?.trim();
  const p = await productoLaucen(org, e.productoId);
  if (marca && !MARCA_POR_DEFECTO_RE.test(marca) && marca.toLowerCase() !== (p.marca ?? "").trim().toLowerCase()) {
    throw new ErrorErp(`La marca "${marca}" no es la del producto (${p.marca ?? "sin marca"}). Usá la del producto, ${MARCA_POR_DEFECTO} o "Genérica".`);
  }
  const atributos = atributosParaMl(atributosCargables(meta), e.atributos);
  const faltan = atributosCargables(meta).filter((a) => a.tags?.required && !atributos.some((x) => x.id === a.id) && !(a.id === "GTIN" && atributos.some((x) => x.id === "EMPTY_GTIN_REASON")));
  if (faltan.length) throw new ErrorErp(`Faltan atributos obligatorios: ${faltan.map((a) => a.name).join(", ")}.`);

  // Sólo fotos del producto en Laucen.
  const permitidas = new Set((await consulta<{ url: string }>(`
    select url from producto_foto where organizacion_id = $1 and producto_id = $2
    union select f.url from variacion_foto f join variacion x on x.id = f.variacion_id where f.organizacion_id = $1 and x.producto_id = $2`,
    [org, e.productoId])).map((f) => f.url));
  const nombres = new Map((await consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1", [org])).map((c) => [c.id, c.nombre]));
  const texto = e.descripcion.trim();

  const cambios: CambioMl[] = [];
  const preparadas: string[] = [], avisos: string[] = [];
  const rechazadas: { cuenta: string; motivo: string }[] = [];
  for (const c of e.cuentas) {
    const nombre = nombres.get(c.canal) ?? `canal ${c.canal}`;
    const rech = (motivo: string) => rechazadas.push({ cuenta: nombre, motivo });
    const titulo = c.titulo.replace(/\s+/g, " ").trim();
    if (!titulo) { rech("falta el título"); continue; }
    if (titulo.length > LARGO_TITULO) { rech(`el título tiene ${titulo.length} letras (hasta ${LARGO_TITULO})`); continue; }
    if (!c.precio || c.precio <= 0) { rech("falta el precio"); continue; }
    const fotos = [...new Set(c.fotos)].filter((u) => permitidas.has(u));
    if (!fotos.length) { rech("no tiene ninguna foto elegida"); continue; }
    const cuenta = await cuentaDelCanal(org, c.canal);
    if (!cuenta || cuenta.estado !== "activa") { rech("la cuenta no está conectada"); continue; }
    const ya = await yaTiene(org, c.canal, [v.sku]);
    if (ya) { rech(`ya tiene este producto publicado (${ya}): reactivá ésa`); continue; }
    const datos = { titulo, categoria: e.categoria, precio: c.precio, cantidad: e.cantidad, tipo: e.tipo, condicion: e.condicion, fotos, sku: v.sku, garantiaTipo: e.garantiaTipo, garantiaTiempo: e.garantiaTiempo };
    let r = await comprobarAlta(cuenta, (x) => cuerpoNueva(datos, atributos, x));
    // Si ML no acepta el nombre de familia (categoría del modelo viejo), se vuelve a comprobar con título.
    if (!r.ok && /family_name/i.test(r.motivo)) r = await comprobarAlta(cuenta, (x) => cuerpoNueva(datos, atributos, { ...x, conTitle: true }));
    if (!r.ok) { rech(`Mercado Libre no la acepta: ${r.motivo}`); continue; }
    if (r.avisos) avisos.push(`${nombre}: ${r.avisos}`);
    const pedidos: PedidoMl[] = [
      { metodo: "POST", ruta: "/items", cuerpo: r.cuerpo },
      ...(texto ? [{ metodo: "POST" as const, ruta: "/items/{id}/description", cuerpo: { plain_text: texto } }] : []),
    ];
    cambios.push({
      canalId: c.canal, itemId: `nueva:${v.sku}`, tipo: "crear",
      antes: { estado: "no existe en esta cuenta" },
      payload: { descripcion: `Crear en ${nombre}: ${titulo} (${v.sku}, desde Laucen)`, pedidos },
    });
    preparadas.push(nombre);
  }
  if (!cambios.length) throw new ErrorErp(`No se preparó ninguna. ${rechazadas.map((x) => `${x.cuenta}: ${x.motivo}`).join(" · ")}`);
  const loteId = await encolarLoteConBoton(org, cambios.length === 1 ? cambios[0].canalId : null, cambios,
    `Publicar ${v.sku} (nueva, desde Laucen) en ${preparadas.join(", ")}`, usuarioId);
  return { loteId, preparadas, rechazadas, avisos };
}
