// El análisis diario (Fer, 7/11; bitácora #1130): lo que antes se revisaba a mano cada día o dos (bitácora #679,
// #985–#1118), hecho por Laucen. Sólo LEE: nada sale a Mercado Libre desde acá; lo que conviene hacer queda para el
// clic de Fer (las acciones de la pantalla).
//
//   1. Campañas de ML de las publicaciones activas de las familias elegidas (lib/precios-ml/datos.ts, calcularCanal: el
//      mismo motor que «Precios en ML»). Por publicación: si está donde el esquema dice que tiene que estar; si está al
//      tachado sin ninguna campaña (así no vende); si hay una campaña de ML a la que puede entrar bajando como mucho el
//      % de la configuración (oportunidad, para un lote); si el esquema pide un cambio que no salió o que ML rechazó; y
//      si está en una campaña que la deja bastante debajo del esquema.
//   2. Ofertas relámpago y compartidas de esas familias (lib/precios-ml/relampago.ts, relampagos): las que ML propone, las
//      que entran por el tope del % y llegan al piso, y las que ya están programadas o en curso.
//   3. Publicidad (lib/publicidad/embudo.ts): los últimos 7 días contra los 7 anteriores, por canal (cada cuenta de ML,
//      Meta, Google) y por campaña de Google y Meta; el veredicto de la publicidad de ML por producto
//      (lib/publicidad/veredicto.ts); y cuándo se leyó por última vez cada fuente.
//   4. Visitas de la tienda web (visitante_evento): por día y por origen, con el embudo visita → producto → carrito →
//      checkout → compra.

import { consulta, una } from "@/lib/erp/base";
import { calcularCanal, canalesMl, familiasDe } from "@/lib/precios-ml/datos";
import { mandadosSinLeer } from "@/lib/precios-ml/preparar";
import { CON_PRECIO, PLAN_INFO, cadenaFamilias, pedidosPrecio, queCambia, rigeHoy,
  type Campana, type PropuestaPub } from "@/lib/precios-ml/motor";
import { relampagos, enviosRelampago, claveCola, type Relampago } from "@/lib/precios-ml/relampago";
import { embudo } from "@/lib/publicidad/embudo";
import { veredictos } from "@/lib/publicidad/veredicto";
import { configAnalisis, nombresFamilias, type ConfigAnalisis } from "@/lib/analisis-diario/config";

// ── Tipos de lo que se guarda (analisis_diario.datos) ────────────────────────

export type EstadoCampana = "oportunidad" | "sin_campana" | "en_camino" | "pendiente" | "bajo_piso";

export type FilaCampanaPub = {
  estado: EstadoCampana;
  canalId: number; cuenta: string; itemId: string; productoId: number; sku: string; titulo: string; plan: string | null;
  /** Lo que el esquema dice que paga el comprador (la Clásica o el precio del plan) y el publicado (con tachado). */
  venta: number | null; lista: number | null;
  /** Lo que paga hoy el comprador. */
  pagaHoy: number | null;
  detalle: string;
  /** La campaña a la que conviene entrar (oportunidad) o la que la deja debajo (bajo piso). */
  campana: { id: string; tipo: string; nombre: string | null; precio: number; bajaPct: number } | null;
  /** Lo último que ML contestó a un cambio de precio o campaña de esta publicación, si fue un error. */
  error: string | null;
};

export type FilaOferta = {
  canalId: number; cuenta: string; itemId: string; productoId: number; sku: string; titulo: string;
  tipo: string; nombre: string | null; estado: string;
  /** Lo que paga el comprador en la oferta, la base del esquema y cuánto baja lo que pone el vendedor contra esa base. */
  precio: number | null; base: number | null; bajaPct: number | null;
  recibisHoy: number | null; recibisOferta: number | null; piso: number | null; alcanza: boolean | null;
  stock: number | null; stockPide: number | null; desde: string | null; hasta: string | null;
  pctVendedor: number | null; pctMeli: number | null;
  /** Cumple todo para entrar (propuesta todavía no aceptada). */
  entra: boolean;
  /** Ya se pidió entrar (estado de la cola). */
  pedida: string | null;
  motivo: string | null;
};

