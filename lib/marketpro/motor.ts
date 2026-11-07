// El motor que baja Market Pro (Fer, 5/11). La API contesta una consulta por vez por llave y de a 100 filas, así que
// todo pasa por una cola (mpro_descarga) que trabaja una sola vuelta a la vez por organización (turno en
// mpro_llave.motor_hasta), unos 4 minutos por vuelta; al terminar se vuelve a llamar sola y, si se corta, la base la
// relanza cada 2 minutos (db/marketpro.sql).
//
// El plan, solo, al cargar la llave:
//   1. el árbol de categorías del país;
//   2. probar qué categorías ve la llave: las de primer nivel y, de las que tienen datos, sus hijas (segundo nivel):
//      cada una con datos queda «seguida»;
//   3. por cada seguida: cuántas publicaciones hubo cada mes (con y sin ventas), las filas de cada mes desde octubre de
//      2023 (sólo las que vendieron; los atributos, sólo del último mes cerrado), del más nuevo al más viejo, y las
//      filas por día de los últimos 30 días; después, el resto de los días hasta octubre de 2025.

import { consulta, una } from "@/lib/erp/base";
import { urlPanel } from "@/lib/tienda/dominios";
import { ErrorMarketPro, FILAS_POR_PEDIDO, pedirMarketPro, type CategoriaApi, type ItemApi, type Pagina } from "./api";

export const PRIMER_MES = "202310"; // desde cuándo hay datos mensuales
export const PRIMER_DIA = "2025-10-01"; // desde cuándo hay datos diarios
const SEGUNDOS_POR_VUELTA = 170; // + el último pedido (Market Pro a veces tarda hasta ~100 s): entra en los 5 minutos de la ruta
// Tandas cortas: Market Pro tarda más cuanto más adentro de una consulta se pagina (medido 5/11: 3,5 s por página al
// principio, 11 s pasadas las 130.000 filas). Jardín vende ~10.000 publicaciones por día: 3 días son ~30.000 filas.
const DIAS_POR_TANDA = 3;

type Descarga = {
  id: number; tipo: "categorias" | "probar" | "conteo" | "mes" | "dia"; category_id: number | null; mes: string | null;
  desde: string | null; hasta: string | null; filtros: Record<string, string | number>; atributos: boolean; desplazamiento: number; intentos: number;
};

// ---- Fechas (hora argentina) ----

const hoyAr = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const aaaamm = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Los meses con datos, del más nuevo (el que corre) al más viejo. */
export function mesesDisponibles(): string[] {
  const h = hoyAr();
  const out: string[] = [];
  for (let d = new Date(h.getFullYear(), h.getMonth(), 1); aaaamm(d) >= PRIMER_MES; d.setMonth(d.getMonth() - 1)) out.push(aaaamm(d));
  return out;
}

/** El último mes cerrado (YYYYMM). */
export const ultimoMesCerrado = () => mesesDisponibles()[1];

// ---- Plan ----

async function encolar(org: string, d: { clave: string; tipo: Descarga["tipo"]; category_id?: number | null; mes?: string | null; desde?: string | null;
  hasta?: string | null; filtros?: Record<string, unknown>; atributos?: boolean; prioridad: number }): Promise<void> {
  await consulta(`insert into mpro_descarga (organizacion_id, clave, tipo, category_id, mes, desde, hasta, filtros, atributos, prioridad)
                  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict (organizacion_id, clave) do nothing`,
    [org, d.clave, d.tipo, d.category_id ?? null, d.mes ?? null, d.desde ?? null, d.hasta ?? null, JSON.stringify(d.filtros ?? {}), d.atributos ?? false, d.prioridad]);
}

/** Lo primero al cargar la llave: el árbol (si no está o tiene más de 30 días) y, después, probar las categorías. */
export async function planInicial(org: string): Promise<void> {
  const arbol = await una<{ n: number; viejo: boolean }>("select count(*)::int n, coalesce(min(leida_ts) < now() - interval '30 days', true) viejo from mpro_categoria where pais = 'ar'");
  if (!arbol?.n || arbol.viejo) await encolar(org, { clave: `categorias:${iso(hoyAr())}`, tipo: "categorias", prioridad: 0 });
  else await encolarPruebas(org);
}

