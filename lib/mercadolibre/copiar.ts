// Copiar publicaciones de una cuenta de ML a otra (Fer, 5/10): las cinco cuentas
// tienen que tener las mismas publicaciones. Se arma desde lo que Laucen ya
// guardó de ML (meli_item.datos_externos.ml, el item completo), se comprueba con
// ML (POST /items/validate: no publica nada) y queda en un lote "Preparado, falta
// tu clic" (lib/mercadolibre/cola.ts): nada sale a ML sin el clic de Fer.
//
// Alcance de esta primera versión (el piloto): publicaciones activas, que NO
// sean de catálogo y sin variaciones. Las de catálogo se arman aparte (cada
// cuenta tiene que ganar con un plan de cuotas distinto) y las que tienen
// variaciones todavía no.
//
// Modelo de ML: todas las publicaciones de estas cuentas son "de productos de
// usuario" (tienen family_name): ML arma el título a partir del family_name, así
// que variar el título es variar el family_name.

import { textosCanal, descripcionCopiada } from "@/lib/canales/textos";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { encolarLoteConBoton, errorLegible, type CambioMl, type PedidoMl } from "@/lib/mercadolibre/cola";
import { variacionPorSku } from "@/lib/mercadolibre/publicaciones";

export type OpcionesCopia = { variarTitulo: boolean; rotarFotos: boolean };

// El item tal cual lo devuelve ML (sólo lo que se usa).
type Av = { id: string; value_id?: string | null; value_name?: string | null };
export type ItemGuardado = {
  id: string; status?: string; title?: string; family_name?: string | null; category_id?: string; price?: number; currency_id?: string;
  available_quantity?: number; buying_mode?: string; condition?: string; listing_type_id?: string; channels?: string[];
  pictures?: { id?: string; url?: string; secure_url?: string }[]; attributes?: Av[]; sale_terms?: Av[]; video_id?: string | null;
  shipping?: { mode?: string; local_pick_up?: boolean; free_shipping?: boolean };
  catalog_listing?: boolean; variations?: unknown[]; seller_custom_field?: string | null;
};

/** El título con las palabras de atrás adelante y las de adelante atrás: la primera
 *  (qué es el producto) queda donde está; de lo que sigue, la segunda mitad pasa
 *  adelante. Mismo largo, mismas palabras: ML lo cuenta como otro título. */
export function variarTitulo(titulo: string): string {
  const palabras = titulo.trim().split(/\s+/).filter(Boolean);
  if (palabras.length < 4) return palabras.join(" ");
  const [primera, ...resto] = palabras;
  const corte = Math.ceil(resto.length / 2);
  return [primera, ...resto.slice(corte), ...resto.slice(0, corte)].join(" ");
}

/** La primera foto pasa al final (la principal es otra). */
export function rotarFotos<T>(fotos: T[]): T[] {
  return fotos.length < 2 ? [...fotos] : [...fotos.slice(1), fotos[0]];
}

/** Por qué una publicación no se puede copiar todavía (o null si se puede). */
export function motivoNoCopiable(it: ItemGuardado): string | null {
  if (it.status !== "active") return "no está activa";
  if (it.catalog_listing) return "es de catálogo (se arma aparte)";
  if (it.variations?.length) return "tiene variaciones (todavía no se copian)";
  if (!it.pictures?.length) return "no tiene fotos";
  if (!it.category_id || it.price == null) return "le faltan datos en Laucen: traé las publicaciones de nuevo";
  return null;
}

/** El cuerpo de POST /items para crear la copia en la otra cuenta. No lleva lo
 *  propio de la cuenta de origen: tienda oficial, catálogo, logística (Full /
 *  Flex), ids de ML ni el SKU viejo. */
/** Atributos que ML calcula o fija él: mandarlos da aviso ("ignored because it is not modifiable"). */
export const NO_MODIFICABLE = (id: string) => /^PACKAGE_/.test(id) || id === "IS_TOM_BRAND";

