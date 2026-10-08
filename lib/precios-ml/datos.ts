// Precios en Mercado Libre: lo que el motor (motor.ts) necesita de la base,
// por canal. La Clásica sale de precio_de (la única función de precios) con
// la lista del canal; las comisiones, de lo que releva Costos ML todos los
// días (ml_costos_comisiones_vigente); lo que ML tiene hoy, del espejo
// (meli_item) y de las lecturas de precio para ganar y campañas.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import {
  CON_PRECIO, campanasBajoPiso, cadenaFamilias, heredar, textoOrigen, PLANES, type Origen, comisionesDe, comisionGeneral, normalizarEscalones, planDePublicacion, proponer,
  type Campana, type Comisiones, type EntradaVariacion, type FilaComision, type FilaVolumen, type Propuesta, type ReglasCanal,
  type ReglasPlan, type ReglaTachado, type PubMl, type PlanOClasica,
} from "@/lib/precios-ml/motor";
import { gruposPlanes, barreraPlanes, reglasDeGrupos, ajustesDeGrupos } from "@/lib/precios-ml/grupos";
import { campanaPropiaDe } from "@/lib/precios-ml/campana-propia";

export type CanalMl = {
  id: number; nombre: string; listaId: number | null; lista: string | null;
  sincronizarPrecios: boolean; leerPrecioGanar: boolean; reglaStock: boolean;
};

const bool = (v: unknown, defecto: boolean) => (v === true || v === "true" ? true : v === false || v === "false" ? false : defecto);

/** Los canales de Mercado Libre de la organización, con la lista de su Clásica
 *  (la del canal; si no tiene, la lista "Clásicas") y sus interruptores. */
export async function canalesMl(org: string): Promise<CanalMl[]> {
  const filas = await consulta<{ id: number; nombre: string; lista_id: number | null; lista: string | null; config: Record<string, unknown> }>(`
    select c.id::int, c.nombre, coalesce(c.lista_precios_id, l2.id)::int lista_id, coalesce(l1.nombre, l2.nombre) lista, c.config
      from canal c
      left join lista_precios l1 on l1.id = c.lista_precios_id
      left join lateral (select id, nombre from lista_precios where organizacion_id = c.organizacion_id and lower(nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') order by id limit 1) l2 on true
     where c.organizacion_id = $1 and c.tipo = 'mercadolibre' and c.estado <> 'archivado'
     order by c.nombre`, [org]);
  return filas.map((f) => ({
    id: f.id, nombre: f.nombre, listaId: f.lista_id, lista: f.lista,
    sincronizarPrecios: bool(f.config?.sincronizar_precios, false),
    leerPrecioGanar: bool(f.config?.leer_precio_ganar, true),
    reglaStock: bool(f.config?.volumen_regla_stock, true),
  }));
}

export async function canalMl(org: string, canal: number): Promise<CanalMl> {
  const c = (await canalesMl(org)).find((x) => x.id === canal);
  if (!c) throw new ErrorErp("Ese canal de Mercado Libre no existe.");
  return c;
}

/** Las reglas de un canal (todas las filas de todos los niveles). */
export async function reglasCanal(org: string, canal: CanalMl): Promise<ReglasCanal> {
  const [tachado, planes, volumen] = await Promise.all([
    consulta<ReglaTachado>(`select nivel, familia_id::int, producto_id::int, tachado_pct::float8, ajuste_pct::float8 from ml_regla_precio where organizacion_id = $1 and canal_id = $2`, [org, canal.id]),
    // De cada cuenta sólo «¿gana?» (ajuste_pct); qué planes, desde dónde, el margen y las cuotas que
    // ve el comprador salen de los grupos de Precios en ML › Planes de cuotas (Fer, 8/10).
    consulta<ReglasPlan>(`select plan, nivel, familia_id::int, producto_id::int, null::boolean activo, null::float8 precio_minimo, null::float8 margen_pct,
                                 null::int cuotas_visibles, ajuste_pct::float8
                            from ml_plan_config where organizacion_id = $1 and canal_id = $2 and ajuste_pct is not null`, [org, canal.id]),
    consulta<FilaVolumen>(`select nivel, familia_id::int, producto_id::int, desde_precio::float8, hasta_precio::float8, escalones, sin_descuento
                             from ml_volumen_escala where organizacion_id = $1 and canal_id = $2 order by desde_precio`, [org, canal.id]),
  ]);
  const [grupos, barrera, canales] = await Promise.all([gruposPlanes(org), barreraPlanes(), canalesMl(org)]);
  planes.push(...reglasDeGrupos(grupos, barrera));
  return { tachado, planes, volumen: volumen.map((v) => ({ ...v, escalones: normalizarEscalones(v.escalones) })), reglaStock: canal.reglaStock,
    ajusteGrupo: ajustesDeGrupos(grupos, canal.id, canales.map((c) => c.id)), campanaPropia: await campanaPropiaDe(org, canal.id) };
}