/** Probar las de primer nivel (las hijas, cuando una tenga datos). Si ya hay seguidas, sólo vuelve a planificarlas. */
async function encolarPruebas(org: string): Promise<void> {
  const seguidas = await consulta<{ category_id: number }>("select category_id from mpro_seguida where organizacion_id = $1 and habilitada", [org]);
  if (seguidas.length) {
    for (const s of seguidas) await planificarCategoria(org, s.category_id);
    return;
  }
  const raices = await consulta<{ category_id: number }>("select category_id from mpro_categoria where pais = 'ar' and nivel = 1 order by category_id");
  for (const r of raices) await encolar(org, { clave: `probar:${r.category_id}`, tipo: "probar", category_id: r.category_id, prioridad: 1 });
}

/** Todo lo de una categoría seguida. Lo ya bajado no se repite (la clave); el mes que corre se vuelve a bajar cada día. */
export async function planificarCategoria(org: string, cat: number): Promise<void> {
  const meses = mesesDisponibles();
  const hoy = iso(hoyAr());
  for (const [i, mes] of meses.entries()) {
    const corre = i === 0;
    // El mes que corre se rehace cada día: lo de días anteriores que no llegó a bajar, se descarta.
    if (corre) await consulta("delete from mpro_descarga where organizacion_id = $1 and estado = 'pendiente' and (clave like $2 or clave like $3)",
      [org, `mes:${cat}:${mes}:%`, `conteo:${cat}:${mes}:%`]);
    await encolar(org, { clave: `conteo:${cat}:${mes}${corre ? `:${hoy}` : ""}`, tipo: "conteo", category_id: cat, mes, prioridad: 5 });
    await encolar(org, { clave: `mes:${cat}:${mes}${corre ? `:${hoy}` : ""}`, tipo: "mes", category_id: cat, mes, filtros: { min_sold_quantity: 1 },
      atributos: !corre, prioridad: 10 + i });
    // Las publicaciones que ese mes no vendieron nada (Fer, 5/11: también se bajan, sin atributos; son pocas).
    if (!corre) await encolar(org, { clave: `mes0:${cat}:${mes}`, tipo: "mes", category_id: cat, mes, filtros: { max_sold_quantity: 0 }, prioridad: 50 });
  }
  // Atributos de todos los meses cerrados (Fer, 5/11): una tanda ya encolada sin ellos los suma desde la página en que esté.
  await consulta(`update mpro_descarga set atributos = true where organizacion_id = $1 and category_id = $2 and tipo = 'mes' and not atributos
                    and estado in ('pendiente', 'corriendo') and clave like 'mes:%' and mes = any($3::text[])`, [org, cat, meses.slice(1)]);
  // Por día, de a 3 días (la API admite menos de 100), todo desde octubre de 2025 (Fer, 5/11: plan de la prueba, opción 1):
  // primero lo que falta de lo más nuevo (de ayer hacia atrás, hasta lo ya pedido) y después lo que falta de lo más viejo
  // (de lo pedido más viejo hacia atrás, hasta octubre de 2025).
  const ayer = hoyAr(); ayer.setDate(ayer.getDate() - 1);
  const ya = await una<{ min: string | null; max: string | null }>(
    "select to_char(min(desde), 'YYYY-MM-DD') min, to_char(max(hasta), 'YYYY-MM-DD') max from mpro_descarga where organizacion_id = $1 and tipo = 'dia' and category_id = $2", [org, cat]);
  const correr = (fecha: string, dias: number) => { const x = new Date(`${fecha}T12:00:00`); x.setDate(x.getDate() + dias); return iso(x); };
  const tramos: { hasta: string; piso: string; primero: number }[] = ya?.max
    ? [{ hasta: iso(ayer), piso: correr(ya.max, 1), primero: 13 }, { hasta: correr(ya.min!, -1), piso: PRIMER_DIA, primero: 60 }]
    : [{ hasta: iso(ayer), piso: PRIMER_DIA, primero: 13 }];
  for (const t of tramos) {
    for (let hasta = t.hasta, n = 0; hasta >= t.piso; n++) {
      const d0 = correr(hasta, -(DIAS_POR_TANDA - 1));
      const d = d0 < t.piso ? t.piso : d0;
      await encolar(org, { clave: `dia:${cat}:${d}:${hasta}`, tipo: "dia", category_id: cat, desde: d, hasta,
        filtros: { min_sold_quantity: 1 }, prioridad: t.primero === 13 && n === 0 ? 13 : 60 + n });
      hasta = correr(d, -1);
    }
  }
}

