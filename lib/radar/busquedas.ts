// "Hacer clic por dentro" en una palabra: traer las publicaciones de esa
// búsqueda. Dos fuentes: la API oficial (gratis, sólo catálogo, sin vendidos)
// y Apify (lo que muestra la página, con vendidos; paga). Todo queda guardado
// y es compartido: si esta semana ya se buscó, se muestra lo guardado.

import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { meliBusquedas, meliPublicaciones } from "@/db/radar";
import { correrConEntrada, costosFinales } from "@/lib/apify";
import { SITIO, ml, semanaDe, tokenML } from "./base";
import { FUENTES_APIFY, configDe, type FuenteApify } from "./config";

export type Busqueda = typeof meliBusquedas.$inferSelect;
export type Publicacion = typeof meliPublicaciones.$inferSelect;
type NuevaPub = typeof meliPublicaciones.$inferInsert;

const inicioSemana = () => new Date(`${semanaDe()}T03:00:00Z`); // lunes 00:00 en Argentina

/** Una búsqueda sirve (no hay que repetirla) si terminó bien o si está
 *  corriendo desde hace menos de 10 minutos; una "corriendo" más vieja quedó
 *  colgada (se cortó el servidor) y se puede reintentar. */
export function sirve(b: Busqueda) {
  if (b.estado === "terminada") return true;
  return b.estado === "corriendo" && Date.now() - b.pedidaEl.getTime() < 10 * 60 * 1000;
}

/** La última búsqueda de esta semana de una palabra con esa fuente. */
export async function busquedaDeLaSemana(palabra: string, fuente: string): Promise<Busqueda | null> {
  const [b] = await db.select().from(meliBusquedas).where(and(
    sql`lower(${meliBusquedas.palabra}) = ${palabra.toLowerCase()}`, eq(meliBusquedas.fuente, fuente),
    gte(meliBusquedas.pedidaEl, inicioSemana()),
  )).orderBy(desc(meliBusquedas.pedidaEl)).limit(1);
  return b ?? null;
}

export function publicacionesDe(busquedaId: number) {
  return db.select().from(meliPublicaciones).where(eq(meliPublicaciones.busquedaId, busquedaId)).orderBy(asc(meliPublicaciones.posicion));
}

type Pedido = { palabra: string; categoriaId: string | null; organizacionId: string; usuarioId?: string; origen?: "manual" | "cron"; semilla?: "tendencia" | "propia" };

async function abrir(p: Pedido, fuente: string) {
  const [b] = await db.insert(meliBusquedas).values({
    palabra: p.palabra, categoriaId: p.categoriaId === SITIO ? null : p.categoriaId, fuente,
    origen: p.origen ?? "manual", organizacionId: p.organizacionId, usuarioId: p.usuarioId ?? null,
    semilla: p.semilla ?? "tendencia",
  }).returning();
  return b;
}

async function cerrar(id: number, datos: Partial<Busqueda>, pubs: NuevaPub[]) {
  if (pubs.length) await db.insert(meliPublicaciones).values(pubs).onConflictDoNothing();
  await db.update(meliBusquedas).set({ terminadaEl: new Date(), ...datos }).where(eq(meliBusquedas.id, id));
}

// ── Gratis: API oficial (catálogo) ───────────────────────

/** Productos de catálogo que coinciden, con la oferta más barata de cada uno
 *  y el nombre del vendedor. Hasta `max` publicaciones. */
