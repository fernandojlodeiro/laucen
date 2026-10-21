// Stock único entre todas las cuentas de ML (orden de la sesión 2): cada
// publicación vinculada de un canal de ML informa el disponible del canal
// (suma de sus depósitos) y se PAUSA cuando llega al umbral de pausa
// (publicación → producto → canal → organización → 1). Cuando vuelve a
// haber stock la reactiva, la haya pausado quien la haya pausado (Fer, 3/10:
// tener el precio y demás al día al activar es responsabilidad suya). Si ML la
// pausó por una infracción, ML rechaza la reactivación y queda en la cola
// "Con error" (no se reintenta en 6 h).
//
// Prendido por canal: canal.config.sincronizar_stock = true (Configuración →
// Canales). Apagado no toca nada en ML — así se puede conectar una cuenta y
// cargar el stock tranquilo antes de que Laucen empiece a mandar.
// Las publicaciones de Full no se tocan (el stock lo maneja ML).
//
// Nada se manda acá: los cambios entran a la cola (lib/mercadolibre/cola.ts)
// y los manda su trabajador, con reintentos y respetando los límites de ML.
// Lo que se graba en Laucen (pausada, cantidad informada) se graba recién
// cuando ML lo acepta.
//
// Cuándo se revisa: al instante, en cada cambio de stock (la base anota la
// variación y llama a /api/erp/stock → procesarCambiosStock; ver db/stock.sql);
// al instante también cuando ML avisa que una publicación vendió, antes de que
// llegue la orden (ventas en camino, más abajo); y como red de seguridad, en
// /api/erp/tareas, el barrido de media hora y la barrida nocturna.
//
// Con poco stock y precio bajo, el disponible se reparte entre las cuentas en
// vez de mostrarlo entero en cada una (lib/mercadolibre/reparto.ts).