export function armarCuerpoCopia(it: ItemGuardado, sku: string | null, opciones: OpcionesCopia, extra: { modelo?: string | null; sacar?: string[]; sinEnvio?: boolean; completar?: string[] } = {}): Record<string, unknown> {
  const nombre = ((it.family_name ?? it.title) ?? "").trim();
  const nuevoNombre = opciones.variarTitulo ? variarTitulo(nombre) : nombre;
  const fotos = (it.pictures ?? []).map((f) => f.secure_url ?? f.url).filter((u): u is string => !!u);
  const atributos = (it.attributes ?? [])
    .filter((a) => a.id !== "SELLER_SKU" && !NO_MODIFICABLE(a.id) && !(extra.sacar ?? []).includes(a.id) && (a.value_name != null || (a.value_id != null && a.value_id !== "-1")))
    .map((a) => ({ id: a.id, ...(a.value_id && a.value_id !== "-1" ? { value_id: a.value_id } : {}), ...(a.value_name != null ? { value_name: a.value_name } : {}) }));
  if (sku) atributos.push({ id: "SELLER_SKU", value_name: sku } as (typeof atributos)[number]);
  // Muchas publicaciones viejas no tienen Modelo en ML y ML hoy lo exige en algunas categorías: se usa el del producto de Laucen.
  if (extra.modelo && !atributos.some((a) => a.id === "MODEL")) atributos.push({ id: "MODEL", value_name: extra.modelo } as (typeof atributos)[number]);
  // Un «número de pieza» obligatorio que la publicación vieja no tiene: el Modelo (el de ML o el de Laucen).
  const modelo = atributos.find((a) => a.id === "MODEL")?.value_name ?? extra.modelo ?? null;
  for (const id of extra.completar ?? []) {
    if (modelo && ES_NUMERO_DE_PIEZA(id) && !atributos.some((a) => a.id === id)) atributos.push({ id, value_name: modelo } as (typeof atributos)[number]);
  }
  const condiciones = (it.sale_terms ?? []).filter((t) => t.value_name != null || t.value_id != null)
    .map((t) => ({ id: t.id, ...(t.value_id ? { value_id: t.value_id } : {}), ...(t.value_name != null ? { value_name: t.value_name } : {}) }));
  return {
    ...(it.family_name ? { family_name: nuevoNombre } : { title: nuevoNombre }),
    category_id: it.category_id,
    price: it.price,
    currency_id: it.currency_id ?? "ARS",
    available_quantity: Math.max(1, it.available_quantity ?? 1),
    buying_mode: it.buying_mode ?? "buy_it_now",
    condition: it.condition ?? "new",
    listing_type_id: it.listing_type_id,
    ...(it.channels?.length ? { channels: it.channels } : {}),
    pictures: (opciones.rotarFotos ? rotarFotos(fotos) : fotos).map((source) => ({ source })),
    attributes: atributos,
    // Mercado Envíos 2 y nada más: el envío gratis obligatorio, el costo y el resto los decide ML para esa cuenta
    // (si ML protesta por el envío, se reintenta sin este bloque y usa lo que tiene la cuenta).
    ...(extra.sinEnvio ? {} : { shipping: { mode: "me2" } }),
    ...(condiciones.length ? { sale_terms: condiciones } : {}),
    ...(it.video_id ? { video_id: it.video_id } : {}),
  };
}

/** Clave para saber si dos publicaciones son el mismo producto: el SKU sin "DE-" o,
 *  si no tiene, el título sin tildes ni signos. */
