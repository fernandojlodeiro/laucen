// Promociones de Mercado Libre: lo que se LEE (sólo lectura, AGENTS.md) y se registra en Laucen
// (Fer, 5/10: "controlar todas las promociones; que todo quede registrado en Laucen").
//
//   · Campañas de cada cuenta: GET /seller-promotions/users/{user_id}?app_version=v2, y de cada una su
//     detalle (beneficios: cuánto pone ML y cuánto el vendedor) → ml_promo_campana.
//   · Las publicaciones que están EN una campaña en curso (started / pending): GET
//     /seller-promotions/promotions/{id}/items?status=… → ml_promo_item. Es lo que mueve el precio.
//   · Las campañas a las que cada publicación puede entrar (candidate) las lee lectura.ts por publicación.
//   · Cada cambio queda en ml_promo_historia: campaña que empieza, termina o cambia de fechas; publicación
//     que entra, sale o cambia de precio o de estado. Esa historia es la que explica un cambio de precio.
//
// Todo lo de "qué cambió" es PURO (diferenciasItem, diferenciasCampana) y se prueba sin base ni red.

import { consulta } from "@/lib/erp/base";
import type { RespuestaMl } from "@/lib/mercadolibre/api";

export type Pedir = (ruta: string) => Promise<RespuestaMl>;

/** Una campaña, o una publicación en una campaña, como la devuelve ML (sólo lo que se usa; el resto va en `datos`). */
export type PromoMl = {
  id?: string | number; type?: string; sub_type?: string; status?: string; name?: string;
  price?: number | null; deal_price?: number | null; new_price?: number | null; original_price?: number | null;
  min_discounted_price?: number | null; max_discounted_price?: number | null;
  start_date?: string | null; finish_date?: string | null; end_date?: string | null; deadline_date?: string | null;
  offer_id?: string | null; meli_percentage?: number | null; seller_percentage?: number | null;
  benefits?: { type?: string; meli_percent?: number | null; seller_percent?: number | null } | null;
};

export type FilaPromoItem = {
  promocion_id: string; tipo: string; estado: string | null; nombre: string | null; precio: number | null;
  min_precio: number | null; max_precio: number | null; hasta: string | null; desde: string | null; limite: string | null;
  precio_original: number | null; pct_meli: number | null; pct_vendedor: number | null; oferta_id: string | null;
};

export type FilaCampana = {
  promocion_id: string; tipo: string; subtipo: string | null; nombre: string | null; estado: string | null;
  desde: string | null; hasta: string | null; limite: string | null; pct_meli: number | null; pct_vendedor: number | null;
};

export type QueCambio = "campana_alta" | "campana_estado" | "campana_fechas" | "item_alta" | "item_estado" | "item_precio" | "item_baja";
export type EventoPromo = {
  que: QueCambio; promocion_id: string; item_id: string | null; tipo: string | null; nombre: string | null;
  antes: string | null; despues: string | null; precio_antes: number | null; precio_despues: number | null;
};

const num = (x: unknown): number | null => { const n = typeof x === "string" ? Number(x) : (x as number); return typeof n === "number" && Number.isFinite(n) ? n : null; };
const fecha = (x: unknown): string | null => (typeof x === "string" && !Number.isNaN(Date.parse(x)) ? x : null);

/** En promoción de verdad (mueve el precio): started o pending. */
export const enPromocion = (estado: string | null | undefined) => estado === "started" || estado === "pending";

/** Una publicación en una campaña (de GET /seller-promotions/items/{id} o de /promotions/{id}/items). */
export function filaDePromoItem(x: PromoMl, campana?: { id: string; tipo: string; nombre: string | null }): FilaPromoItem | null {
  const id = campana?.id ?? (x.id != null ? String(x.id) : null);
  const tipo = campana?.tipo ?? x.type ?? null;
  if (!id || !tipo) return null;
  return {
    promocion_id: id, tipo, estado: x.status ?? null, nombre: campana?.nombre ?? x.name ?? null,
    precio: enPromocion(x.status) ? num(x.price) ?? num(x.deal_price) ?? num(x.new_price) : null,
    min_precio: num(x.min_discounted_price), max_precio: num(x.max_discounted_price),
    hasta: fecha(x.finish_date) ?? fecha(x.end_date), desde: fecha(x.start_date), limite: fecha(x.deadline_date),
    precio_original: num(x.original_price), pct_meli: num(x.meli_percentage), pct_vendedor: num(x.seller_percentage), oferta_id: x.offer_id ?? null,
  };
}