/** «Actualizar»: vuelve a planificar todas las seguidas (suma lo del día y el mes que corre). */
export async function actualizarTodo(org: string): Promise<void> {
  const seguidas = await consulta<{ category_id: number }>("select category_id from mpro_seguida where organizacion_id = $1 and habilitada is not false", [org]);
  if (!seguidas.length) return planInicial(org);
  for (const s of seguidas) await planificarCategoria(org, s.category_id);
}

// ---- La vuelta ----

/** Una vuelta del motor: toma el turno, baja hasta ~4 minutos y lo suelta. Si queda algo, se vuelve a llamar. */
export async function vuelta(org: string, token: string): Promise<{ pedidos: number; quedan: boolean; motivo?: string }> {
  const t = await una<{ llave: string; pais: string }>(`
    update mpro_llave set motor_hasta = now() + interval '6 minutes', motor_ts = now()
     where organizacion_id = $1 and token = $2::uuid and not pausado and (motor_hasta is null or motor_hasta < now())
     returning llave, pais`, [org, token]);
  if (!t) return { pedidos: 0, quedan: false, motivo: "otra vuelta trabajando, pausado o token desconocido" };
  const t0 = Date.now();
  let pedidos = 0;
  let fatal = false;
  try {
    while (Date.now() - t0 < SEGUNDOS_POR_VUELTA * 1000) {
      const d = await una<Descarga>(`select id::int, tipo, category_id, mes, to_char(desde, 'YYYY-MM-DD') desde, to_char(hasta, 'YYYY-MM-DD') hasta,
                                            filtros, atributos, desplazamiento, intentos
                                       from mpro_descarga where organizacion_id = $1 and estado in ('pendiente', 'corriendo')
                                      order by prioridad, id limit 1`, [org]);
      if (!d) break;
      await consulta("update mpro_descarga set estado = 'corriendo', empezada_ts = coalesce(empezada_ts, now()) where id = $1", [d.id]);
      try {
        pedidos += await paso(org, t.llave, t.pais, d);
        await consulta("update mpro_llave set motor_ts = now(), ultimo_error = null where organizacion_id = $1", [org]);
      } catch (e) {
        if (e instanceof ErrorMarketPro && e.fatal) {
          fatal = true;
          await consulta("update mpro_llave set ultimo_error = $2, ultimo_error_ts = now(), pausado = true where organizacion_id = $1", [org, e.message]);
          break;
        }
        const msj = e instanceof ErrorMarketPro ? e.message : `Error al guardar lo bajado (${String(e instanceof Error ? e.message : e).slice(0, 150)}).`;
        if (!(e instanceof ErrorMarketPro)) console.error("[marketpro] paso", d.id, d.tipo, e instanceof Error ? e.message : e);
        // Un 422 no se arregla reintentando; lo demás, hasta 5 veces (en vueltas distintas).
        const final = (e instanceof ErrorMarketPro && e.estado === 422) || d.intentos + 1 >= 5;
        await consulta("update mpro_descarga set intentos = intentos + 1, error = $2, estado = $3 where id = $1", [d.id, msj, final ? "error" : "pendiente"]);
        await consulta("update mpro_llave set ultimo_error = $2, ultimo_error_ts = now() where organizacion_id = $1", [org, msj]);
        if (!final && e instanceof ErrorMarketPro && e.reintentar) break; // la API anda mal: se espera a la próxima vuelta
      }
    }
  } finally {
    await consulta("update mpro_llave set motor_hasta = null where organizacion_id = $1", [org]);
  }
  const quedan = !fatal && !!(await una("select 1 from mpro_descarga where organizacion_id = $1 and estado in ('pendiente', 'corriendo') limit 1", [org]));
  if (quedan) await llamarMotor(org, token);
  return { pedidos, quedan };
}