export type CanalPublicidad = {
  clave: string; canal: string; detalle: string | null;
  gasto: number | null; vieron: number | null; clics: number | null; escribieron: number | null; ventas: number; vendido: number;
  unidad: "unidades" | "pedidos";
  antes: { gasto: number | null; ventas: number; vendido: number };
};

export type CampanaAds = { plataforma: string; campana: string; gasto: number; vieron: number; clics: number; gastoAntes: number; clicsAntes: number };

export type ProductoMlAds = { clave: string; sku: string | null; titulo: string; veredicto: string; motivo: string; costo: number; vendido: number; ventas: number };

export type Fuente = { nombre: string; ultima: string | null; estado: string | null; vieja: boolean; nota: string | null };

export type DiaVisitas = { fecha: string; visitantes: number; visitas: number; productos: number; carrito: number; checkout: number; compra: number; whatsapp: number };

export type OrigenVisitas = { origen: string; visitantes: number; antes: number };

export type Analisis = {
  fecha: string; generado: string;
  config: { familias: { id: number; nombre: string }[]; maxBajaPct: number };
  campanas: {
    publicaciones: number; enCampana: number; sinNecesidad: number;
    filas: FilaCampanaPub[];
  };
  ofertas: FilaOferta[];
  publicidad: {
    desde: string; hasta: string; desdeAntes: string; hastaAntes: string;
    canales: CanalPublicidad[]; campanas: CampanaAds[]; mlAds: ProductoMlAds[]; fuentes: Fuente[];
  };
  visitas: { dias: DiaVisitas[]; total: Omit<DiaVisitas, "fecha">; antes: Omit<DiaVisitas, "fecha">; origenes: OrigenVisitas[] };
  /** Cuánto tardó cada parte (ms) y las que no se pudieron hacer. */
  tiempos?: Record<string, number>; errores?: string[];
  urgentes: string[];
};

// ── Fechas (hora argentina) ──────────────────────────────────────────────────

const ZONA = "America/Argentina/Buenos_Aires";
export const hoyAr = (d: Date = new Date()) => d.toLocaleDateString("en-CA", { timeZone: ZONA });
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── 1. Campañas (puro) ───────────────────────────────────────────────────────

const enCurso = (c: Campana, ahora: Date) => (c.estado === "started" || c.estado === "pending") && rigeHoy(c, ahora);

/** Cuánto baja `precio` contra `base`, en % con un decimal. */
export const bajaPct = (precio: number, base: number) => Math.round(((base - precio) / base) * 1000) / 10;

/** La mejor campaña de ML (de las que llevan precio: oferta del día, campaña del vendedor) a la que la publicación puede
 *  entrar: la que deja el precio más alto (hasta `venta`, sin pasar el más alto que acepta ML ni bajar del más bajo).
 *  null si no hay ninguna. Pura. */
export function mejorCandidata(campanas: Campana[], venta: number): { campana: Campana; precio: number; bajaPct: number } | null {
  let mejor: { campana: Campana; precio: number; bajaPct: number } | null = null;
  for (const c of campanas) {
    if (c.estado !== "candidate" || !CON_PRECIO.includes(c.tipo) || c.max == null || !(c.max > 0)) continue;
    const precio = Math.floor(Math.min(c.max, venta));
    if (c.min != null && precio < c.min - 0.5) continue;
    if (!mejor || precio > mejor.precio) mejor = { campana: c, precio, bajaPct: bajaPct(precio, venta) };
  }
  return mejor;
}

/** Lo que paga el comprador en una campaña en curso, lo que pone ML de su bolsillo (en las que arma ML: «Potencia tus
 *  ventas» y otras compartidas, `original` × % de ML) y lo que queda por venta antes de comisión y envío (la suma).
 *  null si ML no informa el precio. Pura. */
export function recibeEnCampana(c: Campana): { paga: number; aporteMl: number; queda: number } | null {
  if (c.precio == null || !(c.precio > 0)) return null;
  const aporteMl = !CON_PRECIO.includes(c.tipo) && c.original && c.pctMeli ? Math.round((c.original * c.pctMeli) / 100) : 0;
  return { paga: Number(c.precio), aporteMl, queda: Number(c.precio) + aporteMl };
}