/** Las comisiones vigentes por categoría de ML y el promedio (para las que
 *  no están relevadas). Si Costos ML todavía no corrió, los valores de referencia. */
export async function comisionesMl(): Promise<{ porCategoria: Map<string, FilaComision>; general: Comisiones }> {
  const hay = await una<{ ok: boolean }>("select to_regclass('public.ml_costos_comisiones_vigente') is not null ok");
  if (!hay?.ok) return { porCategoria: new Map(), general: comisionGeneral([]) };
  const filas = await consulta<FilaComision & { categoria_id: string }>(`
    select categoria_id, clasica_pct::float8, premium_pct::float8, premium_3x_pct::float8, premium_9x_pct::float8, premium_12x_pct::float8
      from ml_costos_comisiones_vigente`);
  return { porCategoria: new Map(filas.map((f) => [f.categoria_id, f])), general: comisionGeneral(filas) };
}

export async function familiasDe(org: string) {
  const filas = await consulta<{ id: number; padre_id: number | null; nombre: string; ml_categoria: string | null }>(
    "select id::int, padre_id::int, nombre, ml_categoria from familia where organizacion_id = $1", [org]);
  return {
    filas,
    padres: new Map(filas.map((f) => [f.id, f.padre_id])),
    nombre: new Map(filas.map((f) => [f.id, f.nombre])),
    categoria: new Map(filas.map((f) => [f.id, f.ml_categoria])),
  };
}

type FilaPub = {
  pub: number; variacion_id: number; producto_id: number; sku: string; titulo: string; familia_id: number | null;
  item: string; var: string | null; estado: string; tipo: string | null; categoria: string | null;
  precio_canal: number | null; precio_mi: number | null; original: number | null; tags: unknown; cat_prod: string | null;
  user_product: string | null; catalogo: boolean; clasica: number | null; stock: number | null;
  ptw: number | null; ptw_estado: string | null; ptw_ts: Date | null;
};

/** Lo que se muestra de cada variación además de la propuesta. */
export type InfoVariacion = { variacionId: number; productoId: number; sku: string; titulo: string; familiaId: number | null; comisionEstimada: boolean; stock: number | null };

export type Calculo = { canal: CanalMl; propuestas: { info: InfoVariacion; propuesta: Propuesta }[]; familias: Awaited<ReturnType<typeof familiasDe>> };

/** Calcula la propuesta de todas las variaciones publicadas en un canal (o
 *  sólo de `variaciones`). Nada se manda: es lo que muestra la vista previa y
 *  lo que arma los lotes. */
