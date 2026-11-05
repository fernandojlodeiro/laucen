// La API de Market Pro (Real Trends): GET con la llave en el encabezado X-API-Key, contesta JSON. Una sola consulta por
// llave a la vez (la segunda da 429); de a 100 filas (limit/offset). Guía: docs del 5/11 que mandó Fer.

export const BASE_MARKETPRO = "https://api.marketpro.real-trends.com";
export const FILAS_POR_PEDIDO = 100;

export type Pagina<T> = { items: T[]; total: number; limit: number; offset: number };

/** Un error de la API ya en criollo. `fatal`: la llave no sirve (no tiene sentido seguir pidiendo). */
export class ErrorMarketPro extends Error {
  constructor(mensaje: string, public estado: number, public fatal = false, public reintentar = false) {
    super(mensaje);
  }
}

export async function pedirMarketPro<T>(llave: string, ruta: string, params: Record<string, string | number | boolean | null | undefined>): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") q.set(k, String(v));
  for (let intento = 1; ; intento++) {
    let r: Response;
    try {
      r = await fetch(`${BASE_MARKETPRO}${ruta}?${q}`, { headers: { "X-API-Key": llave, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(50_000) });
    } catch (e) {
      if (intento < 3) { await esperar(2000 * intento); continue; }
      console.error("[marketpro] sin respuesta", ruta, e);
      throw new ErrorMarketPro("Market Pro no responde. Se reintenta en un rato.", 0, false, true);
    }
    if (r.ok) return (await r.json()) as T;
    const detalle = await r.text().catch(() => "");
    // Otra consulta con la misma llave todavía corre (la de una prueba, u otra vuelta): se espera y se reintenta.
    if (r.status === 429 && intento < 6) { await esperar(3000 * intento); continue; }
    if (r.status >= 500 && intento < 3) { await esperar(3000 * intento); continue; }
    console.error("[marketpro]", r.status, ruta, q.toString(), detalle.slice(0, 300));
    let msj = "";
    try { msj = String((JSON.parse(detalle) as { detail?: unknown }).detail ?? ""); } catch { /* no era JSON */ }
    if (r.status === 401) throw new ErrorMarketPro("Falta la llave de Market Pro.", 401, true);
    if (r.status === 403) {
      if (/not enabled/i.test(msj)) throw new ErrorMarketPro("La llave es válida pero no tiene habilitado el acceso por API: hay que pedírselo al representante de Market Pro.", 403, true);
      throw new ErrorMarketPro("Market Pro dice que la llave no es válida o está vencida.", 403, true);
    }
    if (r.status === 422) throw new ErrorMarketPro(`Market Pro rechazó la consulta (${msj.slice(0, 200) || "algún dato no le gustó"}).`, 422);
    if (r.status === 429) throw new ErrorMarketPro("Market Pro está ocupado con otra consulta de la misma llave. Se reintenta en un rato.", 429, false, true);
    throw new ErrorMarketPro("Market Pro no respondió bien. Se reintenta en un rato.", r.status, false, true);
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Prueba una llave antes de grabarla (una consulta de una fila del árbol de categorías). null = anda. */
export async function probarLlaveMarketPro(llave: string, pais = "ar"): Promise<string | null> {
  try {
    await pedirMarketPro<Pagina<unknown>>(llave, "/categories", { country: pais, limit: 1 });
    return null;
  } catch (e) {
    return e instanceof ErrorMarketPro ? e.message : "Market Pro no responde. Probá de nuevo en un momento.";
  }
}

// ---- Lo que devuelve cada consulta ----

export type CategoriaApi = { category_id: number; name: string; name_path: string; path: number[] | string | null; is_leaf: boolean };

export type ItemApi = {
  day?: string; month?: string; item_id: string; category_id: string | null; category_name: string | null; title: string | null;
  brand: string | null; model: string | null; ean_gtin: string | null; catalog_product_id: string | null; thumbnail_url: string | null;
  reputation: string | null; nickname: string | null; alias: string | null; sold_quantity: number | null; price: number | null; gmv: number | null;
  avg_discount: number | null; listing_type: string | null; installments: string | null; shipping_mode: string | null;
  has_free_shipping: string | boolean | null; is_catalog_product: string | boolean | null; shipping_mode_type: string | null;
  condition: string | null; seller_state: string | null; seller_city: string | null; days_active: number | null; avg_daily_visits: number | null;
  conversion_ratio: number | null; avg_daily_questions: number | null; pictures_qty: number | null; total_visits: number | null;
  total_questions: number | null; total_orders: number | null; cancelled_orders: number | null; domain: string | null; seller_sku: string | null;
  attributes: unknown;
};