/** Llama a la ruta del motor sin esperarla (sigue en otra función, con su propio tiempo). */
export async function llamarMotor(org: string, token?: string): Promise<void> {
  const tk = token ?? (await una<{ token: string }>("select token::text from mpro_llave where organizacion_id = $1", [org]))?.token;
  if (!tk) return;
  await fetch(`${urlPanel()}/api/marketpro?org=${encodeURIComponent(org)}&token=${tk}`, { cache: "no-store", signal: AbortSignal.timeout(3000) }).catch(() => {});
}

/** Un pedido a la API (o dos, en el conteo) y lo que se guarda. Devuelve cuántos pedidos hizo. */
async function paso(org: string, llave: string, pais: string, d: Descarga): Promise<number> {
  const terminar = (total: number | null, filas = 0) => consulta(
    "update mpro_descarga set estado = 'terminada', terminada_ts = now(), total = coalesce($2, total), filas = filas + $3, pedidos = pedidos + 1, error = null where id = $1",
    [d.id, total, filas]);

  if (d.tipo === "categorias") {
    const p = await pedirMarketPro<Pagina<CategoriaApi>>(llave, "/categories", { country: pais, limit: FILAS_POR_PEDIDO, offset: d.desplazamiento });
    await guardarCategorias(pais, p.items);
    const fin = p.items.length < FILAS_POR_PEDIDO;
    if (fin) {
      await terminar(p.total, p.items.length);
      await encolarPruebas(org);
    } else {
      await consulta("update mpro_descarga set desplazamiento = desplazamiento + $2, filas = filas + $2, total = $3, pedidos = pedidos + 1 where id = $1", [d.id, p.items.length, p.total]);
    }
    return 1;
  }

  if (d.tipo === "probar") {
    const cat = d.category_id!;
    const p = await pedirMarketPro<Pagina<ItemApi>>(llave, "/reports/monthly-items", { country: pais, month: ultimoMesCerrado(), category_id: cat, limit: 1 });
    await terminar(p.total);
    const c = await una<{ nivel: number; ruta: string }>("select nivel, ruta from mpro_categoria where pais = $1 and category_id = $2", [pais, cat]);
    if (p.total > 0 && (c?.nivel ?? 2) < 2) {
      const hijas = await consulta<{ category_id: number }>("select category_id from mpro_categoria where pais = $1 and padres[array_length(padres, 1)] = $2", [pais, cat]);
      for (const h of hijas) await encolar(org, { clave: `probar:${h.category_id}`, tipo: "probar", category_id: h.category_id, prioridad: 1 });
    } else if (p.total > 0) {
      await consulta(`insert into mpro_seguida (organizacion_id, category_id, ruta, habilitada, publicaciones) values ($1, $2, $3, true, $4)
                      on conflict (organizacion_id, category_id) do update set habilitada = true, publicaciones = excluded.publicaciones, ruta = excluded.ruta`,
        [org, cat, c?.ruta ?? null, p.total]);
      await planificarCategoria(org, cat);
    } else {
      await consulta("update mpro_seguida set habilitada = false, publicaciones = 0 where organizacion_id = $1 and category_id = $2", [org, cat]);
    }
    return 1;
  }

  if (d.tipo === "conteo") {
    const todas = await pedirMarketPro<Pagina<ItemApi>>(llave, "/reports/monthly-items", { country: pais, month: d.mes!, category_id: d.category_id!, limit: 1 });
    const conVentas = await pedirMarketPro<Pagina<ItemApi>>(llave, "/reports/monthly-items", { country: pais, month: d.mes!, category_id: d.category_id!, limit: 1, min_sold_quantity: 1 });
    await consulta(`insert into mpro_conteo (organizacion_id, category_id, mes, publicaciones, con_ventas) values ($1, $2, to_date($3, 'YYYYMM'), $4, $5)
                    on conflict (organizacion_id, category_id, mes) do update set publicaciones = excluded.publicaciones, con_ventas = excluded.con_ventas, ts = now()`,
      [org, d.category_id, d.mes, todas.total, conVentas.total]);
    await terminar(todas.total);
    await consulta("update mpro_descarga set pedidos = pedidos + 1 where id = $1", [d.id]);
    return 2;
  }

  // mes / dia: una página de filas.
  const ruta = d.tipo === "mes" ? "/reports/monthly-items" : "/reports/items";
  const p = await pedirMarketPro<Pagina<ItemApi>>(llave, ruta, {
    country: pais, category_id: d.category_id!, ...(d.tipo === "mes" ? { month: d.mes! } : { date_from: d.desde!, date_to: d.hasta! }),
    ...d.filtros, include_attributes: d.atributos || undefined, limit: FILAS_POR_PEDIDO, offset: d.desplazamiento,
  });
  await guardarItems(org, d.tipo === "mes" ? "m" : "d", p.items, d.atributos);
  if (p.items.length < FILAS_POR_PEDIDO) await terminar(p.total, p.items.length);
  else await consulta("update mpro_descarga set desplazamiento = desplazamiento + $2, filas = filas + $2, total = $3, pedidos = pedidos + 1, error = null where id = $1",
    [d.id, p.items.length, p.total]);
  return 1;
}