export async function buscarGratis(p: Pedido, max = 10): Promise<Busqueda> {
  const ya = await busquedaDeLaSemana(p.palabra, "api");
  if (ya && sirve(ya)) return ya;
  const b = await abrir(p, "api");
  try {
    const token = await tokenML(p.organizacionId);
    const r = await ml(`/products/search?status=active&site_id=${SITIO}&q=${encodeURIComponent(p.palabra)}&limit=30`, token);
    if (r.status !== 200) throw new Error(`Mercado Libre respondió ${r.status}`);
    const datos = r.datos as { paging?: { total?: number }; results?: { id: string; name: string; pictures?: { url: string }[] }[] };
    const productos = datos.results ?? [];
    const pubs: NuevaPub[] = [];
    for (let i = 0; i < productos.length && pubs.length < max; i += 6) {
      const tanda = await Promise.all(productos.slice(i, i + 6).map(async (prod) => {
        const it = await ml(`/products/${prod.id}/items?limit=10`, token);
        const ofertas = ((it.datos as { results?: Record<string, unknown>[] })?.results ?? []);
        if (!ofertas.length) return null;
        const o = ofertas.reduce((a, x) => (Number(x.price) < Number(a.price) ? x : a));
        return { prod, o };
      }));
      for (const t of tanda) if (t && pubs.length < max) pubs.push({
        busquedaId: b.id, posicion: pubs.length + 1, itemId: String(t.o.item_id ?? ""), productoId: t.prod.id,
        titulo: t.prod.name, url: `https://www.mercadolibre.com.ar/p/${t.prod.id}`, foto: t.prod.pictures?.[0]?.url ?? null,
        precio: Number(t.o.price) || null, precioAnterior: Number(t.o.original_price) || null, moneda: String(t.o.currency_id ?? "ARS"),
        vendedor: String(t.o.seller_id ?? ""), tiendaOficial: t.o.official_store_id != null,
        envioGratis: Boolean((t.o.shipping as { free_shipping?: boolean })?.free_shipping),
        full: (t.o.shipping as { logistic_type?: string })?.logistic_type === "fulfillment", datos: t.o,
      });
    }
    // Nombre de cada vendedor (la oferta sólo trae el número).
    const ids = [...new Set(pubs.map((x) => x.vendedor).filter(Boolean))] as string[];
    const nombres = new Map<string, string>();
    await Promise.all(ids.map(async (id) => {
      const u = await ml(`/users/${id}`, token);
      const nick = (u.datos as { nickname?: string })?.nickname;
      if (nick) nombres.set(id, nick);
    }));
    pubs.forEach((x) => { if (x.vendedor && nombres.has(x.vendedor)) x.vendedor = nombres.get(x.vendedor)!; });
    await cerrar(b.id, { estado: "terminada", totalResultados: datos.paging?.total != null ? `${datos.paging.total} productos de catálogo` : null, costoUsd: 0 }, pubs);
  } catch (e) {
    await cerrar(b.id, { estado: "fallo", error: String(e).slice(0, 500) }, []);
  }
  const [final] = await db.select().from(meliBusquedas).where(eq(meliBusquedas.id, b.id));
  return final;
}

// ── Paga: Apify ──────────────────────────────────────────

/** Gastado por la organización en Apify esta semana (lo que está corriendo
 *  cuenta con su costo estimado). */
export async function gastoDeLaSemana(organizacionId: string) {
  const filas = await db.select({ costo: meliBusquedas.costoUsd, estado: meliBusquedas.estado, fuente: meliBusquedas.fuente })
    .from(meliBusquedas).where(and(eq(meliBusquedas.organizacionId, organizacionId), gte(meliBusquedas.pedidaEl, inicioSemana()),
      sql`${meliBusquedas.fuente} like 'apify:%'`));
  return filas.reduce((t, f) => t + (f.estado === "corriendo" && f.costo == null
    ? FUENTES_APIFY[f.fuente.slice(6) as FuenteApify]?.costoPorPalabra ?? 0.2
    : f.costo ?? 0), 0);
}

export class TopeDeGasto extends Error {}