export const claveProducto = (sku: string | null | undefined, titulo: string | null | undefined): string => {
  const s = (sku ?? "").trim().replace(/^DE-/i, "").toUpperCase();
  if (s) return `S:${s}`;
  return `T:${(titulo ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
};

type CausaMl = { type?: string; code?: string; message?: string };
const causasDe = (datos: unknown): CausaMl[] => {
  const c = (datos as { cause?: unknown } | null)?.cause;
  return Array.isArray(c) ? (c as CausaMl[]) : [];
};

/** ¿La comprobación de ML sirve? Sí si dio 2xx, o si dio 400 pero sólo con avisos (ningún error): los avisos
 *  (envío gratis obligatorio, costo del envío, modo me1) los resuelve ML al crear la publicación. */
export function aceptable(r: { status: number; datos: unknown }): boolean {
  if (r.status >= 200 && r.status < 300) return true;
  const causas = causasDe(r.datos);
  return r.status === 400 && causas.length > 0 && causas.every((c) => c.type === "warning");
}

/** Los atributos que ML dice que se ignoran por no ser modificables. */
export function atributosNoModificables(datos: unknown): string[] {
  return causasDe(datos).flatMap((c) => [...(c.message ?? "").matchAll(/Attribute \[([A-Z0-9_]+)\] ignored because it is not modifiable/g)].map((m) => m[1]));
}

/** Los atributos con un valor que ML no acepta en esa cuenta (ej. PRODUCT_TYPE «Notebook»,
 *  bitácora 7/10): si no es uno que la categoría exige, se puede mandar sin él. */
/** Los atributos obligatorios que faltan («The attributes [A, B] are required for category …»). */
export function atributosFaltantes(datos: unknown): string[] {
  return causasDe(datos).filter((c) => c.type !== "warning")
    .flatMap((c) => [...(c.message ?? "").matchAll(/attributes \[([A-Z0-9_, ]+)\] are required/gi)].flatMap((m) => m[1].split(",").map((x) => x.trim()).filter(Boolean)));
}

/** Los obligatorios que son «número de pieza» (Fer, 10/10: ML pide DEVICE_PART_NUMBER en repuestos): se completan con el Modelo. */
const ES_NUMERO_DE_PIEZA = (id: string) => /PART_NUMBER$|^MPN$/.test(id);

export function atributosInvalidos(datos: unknown): string[] {
  return causasDe(datos).filter((c) => c.type !== "warning")
    .flatMap((c) => [...(c.message ?? "").matchAll(/Attribute \[([A-Z0-9_]+)\] is not valid/g)].map((m) => m[1]));
}

/** Por qué ML rechaza un alta: cada causa con su tipo (error / aviso) y su código, sin repetir. Si hay errores, van primero. */
export function motivoValidacion(status: number, datos: unknown): string {
  const causas = causasDe(datos).filter((c) => (c.message ?? "").trim());
  if (!causas.length) return errorLegible(status, datos);
  const orden = (c: CausaMl) => (c.type === "error" ? 0 : c.type === "warning" ? 2 : 1);
  const lineas = [...new Map([...causas].sort((a, b) => orden(a) - orden(b)).map((c) => {
    const t = `${c.type ? (c.type === "warning" ? "aviso" : c.type) : "?"}${c.code ? ` ${c.code}` : ""}: ${(c.message ?? "").trim()}`;
    return [t, t] as const;
  })).values()];
  const t = lineas.join(" · ");
  return t.length > 700 ? `${t.slice(0, 700)}…` : t;
}

export type Comprobacion = { ok: true; cuerpo: Record<string, unknown>; avisos: string | null } | { ok: false; motivo: string };

/** Comprueba un alta con ML (POST /items/validate: no publica nada). Si ML avisa que hay
 *  atributos que no se pueden mandar, los saca y vuelve a comprobar; si protesta por el
 *  envío, vuelve a comprobar sin el bloque de envío (usa el que tiene la cuenta). */
export async function comprobarAlta(cuenta: CuentaMl, armar: (x: { sacar: string[]; sinEnvio?: boolean; completar?: string[] }) => Record<string, unknown>): Promise<Comprobacion> {
  let sacar: string[] = [];
  let completar: string[] = [];
  let cuerpo = armar({ sacar });
  let r = await ml(cuenta, "POST", "/items/validate", cuerpo);
  // Un obligatorio que falta y se puede completar (número de pieza ← Modelo): se prueba con él.
  const faltan = atributosFaltantes(r.datos).filter((x) => ES_NUMERO_DE_PIEZA(x));
  if (r.status === 400 && faltan.length) {
    completar = faltan;
    cuerpo = armar({ sacar, completar });
    r = await ml(cuenta, "POST", "/items/validate", cuerpo);
  }
  const nuevos = atributosNoModificables(r.datos).filter((x) => !sacar.includes(x));
  if (r.status === 400 && nuevos.length) {
    sacar = [...sacar, ...nuevos];
    cuerpo = armar({ sacar, completar });
    r = await ml(cuenta, "POST", "/items/validate", cuerpo);
  }
  // Un atributo con un valor que ML no acepta (ej. PRODUCT_TYPE): se prueba sin él (hasta dos vueltas).
  for (let vuelta = 0; vuelta < 2 && r.status === 400; vuelta++) {
    const invalidos = [...atributosInvalidos(r.datos), ...atributosNoModificables(r.datos)].filter((x) => !sacar.includes(x));
    if (!invalidos.length) break;
    sacar = [...sacar, ...invalidos];
    cuerpo = armar({ sacar, completar });
    r = await ml(cuenta, "POST", "/items/validate", cuerpo);
  }
  if (!aceptable(r) && /mode me1|free shipping|shipping/i.test(JSON.stringify(r.datos))) {
    cuerpo = armar({ sacar, sinEnvio: true, completar });
    r = await ml(cuenta, "POST", "/items/validate", cuerpo);
  }
  if (!aceptable(r)) return { ok: false, motivo: motivoValidacion(r.status, r.datos) };
  const avisos = causasDe(r.datos).filter((c) => (c.message ?? "").trim() && !/not modifiable/.test(c.message ?? ""));
  return { ok: true, cuerpo, avisos: avisos.length ? motivoValidacion(r.status, { cause: avisos }) : null };
}

/** El Modelo cargado en el producto de Laucen que tiene ese SKU (para completar el que falta en ML). */
export async function modeloDeLaucen(org: string, sku: string): Promise<string | null> {
  const v = await variacionPorSku(org, sku);
  if (!v) return null;
  return (await una<{ modelo: string | null }>("select p.modelo from variacion x join producto p on p.id = x.producto_id where x.id = $1", [v]))?.modelo?.trim() || null;
}

export type Rechazo = { item_id: string; titulo: string | null; motivo: string };
export type PreparacionCopia = { loteId: number | null; preparadas: number; rechazadas: Rechazo[]; conAvisos: { item_id: string; titulo: string | null; avisos: string }[] };

const MAX_POR_LOTE = 40;

/** Prepara el lote que crea en `destino` las publicaciones elegidas de `origen`. Lee de ML
 *  (la descripción de cada una) y la comprueba con ML (validate, que no publica nada); lo que
 *  ML rechaza no entra al lote y se devuelve con el motivo. El lote queda esperando el clic. */
export async function prepararCopia(org: string, origen: number, destino: number, itemIds: string[], opciones: OpcionesCopia, usuarioId: string): Promise<PreparacionCopia> {
  if (origen === destino) throw new ErrorErp("La cuenta de origen y la de destino son la misma.");
  const ids = [...new Set(itemIds)];
  if (!ids.length) throw new ErrorErp("No elegiste ninguna publicación.");
  if (ids.length > MAX_POR_LOTE) throw new ErrorErp(`Elegí hasta ${MAX_POR_LOTE} publicaciones por vez (elegiste ${ids.length}).`);
  const cOrigen = await cuentaDelCanal(org, origen), cDestino = await cuentaDelCanal(org, destino);
  // El encabezado y el pie de la descripción: se sacan los de origen y se ponen los de destino (lib/canales/textos.ts).
  const [textosOrigen, textosDestino] = await Promise.all([textosCanal(org, origen), textosCanal(org, destino)]);
  if (!cOrigen || cOrigen.estado !== "activa") throw new ErrorErp("La cuenta de origen no está conectada.");
  if (!cDestino || cDestino.estado !== "activa") throw new ErrorErp("La cuenta de destino no está conectada.");
  const nombreDestino = (await una<{ nombre: string }>("select nombre from canal where id = $2 and organizacion_id = $1", [org, destino]))?.nombre ?? `canal ${destino}`;

  const filas = await consulta<{ item_id: string; titulo: string | null; sku: string | null; ml: ItemGuardado | null }>(
    `select distinct on (item_id) item_id, titulo, sku, datos_externos -> 'ml' ml from meli_item
      where organizacion_id = $1 and canal_id = $2 and item_id = any($3::text[]) order by item_id`, [org, origen, ids]);
  // Lo que ya tiene el destino (para no duplicar): sus SKU y títulos.
  const yaEnDestino = new Set((await consulta<{ sku: string | null; titulo: string | null }>(
    "select sku, titulo from meli_item where organizacion_id = $1 and canal_id = $2 and estado <> 'closed'", [org, destino])).map((f) => claveProducto(f.sku, f.titulo)));

  const rechazadas: Rechazo[] = [];
  const conAvisos: { item_id: string; titulo: string | null; avisos: string }[] = [];
  const cambios: CambioMl[] = [];
  const encontrados = new Set(filas.map((f) => f.item_id));
  for (const i of ids) if (!encontrados.has(i)) rechazadas.push({ item_id: i, titulo: null, motivo: "no está en la cuenta de origen" });

  for (const f of filas) {
    const rech = (motivo: string) => rechazadas.push({ item_id: f.item_id, titulo: f.titulo, motivo });
    if (!f.ml) { rech("Laucen no tiene sus datos completos: traé las publicaciones de nuevo"); continue; }
    const no = motivoNoCopiable(f.ml);
    if (no) { rech(no); continue; }
    if (yaEnDestino.has(claveProducto(f.sku, f.titulo))) { rech(`ya está en ${nombreDestino}`); continue; }
    const sku = f.sku?.trim() || null; // el SKU es el mismo en todas las cuentas
    const modelo = f.sku ? await modeloDeLaucen(org, f.sku) : null;
    // Siempre Clásica, aunque la de origen sea Premium (Fer, 5/10).
    const c = await comprobarAlta(cDestino, (x) => armarCuerpoCopia({ ...f.ml!, listing_type_id: "gold_special" }, sku, opciones, { modelo, ...x }));
    if (!c.ok) { rech(`Mercado Libre no la acepta: ${c.motivo}`); continue; }
    const cuerpo = c.cuerpo;
    // Entra, pero ML dejó avisos (ej. "envío gratis obligatorio agregado"): se cuentan aparte.
    if (c.avisos) conAvisos.push({ item_id: f.item_id, titulo: f.titulo, avisos: c.avisos });
    const desc = await ml<{ plain_text?: string }>(cOrigen, "GET", `/items/${f.item_id}/description`);
    const leida = desc.status === 200 ? desc.datos.plain_text?.trim() ?? "" : "";
    const texto = leida ? descripcionCopiada(leida, textosOrigen, textosDestino).texto : "";
    const pedidos: PedidoMl[] = [
      { metodo: "POST", ruta: "/items", cuerpo: cuerpo },
      ...(texto ? [{ metodo: "POST" as const, ruta: "/items/{id}/description", cuerpo: { plain_text: texto } }] : []),
    ];
    cambios.push({
      canalId: destino, itemId: `nueva:${f.item_id}`, tipo: "crear",
      antes: { estado: "no existe en esta cuenta" },
      payload: { descripcion: `Crear en ${nombreDestino}: ${String(cuerpo.family_name ?? cuerpo.title)} (copia de ${f.item_id})`, origen: { canal: origen, item_id: f.item_id }, pedidos },
    });
  }
  if (!cambios.length) return { loteId: null, preparadas: 0, rechazadas, conAvisos };
  const loteId = await encolarLoteConBoton(org, destino, cambios,
    `Crear en ${nombreDestino} ${cambios.length} publicaciones copiadas de otra cuenta`, usuarioId);
  return { loteId, preparadas: cambios.length, rechazadas, conAvisos };
}