/** Una campaña, de la lista de campañas de la cuenta (y su detalle, si lo hay). */
export function filaDeCampana(x: PromoMl, detalle?: PromoMl | null): FilaCampana | null {
  if (x.id == null || !x.type) return null;
  const d = detalle ?? {};
  const b = d.benefits ?? x.benefits ?? null;
  return {
    promocion_id: String(x.id), tipo: x.type, subtipo: d.sub_type ?? x.sub_type ?? null, nombre: d.name ?? x.name ?? null,
    estado: d.status ?? x.status ?? null,
    desde: fecha(d.start_date) ?? fecha(x.start_date), hasta: fecha(d.finish_date) ?? fecha(x.finish_date), limite: fecha(d.deadline_date) ?? fecha(x.deadline_date),
    pct_meli: num(b?.meli_percent), pct_vendedor: num(b?.seller_percent),
  };
}

const igualesFecha = (a: string | null, b: string | null) => (a == null || b == null ? a === b : Date.parse(a) === Date.parse(b));

/** Qué cambió en una publicación entre dos lecturas de sus campañas. En la primera lectura no se anotan las
 *  campañas a las que sólo "puede entrar" (serían miles de altas sin sentido): sólo las que ya está adentro. */
export function diferenciasItem(item: string, antes: FilaPromoItem[], despues: FilaPromoItem[], primeraLectura = false): EventoPromo[] {
  const previas = new Map(antes.map((x) => [x.promocion_id, x]));
  const ahora = new Set(despues.map((x) => x.promocion_id));
  const base = (x: FilaPromoItem) => ({ promocion_id: x.promocion_id, item_id: item, tipo: x.tipo, nombre: x.nombre });
  const salida: EventoPromo[] = [];
  for (const d of despues) {
    const a = previas.get(d.promocion_id);
    if (!a) {
      if (!primeraLectura || enPromocion(d.estado)) salida.push({ ...base(d), que: "item_alta", antes: null, despues: d.estado, precio_antes: null, precio_despues: d.precio });
      continue;
    }
    if ((a.estado ?? "") !== (d.estado ?? "")) salida.push({ ...base(d), que: "item_estado", antes: a.estado, despues: d.estado, precio_antes: a.precio, precio_despues: d.precio });
    else if (a.precio != null && d.precio != null && a.precio !== d.precio) {
      salida.push({ ...base(d), que: "item_precio", antes: d.estado, despues: d.estado, precio_antes: a.precio, precio_despues: d.precio });
    }
  }
  for (const a of antes) if (!ahora.has(a.promocion_id)) salida.push({ ...base(a), que: "item_baja", antes: a.estado, despues: null, precio_antes: a.precio, precio_despues: null });
  return salida;
}

/** Qué cambió en una campaña entre dos lecturas. Sin lectura anterior, es un alta. */
export function diferenciasCampana(antes: FilaCampana | null, despues: FilaCampana): EventoPromo[] {
  const base = { promocion_id: despues.promocion_id, item_id: null, tipo: despues.tipo, nombre: despues.nombre, precio_antes: null, precio_despues: null };
  if (!antes) return [{ ...base, que: "campana_alta", antes: null, despues: despues.estado }];
  const salida: EventoPromo[] = [];
  if ((antes.estado ?? "") !== (despues.estado ?? "")) salida.push({ ...base, que: "campana_estado", antes: antes.estado, despues: despues.estado });
  if (!igualesFecha(antes.desde, despues.desde) || !igualesFecha(antes.hasta, despues.hasta)) {
    const t = (c: FilaCampana) => `${c.desde ?? "?"} → ${c.hasta ?? "?"}`;
    salida.push({ ...base, que: "campana_fechas", antes: t(antes), despues: t(despues) });
  }
  return salida;
}

// ── Base ──────────────────────────────────────────────────

