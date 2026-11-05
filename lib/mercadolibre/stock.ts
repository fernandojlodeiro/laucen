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
  /** Preventa (Fer, 5/11; lib/preventa): cómo está hoy en ML (de qué orden y con cuántos días de demora) y, si le toca
   *  estar en preventa, la orden, los días y lo que le toca del cupo. `preventaManual`: el canal no tiene la preventa
   *  automática prendida (Laucen no la pone ni la cambia sola). */
  preventa_orden_id?: number | null; preventa_dias?: number | null;
  preventa?: { ordenId: number; dias: number; cupo: number } | null;
  preventaManual?: boolean;
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
  const c = cambioNormalOPreventa(p);
  return c;
}

/** Preventa en Mercado Libre (Fer, 5/11): sin stock físico y con una orden publicada en ML, la publicación queda activa
 *  con «disponible N días después de la compra» (el término de venta MANUFACTURING_TIME) y su parte del cupo. Cuando
 *  vuelve a haber stock (o se termina la preventa), se le saca la demora y sigue como siempre. Pura. */
function cambioNormalOPreventa(p: Pub): (CambioMl & { que: "pausa" | "reactivar" | "cantidad" }) | null {
  const base = { canalId: p.canal_id, itemId: p.id_externo, variationId: p.variacion_externa, publicacionId: p.id, tipo: "stock" as const };
  const antes = { estado: p.estado, cantidad: p.cantidad_publicada, preventa_dias: p.preventa_dias ?? null };
  const enPreventa = p.preventa_orden_id != null;
  // Un canal sin la preventa automática: la preventa la pone el lote que se manda con el botón (prepararPreventaMl). Ya
  // puesta, acá no se toca mientras siga valiendo; si todavía no se puso, la publicación sigue la regla de siempre.
  if (p.preventa && p.preventa.cupo > 0 && p.preventaManual && enPreventa) return null;
  if (p.preventa && p.preventa.cupo > 0 && !p.preventaManual) {
    const pv = p.preventa;
    if (p.estado === "activa" && p.cantidad_publicada === pv.cupo && p.preventa_orden_id === pv.ordenId && p.preventa_dias === pv.dias) return null;
    const reactiva = p.estado !== "activa";
    return {
      ...base, que: reactiva ? "reactivar" : "cantidad", prioridad: reactiva ? PRIORIDAD.reactivar : PRIORIDAD.normal, antes,
      payload: { cantidad: pv.cupo, estado: "active", preventa: { dias: pv.dias } },
      efecto: { publicacion: { id: p.id, estado: "activa", pausada_por_stock: false, cantidad_publicada: pv.cupo, preventa: { ordenId: pv.ordenId, dias: pv.dias } } },
    };
  }
  if (p.preventa && p.preventa.cupo <= 0 && enPreventa) {
    // Se agotó el cupo de la preventa: se pausa (con la demora puesta, por si se reparte de nuevo).
    if (p.estado !== "activa") return null;
    return {
      ...base, que: "pausa", prioridad: PRIORIDAD.pausa, antes,
      payload: { cantidad: 0, estado: "paused" },
      efecto: { publicacion: { id: p.id, estado: "pausada", pausada_por_stock: true, cantidad_publicada: 0 } },
    };
  }
  const normal = cambioSinPreventa(p);
  if (!enPreventa) return normal;
  // Estaba en preventa y ya no corresponde: además de lo de siempre, se le saca la demora.
  const sacar = { preventa: { dias: null } };
  const efectoSacar = { preventa: { ordenId: null, dias: null } };
  if (normal) {
    return { ...normal, payload: { ...normal.payload, ...sacar }, efecto: { ...normal.efecto, publicacion: { ...normal.efecto!.publicacion!, ...efectoSacar } } };
  }
  return { ...base, que: "cantidad", prioridad: PRIORIDAD.normal, antes, payload: { ...sacar }, efecto: { publicacion: { id: p.id, ...efectoSacar } } };
}