export async function calcularCanal(org: string, canalId: number, opts: { variaciones?: number[] | null; fecha?: string } = {}): Promise<Calculo> {
  const canal = await canalMl(org, canalId);
  const [reglas, com, familias] = await Promise.all([reglasCanal(org, canal), comisionesMl(), familiasDe(org)]);
  const filas = await consulta<FilaPub>(`
    select p.id::int pub, p.variacion_id::int, v.producto_id::int, v.sku, titulo_variacion(v.id) titulo, pr.familia_id::int,
           p.id_externo item, p.variacion_externa var, p.estado, coalesce(p.tipo_publicacion, mi.tipo) tipo,
           coalesce(p.categoria_externa, mi.categoria) categoria, p.precio_canal::float8, mi.precio::float8 precio_mi,
           (mi.datos_externos -> 'ml' ->> 'original_price')::float8 original, mi.datos_externos -> 'ml' -> 'tags' tags,
           mi.datos_externos -> 'ml' ->> 'catalog_product_id' cat_prod,
           coalesce(p.datos_externos ->> 'user_product_id', mi.datos_externos -> 'ml' ->> 'user_product_id') user_product,
           coalesce((p.datos_externos ->> 'catalogo')::boolean, (mi.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false) catalogo,
           pd.lista_ars::float8 clasica, stock_disponible_canal(p.organizacion_id, p.variacion_id, p.canal_id) stock,
           w.precio::float8 ptw, w.estado ptw_estado, w.leido_ts ptw_ts
      from publicacion p
      join variacion v on v.id = p.variacion_id
      join producto pr on pr.id = v.producto_id
      left join meli_item mi on mi.canal_id = p.canal_id and mi.item_id = p.id_externo and mi.variation_id = coalesce(p.variacion_externa, '')
      left join lateral (select lista_ars from precio_de(p.organizacion_id, p.variacion_id, $3::bigint, $5::date)) pd on $3::bigint is not null
      left join ml_price_to_win w on w.canal_id = p.canal_id and w.item_id = p.id_externo and w.error is null
     where p.organizacion_id = $1 and p.canal_id = $2 and p.id_externo is not null and p.estado <> 'cerrada'
       and ($4::bigint[] is null or p.variacion_id = any($4::bigint[]))
     order by v.sku, p.id`,
    [org, canal.id, canal.listaId, opts.variaciones?.length ? opts.variaciones : null, opts.fecha ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })]);
  const items = [...new Set(filas.map((f) => f.item))];
  const [promos, volumen] = items.length ? await Promise.all([
    consulta<{ item_id: string; promocion_id: string; tipo: string; estado: string | null; nombre: string | null; precio: number | null; min_precio: number | null; max_precio: number | null;
               precio_original: number | null; pct_vendedor: number | null }>(`
      select item_id, promocion_id, tipo, estado, nombre, precio::float8, min_precio::float8, max_precio::float8, precio_original::float8, pct_vendedor::float8
        from ml_promo_item where canal_id = $1 and item_id = any($2::text[]) and (hasta is null or hasta > now())`, [canal.id, items]),
    consulta<{ item_id: string; variation_id: string; payload: { escalones?: { cantidad: number; precio: number }[] } }>(`
      select distinct on (item_id, variation_id) item_id, variation_id, payload from ml_cola
       where canal_id = $1 and tipo = 'descuento' and estado = 'ok' and item_id = any($2::text[])
       order by item_id, variation_id, id desc`, [canal.id, items]),
  ]) : [[], []];
  const campanas = new Map<string, Campana[]>();
  for (const p of promos) {
    campanas.set(p.item_id, [...(campanas.get(p.item_id) ?? []), { id: p.promocion_id, tipo: p.tipo, estado: p.estado, nombre: p.nombre, precio: p.precio, min: p.min_precio, max: p.max_precio,
      original: p.precio_original, pctVendedor: p.pct_vendedor }]);
  }
  const volMl = new Map(volumen.map((v) => [`${v.item_id}|${v.variation_id}`, v.payload?.escalones ?? null]));

  // Las pausadas no se muestran ni se tocan (Fer, 8/10): sólo cuentan para no crear de nuevo un plan que ya
  // tiene publicación. Una variación sin ninguna publicación activa en la cuenta no se calcula.
  const porVariacion = new Map<number, FilaPub[]>();
  const pausados = new Map<number, Set<string>>();
  for (const f of filas) {
    if (f.estado === "activa") porVariacion.set(f.variacion_id, [...(porVariacion.get(f.variacion_id) ?? []), f]);
    else pausados.set(f.variacion_id, new Set([...(pausados.get(f.variacion_id) ?? []), planDePublicacion(f.tipo, f.tags) ?? ""]));
  }
  const propuestas: Calculo["propuestas"] = [];
  for (const [variacionId, fs] of porVariacion) {
    const f0 = fs[0];
    const cadena = cadenaFamilias(f0.familia_id, familias.padres);
    // La categoría de ML para la comisión: la de la publicación; si no, la de la familia (o una de arriba).
    const categoria = fs.find((f) => f.categoria)?.categoria ?? cadena.map((x) => familias.categoria.get(x)).find(Boolean) ?? null;
    const c = comisionesDe(categoria ? com.porCategoria.get(categoria) : null, com.general);
    const pubs: PubMl[] = fs.map((f) => ({
      publicacionId: f.pub, itemId: f.item, variationId: f.var, plan: planDePublicacion(f.tipo, f.tags), estado: f.estado,
      // Lo que paga hoy el comprador: si está adentro de una campaña, el precio de la campaña (meli_item.precio
      // es el de lista). Sin esto, una publicación en campaña parecía "a su precio" y la sacaba (7/10).
      precioListaMl: f.original ?? f.precio_mi ?? f.precio_canal,
      precioVentaMl: ventaHoy(f.precio_mi ?? f.precio_canal, campanas.get(f.item) ?? []),
      priceToWin: f.ptw, estadoPtw: f.ptw_estado, campanas: campanas.get(f.item) ?? [],
      volumenMl: volMl.get(`${f.item}|${f.var ?? ""}`) ?? null,
      userProductId: f.user_product, catalogProductId: f.cat_prod, catalogo: f.catalogo,
    }));
    const entrada: EntradaVariacion = {
      variacionId, productoId: f0.producto_id, lugar: { productoId: f0.producto_id, familias: cadena },
      clasica: f0.clasica, stock: f0.stock, comisiones: c.valores, comisionEstimada: c.estimada, pubs,
      planesPausados: [...(pausados.get(variacionId) ?? [])].filter(Boolean) as PlanOClasica[],
    };
    propuestas.push({
      info: { variacionId, productoId: f0.producto_id, sku: f0.sku, titulo: f0.titulo, familiaId: f0.familia_id, comisionEstimada: c.estimada, stock: f0.stock },
      propuesta: proponer(entrada, reglas),
    });
  }
  return { canal, propuestas, familias };
}