/** Lo que paga hoy el comprador: el menor precio de las campañas en curso (también las compartidas que arma ML). Pura. */
export function pagaHoy(pub: { precioVentaMl: number | null; campanas: Campana[] }, ahora: Date = new Date()): number | null {
  const v = Math.min(pub.precioVentaMl ?? Infinity, ...pub.campanas.filter((c) => enCurso(c, ahora) && c.precio != null && c.precio > 0).map((c) => Number(c.precio)));
  return Number.isFinite(v) ? v : null;
}

/** Cómo está una publicación activa con sus campañas, contra lo que dice el esquema (la propuesta del motor). null si
 *  está bien (en campaña al precio del esquema, o a su precio sin tachado y sin necesitar campaña). Pura.
 *  `sinLeer`: ya se le mandó algo que ML todavía no confirmó (se espera). `error`: lo último que contestó ML, si falló. */
export function revisarPublicacion(pa: PropuestaPub, maxBajaPct: number, o: { sinLeer: boolean; error: string | null; ahora?: Date }):
  { estado: EstadoCampana; detalle: string; campana: FilaCampanaPub["campana"] } | null {
  const ahora = o.ahora ?? new Date();
  const pub = pa.pub;
  if (pub.estado !== "activa" || pa.venta == null || pa.lista == null) return null;
  const pesos = (x: number) => `$ ${Math.round(x).toLocaleString("es-AR")}`;
  // En una campaña que la deja más abajo de lo que se acepta (el % de la configuración) contra el esquema: se mide lo que
  // queda por venta (lo que paga el comprador más lo que pone ML en una compartida), no lo que dice ML que pone cada uno.
  if (pa.piso != null) {
    for (const c of pub.campanas) {
      if (!enCurso(c, ahora)) continue;
      const r = recibeEnCampana(c);
      if (r == null || r.queda >= pa.piso * (1 - maxBajaPct / 100) - 1) continue;
      const b = bajaPct(r.queda, pa.piso);
      const como = r.aporteMl > 0 ? `el comprador paga ${pesos(r.paga)} y ML pone ${pesos(r.aporteMl)}: queda ${pesos(r.queda)} por venta` : `a ${pesos(r.queda)}`;
      return { estado: "bajo_piso", detalle: `En «${c.nombre ?? c.tipo}» ${como}, ${b.toLocaleString("es-AR")} % debajo del esquema (${pesos(pa.piso)}), más que el ${maxBajaPct.toLocaleString("es-AR")} % aceptado.`,
        campana: { id: c.id, tipo: c.tipo, nombre: c.nombre ?? null, precio: Math.round(r.queda), bajaPct: b } };
    }
  }
  const necesita = pa.lista > pa.venta + 1;
  const adentro = pub.campanas.filter((c) => enCurso(c, ahora));
  const pedidos = pedidosPrecio(pa);
  if (adentro.length) {
    // Ya está en una campaña (de ML, compartida o la propia): sólo importa si el esquema pide cambiarle el precio.
    if (!pa.cambiaPrecio || !pedidos.length || o.sinLeer) return null;
    return { estado: "pendiente", detalle: `El esquema pide: ${queCambia(pa)}.${o.error ? ` ML contestó: ${o.error}` : ""}`, campana: null };
  }
  if (!necesita) return null;
  // Al tachado y sin ninguna campaña: el comprador paga el tachado, no vende.
  const mejor = mejorCandidata(pub.campanas, pa.venta);
  if (mejor && mejor.bajaPct <= maxBajaPct + 0.05) {
    const c = mejor.campana;
    return { estado: "oportunidad",
      detalle: `Sin campaña. Puede entrar a «${c.nombre ?? c.tipo}» a ${pesos(mejor.precio)}${mejor.bajaPct > 0 ? ` (${mejor.bajaPct.toLocaleString("es-AR")} % menos que el esquema, ${pesos(pa.venta)})` : " (el precio del esquema)"}.`,
      campana: { id: c.id, tipo: c.tipo, nombre: c.nombre ?? null, precio: mejor.precio, bajaPct: mejor.bajaPct } };
  }
  const otra = mejor ? ` La mejor campaña que ofrece ML («${mejor.campana.nombre ?? mejor.campana.tipo}») la baja ${mejor.bajaPct.toLocaleString("es-AR")} %, más que el ${maxBajaPct.toLocaleString("es-AR")} % aceptado.` : " ML no le ofrece ninguna campaña con precio.";
  if (pedidos.length && (o.sinLeer || !o.error)) {
    return { estado: "en_camino", detalle: `Sin campaña. ${o.sinLeer ? "Ya se mandó" : "El esquema pide"}: ${queCambia(pa)}.`, campana: null };
  }
  return { estado: "sin_campana", detalle: `Al tachado (${pesos(pa.lista)}) sin ninguna campaña: el comprador paga eso.${otra}${o.error ? ` Lo último que contestó ML: ${o.error}` : ""}`, campana: null };
}