function cambioSinPreventa(p: Pub): (CambioMl & { que: "pausa" | "reactivar" | "cantidad" }) | null {
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
    // Una baja sale antes que cualquier suba o reactivación (Fer, 4/11): cuando el reparto pasa una unidad de una
    // publicación a otra, si la suba saliera primero, por un momento ML mostraría más de lo que hay (sobreventa).
    const baja = p.cantidad_publicada != null && cant < p.cantidad_publicada;
    return {
      ...base, que: "cantidad", prioridad: baja ? PRIORIDAD.pausa : PRIORIDAD.normal, antes,
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
           umbral_pausa_de(p.organizacion_id, p.variacion_id, p.canal_id) umbral, p.preventa_orden_id::int, p.preventa_dias,
           not coalesce((c.config ->> 'preventa_automatica')::boolean, false) "preventaManual"
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
  await marcarPreventa(org, pubs);
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

// ── Preventa en Mercado Libre (Fer, 5/11) ──────────────────

/** A cada publicación que le toca estar en preventa le pone la orden, los días de demora y su parte del cupo: el cupo
 *  de la orden se reparte en partes iguales entre las publicaciones de esa variación en todas las cuentas (lo que
 *  sobra, a las primeras). Sólo publicaciones sin variaciones en ML (la demora es de la publicación entera). */
export async function marcarPreventa(org: string, pubs: Pub[]): Promise<void> {
  const candidatas = pubs.filter((p) => !p.variacion_externa && !p.pausada_manual);
  if (!candidatas.length) return;
  const { ofertasPreventa, diasHasta } = await import("@/lib/preventa");
  // La oferta es por variación (la misma orden en todas las cuentas: ML decide sólo por si hay físico, que es común).
  const porCanal = new Map<number, Pub[]>();
  for (const p of candidatas) porCanal.set(p.canal_id, [...(porCanal.get(p.canal_id) ?? []), p]);
  const ofertas = new Map<number, Awaited<ReturnType<typeof ofertasPreventa>> extends Map<number, infer O> ? O : never>();
  for (const [canal, ps] of porCanal) {
    const of = await ofertasPreventa(org, [...new Set(ps.map((p) => p.variacion_id))], { id: canal, tipo: "ml" });
    for (const [v, o] of of) if (!ofertas.has(v)) ofertas.set(v, o);
  }
  const porVariacion = new Map<number, Pub[]>();
  for (const p of candidatas) if (ofertas.has(p.variacion_id)) porVariacion.set(p.variacion_id, [...(porVariacion.get(p.variacion_id) ?? []), p]);
  for (const [v, ps] of porVariacion) {
    const o = ofertas.get(v)!;
    const dias = diasHasta(o.llegada);
    const base = Math.floor(o.cupo / ps.length), resto = o.cupo - base * ps.length;
    ps.sort((a, b) => a.id - b.id).forEach((p, i) => { p.preventa = { ordenId: o.ordenId, dias, cupo: base + (i < resto ? 1 : 0) }; });
  }
}

/** «Preparar para Mercado Libre» de una orden (canales sin la preventa automática): arma un lote con el pase a preventa
 *  de las publicaciones sin stock de los productos de la orden, para que Fer lo mande con el botón de la cola
 *  (Configuración › Cola de Mercado Libre). Devuelve los lotes armados por cuenta. */
export async function prepararPreventaMl(org: string, ordenId: number, usuario: string): Promise<{ canal: string; loteId: number; cambios: number }[]> {
  const vars = await consulta<{ v: number }>(`
    select distinct coalesce(k.variacion_kit_id, l.variacion_id)::int v from orden_compra o join compra_invoice_linea l on l.invoice_id = o.invoice_id
      left join kit_componente k on k.variacion_componente_id = l.variacion_id where o.id = $1 and o.organizacion_id = $2 and l.variacion_id is not null
    union select l.variacion_id::int from orden_compra o join compra_invoice_linea l on l.invoice_id = o.invoice_id where o.id = $1 and l.variacion_id is not null`, [ordenId, org]);
  if (!vars.length) return [];
  const pubs = await consulta<Pub & { canal: string }>(`
    select p.id::int, p.canal_id::int, c.nombre canal, p.variacion_id::int, p.id_externo, p.variacion_externa, p.estado, p.pausada_por_stock, p.pausada_manual,
           p.cantidad_publicada, stock_disponible_canal(p.organizacion_id, p.variacion_id, p.canal_id) disponible,
           umbral_pausa_de(p.organizacion_id, p.variacion_id, p.canal_id) umbral, p.preventa_orden_id::int, p.preventa_dias
      from publicacion p join canal c on c.id = p.canal_id
     where p.organizacion_id = $1 and c.tipo = 'mercadolibre' and c.estado = 'activo' and not coalesce((c.config ->> 'preventa_automatica')::boolean, false)
       and p.id_externo is not null and p.estado <> 'cerrada' and coalesce(p.datos_externos ->> 'logistica', '') <> 'fulfillment'
       and p.variacion_id = any($2::bigint[])`, [org, vars.map((x) => x.v)]);
  await marcarPreventa(org, pubs);
  const salida: { canal: string; loteId: number; cambios: number }[] = [];
  const porCanal = new Map<number, CambioMl[]>();
  const nombres = new Map<number, string>();
  for (const p of pubs) {
    if (!p.preventa || p.preventa.ordenId !== ordenId) continue;
    const c = cambioDeStock({ ...p, preventaManual: false });
    if (!c) continue;
    const { que: _q, ...cambio } = c;
    porCanal.set(p.canal_id, [...(porCanal.get(p.canal_id) ?? []), cambio]);
    nombres.set(p.canal_id, p.canal);
  }
  const { encolarLoteConBoton } = await import("@/lib/mercadolibre/cola");
  for (const [canal, cambios] of porCanal) {
    const o = await una<{ codigo: string }>("select codigo from orden_compra where id = $1", [ordenId]);
    const loteId = await encolarLoteConBoton(org, canal, cambios, `Preventa de la orden ${o?.codigo ?? ordenId}: ${cambios.length} publicaciones sin stock pasan a entrega diferida`, usuario);
    salida.push({ canal: nombres.get(canal) ?? String(canal), loteId, cambios: cambios.length });
  }
  return salida;
}