export async function guardarEventos(org: string, canal: number, eventos: EventoPromo[]): Promise<void> {
  if (!eventos.length) return;
  for (let i = 0; i < eventos.length; i += 500) {
    await consulta(`
      insert into ml_promo_historia (organizacion_id, canal_id, promocion_id, item_id, tipo, nombre, que, antes, despues, precio_antes, precio_despues)
      select $1, $2, x.promocion_id, x.item_id, x.tipo, x.nombre, x.que, x.antes, x.despues, x.precio_antes, x.precio_despues
        from jsonb_to_recordset($3::jsonb) x(promocion_id text, item_id text, tipo text, nombre text, que text, antes text, despues text, precio_antes numeric, precio_despues numeric)`,
      [org, canal, JSON.stringify(eventos.slice(i, i + 500))]);
  }
}

type FilaDb = FilaPromoItem;
const COLS_ITEM = "promocion_id, tipo, estado, nombre, precio::float, min_precio::float, max_precio::float, hasta::text, desde::text, limite::text, precio_original::float, pct_meli::float, pct_vendedor::float, oferta_id";

/** Guarda lo leído de las campañas de UNA publicación (reemplaza a borrar y volver a cargar): anota qué cambió
 *  en la historia, actualiza las filas y saca las que ya no están. `primeraLectura`: nunca se había leído. */
export async function registrarPromosDeItem(org: string, canal: number, item: string, lista: { fila: FilaPromoItem; datos: unknown }[], primeraLectura: boolean): Promise<number> {
  const antes = await consulta<FilaDb>(`select ${COLS_ITEM} from ml_promo_item where canal_id = $1 and item_id = $2`, [canal, item]);
  const eventos = diferenciasItem(item, antes, lista.map((x) => x.fila), primeraLectura);
  await guardarEventos(org, canal, eventos);
  await consulta("delete from ml_promo_item where canal_id = $1 and item_id = $2 and not (promocion_id = any($3::text[]))", [canal, item, lista.map((x) => x.fila.promocion_id)]);
  await escribirFilasItem(org, canal, item, lista);
  return eventos.length;
}

async function escribirFilasItem(org: string, canal: number, item: string, lista: { fila: FilaPromoItem; datos: unknown }[]): Promise<void> {
  if (!lista.length) return;
  await consulta(`
    insert into ml_promo_item (organizacion_id, canal_id, item_id, promocion_id, tipo, estado, nombre, precio, min_precio, max_precio, hasta, desde, limite,
                               precio_original, pct_meli, pct_vendedor, oferta_id, datos, leido_ts)
    select $1, $2, $3, x.promocion_id, x.tipo, x.estado, x.nombre, x.precio, x.min_precio, x.max_precio, x.hasta, x.desde, x.limite,
           x.precio_original, x.pct_meli, x.pct_vendedor, x.oferta_id, x.datos, now()
      from jsonb_to_recordset($4::jsonb) x(promocion_id text, tipo text, estado text, nombre text, precio numeric, min_precio numeric, max_precio numeric,
           hasta timestamptz, desde timestamptz, limite timestamptz, precio_original numeric, pct_meli numeric, pct_vendedor numeric, oferta_id text, datos jsonb)
    on conflict (canal_id, item_id, promocion_id) do update set tipo = excluded.tipo, estado = excluded.estado, nombre = excluded.nombre, precio = excluded.precio,
      min_precio = excluded.min_precio, max_precio = excluded.max_precio, hasta = excluded.hasta, desde = excluded.desde, limite = excluded.limite,
      precio_original = excluded.precio_original, pct_meli = excluded.pct_meli, pct_vendedor = excluded.pct_vendedor, oferta_id = excluded.oferta_id,
      datos = excluded.datos, leido_ts = now()`,
    [org, canal, item, JSON.stringify(lista.map((x) => ({ ...x.fila, datos: x.datos })))]);
}

const lista = (d: unknown): PromoMl[] => {
  if (Array.isArray(d)) return d as PromoMl[];
  const o = d as { results?: unknown; data?: unknown } | null;
  return Array.isArray(o?.results) ? (o!.results as PromoMl[]) : Array.isArray(o?.data) ? (o!.data as PromoMl[]) : [];
};

export type ResultadoCampanas = { campanas: number; nuevas: number; items: number; eventos: number; errores: string[] };