// ---- Guardar ----

async function guardarCategorias(pais: string, items: CategoriaApi[]): Promise<void> {
  if (!items.length) return;
  const filas = items.map((c) => {
    const camino = Array.isArray(c.path) ? c.path.map(Number) : typeof c.path === "string" ? c.path.split(/[^\d]+/).filter(Boolean).map(Number) : [];
    const padres = camino.filter((x) => x !== Number(c.category_id));
    return { category_id: Number(c.category_id), nombre: c.name, ruta: c.name_path, padres, hoja: !!c.is_leaf, nivel: (c.name_path ?? "").split(" > ").length };
  });
  await consulta(`insert into mpro_categoria (pais, category_id, nombre, ruta, padres, hoja, nivel)
                  select $1, x.category_id, x.nombre, x.ruta, array(select jsonb_array_elements_text(x.padres)::int), x.hoja, x.nivel
                    from jsonb_to_recordset($2::jsonb) x(category_id int, nombre text, ruta text, padres jsonb, hoja boolean, nivel int)
                  on conflict (pais, category_id) do update set nombre = excluded.nombre, ruta = excluded.ruta, padres = excluded.padres,
                     hoja = excluded.hoja, nivel = excluded.nivel, leida_ts = now()`, [pais, JSON.stringify(filas)]);
}

const MARCAS_GENERICAS = /^(gen[eé]ric[oa]s?|generic|sin marca|otras?|otros|no aplica|n\/?a|-)$/i;
const limpio = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
/** JSON para la base: Postgres no acepta el carácter nulo (\u0000) en texto ni en jsonb, y algún dato de Market Pro lo trae. */
const aJson = (x: unknown) => JSON.stringify(x).replace(/\\u0000/g, "");
const siNo = (v: string | boolean | null | undefined) => (v == null ? null : v === true || /^(yes|si|sí|true|1)$/i.test(String(v)));