/** Las variaciones de los productos de esas familias (con sus subfamilias). */
async function variacionesDe(org: string, familias: number[]): Promise<{ variaciones: number[]; productos: Set<number> }> {
  if (!familias.length) return { variaciones: [], productos: new Set() };
  const filas = await consulta<{ variacion: number; producto: number }>(`
    with recursive f as (select id from familia where organizacion_id = $1 and id = any($2::bigint[])
                         union select h.id from familia h join f on h.padre_id = f.id)
    select v.id::int variacion, v.producto_id::int producto from variacion v join producto p on p.id = v.producto_id
     where p.organizacion_id = $1 and p.familia_id in (select id from f)`, [org, familias]);
  return { variaciones: filas.map((f) => f.variacion), productos: new Set(filas.map((f) => f.producto)) };
}

/** Lo último que ML contestó a un precio o una campaña de cada publicación, si fue un error. */
async function ultimosErrores(canal: number, items: string[]): Promise<Map<string, string>> {
  if (!items.length) return new Map();
  return new Map((await consulta<{ item_id: string; error: string | null; estado: string }>(`
    select distinct on (item_id) item_id, estado, ultimo_error error from ml_cola
     where canal_id = $1 and item_id = any($2::text[]) and tipo in ('precio', 'campana') order by item_id, id desc`, [canal, items]))
    .filter((x) => x.estado === "error" && x.error).map((x) => [x.item_id, x.error!.slice(0, 220)]));
}

export async function analizarCampanas(org: string, cfg: ConfigAnalisis): Promise<Analisis["campanas"]> {
  const { variaciones } = await variacionesDe(org, cfg.familias);
  const res: Analisis["campanas"] = { publicaciones: 0, enCampana: 0, sinNecesidad: 0, filas: [] };
  if (!variaciones.length) return res;
  const ahora = new Date();
  for (const canal of await canalesMl(org)) {
    const cuenta = await una("select 1 from meli_cuenta where organizacion_id = $1 and canal_id = $2 and estado = 'activa'", [org, canal.id]);
    if (!cuenta) continue;
    const calculo = await calcularCanal(org, canal.id, { variaciones });
    const sinLeer = await mandadosSinLeer(canal.id);
    const items = calculo.propuestas.flatMap((p) => p.propuesta.pubs.map((x) => x.pub.itemId));
    const errores = await ultimosErrores(canal.id, items);
    for (const { info, propuesta } of calculo.propuestas) {
      for (const pa of propuesta.pubs) {
        if (pa.pub.estado !== "activa") continue;
        res.publicaciones++;
        if (pa.pub.campanas.some((c) => enCurso(c, ahora))) res.enCampana++;
        else if (pa.lista != null && pa.venta != null && pa.lista <= pa.venta + 1) res.sinNecesidad++;
        const r = revisarPublicacion(pa, cfg.maxBajaPct, { sinLeer: sinLeer.has(pa.pub.itemId), error: errores.get(pa.pub.itemId) ?? null, ahora });
        if (!r) continue;
        res.filas.push({
          ...r, canalId: canal.id, cuenta: canal.nombre, itemId: pa.pub.itemId, productoId: info.productoId, sku: info.sku, titulo: info.titulo,
          plan: pa.pub.plan ? PLAN_INFO[pa.pub.plan].corto : null, venta: pa.venta, lista: pa.lista, pagaHoy: pagaHoy(pa.pub, ahora),
          error: errores.get(pa.pub.itemId) ?? null,
        });
      }
    }
  }
  const orden: Record<EstadoCampana, number> = { oportunidad: 0, sin_campana: 1, bajo_piso: 2, pendiente: 3, en_camino: 4 };
  res.filas.sort((a, b) => orden[a.estado] - orden[b.estado] || a.sku.localeCompare(b.sku) || a.cuenta.localeCompare(b.cuenta));
  return res;
}