/** Lo que paga hoy el comprador por las ofertas propias: el menor precio de las campañas en curso en las
 *  que el precio lo pone el vendedor (oferta del día, campaña del vendedor), o el de la publicación. Las que
 *  arma ML («Potencia tus ventas» y otras con descuento que pone ML) no cuentan: si contaran, Laucen bajaría
 *  la oferta propia hasta ese precio y pagaría solo el descuento que ML compartía (7/10). */
export function ventaHoy(precio: number | null, campanas: Campana[]): number | null {
  const v = Math.min(...campanas.filter((c) => (c.estado === "started" || c.estado === "pending") && CON_PRECIO.includes(c.tipo) && c.precio != null && c.precio > 0).map((c) => Number(c.precio)),
    precio ?? Infinity);
  return Number.isFinite(v) ? v : null;
}

// ── Guardar reglas ──────────────────────────────────────────

export type Donde = { nivel: "general" | "familia" | "producto"; familiaId?: number | null; productoId?: number | null };

async function validarDonde(org: string, d: Donde): Promise<{ familia: number | null; producto: number | null }> {
  if (d.nivel === "general") return { familia: null, producto: null };
  if (d.nivel === "familia") {
    if (!d.familiaId || !(await una("select 1 from familia where id = $1 and organizacion_id = $2", [d.familiaId, org]))) throw new ErrorErp("Elegí una categoría.");
    return { familia: d.familiaId, producto: null };
  }
  if (!d.productoId || !(await una("select 1 from producto where id = $1 and organizacion_id = $2", [d.productoId, org]))) throw new ErrorErp("Elegí un producto.");
  return { familia: null, producto: d.productoId };
}

/** Graba el % de tachado de un nivel (null = hereda; en general, 0) y, si se pasa,
 *  el ajuste de la Clásica en esta cuenta («¿quién gana?»: 0 = gana, +X % = no gana;
 *  null = hereda). `ajuste` undefined = no lo toca. */
export async function guardarTachado(org: string, canal: number, d: Donde, pct: number | null, ajuste?: number | null): Promise<void> {
  await canalMl(org, canal);
  if (pct != null && !(pct >= 0 && pct <= 300)) throw new ErrorErp("El tachado tiene que ser un % entre 0 y 300.");
  if (ajuste != null && !(ajuste >= -50 && ajuste <= 100)) throw new ErrorErp("El «si no gana, +%» tiene que estar entre -50 % y 100 % (0 = gana).");
  const { familia, producto } = await validarDonde(org, d);
  await consulta(`
    insert into ml_regla_precio (organizacion_id, canal_id, nivel, familia_id, producto_id, tachado_pct, ajuste_pct) values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (canal_id, nivel, coalesce(familia_id, 0), coalesce(producto_id, 0)) do update set tachado_pct = excluded.tachado_pct,
      ajuste_pct = case when $8 then excluded.ajuste_pct else ml_regla_precio.ajuste_pct end, actualizado_ts = now()`,
    [org, canal, d.nivel, familia, producto, pct, ajuste ?? null, ajuste !== undefined]);
}

export type ValoresPlan = { activo: boolean | null; precioMinimo: number | null; margenPct: number | null; cuotasVisibles?: number | null; ajustePct?: number | null };

export async function guardarPlan(org: string, canal: number, plan: string, d: Donde, v: ValoresPlan): Promise<void> {
  await canalMl(org, canal);
  if (!["premium", "3x_campaign", "9x_campaign", "12x_campaign"].includes(plan)) throw new ErrorErp("Ese plan no existe.");
  if (v.precioMinimo != null && v.precioMinimo < 0) throw new ErrorErp("El precio mínimo no puede ser negativo.");
  if (v.margenPct != null && !(v.margenPct >= -50 && v.margenPct <= 300)) throw new ErrorErp("El margen tiene que estar entre -50 % y 300 %.");
  if (v.cuotasVisibles != null && !(Number.isInteger(v.cuotasVisibles) && v.cuotasVisibles >= 1 && v.cuotasVisibles <= 24)) throw new ErrorErp("Las cuotas que ve el comprador van de 1 a 24.");
  if (v.ajustePct != null && !(v.ajustePct >= -50 && v.ajustePct <= 100)) throw new ErrorErp("El «si no gana, +%» tiene que estar entre -50 % y 100 % (0 = gana).");
  const { familia, producto } = await validarDonde(org, d);
  await consulta(`
    insert into ml_plan_config (organizacion_id, canal_id, plan, nivel, familia_id, producto_id, activo, precio_minimo, margen_pct, cuotas_visibles, ajuste_pct)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    on conflict (canal_id, plan, nivel, coalesce(familia_id, 0), coalesce(producto_id, 0))
    do update set activo = excluded.activo, precio_minimo = excluded.precio_minimo, margen_pct = excluded.margen_pct,
                  cuotas_visibles = excluded.cuotas_visibles,
                  ajuste_pct = case when $12 then excluded.ajuste_pct else ml_plan_config.ajuste_pct end, actualizado_ts = now()`,
    [org, canal, plan, d.nivel, familia, producto, v.activo, v.precioMinimo, v.margenPct, d.nivel === "general" ? v.cuotasVisibles ?? null : null,
      v.ajustePct ?? null, v.ajustePct !== undefined]);
}