/** La clave que junta publicaciones del mismo producto. */
export function claveProducto(it: Pick<ItemApi, "catalog_product_id" | "ean_gtin" | "brand" | "model" | "item_id">): string {
  const cat = limpio(it.catalog_product_id).replace(/^MLA/i, "");
  if (cat && cat !== "-") return `c:${cat}`;
  const ean = limpio(it.ean_gtin).split(/[,;\s]+/)[0];
  if (/^\d{8,14}$/.test(ean)) return `e:${ean}`;
  const marca = limpio(it.brand).toLowerCase();
  const modelo = limpio(it.model).toLowerCase();
  if (marca && modelo && !MARCAS_GENERICAS.test(marca) && !MARCAS_GENERICAS.test(modelo)) return `m:${marca}|${modelo}`;
  return `i:${it.item_id}`;
}

async function guardarItems(org: string, grano: "m" | "d", items: ItemApi[], atributos: boolean): Promise<void> {
  if (!items.length) return;
  const periodo = (it: ItemApi) => (grano === "m" ? `${(it.month ?? "").slice(0, 7)}-01` : (it.day ?? "").slice(0, 10));
  const nulo = (s: string | null | undefined) => { const x = limpio(s); return x && x !== "-" ? x : null; };
  const pubs = items.map((it) => ({
    item_id: it.item_id, cat: it.category_id ? Number(String(it.category_id).replace(/\D/g, "")) || null : null, categoria: nulo(it.category_name),
    titulo: nulo(it.title), marca: nulo(it.brand), modelo: nulo(it.model), ean: nulo(it.ean_gtin), catalogo: nulo(it.catalog_product_id), foto: nulo(it.thumbnail_url),
    vendedor: nulo(it.nickname), alias: nulo(it.alias), reputacion: nulo(it.reputation), provincia: nulo(it.seller_state), ciudad: nulo(it.seller_city), dominio: nulo(it.domain),
    sku: nulo(it.seller_sku), condicion: nulo(it.condition), producto: claveProducto(it), periodo: periodo(it),
  }));
  // Una misma publicación puede venir dos veces en la página (por día): gana la última.
  const unicas = [...new Map(pubs.map((p) => [p.item_id, p])).values()];
  await consulta(`insert into mpro_publicacion (organizacion_id, item_id, cat, categoria, titulo, marca, modelo, ean, catalogo, foto, vendedor, alias, reputacion,
                    provincia, ciudad, dominio, sku, condicion, producto, visto_periodo)
                  select $1, x.item_id, x.cat, x.categoria, x.titulo, x.marca, x.modelo, x.ean, x.catalogo, x.foto, x.vendedor, x.alias, x.reputacion,
                         x.provincia, x.ciudad, x.dominio, x.sku, x.condicion, x.producto, x.periodo
                    from jsonb_to_recordset($2::jsonb) x(item_id text, cat int, categoria text, titulo text, marca text, modelo text, ean text, catalogo text,
                         foto text, vendedor text, alias text, reputacion text, provincia text, ciudad text, dominio text, sku text, condicion text, producto text, periodo date)
                  on conflict (organizacion_id, item_id) do update set cat = excluded.cat, categoria = excluded.categoria, titulo = excluded.titulo,
                     marca = excluded.marca, modelo = excluded.modelo, ean = excluded.ean, catalogo = excluded.catalogo, foto = excluded.foto,
                     vendedor = excluded.vendedor, alias = coalesce(excluded.alias, mpro_publicacion.alias), reputacion = excluded.reputacion, provincia = excluded.provincia, ciudad = excluded.ciudad,
                     dominio = excluded.dominio, sku = excluded.sku, condicion = excluded.condicion, producto = excluded.producto,
                     visto_periodo = excluded.visto_periodo, visto_ts = now()
                   where mpro_publicacion.visto_periodo is null or excluded.visto_periodo >= mpro_publicacion.visto_periodo`,
    [org, aJson(unicas)]);

  const ventas = items.map((it) => ({
    periodo: periodo(it), item_id: it.item_id, vendidas: it.sold_quantity, precio: it.price, gmv: it.gmv, descuento: it.avg_discount, tipo: it.listing_type,
    cuotas: it.installments == null ? null : String(it.installments), envio: it.shipping_mode, envio_tipo: it.shipping_mode_type, envio_gratis: siNo(it.has_free_shipping), catalogo: siNo(it.is_catalog_product),
    dias_activa: it.days_active, visitas_dia: it.avg_daily_visits, conversion: it.conversion_ratio, preguntas_dia: it.avg_daily_questions, fotos: it.pictures_qty,
    visitas_total: it.total_visits, preguntas_total: it.total_questions, ventas_total: it.total_orders, canceladas: it.cancelled_orders, reputacion: it.reputation,
  }));
  const ventasUnicas = [...new Map(ventas.map((v) => [`${v.periodo}|${v.item_id}`, v])).values()];
  await consulta(`insert into mpro_venta (organizacion_id, grano, periodo, item_id, vendidas, precio, gmv, descuento, tipo, cuotas, envio, envio_tipo, envio_gratis, catalogo,
                    dias_activa, visitas_dia, conversion, preguntas_dia, fotos, visitas_total, preguntas_total, ventas_total, canceladas, reputacion)
                  select $1, $2, x.periodo, x.item_id, round(x.vendidas)::int, x.precio, x.gmv, x.descuento, x.tipo, x.cuotas, x.envio, x.envio_tipo, x.envio_gratis, x.catalogo,
                         round(x.dias_activa)::int, x.visitas_dia, x.conversion, x.preguntas_dia, round(x.fotos)::smallint, round(x.visitas_total)::int,
                         round(x.preguntas_total)::int, round(x.ventas_total)::int, round(x.canceladas)::int, x.reputacion
                    from jsonb_to_recordset($3::jsonb) x(periodo date, item_id text, vendidas numeric, precio numeric, gmv numeric, descuento numeric, tipo text,
                         cuotas text, envio text, envio_tipo text, envio_gratis boolean, catalogo boolean, dias_activa numeric, visitas_dia numeric, conversion numeric,
                         preguntas_dia numeric, fotos numeric, visitas_total numeric, preguntas_total numeric, ventas_total numeric, canceladas numeric, reputacion text)
                  on conflict (organizacion_id, grano, periodo, item_id) do update set vendidas = excluded.vendidas, precio = excluded.precio, gmv = excluded.gmv,
                     descuento = excluded.descuento, tipo = excluded.tipo, cuotas = excluded.cuotas, envio = excluded.envio, envio_tipo = excluded.envio_tipo, envio_gratis = excluded.envio_gratis,
                     catalogo = excluded.catalogo, dias_activa = excluded.dias_activa, visitas_dia = excluded.visitas_dia, conversion = excluded.conversion,
                     preguntas_dia = excluded.preguntas_dia, fotos = excluded.fotos, visitas_total = excluded.visitas_total, preguntas_total = excluded.preguntas_total,
                     ventas_total = excluded.ventas_total, canceladas = excluded.canceladas, reputacion = excluded.reputacion`,
    [org, grano, aJson(ventasUnicas)]);

  if (atributos) {
    const attrs = items.filter((it) => it.attributes != null).map((it) => ({ item_id: it.item_id, atributos: typeof it.attributes === "string" ? safeJson(it.attributes) : it.attributes }));
    // Los atributos son un extra: si no se pueden guardar, las ventas quedan igual (y se anota en el log).
    if (attrs.length) await consulta(`insert into mpro_atributos (organizacion_id, item_id, atributos)
                                      select $1, x.item_id, x.atributos from jsonb_to_recordset($2::jsonb) x(item_id text, atributos jsonb)
                                      on conflict (organizacion_id, item_id) do update set atributos = excluded.atributos, ts = now()`, [org, aJson(attrs)])
      .catch((e) => console.error("[marketpro] atributos", e instanceof Error ? e.message : e));
  }
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