// ── 2. Ofertas relámpago y compartidas ───────────────────────────────────────

/** Si una propuesta (todavía no aceptada) cumple todo para entrar con el tope de la configuración, y si no, por qué. Pura. */
export function evaluarOferta(f: Pick<Relampago, "estado" | "rel" | "bajaPct" | "alcanza" | "stock" | "stock_min" | "base">, maxBajaPct: number): { entra: boolean; motivo: string | null } {
  if (f.estado !== "candidate") return { entra: false, motivo: null };
  if (f.rel == null) return { entra: false, motivo: "El precio queda fuera del rango que acepta ML." };
  if (f.base == null || f.bajaPct == null) return { entra: false, motivo: "Sin precio de esquema para comparar." };
  if (f.bajaPct > maxBajaPct + 0.05) return { entra: false, motivo: `Baja ${f.bajaPct.toLocaleString("es-AR")} %, más que el ${maxBajaPct.toLocaleString("es-AR")} % aceptado.` };
  if (f.alcanza === false) return { entra: false, motivo: "No llega al piso del producto." };
  if (f.stock == null || f.stock <= 0) return { entra: false, motivo: "Sin stock." };
  if (f.stock_min != null && f.stock < f.stock_min) return { entra: false, motivo: `ML pide ${f.stock_min} u. y hay ${f.stock}.` };
  return { entra: true, motivo: null };
}

export async function analizarOfertas(org: string, cfg: ConfigAnalisis): Promise<FilaOferta[]> {
  if (!cfg.familias.length) return [];
  const [todas, familias, envios] = await Promise.all([relampagos(org, null), familiasDe(org), enviosRelampago(org)]);
  const elegidas = new Set(cfg.familias);
  const enFamilia = (familia: number | null) => cadenaFamilias(familia, familias.padres).some((x) => elegidas.has(x));
  return todas.filter((f) => enFamilia(f.familia_id)).map((f): FilaOferta => {
    const e = evaluarOferta(f, cfg.maxBajaPct);
    const envio = envios.get(claveCola(f));
    const pedida = f.estado === "candidate" && envio && !(envio.estado === "error" && envio.precio !== f.rel) ? envio.estado : null;
    return {
      canalId: f.canal_id, cuenta: f.cuenta, itemId: f.item_id, productoId: f.producto_id, sku: f.sku, titulo: f.titulo,
      tipo: f.tipo_promo, nombre: f.nombre_promo, estado: f.estado, precio: f.rel, base: f.base, bajaPct: f.bajaPct,
      recibisHoy: f.recibisHoy, recibisOferta: f.recibisRel, piso: f.piso, alcanza: f.alcanza, stock: f.stock, stockPide: f.stock_min,
      desde: f.desde, hasta: f.hasta, pctVendedor: f.pct_vendedor, pctMeli: f.pct_meli,
      entra: e.entra && !pedida, pedida, motivo: pedida ? (envio?.estado === "error" ? `ML la rechazó: ${envio.error ?? ""}`.slice(0, 200) : "Ya se pidió entrar.") : e.motivo,
    };
  }).sort((a, b) => Number(b.entra) - Number(a.entra) || a.estado.localeCompare(b.estado) || a.sku.localeCompare(b.sku));
}

// ── 3. Publicidad ────────────────────────────────────────────────────────────