/** Borra todo lo propio de una excepción (categoría o producto) en un canal. */
export async function borrarExcepcion(org: string, canal: number, d: Donde): Promise<void> {
  if (d.nivel === "general") throw new ErrorErp("Lo general no se borra: cambialo.");
  const { familia, producto } = await validarDonde(org, d);
  for (const t of ["ml_regla_precio", "ml_plan_config"]) {
    await consulta(`delete from ${t} where organizacion_id = $1 and canal_id = $2 and nivel = $3 and familia_id is not distinct from $4 and producto_id is not distinct from $5`,
      [org, canal, d.nivel, familia, producto]);
  }
}

export type ValoresVolumen = { desde: number; hasta: number | null; escalones: { cantidad: number; pct: number }[]; sinDescuento: boolean };

export async function guardarVolumen(org: string, canal: number, d: Donde, v: ValoresVolumen, id?: number | null): Promise<number> {
  await canalMl(org, canal);
  const { familia, producto } = await validarDonde(org, d);
  if (!(v.desde >= 0)) throw new ErrorErp("El «desde» tiene que ser un precio mayor o igual a cero.");
  if (v.hasta != null && !(v.hasta > v.desde)) throw new ErrorErp("El «hasta» tiene que ser mayor que el «desde».");
  const escalones = normalizarEscalones(v.escalones);
  if (!v.sinDescuento && !escalones.length) throw new ErrorErp("Cargá al menos un escalón (cantidad desde 2 y su %), o tildá «sin descuento».");
  if (v.escalones.length > 5) throw new ErrorErp("Mercado Libre acepta hasta 5 escalones.");
  // Los rangos de un mismo nivel no se pisan.
  const pisa = await una(`
    select 1 from ml_volumen_escala where organizacion_id = $1 and canal_id = $2 and nivel = $3 and familia_id is not distinct from $4
       and producto_id is not distinct from $5 and ($8::bigint is null or id <> $8)
       and numrange(desde_precio, hasta_precio) && numrange($6::numeric, $7::numeric)`,
    [org, canal, d.nivel, familia, producto, v.desde, v.hasta, id ?? null]);
  if (pisa) throw new ErrorErp("Ese rango de precios se pisa con otro del mismo nivel.");
  if (id) {
    const r = await una<{ id: string }>(`update ml_volumen_escala set desde_precio = $3, hasta_precio = $4, escalones = $5::jsonb, sin_descuento = $6, actualizado_ts = now()
      where id = $2 and organizacion_id = $1 returning id`, [org, id, v.desde, v.hasta, JSON.stringify(v.sinDescuento ? [] : escalones), v.sinDescuento]);
    if (!r) throw new ErrorErp("Ese rango ya no existe.");
    return id;
  }
  const r = await una<{ id: string }>(`
    insert into ml_volumen_escala (organizacion_id, canal_id, nivel, familia_id, producto_id, desde_precio, hasta_precio, escalones, sin_descuento)
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) returning id`,
    [org, canal, d.nivel, familia, producto, v.desde, v.hasta, JSON.stringify(v.sinDescuento ? [] : escalones), v.sinDescuento]);
  return Number(r!.id);
}

export async function borrarVolumen(org: string, id: number): Promise<void> {
  await consulta("delete from ml_volumen_escala where id = $1 and organizacion_id = $2", [id, org]);
}

/** "Replicar en las demás cuentas": copia la tabla de volumen de un canal
 *  (todos los niveles) a los otros canales de ML, reemplazando la suya. */
export async function replicarVolumen(org: string, canal: number): Promise<number> {
  await canalMl(org, canal);
  const otros = (await canalesMl(org)).filter((c) => c.id !== canal);
  for (const o of otros) {
    await consulta("delete from ml_volumen_escala where organizacion_id = $1 and canal_id = $2", [org, o.id]);
    await consulta(`
      insert into ml_volumen_escala (organizacion_id, canal_id, nivel, familia_id, producto_id, desde_precio, hasta_precio, escalones, sin_descuento)
      select organizacion_id, $3, nivel, familia_id, producto_id, desde_precio, hasta_precio, escalones, sin_descuento
        from ml_volumen_escala where organizacion_id = $1 and canal_id = $2`, [org, canal, o.id]);
  }
  return otros.length;
}