import { consulta, enTransaccion, una } from "@/lib/erp/base";
import { cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { encolar, PRIORIDAD, type CambioMl, type OrigenCambio } from "@/lib/mercadolibre/cola";
import { repartoDe } from "@/lib/mercadolibre/reparto";

type Pub = {
  id: number; canal_id: number; variacion_id: number; id_externo: string; variacion_externa: string | null; estado: string;
  pausada_por_stock: boolean; pausada_manual: boolean; cantidad_publicada: number | null; disponible: number; umbral: number;
  /** Lo que le toca a esta publicación en el reparto entre cuentas (null o sin dato: el disponible entero). */
  asignado?: number | null;
};

/** Cuántos cambios se calcularon (cantidades, pausas, reactivaciones) y cuántos
 *  entraron de verdad a la cola (los iguales a uno que ya espera no se repiten). */
export type ResultadoStock = { revisadas: number; cantidades: number; pausadas: number; reactivadas: number; encoladas: number; errores: string[] };

/** Lo que hay que mandar a ML para una publicación según su stock (o nada).
 *  Pausa al llegar al umbral (o si en el reparto no le tocó nada), informando
 *  también la cantidad en el mismo envío (una variación no se pausa sola en ML:
 *  se le informa 0); si está pausada (por quien sea) y vuelve a haber, la
 *  reactiva; si no, informa la cantidad (la del reparto, si le toca uno). */
export function cambioDeStock(p: Pub): (CambioMl & { que: "pausa" | "reactivar" | "cantidad" }) | null {
  // Pausada a mano por el usuario: no se toca (ni se reactiva) hasta que él le saque la marca.
  if (p.pausada_manual) return null;
  const disp = Math.max(0, p.disponible);
  const cant = p.asignado == null ? disp : Math.min(disp, Math.max(0, p.asignado));
  const base = { canalId: p.canal_id, itemId: p.id_externo, variationId: p.variacion_externa, publicacionId: p.id, tipo: "stock" as const };
  const antes = { estado: p.estado, cantidad: p.cantidad_publicada };
  if (disp <= p.umbral || cant === 0) {
    if (p.estado !== "activa") return null;
    return {
      ...base, que: "pausa", prioridad: PRIORIDAD.pausa, antes,
      // Pausa y cantidad juntas, en el mismo envío (Fer, 6/10): nunca queda activa con 0, y ML
      // también ve la cantidad real (con umbral 1 y 1 disponible: pausada con 1).
      payload: p.variacion_externa ? { cantidad: 0 } : { estado: "paused", cantidad: cant },
      efecto: { publicacion: { id: p.id, estado: "pausada", pausada_por_stock: true, cantidad_publicada: p.variacion_externa ? 0 : cant } },
    };
  }
  if (p.pausada_por_stock || p.estado === "pausada") {
    return {
      ...base, que: "reactivar", prioridad: PRIORIDAD.reactivar, antes,
      payload: p.variacion_externa ? { cantidad: cant } : { cantidad: cant, estado: "active" },
      efecto: { publicacion: { id: p.id, estado: "activa", pausada_por_stock: false, cantidad_publicada: cant } },
    };
  }
  if (p.estado === "activa" && p.cantidad_publicada !== cant) {
    // De 0 a algo: además de la cantidad, que se active en el mismo envío (Fer, 6/10), por si ML
    // la había pausado al quedar sin stock.
    const activar = !p.variacion_externa && (p.cantidad_publicada ?? 0) === 0;
    return {
      ...base, que: "cantidad", prioridad: PRIORIDAD.normal, antes,
      payload: activar ? { cantidad: cant, estado: "active" } : { cantidad: cant },
      efecto: { publicacion: { id: p.id, cantidad_publicada: cant } },
    };
  }
  return null;
}

/** Calcula qué publicaciones cambiaron y lo ENCOLA (lib/mercadolibre/cola.ts):
 *  nada se manda acá, lo manda el trabajador de la cola. Sin `variaciones`,
 *  revisa todas las de los canales con la sincronización prendida (o sólo
 *  `opts.canal`). Para un kit, pasar también las variaciones de sus
 *  componentes no hace falta: se revisan por la publicación del kit. */
export async function sincronizarStockMl(org: string, variaciones?: number[], _hastaMs?: number,
  opts: { canal?: number; origen?: OrigenCambio } = {}): Promise<ResultadoStock> {
  const res: ResultadoStock = { revisadas: 0, cantidades: 0, pausadas: 0, reactivadas: 0, encoladas: 0, errores: [] };
  // Si cambió un componente, también los kits que lo usan.
  let vars = variaciones;
  if (vars?.length) {
    const kits = await consulta<{ id: number }>("select distinct variacion_kit_id::int id from kit_componente where variacion_componente_id = any($1::bigint[])", [vars]);
    vars = [...new Set([...vars, ...kits.map((k) => k.id)])];
  }
  const pubs = await consulta<Pub>(`
    select p.id::int, p.canal_id::int, p.variacion_id::int, p.id_externo, p.variacion_externa, p.estado, p.pausada_por_stock, p.pausada_manual,
           p.cantidad_publicada, stock_disponible_canal(p.organizacion_id, p.variacion_id, p.canal_id) disponible,
           umbral_pausa_de(p.organizacion_id, p.variacion_id, p.canal_id) umbral
      from publicacion p join canal c on c.id = p.canal_id
     where p.organizacion_id = $1 and c.tipo = 'mercadolibre' and c.estado = 'activo'
       and coalesce((c.config ->> 'sincronizar_stock')::boolean, false)
       and p.id_externo is not null and p.estado <> 'cerrada'
       and coalesce(p.datos_externos ->> 'logistica', '') <> 'fulfillment'
       and ($2::bigint[] is null or p.variacion_id = any($2::bigint[]))
       and ($3::bigint is null or p.canal_id = $3)
     order by p.canal_id, p.id`, [org, vars?.length ? vars : null, opts.canal ?? null]);
  // Lo vendido en ML que todavía no entró como pedido se descuenta ya; y con
  // poco stock, lo que le toca a cada publicación en el reparto entre cuentas.
  const variacionesPubs = [...new Set(pubs.map((p) => p.variacion_id))];
  const enCamino = await enCaminoDe(org, variacionesPubs);
  for (const p of pubs) p.disponible -= enCamino.get(p.variacion_id) ?? 0;
  const reparto = await repartoDe(org, variacionesPubs, enCamino);
  for (const p of pubs) p.asignado = reparto.get(p.id) ?? null;
  const cuentas = new Map<number, CuentaMl | null>();
  const cambios: CambioMl[] = [];
  for (const p of pubs) {
    if (!cuentas.has(p.canal_id)) cuentas.set(p.canal_id, await cuentaDelCanal(org, p.canal_id));
    const cuenta = cuentas.get(p.canal_id);
    if (!cuenta || cuenta.estado !== "activa") continue;
    res.revisadas++;
    const c = cambioDeStock(p);
    if (!c) continue;
    if (c.que === "pausa") res.pausadas++; else if (c.que === "reactivar") res.reactivadas++; else res.cantidades++;
    const { que: _que, ...cambio } = c;
    cambios.push(cambio);
  }
  if (cambios.length) {
    try {
      const r = await encolar(org, cambios, { origen: opts.origen ?? "automatico" });
      res.encoladas = r.encoladas + r.reemplazadas;
    } catch (e) {
      res.errores.push((e as Error).message);
    }
  }
  return res;
}

/** Las variaciones con eventos de stock sin procesar (los emite mover_stock
 *  al cruzar el umbral): se marcan como procesados por 'meli'. */
export async function variacionesConEventos(org: string): Promise<number[]> {
  const r = await consulta<{ variacion_id: number }>(`
    with ev as (
      update evento set procesado_ts = now(), procesado_por = 'meli'
       where organizacion_id = $1 and tipo = 'stock_bajo_umbral' and procesado_ts is null
         and (payload ->> 'canal_id')::bigint in (select id from canal where organizacion_id = $1 and tipo = 'mercadolibre')
      returning (payload ->> 'variacion_id')::int variacion_id)
    select distinct variacion_id from ev`, [org]);
  return r.map((x) => x.variacion_id);
}

/** ¿La organización tiene algún canal de ML sincronizando stock? */
export async function haySincronizacion(org: string): Promise<boolean> {
  return !!(await una("select 1 from canal where organizacion_id = $1 and tipo = 'mercadolibre' and coalesce((config ->> 'sincronizar_stock')::boolean, false) limit 1", [org]));
}

export type ResultadoCambios = {
  variaciones: number;
  /** Por organización: lo que encoló para ML (si sincroniza) o el error. */
  organizaciones: Record<string, ResultadoStock | { error: string } | { sinSincronizacion: true }>;
  /** Canales de tienda web cuya copia del catálogo hay que invalidar. */
  tiendas: number[];
};

/** Procesa los cambios de stock anotados en `stock_cambio_pendiente` (ver el
 *  mecanismo completo en db/stock.sql): los toma (los que otra transacción
 *  tiene tomados se saltean; esa transacción avisa al confirmar), encola en
 *  ML la cantidad nueva de cada publicación vinculada —pausa con prioridad
 *  máxima al llegar al umbral, reactiva lo que pausó Laucen— y devuelve las
 *  tiendas a invalidar. Si algo falla, las variaciones vuelven a quedar
 *  pendientes. La llaman /api/erp/stock (al instante, por pg_net) y
 *  /api/erp/tareas (red de seguridad). */
export async function procesarCambiosStock(org?: string): Promise<ResultadoCambios> {
  const filas = await consulta<{ organizacion_id: string; variacion_id: number }>(`
    delete from stock_cambio_pendiente
     where (organizacion_id, variacion_id) in (
       select organizacion_id, variacion_id from stock_cambio_pendiente
        where $1::text is null or organizacion_id = $1
        for update skip locked)
    returning organizacion_id, variacion_id::int`, [org ?? null]);
  const res: ResultadoCambios = { variaciones: filas.length, organizaciones: {}, tiendas: [] };
  if (!filas.length) return res;
  const porOrg = new Map<string, number[]>();
  for (const f of filas) porOrg.set(f.organizacion_id, [...(porOrg.get(f.organizacion_id) ?? []), f.variacion_id]);
  for (const [o, vars] of porOrg) {
    try {
      res.organizaciones[o] = (await haySincronizacion(o)) ? await sincronizarStockMl(o, vars) : { sinSincronizacion: true };
    } catch (e) {
      res.organizaciones[o] = { error: e instanceof Error ? e.message : String(e) };
      // Que no se pierdan: vuelven a la tabla sin avisar de nuevo (las
      // levanta 'erp-tareas' al minuto: si no, un error que se repite haría
      // un ida y vuelta sin fin con pg_net).
      await enTransaccion(async (c) => {
        await c.query("select set_config('laucen.stock_avisado', 'si', true)");
        await c.query(`insert into stock_cambio_pendiente (organizacion_id, variacion_id, creado_ts)
                       select $1, unnest($2::bigint[]), now() - interval '1 minute' on conflict do nothing`, [o, vars]);
      }).catch(() => {});
    }
  }
  const tiendas = await consulta<{ id: number }>(
    "select id::int from canal where organizacion_id = any($1::text[]) and tipo = 'web_minorista' and estado <> 'archivado'", [[...porOrg.keys()]]);
  res.tiendas = tiendas.map((t) => t.id);
  return res;
}

// ── Ventas en camino ─────────────────────────────────────
// ML avisa que cambió una publicación (aviso "items") unos segundos antes que
// la orden (aviso "orders"): con el SKU00537, 14 s. Si en ese aviso subieron
// los vendidos de la publicación, la venta ya pasó aunque la orden no haya
// entrado: se anota (ml_venta_en_camino, db/mercadolibre.sql) y se revisa el
// stock de las demás cuentas ya, descontándola. Cuando la orden entra como
// pedido (reserva el stock), deja de contarse; lo que no llegue a entrar se
// olvida a los 30 minutos (para entonces el barrido ya trajo la orden).

/** Anota lo que vendió un item según ML (antes de guardarlo) y devuelve las
 *  variaciones de Laucen que tuvieron ventas nuevas. */
export async function anotarVentasEnCamino(org: string, canal: number, item: string, filas: { variation_id: string; vendidos: number | null }[]): Promise<number[]> {
  const vars = new Set<number>();
  for (const f of filas) {
    if (f.vendidos == null) continue;
    // La comparación y la anotación van juntas en la base (ml_anotar_vendidos):
    // dos avisos del mismo item a la vez no cuentan dos veces la misma venta.
    const r = await una<{ v: number | null }>("select ml_anotar_vendidos($1, $2, $3, $4, $5)::int v", [org, canal, item, f.variation_id, f.vendidos]);
    if (r?.v) vars.add(r.v);
  }
  return [...vars];
}

/** Lo vendido en ML que todavía no entró como pedido, por variación: por cada
 *  item, lo que subieron sus vendidos en los últimos 30 minutos menos lo que
 *  entró como pedido desde la lectura anterior (si da negativo, 0). */
export async function enCaminoDe(org: string, variaciones: number[]): Promise<Map<number, number>> {
  if (!variaciones.length) return new Map();
  const filas = await consulta<{ variacion_id: number; n: number }>(`
    with ev as (
      select canal_id, item_id, variation_id, variacion_id, sum(vendidas) vendidas, min(desde_ts) desde
        from ml_venta_en_camino
       where organizacion_id = $1 and variacion_id = any($2::bigint[]) and creado_ts > now() - interval '30 minutes'
       group by 1, 2, 3, 4)
    select ev.variacion_id::int, sum(greatest(0, ev.vendidas - coalesce((
             select sum(l.cantidad) from pedido pe join pedido_linea l on l.pedido_id = pe.id
              where pe.organizacion_id = $1 and pe.canal_id = ev.canal_id and pe.creado_ts > ev.desde
                and l.datos_externos -> 'ml' ->> 'item_id' = ev.item_id
                and coalesce(l.datos_externos -> 'ml' ->> 'variation_id', '') = ev.variation_id), 0)))::int n
      from ev group by 1`, [org, variaciones]);
  return new Map(filas.filter((f) => f.n > 0).map((f) => [f.variacion_id, f.n]));
}