export async function analizarPublicidad(org: string, hoy: string): Promise<Analisis["publicidad"]> {
  // Los 7 días cerrados (hasta ayer) y los 7 anteriores.
  const hasta = sumarDias(hoy, -1), desde = sumarDias(hoy, -7);
  const hastaAntes = sumarDias(hoy, -8), desdeAntes = sumarDias(hoy, -14);
  const [ahora, antes, campanas, prods, fuentes] = await Promise.all([
    embudo(org, desde, hasta),
    embudo(org, desdeAntes, hastaAntes),
    consulta<CampanaAds>(`
      select d.plataforma, coalesce(max(d.campana), d.campana_id, 'sin campaña') campana,
             coalesce(sum(case when d.fecha >= $2::date then case when d.moneda = 'ARS' then d.gasto else d.gasto * coalesce(tc_de_ts(d.organizacion_id, d.fecha::timestamptz), 0) end end), 0)::float8 gasto,
             coalesce(sum(d.impresiones) filter (where d.fecha >= $2::date), 0)::float8 vieron,
             coalesce(sum(d.clics) filter (where d.fecha >= $2::date), 0)::float8 clics,
             coalesce(sum(case when d.fecha < $2::date then case when d.moneda = 'ARS' then d.gasto else d.gasto * coalesce(tc_de_ts(d.organizacion_id, d.fecha::timestamptz), 0) end end), 0)::float8 "gastoAntes",
             coalesce(sum(d.clics) filter (where d.fecha < $2::date), 0)::float8 "clicsAntes"
        from anuncio_dia d where d.organizacion_id = $1 and d.fecha between $3::date and $4::date
       group by d.plataforma, d.campana_id having sum(d.gasto) > 0 or sum(d.clics) > 0 order by 3 desc`, [org, desde, desdeAntes, hasta]).catch(() => []),
    veredictos(org).catch(() => []),
    fuentesPublicidad(org),
  ]);
  const porClave = new Map(antes.filas.map((f) => [f.clave, f]));
  const canales: CanalPublicidad[] = ahora.filas.map((f) => {
    const a = porClave.get(f.clave);
    return { clave: f.clave, canal: f.canal, detalle: f.detalle, gasto: f.gasto, vieron: f.vieron, clics: f.clics, escribieron: f.escribieron,
      ventas: f.ventas, vendido: f.vendido, unidad: f.unidad, antes: { gasto: a?.gasto ?? null, ventas: a?.ventas ?? 0, vendido: a?.vendido ?? 0 } };
  });
  const mlAds = prods.filter((p) => p.veredicto === "cortar" || p.veredicto === "bajar" || p.veredicto === "subir")
    .sort((a, b) => ({ cortar: 0, bajar: 1, subir: 2 }[a.veredicto as "cortar"] - { cortar: 0, bajar: 1, subir: 2 }[b.veredicto as "cortar"]) || b.costo - a.costo)
    .slice(0, 30)
    .map((p) => ({ clave: p.clave, sku: p.sku, titulo: p.titulo, veredicto: p.veredicto, motivo: p.motivo, costo: p.costo, vendido: p.monto, ventas: p.ventas }));
  return { desde, hasta, desdeAntes, hastaAntes, canales, campanas, mlAds, fuentes };
}

/** Cuándo se leyó por última vez cada fuente de la publicidad (vieja: hace más de 12 horas). */
async function fuentesPublicidad(org: string): Promise<Fuente[]> {
  const viejo = (t: string | null) => !t || Date.now() - new Date(t).getTime() > 12 * 3600_000;
  const [g, m, ml, promos, gasto] = await Promise.all([
    una<{ ts: string | null; estado: string | null }>("select lectura_ts::text ts, lectura_estado estado from google_ads_credencial where organizacion_id = $1 and estado = 'activo'", [org]).catch(() => null),
    una<{ ts: string | null; estado: string | null }>("select lectura_ts::text ts, lectura_estado estado from meta_ads_credencial where organizacion_id = $1 and estado = 'activo'", [org]).catch(() => null),
    una<{ ts: string | null }>("select max(fin_ts)::text ts from pub_lectura where organizacion_id = $1", [org]).catch(() => null),
    una<{ ts: string | null }>("select max(leido_ts)::text ts from ml_promo_item where organizacion_id = $1", [org]).catch(() => null),
    consulta<{ plataforma: string; gasto: number }>(`select plataforma, coalesce(sum(gasto), 0)::float8 gasto from anuncio_dia
       where organizacion_id = $1 and fecha >= (now() at time zone '${ZONA}')::date - 3 group by 1`, [org]).catch(() => []),
  ]);
  const gastoDe = (p: string) => gasto.find((x) => x.plataforma === p)?.gasto ?? 0;
  const salida: Fuente[] = [];
  if (g) salida.push({ nombre: "Google Ads", ultima: g.ts, estado: g.estado, vieja: viejo(g.ts) || g.estado === "rechazo",
    nota: gastoDe("google") > 0 ? null : "Sin gasto en los últimos 3 días: o las campañas están apagadas, o no se están leyendo." });
  if (m) salida.push({ nombre: "Meta (Facebook e Instagram)", ultima: m.ts, estado: m.estado, vieja: viejo(m.ts) || m.estado === "rechazo",
    nota: gastoDe("meta") > 0 ? null : "Sin gasto en los últimos 3 días: o las campañas están apagadas o sin entrega, o no se están leyendo." });
  salida.push({ nombre: "Publicidad de Mercado Libre", ultima: ml?.ts ?? null, estado: null, vieja: viejo(ml?.ts ?? null), nota: null });
  salida.push({ nombre: "Campañas de Mercado Libre", ultima: promos?.ts ?? null, estado: null, vieja: viejo(promos?.ts ?? null), nota: null });
  return salida;
}