/** Prende o apaga un interruptor del canal (canal.config). */
export async function fijarInterruptor(org: string, canal: number, clave: "sincronizar_precios" | "leer_precio_ganar" | "volumen_regla_stock", valor: boolean): Promise<void> {
  await canalMl(org, canal);
  await consulta("update canal set config = config || jsonb_build_object($3::text, $4::boolean) where id = $2 and organizacion_id = $1", [org, canal, clave, valor]);
}

// ── Para las pantallas ──────────────────────────────────────

export type Excepcion = {
  clave: string; nivel: "familia" | "producto"; familia_id: number | null; producto_id: number | null;
  nombre: string; sku: string | null; tachado_pct: number | null; ajuste_pct: number | null;
  planes: Record<string, { activo: boolean | null; min: number | null; margen: number | null; ajuste: number | null }>;
  /** La familia del producto (para calcular lo que hereda). */
  familia_producto?: number | null;
};

/** Las excepciones (categoría o producto) de un canal, con su tachado y sus planes. */
export async function excepcionesCanal(org: string, canal: number): Promise<Excepcion[]> {
  const filas = await consulta<Omit<Excepcion, "clave">>(`
    with k as (
      select nivel, familia_id, producto_id from ml_regla_precio where organizacion_id = $1 and canal_id = $2 and nivel <> 'general'
      union
      select nivel, familia_id, producto_id from ml_plan_config where organizacion_id = $1 and canal_id = $2 and nivel <> 'general' and ajuste_pct is not null)
    select k.nivel, k.familia_id::int, k.producto_id::int, coalesce(f.nombre, p.titulo, '—') nombre, p.sku_base sku, p.familia_id::int familia_producto,
           (select tachado_pct::float8 from ml_regla_precio r where r.canal_id = $2 and r.nivel = k.nivel
               and r.familia_id is not distinct from k.familia_id and r.producto_id is not distinct from k.producto_id) tachado_pct,
           (select ajuste_pct::float8 from ml_regla_precio r where r.canal_id = $2 and r.nivel = k.nivel
               and r.familia_id is not distinct from k.familia_id and r.producto_id is not distinct from k.producto_id) ajuste_pct,
           coalesce((select jsonb_object_agg(c.plan, jsonb_build_object('activo', c.activo, 'min', c.precio_minimo, 'margen', c.margen_pct, 'ajuste', c.ajuste_pct))
              from ml_plan_config c where c.canal_id = $2 and c.nivel = k.nivel
               and c.familia_id is not distinct from k.familia_id and c.producto_id is not distinct from k.producto_id), '{}') planes
      from k left join familia f on f.id = k.familia_id left join producto p on p.id = k.producto_id
     order by k.nivel, coalesce(f.nombre, p.sku_base)`, [org, canal]);
  return filas.map((f) => ({ ...f, clave: f.nivel === "familia" ? `f${f.familia_id}` : `p${f.producto_id}` }));
}

export type RangoVolumen = {
  id: number; nivel: "general" | "familia" | "producto"; familia_id: number | null; producto_id: number | null; nombre: string | null; sku: string | null;
  desde_precio: number; hasta_precio: number | null; escalones: { cantidad: number; pct: number }[]; sin_descuento: boolean;
};

export async function volumenCanal(org: string, canal: number): Promise<RangoVolumen[]> {
  return consulta<RangoVolumen>(`
    select v.id::int, v.nivel, v.familia_id::int, v.producto_id::int, coalesce(f.nombre, p.titulo) nombre, p.sku_base sku,
           v.desde_precio::float8, v.hasta_precio::float8, v.escalones, v.sin_descuento
      from ml_volumen_escala v left join familia f on f.id = v.familia_id left join producto p on p.id = v.producto_id
     where v.organizacion_id = $1 and v.canal_id = $2
     order by case v.nivel when 'general' then 0 when 'familia' then 1 else 2 end, coalesce(f.nombre, p.sku_base), v.desde_precio`, [org, canal]);
}

/** Los destacados que dejaron de ganar. */
export async function alertasCanal(org: string, canal: number) {
  return consulta<{ variacion_id: number; producto_id: number; sku: string; titulo: string; plan: string; item_id: string; precio: number; alerta: string; verificado_ts: Date | null }>(`
    select d.variacion_id::int, v.producto_id::int, v.sku, titulo_variacion(v.id) titulo, d.plan, d.item_id, d.precio::float8, d.alerta, d.verificado_ts
      from ml_plan_destacado d join variacion v on v.id = d.variacion_id
     where d.organizacion_id = $1 and d.canal_id = $2 and d.alerta is not null order by v.sku`, [org, canal]);
}