/** Lee las campañas de la cuenta (y las publicaciones que están en las que están en curso) y las registra.
 *  `historico`: pide también las ya terminadas y las programadas (para la carga inicial). Si ML no da una
 *  lista o un filtro, el error queda anotado en `errores` y se sigue. */
export async function leerCampanas(org: string, canal: number, userId: number, pedir: Pedir, hastaMs: number, opts: { historico?: boolean } = {}): Promise<ResultadoCampanas> {
  const res: ResultadoCampanas = { campanas: 0, nuevas: 0, items: 0, eventos: 0, errores: [] };
  // 1. La lista de campañas de la cuenta (con los filtros de estado que se pidan).
  const filtros = opts.historico ? ["", "finished", "started", "pending", "programmed", "paused"] : [""];
  const vistas = new Map<string, PromoMl>();
  for (const estado of filtros) {
    let offset = 0;
    for (let pagina = 0; pagina < 20; pagina++) {
      if (Date.now() > hastaMs) { res.errores.push("se cortó por tiempo"); break; }
      const r = await pedir(`/seller-promotions/users/${userId}?app_version=v2&limit=50&offset=${offset}${estado ? `&status=${estado}` : ""}`);
      if (r.status !== 200) { if (estado === "" || pagina === 0) res.errores.push(`lista${estado ? ` (${estado})` : ""}: ML contestó ${r.status}`); break; }
      const pag = lista(r.datos);
      const nuevas = pag.filter((x) => x.id != null && !vistas.has(String(x.id)));
      for (const x of nuevas) vistas.set(String(x.id), x);
      const total = num((r.datos as { paging?: { total?: number } } | null)?.paging?.total);
      offset += pag.length;
      if (!nuevas.length || (total != null && offset >= total)) break;
    }
  }
  // 2. Cada campaña: su detalle (si es nueva, cambió de estado o hace más de un día), guardarla y anotar qué cambió.
  const conocidas = new Map((await consulta<FilaCampana & { edad_s: number }>(
    `select promocion_id, tipo, subtipo, nombre, estado, desde::text, hasta::text, limite::text, pct_meli::float, pct_vendedor::float,
            extract(epoch from (now() - leido_ts))::float edad_s from ml_promo_campana where canal_id = $1`, [canal]))
    .map((c) => [c.promocion_id, c]));
  const eventos: EventoPromo[] = [];
  const enCurso: FilaCampana[] = [];
  for (const x of vistas.values()) {
    if (Date.now() > hastaMs) { res.errores.push("se cortó por tiempo"); break; }
    try {
      const previa = conocidas.get(String(x.id)) ?? null;
      const basica = filaDeCampana(x);
      if (!basica) continue;
      let detalle: PromoMl | null = null;
      const viejo = !previa || (previa.estado ?? "") !== (basica.estado ?? "") || previa.edad_s > 24 * 3600;
      if (viejo) {
        const d = await pedir(`/seller-promotions/promotions/${x.id}?promotion_type=${encodeURIComponent(x.type!)}&app_version=v2`);
        if (d.status === 200 && d.datos && typeof d.datos === "object") detalle = d.datos as PromoMl;
      }
      const fila = filaDeCampana(x, detalle)!;
      await consulta(`
        insert into ml_promo_campana (organizacion_id, canal_id, promocion_id, tipo, subtipo, nombre, estado, desde, hasta, limite, pct_meli, pct_vendedor, datos, leido_ts)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, now())
        on conflict (canal_id, promocion_id) do update set tipo = excluded.tipo, subtipo = coalesce(excluded.subtipo, ml_promo_campana.subtipo), nombre = excluded.nombre,
          estado = excluded.estado, desde = excluded.desde, hasta = excluded.hasta, limite = excluded.limite,
          pct_meli = coalesce(excluded.pct_meli, ml_promo_campana.pct_meli), pct_vendedor = coalesce(excluded.pct_vendedor, ml_promo_campana.pct_vendedor),
          datos = case when $14::boolean then excluded.datos else ml_promo_campana.datos || jsonb_build_object('lista', excluded.datos -> 'lista') end, leido_ts = now()`,
        [org, canal, fila.promocion_id, fila.tipo, fila.subtipo, fila.nombre, fila.estado, fila.desde, fila.hasta, fila.limite, fila.pct_meli, fila.pct_vendedor,
          JSON.stringify({ lista: x, ...(detalle ? { detalle } : {}) }), !!detalle]);
      // Recién guardada: ahora sí se anota qué cambió (si falló el guardado, no queda un evento sin campaña).
      eventos.push(...diferenciasCampana(previa, fila));
      res.campanas++;
      if (!previa) res.nuevas++;
      if (enPromocion(fila.estado)) enCurso.push(fila);
    } catch (e) {
      res.errores.push(`campaña ${x.id}: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  await guardarEventos(org, canal, eventos);
  res.eventos += eventos.length;
  // 3. Las publicaciones que están adentro de las campañas en curso.
  for (const c of enCurso) {
    if (Date.now() > hastaMs - 3_000) { res.errores.push("se cortó por tiempo"); break; }
    try {
      const r = await leerItemsDeCampana(org, canal, c, pedir, hastaMs);
      res.items += r.items; res.eventos += r.eventos;
      if (r.error) res.errores.push(`${c.nombre ?? c.promocion_id}: ${r.error}`);
    } catch (e) {
      res.errores.push(`${c.nombre ?? c.promocion_id}: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  return res;
}

/** Las publicaciones que están en una campaña en curso (started y pending): las guarda, anota las que entran, cambian o
 *  salen. Sólo da por salidas las que faltan si la lectura quedó completa. */
export async function leerItemsDeCampana(org: string, canal: number, c: FilaCampana, pedir: Pedir, hastaMs: number): Promise<{ items: number; eventos: number; error?: string }> {
  const previas = new Map((await consulta<FilaDb & { item_id: string }>(
    `select item_id, ${COLS_ITEM} from ml_promo_item where canal_id = $1 and promocion_id = $2`, [canal, c.promocion_id])).map((f) => [f.item_id, f]));
  const vistos = new Set<string>();
  const eventos: EventoPromo[] = [];
  let completo = true, error: string | undefined, items = 0;
  for (const estado of ["started", "pending"]) {
    let token: string | null = null;
    for (let pagina = 0; pagina < 60; pagina++) {
      if (Date.now() > hastaMs - 2_000) { completo = false; break; }
      const r = await pedir(`/seller-promotions/promotions/${c.promocion_id}/items?promotion_type=${encodeURIComponent(c.tipo)}&app_version=v2&status=${estado}&limit=50${token ? `&search_after=${encodeURIComponent(token)}` : ""}`);
      if (r.status !== 200) { completo = false; error = `ML contestó ${r.status} al pedir las publicaciones`; break; }
      const pag = lista(r.datos);
      const filas = pag.map((x) => ({ x, fila: x.id != null ? filaDePromoItem({ ...x, status: x.status ?? estado }, { id: c.promocion_id, tipo: c.tipo, nombre: c.nombre }) : null })).filter((y) => y.fila);
      for (const { x, fila } of filas) {
        const item = String(x.id);
        vistos.add(item);
        const previa = previas.get(item);
        eventos.push(...diferenciasItem(item, previa ? [previa] : [], [fila!], false).filter((e) => e.item_id === item));
        await escribirFilasItem(org, canal, item, [{ fila: fila!, datos: x }]);
        items++;
      }
      token = (r.datos as { paging?: { search_after?: string | null } } | null)?.paging?.search_after ?? null;
      if (!token || !pag.length) break;
    }
  }
  if (completo) {
    const salieron = [...previas.entries()].filter(([item, f]) => enPromocion(f.estado) && !vistos.has(item));
    for (const [item, f] of salieron) {
      eventos.push({ que: "item_baja", promocion_id: c.promocion_id, item_id: item, tipo: c.tipo, nombre: c.nombre, antes: f.estado, despues: null, precio_antes: f.precio, precio_despues: null });
    }
    if (salieron.length) await consulta("delete from ml_promo_item where canal_id = $1 and promocion_id = $2 and item_id = any($3::text[])", [canal, c.promocion_id, salieron.map(([i]) => i)]);
  }
  await guardarEventos(org, canal, eventos);
  return { items, eventos: eventos.length, error };
}