const num = (v: unknown) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const pisoVendidos = (t: unknown) => {
  const m = String(t ?? "").replace(/\./g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
};

function aPublicacion(fuente: FuenteApify, busquedaId: number, x: Record<string, unknown>, i: number): NuevaPub {
  if (fuente === "karamelo") return {
    busquedaId, posicion: Number(x.resultPosition) || i + 1, itemId: (x.publicationId as string) ?? null,
    productoId: (x.catalogProductId as string) || null, titulo: String(x.title ?? "(sin título)"),
    url: (x.productUrl as string) ?? null, foto: (x.thumbnailUrl as string) ?? null,
    precio: num(x.currentPrice), precioAnterior: num(x.previousPrice), moneda: (x.currency as string) ?? "ARS",
    vendidos: typeof x.soldQuantity === "number" ? x.soldQuantity : pisoVendidos(x.soldQuantity),
    vendidosTexto: x.soldQuantity != null ? `+${x.soldQuantity} vendidos` : null,
    vendedor: (x.sellerName as string) || null, tiendaOficial: Boolean(x.isOfficialStore), envioGratis: Boolean(x.freeShipping),
    estrellas: num(x.rating), opiniones: typeof x.reviewCount === "number" ? x.reviewCount : null, datos: x,
  };
  return {
    busquedaId, posicion: i + 1, itemId: (x.item_id as string) ?? (x.ml_id as string) ?? null, productoId: null,
    titulo: String(x.name ?? "(sin título)"), url: (x.permalink as string) ?? (x.url_item as string) ?? null,
    foto: (x.thumbnail as string) ?? null, precio: num(x.price), precioAnterior: num(x.original_price),
    moneda: (x.currency as string) ?? "ARS", vendidos: pisoVendidos(x.sold_quantity_text),
    vendidosTexto: (x.sold_quantity_text as string) || null, stockTexto: (x.stock_text as string) || null,
    vendedor: (x.seller as string) ?? (x.vendor_name as string) ?? null, tiendaOficial: Boolean(x.official_store),
    envioGratis: Boolean(x.free_shipping), estrellas: num(x.reviews_rating),
    opiniones: typeof x.reviews_count === "number" ? x.reviews_count : null, datos: x,
  };
}

/** Busca la palabra con Apify, respetando el tope semanal de gasto de la
 *  organización. Tira `TopeDeGasto` si no alcanza. */
export async function buscarConApify(p: Pedido, esperaSeg = 180): Promise<Busqueda> {
  const config = await configDe(p.organizacionId);
  const fuente = config.fuenteApify as FuenteApify;
  const clave = `apify:${fuente}`;
  const ya = await busquedaDeLaSemana(p.palabra, clave);
  if (ya && sirve(ya)) return ya;

  const def = FUENTES_APIFY[fuente];
  const gastado = await gastoDeLaSemana(p.organizacionId);
  if (gastado + def.costoPorPalabra > config.topeSemanalUsd) {
    throw new TopeDeGasto(`Se llegó al tope semanal de USD ${config.topeSemanalUsd} (gastado: USD ${gastado.toFixed(2)}).`);
  }

  const b = await abrir(p, clave);
  const entrada = fuente === "karamelo"
    ? { keyword: p.palabra, country: "https://listado.mercadolibre.com.ar/", maxPages: 1, extractProductDetails: false }
    : { queries: [p.palabra], country: "AR", maxItems: 48, enrichDetailPage: true };
  const c = await correrConEntrada(def.actor, entrada, { max: 48, esperaSeg, topeUsd: 0.4 });
  const items = c.items as Record<string, unknown>[];
  const pubs = items.map((x, i) => aPublicacion(fuente, b.id, x, i));
  // Posiciones únicas (karamelo trae su propia posición; por las dudas).
  const vistas = new Set<number>();
  pubs.forEach((x, i) => { if (vistas.has(x.posicion)) x.posicion = 1000 + i; vistas.add(x.posicion); });
  const total = items[0]?.totalResults;
  await cerrar(b.id, {
    estado: c.estado === "SUCCEEDED" || items.length ? "terminada" : "fallo", error: c.error?.slice(0, 500) ?? null,
    runId: c.runId ?? null, costoUsd: c.costoUsd, totalResultados: total != null ? String(total) : null,
  }, pubs);
  const [final] = await db.select().from(meliBusquedas).where(eq(meliBusquedas.id, b.id));
  return final;
}

/** Actualiza el costo de las búsquedas de Apify de los últimos 8 días con el
 *  costo final que informa Apify (se asienta después de terminar). */
export async function actualizarCostos() {
  const desde = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  const filas = await db.select({ id: meliBusquedas.id, run: meliBusquedas.runId }).from(meliBusquedas)
    .where(and(isNotNull(meliBusquedas.runId), gte(meliBusquedas.pedidaEl, desde)));
  if (!filas.length) return 0;
  const finales = await costosFinales(filas.map((f) => f.run!));
  let n = 0;
  for (const f of filas) {
    const usd = finales[f.run!]?.usd;
    if (usd != null) { await db.update(meliBusquedas).set({ costoUsd: usd }).where(eq(meliBusquedas.id, f.id)); n++; }
  }
  return n;
}

/** Búsquedas de esta semana de varias palabras (para marcar cuáles ya tienen). */
export async function busquedasDeLaSemana(palabras: string[]) {
  if (!palabras.length) return [] as Busqueda[];
  return db.select().from(meliBusquedas).where(and(
    inArray(sql`lower(${meliBusquedas.palabra})`, palabras.map((x) => x.toLowerCase())),
    gte(meliBusquedas.pedidaEl, inicioSemana()),
  )).orderBy(desc(meliBusquedas.pedidaEl));
}