export type BajoPiso = {
  variacionId: number; productoId: number; sku: string; titulo: string; itemId: string; publicacionId: number; plan: string | null;
  campanaId: string; tipo: string; nombre: string | null; propia: boolean; precio: number; piso: number;
};

/** Las publicaciones que están en una campaña (propia o de ML) que las deja
 *  debajo del piso del esquema. Calcula sólo las variaciones en campaña. */
export async function campanasBajoPisoCanal(org: string, canal: number): Promise<BajoPiso[]> {
  const vs = await consulta<{ id: number }>(`
    select distinct p.variacion_id::int id from publicacion p
      join ml_promo_item m on m.canal_id = p.canal_id and m.item_id = p.id_externo
     where p.organizacion_id = $1 and p.canal_id = $2 and p.estado <> 'cerrada'
       and m.estado in ('started', 'pending') and (m.hasta is null or m.hasta > now())`, [org, canal]);
  if (!vs.length) return [];
  const calculo = await calcularCanal(org, canal, { variaciones: vs.map((v) => v.id) });
  const salida: BajoPiso[] = [];
  for (const { info, propuesta } of calculo.propuestas) {
    for (const pa of propuesta.pubs) {
      for (const { campana: c, precio } of campanasBajoPiso(pa)) {
        salida.push({
          variacionId: info.variacionId, productoId: info.productoId, sku: info.sku, titulo: info.titulo, itemId: pa.pub.itemId, publicacionId: pa.pub.publicacionId,
          plan: pa.pub.plan, campanaId: c.id, tipo: c.tipo, nombre: c.nombre ?? null, propia: CON_PRECIO.includes(c.tipo), precio, piso: pa.piso!,
        });
      }
    }
  }
  return salida;
}

/** Lo que cuenta cada pestaña. */
export async function cuentasCanal(org: string, canal: number) {
  return (await una<{ excepciones: number; volumen: number; alertas: number }>(`
    select (select count(*) from (
              select nivel, familia_id, producto_id from ml_regla_precio where organizacion_id = $1 and canal_id = $2 and nivel <> 'general'
              union select nivel, familia_id, producto_id from ml_plan_config where organizacion_id = $1 and canal_id = $2 and nivel <> 'general' and ajuste_pct is not null) k)::int excepciones,
           (select count(*) from ml_volumen_escala where organizacion_id = $1 and canal_id = $2)::int volumen,
           (select count(*) from ml_plan_destacado where organizacion_id = $1 and canal_id = $2 and alerta is not null)::int alertas`, [org, canal]))!;
}

/** El producto de un SKU (para las excepciones por producto). */
export async function productoPorSku(org: string, sku: string | null): Promise<number> {
  if (!sku) throw new ErrorErp("Escribí el SKU del producto.");
  const p = await una<{ id: number }>(`
    select p.id::int from producto p where p.organizacion_id = $1 and lower(p.sku_base) = lower($2)
    union all
    select v.producto_id::int from variacion v where v.organizacion_id = $1 and lower(v.sku) = lower($2)
    limit 1`, [org, sku.trim()]);
  if (!p) throw new ErrorErp(`No hay ningún producto con el SKU ${sku}.`);
  return p.id;
}

export type SinCampana = {
  variacionId: number; productoId: number; sku: string; titulo: string; publicacionId: number; itemId: string; plan: string | null;
  precio: number | null; desde: Date; horas: number;
};

/** Las publicaciones con tachado que hace más de `horas` que no están en ninguna campaña
 *  (Fer, 8/10): siguen publicadas al tachado —nunca se bajan a la Clásica—, pero así no
 *  venden. «Desde» es lo último que se sabe: cuando salió de su última campaña, cuando
 *  terminó, o cuando se publicó. */