// ── 4. Visitas ───────────────────────────────────────────────────────────────

const VACIO = { visitantes: 0, visitas: 0, productos: 0, carrito: 0, checkout: 0, compra: 0, whatsapp: 0 };

/** El nombre de un origen de visita (la entrada que trae cada visita). Pura. */
export function nombreOrigen(tipo: string | null, plataforma: string | null): string {
  if (tipo === "anuncio") return plataforma === "google" ? "Anuncio de Google" : plataforma === "meta" ? "Anuncio de Meta" : plataforma === "tiktok" ? "Anuncio de TikTok" : "Anuncio";
  return ({ organico: "Buscador (sin anuncio)", directo: "Directo (escribieron la dirección o un link guardado)", mercadolibre: "Desde Mercado Libre",
    social: "Red social (sin anuncio)", referido: "Otra página", campana: "Otra campaña (mail, posteo)" } as Record<string, string>)[tipo ?? ""] ?? "Sin dato";
}

export async function analizarVisitas(org: string, hoy: string): Promise<Analisis["visitas"]> {
  const desde = sumarDias(hoy, -14), hasta = sumarDias(hoy, -1), corte = sumarDias(hoy, -7);
  const dia = `(e.ts at time zone '${ZONA}')::date`;
  const [porDia, origenes] = await Promise.all([
    consulta<DiaVisitas>(`
      select ${dia}::text fecha, count(distinct e.visitante) filter (where e.tipo = 'visita')::int visitantes, count(*) filter (where e.tipo = 'visita')::int visitas,
             count(*) filter (where e.tipo = 'producto')::int productos, count(distinct e.visitante) filter (where e.tipo = 'carrito')::int carrito,
             count(distinct e.visitante) filter (where e.tipo = 'checkout')::int checkout, count(distinct coalesce(e.pedido_id::text, e.visitante)) filter (where e.tipo = 'compra')::int compra,
             count(*) filter (where e.tipo = 'whatsapp')::int whatsapp
        from visitante_evento e where e.organizacion_id = $1 and ${dia} between $2::date and $3::date group by 1 order by 1`, [org, desde, hasta]).catch(() => []),
    consulta<{ tipo: string | null; plataforma: string | null; visitantes: number; antes: number }>(`
      select e.entrada ->> 'tipo' tipo, e.entrada ->> 'plataforma' plataforma,
             count(distinct e.visitante) filter (where ${dia} >= $4::date)::int visitantes, count(distinct e.visitante) filter (where ${dia} < $4::date)::int antes
        from visitante_evento e where e.organizacion_id = $1 and e.tipo = 'visita' and ${dia} between $2::date and $3::date group by 1, 2`, [org, desde, hasta, corte]).catch(() => []),
  ]);
  const sumar = (ds: DiaVisitas[]) => ds.reduce((t, d) => {
    for (const k of Object.keys(VACIO) as (keyof typeof VACIO)[]) t[k] += d[k];
    return t;
  }, { ...VACIO });
  const dias = porDia.filter((d) => d.fecha >= corte);
  const agrupados = new Map<string, OrigenVisitas>();
  for (const o of origenes) {
    const nombre = nombreOrigen(o.tipo, o.plataforma);
    const ya = agrupados.get(nombre) ?? { origen: nombre, visitantes: 0, antes: 0 };
    ya.visitantes += o.visitantes; ya.antes += o.antes;
    agrupados.set(nombre, ya);
  }
  return { dias, total: sumar(dias), antes: sumar(porDia.filter((d) => d.fecha < corte)), origenes: [...agrupados.values()].sort((a, b) => b.visitantes - a.visitantes) };
}

// ── Todo junto ───────────────────────────────────────────────────────────────