export async function sinCampanaCanal(org: string, canal: CanalMl, horas = 24): Promise<SinCampana[]> {
  const [filas, reglas, familias] = await Promise.all([
    consulta<{ variacion_id: number; producto_id: number; familia_id: number | null; sku: string; titulo: string; pub: number; item: string; tipo: string | null; tags: unknown;
      precio: number | null; clasica: number | null; desde: Date }>(`
      select p.variacion_id::int, v.producto_id::int, pr.familia_id::int, v.sku, titulo_variacion(v.id) titulo, p.id::int pub, p.id_externo item,
             coalesce(mi.tipo, p.tipo_publicacion) tipo, mi.datos_externos -> 'ml' -> 'tags' tags, coalesce(mi.precio, p.precio_canal)::float8 precio,
             (select lista_ars from precio_de(p.organizacion_id, p.variacion_id, $3::bigint, (now() at time zone 'America/Argentina/Buenos_Aires')::date))::float8 clasica,
             greatest(p.creado_ts,
               (select max(h.fecha) from ml_promo_historia h where h.canal_id = p.canal_id and h.item_id = p.id_externo and h.que = 'item_baja' and h.antes in ('started', 'pending')),
               (select max(m.hasta) from ml_promo_item m where m.canal_id = p.canal_id and m.item_id = p.id_externo and m.hasta <= now())) desde
        from publicacion p
        join variacion v on v.id = p.variacion_id
        join producto pr on pr.id = v.producto_id
        left join meli_item mi on mi.canal_id = p.canal_id and mi.item_id = p.id_externo and mi.variation_id = coalesce(p.variacion_externa, '')
       where p.organizacion_id = $1 and p.canal_id = $2 and p.estado = 'activa' and p.id_externo is not null
         and not exists (select 1 from ml_promo_item m where m.canal_id = p.canal_id and m.item_id = p.id_externo
                            and m.estado = 'started' and (m.hasta is null or m.hasta > now()))`, [org, canal.id, canal.listaId]),
    reglasCanal(org, canal),
    familiasDe(org),
  ]);
  const limite = Date.now() - horas * 3_600_000;
  const salida: SinCampana[] = [];
  for (const f of filas) {
    const desde = new Date(f.desde);
    if (desde.getTime() > limite) continue;
    const lugar = { productoId: f.producto_id, familias: cadenaFamilias(f.familia_id, familias.padres) };
    const tachadoPct = Number(heredar(reglas.tachado, lugar, (r) => r.tachado_pct).valor ?? 0);
    if (!(tachadoPct > 0)) continue;
    // Sólo las que ya están publicadas al tachado del esquema: las que todavía están a su precio (la Clásica o el
    // de su plan) no dependen de una campaña para venderse a lo que corresponde.
    if (f.clasica == null || f.precio == null || f.precio < f.clasica * (1 + tachadoPct / 100) * 0.97) continue;
    salida.push({
      variacionId: f.variacion_id, productoId: f.producto_id, sku: f.sku, titulo: f.titulo, publicacionId: f.pub, itemId: f.item, plan: planDePublicacion(f.tipo, f.tags),
      precio: f.precio, desde, horas: Math.floor((Date.now() - desde.getTime()) / 3_600_000),
    });
  }
  return salida.sort((a, b) => a.desde.getTime() - b.desde.getTime());
}

export type Heredado = { tachado: { valor: number; de: string }; clasica: { valor: number; de: string }; planes: Record<string, { valor: number; de: string }> };

/** Lo que una excepción hereda en cada campo vacío (Fer, 8/10: «hereda, ¿de dónde?»): el valor y de dónde
 *  viene (una categoría de arriba o lo general de la cuenta; si no hay nada cargado, 0 = sin descuento / gana). */
export async function heredadoExcepciones(org: string, canal: CanalMl, excepciones: Excepcion[]): Promise<Map<string, Heredado>> {
  const [reglas, familias] = await Promise.all([reglasCanal(org, canal), familiasDe(org)]);
  const de = (o: Origen | null) => (o ? textoOrigen(o, (id) => familias.nombre.get(id)) : "nada cargado");
  const salida = new Map<string, Heredado>();
  for (const e of excepciones) {
    // Lo de arriba de la excepción: para un producto, su categoría y las de arriba; para una categoría, sus padres.
    const cadena = e.nivel === "producto" ? cadenaFamilias(e.familia_producto ?? null, familias.padres) : cadenaFamilias(familias.padres.get(e.familia_id!) ?? null, familias.padres);
    const lugar = { productoId: -1, familias: cadena };
    const t = heredar(reglas.tachado, lugar, (r) => (r.tachado_pct == null ? null : Number(r.tachado_pct)));
    const a = heredar(reglas.tachado, lugar, (r) => (r.ajuste_pct == null ? null : Number(r.ajuste_pct)));
    // Sin nada cargado, «¿gana?» sale de «Quién gana» del grupo (Planes de cuotas): para un producto, el valor justo;
    // para una categoría, el de la cuenta fija, o «rota» (depende de cada producto).
    const grupo = reglas.ajusteGrupo?.({ productoId: e.producto_id ?? 0, familias: e.nivel === "producto" ? cadena : [e.familia_id!, ...cadena] }) ?? {};
    const delGrupo = (p: PlanOClasica, x: { valor: number | null; origen: Origen | null }) =>
      x.valor != null ? { valor: x.valor, de: de(x.origen) } : { valor: grupo[p] ?? 0, de: "de Quién gana del grupo" };
    const planes: Heredado["planes"] = {};
    for (const p of PLANES) {
      planes[p] = delGrupo(p, heredar(reglas.planes.filter((r) => r.plan === p), lugar, (r) => (r.ajuste_pct == null ? null : Number(r.ajuste_pct))));
    }
    salida.set(e.clave, { tachado: { valor: t.valor ?? 0, de: de(t.origen) }, clasica: delGrupo("clasica", a), planes });
  }
  return salida;
}