/** Lo que pide atención hoy, en una línea cada cosa. Pura. */
export function urgentesDe(a: Omit<Analisis, "urgentes">): string[] {
  const salida: string[] = [];
  const n = (k: number, uno: string, muchos: string) => (k === 1 ? `1 ${uno}` : `${k} ${muchos}`);
  const contar = (e: EstadoCampana) => a.campanas.filas.filter((f) => f.estado === e).length;
  const entran = a.ofertas.filter((f) => f.entra).length;
  if (entran) salida.push(`${n(entran, "oferta relámpago o compartida puede", "ofertas relámpago o compartidas pueden")} entrar (bajan hasta el ${a.config.maxBajaPct.toLocaleString("es-AR")} %).`);
  if (contar("oportunidad")) salida.push(`${n(contar("oportunidad"), "publicación sin campaña puede", "publicaciones sin campaña pueden")} entrar a una campaña de ML.`);
  if (contar("sin_campana")) salida.push(`${n(contar("sin_campana"), "publicación está", "publicaciones están")} al tachado sin ninguna campaña (no venden a su precio).`);
  if (contar("bajo_piso")) salida.push(`${n(contar("bajo_piso"), "publicación está", "publicaciones están")} en una campaña que la deja debajo de lo aceptado.`);
  if (contar("pendiente")) salida.push(`${n(contar("pendiente"), "cambio de precio del esquema no salió", "cambios de precio del esquema no salieron")} a ML.`);
  const cortar = a.publicidad.mlAds.filter((p) => p.veredicto === "cortar").length;
  if (cortar) salida.push(`Publicidad de ML: ${n(cortar, "producto para CORTAR", "productos para CORTAR")}.`);
  for (const f of a.publicidad.fuentes) if (f.vieja) salida.push(`${f.nombre}: hace más de 12 horas que no se lee${f.estado === "rechazo" ? " (hay que volver a conectar la cuenta)" : ""}.`);
  return salida;
}

/** Una parte del análisis con su tope de tiempo: si falla o se pasa, queda `vacio` y el motivo (las otras partes siguen). */
async function parte<T>(nombre: string, vacio: T, fn: () => Promise<T>, tiempos: Record<string, number>, errores: string[], topeMs = 100_000): Promise<T> {
  const t0 = Date.now();
  try {
    return await Promise.race([fn(), new Promise<never>((_, no) => setTimeout(() => no(new Error(`tardó más de ${Math.round(topeMs / 1000)} s`)), topeMs))]);
  } catch (e) {
    console.error(`[analisis diario] ${nombre}`, e);
    errores.push(`${nombre}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    return vacio;
  } finally {
    tiempos[nombre] = Date.now() - t0;
  }
}

export async function calcularAnalisis(org: string, hoy: string = hoyAr()): Promise<Analisis> {
  const cfg = await configAnalisis(org);
  const tiempos: Record<string, number> = {}, errores: string[] = [];
  const [familias, campanas, ofertas, publicidad, visitas] = await Promise.all([
    nombresFamilias(org, cfg.familias).catch(() => []),
    parte("Campañas de ML", { publicaciones: 0, enCampana: 0, sinNecesidad: 0, filas: [] }, () => analizarCampanas(org, cfg), tiempos, errores),
    parte("Relámpago y compartidas", [] as FilaOferta[], () => analizarOfertas(org, cfg), tiempos, errores),
    parte("Publicidad", { desde: sumarDias(hoy, -7), hasta: sumarDias(hoy, -1), desdeAntes: sumarDias(hoy, -14), hastaAntes: sumarDias(hoy, -8), canales: [], campanas: [], mlAds: [], fuentes: [] },
      () => analizarPublicidad(org, hoy), tiempos, errores),
    parte("Visitas", { dias: [], total: { ...VACIO }, antes: { ...VACIO }, origenes: [] }, () => analizarVisitas(org, hoy), tiempos, errores),
  ]);
  const base = { fecha: hoy, generado: new Date().toISOString(), config: { familias, maxBajaPct: cfg.maxBajaPct }, campanas, ofertas, publicidad, visitas, tiempos, errores };
  const urgentes = urgentesDe(base);
  for (const e of errores) urgentes.push(`No se pudo analizar ${e}`);
  return { ...base, urgentes };
}
