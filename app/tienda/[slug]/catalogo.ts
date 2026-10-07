// Datos de la tienda pública: la tienda del slug, el catálogo que vende (con
// precio de la lista del canal —precio_de, la función única—, stock del canal,
// vendidos y foto), el árbol de categorías con productos, las cucardas, los
// planes de cuotas y el envío gratis. Sólo lectura; lo que cambia algo está en
// acciones.ts.
//
// El catálogo entero se calcula una vez y se guarda 60 segundos (por canal):
// los listados, la portada, las sugerencias del buscador y el menú de
// categorías filtran ese mismo arreglo en memoria. La ficha del producto, el
// carrito y el checkout NO usan esa copia: cotizan en vivo.

import { sqlPublicadoEnWeb } from "@/lib/catalogo/web";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { hoyAR } from "@/lib/moneda";
import { tiendaPorSlug, type Tienda } from "@/lib/tienda/tienda";
import { planesDeVariaciones, planParaMostrar, type Plan } from "@/lib/tienda/cuotas";

export const POR_PAGINA = 24;
export const COLOR_POR_DEFECTO = "#3483FA";

/** La tienda del slug (una sola consulta por request); si no existe, 404. */
export const cargarTienda = cache(async (slug: string): Promise<Tienda> => {
  let s = slug;
  try { s = decodeURIComponent(slug); } catch { /* queda como vino */ }
  const t = await tiendaPorSlug(s);
  if (!t) notFound();
  return t;
});

export const abierta = (t: Tienda) => t.estado === "activo";
export const ocultaSinStock = (t: Tienda) => t.config.sin_stock === "ocultar";
export const whatsappDe = (t: Tienda) => (t.config.whatsapp ?? "").replace(/\D/g, "") || null;
export const linkWhatsapp = (t: Tienda, texto: string) => {
  const n = whatsappDe(t);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
};

export const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// ── Catálogo ─────────────────────────────────────────────
/** Un producto vendible en la tienda: activo, con alguna variación activa con
 *  precio en la lista del canal. El precio es el más bajo de sus variaciones. */
export type ProductoBase = {
  id: number; titulo: string; marca: string | null; familiaId: number | null; creado: number;
  venta: number; ventaMax: number; lista: number; descuentoPct: number; stock: number; variaciones: number; variacionId: number;
  foto: string | null; vendidos: number;
  /** título, marca y SKUs normalizados (sin acentos, en minúsculas), para buscar. */
  texto: string;
};

async function leerCatalogo(org: string, canalId: number, listaId: number, moneda: string): Promise<ProductoBase[]> {
  const filas = await consulta<{
    id: number; titulo: string; marca: string | null; familia_id: number | null; creado: string; variacion_id: number; variaciones: number;
    lista: string; venta: string; venta_max: string; descuento_pct: string; stock: number; skus: string | null; sku_base: string; foto: string | null; vendidos: number;
  }>(`
    with v as (
      select p.id producto_id, v.id variacion_id, v.orden, v.sku,
             case when $4 = 'USD' then pr.lista_usd else pr.lista_ars end lista,
             case when $4 = 'USD' then pr.venta_usd else pr.venta_ars end venta,
             pr.descuento_pct, greatest(stock_disponible_canal($1, v.id, $2), 0) disp
        from producto p
        join variacion v on v.producto_id = p.id and v.estado = 'activa'
        cross join lateral (select * from precio_de($1, v.id, $3)) pr
       where p.organizacion_id = $1 and p.estado = 'activo'
         -- Sólo lo publicado en este canal web (la web es un canal más).
         and ${sqlPublicadoEnWeb("p", "$2")}
    ), a as (
      select producto_id, min(venta) venta, max(venta) venta_max, count(*)::int variaciones, sum(disp)::int stock, string_agg(sku, ' ') skus,
             (array_agg(lista order by venta, orden, variacion_id))[1] lista,
             (array_agg(descuento_pct order by venta, orden, variacion_id))[1] descuento_pct,
             (array_agg(variacion_id order by venta, orden, variacion_id))[1] variacion_id
        from v group by producto_id
    ), vend as (
      select va.producto_id, sum(l.cantidad)::int n
        from pedido_linea l join pedido pe on pe.id = l.pedido_id join variacion va on va.id = l.variacion_id
       where pe.organizacion_id = $1 and pe.estado not in ('cancelado', 'devuelto')
       group by va.producto_id
    )
    select p.id::int, p.titulo, p.marca, p.familia_id::int, extract(epoch from p.creado_ts)::bigint::text creado, p.sku_base,
           a.variacion_id::int, a.variaciones, a.lista, a.venta, a.venta_max, a.descuento_pct, a.stock, a.skus,
           coalesce((select url from producto_foto where producto_id = p.id order by orden, id limit 1),
                    (select url from variacion_foto where variacion_id = a.variacion_id order by orden, id limit 1)) foto,
           coalesce(vend.n, 0) vendidos
      from a join producto p on p.id = a.producto_id left join vend on vend.producto_id = p.id`,
  [org, canalId, listaId, moneda]);
  return filas.map((f) => ({
    id: f.id, titulo: f.titulo, marca: f.marca?.trim() || null, familiaId: f.familia_id, creado: Number(f.creado),
    venta: Number(f.venta), ventaMax: Number(f.venta_max), lista: Number(f.lista), descuentoPct: Number(f.descuento_pct), stock: f.stock,
    variaciones: f.variaciones, variacionId: f.variacion_id, foto: f.foto, vendidos: f.vendidos,
    texto: normalizar(`${f.titulo} ${f.marca ?? ""} ${f.sku_base} ${f.skus ?? ""}`),
  }));
}

/** Todo lo que vende la tienda (los sin stock se sacan si la tienda los oculta). */
export const catalogoDe = cache(async (t: Tienda): Promise<ProductoBase[]> => {
  if (!t.listaId) return [];
  const todos = await unstable_cache(
    () => leerCatalogo(t.organizacionId, t.canalId, t.listaId!, t.moneda),
    // "v2": descuentos de la web cargados el 7/10 (la copia guardada no se renovaba sola).
    ["tienda-catalogo", "v2", String(t.canalId), String(t.listaId), t.moneda],
    { revalidate: 60, tags: [`tienda-${t.canalId}`] },
  )();
  return ocultaSinStock(t) ? todos.filter((p) => p.stock > 0) : todos;
});

// ── Categorías ───────────────────────────────────────────
export type Familia = { id: number; nombre: string };
export type NodoFamilia = { id: number; nombre: string; padreId: number | null; total: number; hijas: NodoFamilia[]; foto: string | null };

const familiasDeOrg = (org: string) => unstable_cache(
  () => consulta<{ id: number; nombre: string; padre_id: number | null }>(
    "select id::int, nombre, padre_id::int from familia where organizacion_id = $1", [org]),
  ["tienda-familias", org], { revalidate: 300, tags: [`familias-${org}`] },
)();

/** Árbol de categorías que tienen productos en la tienda, con cuántos tiene
 *  cada una (contando sus subcategorías) y la foto de su producto más vendido. */
export const arbolDe = cache(async (t: Tienda) => {
  const [familias, catalogo] = await Promise.all([familiasDeOrg(t.organizacionId), catalogoDe(t)]);
  const padre = new Map(familias.map((f) => [f.id, f.padre_id]));
  const nombre = new Map(familias.map((f) => [f.id, f.nombre]));
  const memo = new Map<number, number[]>();
  /** La familia y todas las de más arriba (hasta la raíz). */
  const cadena = (id: number | null): number[] => {
    if (id == null || !nombre.has(id)) return [];
    const ya = memo.get(id);
    if (ya) return ya;
    const r: number[] = [];
    for (let x: number | null | undefined = id, n = 0; x != null && nombre.has(x) && n < 25; x = padre.get(x), n++) r.push(x);
    memo.set(id, r);
    return r;
  };
  const total = new Map<number, number>();
  const mejor = new Map<number, ProductoBase>();
  for (const p of catalogo) {
    for (const f of cadena(p.familiaId)) {
      total.set(f, (total.get(f) ?? 0) + 1);
      const m = mejor.get(f);
      if (p.foto && (!m || p.vendidos > m.vendidos || (p.vendidos === m.vendidos && p.stock > m.stock))) mejor.set(f, p);
    }
  }
  const nodos = new Map<number, NodoFamilia>();
  for (const [id, n] of total) nodos.set(id, { id, nombre: nombre.get(id)!, padreId: padre.get(id) ?? null, total: n, hijas: [], foto: mejor.get(id)?.foto ?? null });
  const raices: NodoFamilia[] = [];
  for (const n of nodos.values()) {
    const p = n.padreId != null ? nodos.get(n.padreId) : undefined;
    if (p) p.hijas.push(n); else raices.push(n);
  }
  const ordenar = (l: NodoFamilia[]) => { l.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")); l.forEach((x) => ordenar(x.hijas)); };
  ordenar(raices);
  return { raices, nodos, cadena };
});

/** Para el menú (va al navegador): hasta tres niveles, sin fotos. */
export type ItemMenu = { id: number; nombre: string; total: number; hijas: ItemMenu[] };
export function arbolParaMenu(raices: NodoFamilia[], nivel = 0): ItemMenu[] {
  return raices.map((n) => ({ id: n.id, nombre: n.nombre, total: n.total, hijas: nivel < 2 ? arbolParaMenu(n.hijas, nivel + 1) : [] }));
}

/** Una familia, su camino desde la raíz y sus subfamilias con productos. */
export async function familiaConCamino(t: Tienda, id: number) {
  const f = await una<{ id: number; nombre: string; descripcion: string | null }>(
    "select id::int, nombre, descripcion from familia where id = $1 and organizacion_id = $2", [id, t.organizacionId]);
  if (!f) return null;
  const { nodos, cadena } = await arbolDe(t);
  const camino = cadena(id).slice(1).reverse().map((x) => ({ id: x, nombre: nodos.get(x)?.nombre ?? "" })).filter((x) => x.nombre);
  return { ...f, camino, hijas: nodos.get(id)?.hijas ?? [] };
}

// ── Cucardas ─────────────────────────────────────────────
export type Cucarda = { nombre: string; color: string };

/** Cucardas vigentes hoy de cada producto: las propias y las de su familia (y familias de más arriba). */
export async function cucardasDe(org: string, productos: number[]): Promise<Map<number, Cucarda[]>> {
  const m = new Map<number, Cucarda[]>();
  if (!productos.length) return m;
  const filas = await consulta<{ producto_id: number; nombre: string; color: string }>(`
    with recursive cad as (
      select p.id producto_id, p.familia_id fid, 0 n from producto p where p.organizacion_id = $1 and p.id = any($2::bigint[]) and p.familia_id is not null
      union all select cad.producto_id, f.padre_id, cad.n + 1 from cad join familia f on f.id = cad.fid where f.padre_id is not null and cad.n < 20
    ), todas as (
      select producto_id, cucarda_id, desde, hasta from producto_cucarda where organizacion_id = $1 and producto_id = any($2::bigint[])
      union all
      select cad.producto_id, fc.cucarda_id, fc.desde, fc.hasta from cad join familia_cucarda fc on fc.familia_id = cad.fid and fc.organizacion_id = $1
    )
    select producto_id::int, nombre, color from (
      select distinct on (x.producto_id, c.id) x.producto_id, c.nombre, c.color, c.orden
        from todas x join cucarda c on c.id = x.cucarda_id and c.estado = 'activa'
       where (x.desde is null or x.desde <= $3::date) and (x.hasta is null or x.hasta >= $3::date)
       order by x.producto_id, c.id
    ) s order by orden, nombre`, [org, productos, hoyAR()]);
  for (const f of filas) {
    const l = m.get(f.producto_id) ?? [];
    l.push({ nombre: f.nombre, color: /^#[0-9a-f]{3,8}$/i.test(f.color) ? f.color : COLOR_POR_DEFECTO });
    m.set(f.producto_id, l);
  }
  return m;
}

// ── Envío ────────────────────────────────────────────────
export type InfoEnvio = {
  /** Desde qué precio el envío es gratis (0 = siempre; null = nunca). Sólo en pesos. */
  gratisDesde: number | null;
  /** ¿Hay envío a domicilio? ¿Y retiro? */
  aDomicilio: { nombre: string; plazo: string | null; costo: number | null } | null;
  retiro: { nombre: string; plazo: string | null } | null;
};

/** Lo que dicen los métodos de envío activos de la tienda (sin Andreani, que todavía no cotiza; OCA cuenta como envío a domicilio, sin costo fijo). */
export const envioDe = cache(async (t: Tienda): Promise<InfoEnvio> => {
  const ms = await consulta<{ tipo: string; nombre: string; plazo: string | null; costo_ars: string; gratis_desde_ars: string | null }>(`
    select tipo, nombre, plazo, costo_ars, gratis_desde_ars from metodo_envio
     where organizacion_id = $1 and activo and (canal_id is null or canal_id = $2) and tipo <> 'andreani' order by orden, id`,
  [t.organizacionId, t.canalId]);
  const envios = ms.filter((m) => m.tipo === "tarifa_fija" || m.tipo === "por_provincia");
  const umbrales = envios.flatMap((m) => [
    ...(m.gratis_desde_ars != null ? [Number(m.gratis_desde_ars)] : []),
    ...(m.tipo === "tarifa_fija" && Number(m.costo_ars) === 0 ? [0] : []),
  ]);
  const dom = envios[0] ?? ms.find((m) => m.tipo === "oca" || m.tipo === "oca_sucursal") ?? ms.find((m) => m.tipo === "a_convenir");
  const ret = ms.find((m) => m.tipo === "retiro");
  return {
    gratisDesde: t.moneda === "ARS" && umbrales.length ? Math.min(...umbrales) : null,
    aDomicilio: dom ? { nombre: dom.nombre, plazo: dom.plazo, costo: dom.tipo === "tarifa_fija" ? Number(dom.costo_ars) : null } : null,
    retiro: ret ? { nombre: ret.nombre, plazo: ret.plazo } : null,
  };
});

export const envioGratis = (e: InfoEnvio, precio: number) => e.gratisDesde != null && precio >= e.gratisDesde;

// ── Tarjetas y listados ──────────────────────────────────
export type Tarjeta = ProductoBase & {
  cucardas: Cucarda[]; plan: Plan | null; envioGratis: boolean; masVendido: boolean;
};

export type Orden = "relevancia" | "menor" | "mayor" | "vendidos";
export const esOrden = (x: unknown): x is Orden => x === "relevancia" || x === "menor" || x === "mayor" || x === "vendidos";

/** Los más vendidos de la tienda (los que llevan la etiqueta "MÁS VENDIDO"). */
const masVendidosDe = cache(async (t: Tienda) =>
  new Set((await catalogoDe(t)).filter((p) => p.vendidos >= 3).sort((a, b) => b.vendidos - a.vendidos).slice(0, 10).map((p) => p.id)));

/** De productos del catálogo a tarjetas: cucardas, plan de cuotas y envío. */
export async function aTarjetas(t: Tienda, productos: ProductoBase[]): Promise<Tarjeta[]> {
  if (!productos.length) return [];
  const [cucardas, planes, envio, top] = await Promise.all([
    cucardasDe(t.organizacionId, productos.map((p) => p.id)),
    planesDeVariaciones(t.organizacionId, productos.map((p) => p.variacionId)),
    envioDe(t), masVendidosDe(t),
  ]);
  return productos.map((p) => ({
    ...p, cucardas: cucardas.get(p.id) ?? [], plan: planParaMostrar(planes.get(p.variacionId) ?? []),
    envioGratis: envioGratis(envio, p.venta), masVendido: top.has(p.id),
  }));
}

/** Filtra por palabras (todas tienen que estar: en el título, la marca o los SKU). */
export function filtrarPorTexto(lista: ProductoBase[], q: string) {
  const palabras = normalizar(q).split(/\s+/).filter(Boolean).slice(0, 8);
  return palabras.length ? lista.filter((p) => palabras.every((w) => p.texto.includes(w))) : lista;
}

export function ordenar(lista: ProductoBase[], orden: Orden, q?: string | null) {
  const n = normalizar(q ?? "").trim();
  const t = (p: ProductoBase) => normalizar(p.titulo);
  const nuevo = (a: ProductoBase, b: ProductoBase) => b.creado - a.creado || b.id - a.id;
  const copia = [...lista];
  if (orden === "menor") return copia.sort((a, b) => a.venta - b.venta || b.id - a.id);
  if (orden === "mayor") return copia.sort((a, b) => b.venta - a.venta || b.id - a.id);
  if (orden === "vendidos") return copia.sort((a, b) => b.vendidos - a.vendidos || nuevo(a, b));
  if (n) {
    const puntos = (p: ProductoBase) => (t(p).startsWith(n) ? 2 : t(p).includes(n) ? 1 : 0);
    return copia.sort((a, b) => puntos(b) - puntos(a) || (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0) || nuevo(a, b));
  }
  // Sin buscar nada: primero los que tienen stock, los más nuevos arriba.
  return copia.sort((a, b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0) || nuevo(a, b));
}

export type Filtros = {
  q?: string | null; familiaId?: number | null; orden: Orden; pagina: number;
  min?: number | null; max?: number | null; envioGratis?: boolean; marca?: string | null; ofertas?: boolean;
};

export type Facetas = {
  familias: { id: number; nombre: string; cantidad: number }[];
  marcas: { nombre: string; cantidad: number }[];
  precios: { min: number | null; max: number | null; cantidad: number }[];
  envioGratis: number; ofertas: number; hayEnvioGratis: boolean;
};

/** Redondea a un número "lindo" (dos cifras significativas). */
const lindo = (x: number) => {
  if (x <= 0) return 0;
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 1));
  return Math.round(x / p) * p;
};

/** Listado con filtros, facetas (lo que muestra la columna de la izquierda), orden y página. */
export async function buscarProductos(t: Tienda, f: Filtros, porPagina = POR_PAGINA): Promise<{ productos: Tarjeta[]; total: number; facetas: Facetas }> {
  const [catalogo, arbol, envio] = await Promise.all([catalogoDe(t), arbolDe(t), envioDe(t)]);
  let base = f.q ? filtrarPorTexto(catalogo, f.q) : catalogo;
  if (f.familiaId) base = base.filter((p) => arbol.cadena(p.familiaId).includes(f.familiaId!));
  if (f.marca) { const m = normalizar(f.marca); base = base.filter((p) => p.marca && normalizar(p.marca) === m); }
  if (f.envioGratis) base = base.filter((p) => envioGratis(envio, p.venta));
  if (f.ofertas) base = base.filter((p) => p.lista > p.venta);
  // Los rangos de precio se arman con lo que queda ANTES de filtrar por precio.
  const precios = base.map((p) => p.venta).sort((a, b) => a - b);
  let rangos: Facetas["precios"] = [];
  if (precios.length >= 6) {
    const a = lindo(precios[Math.floor(precios.length / 3)]), b = lindo(precios[Math.floor((precios.length * 2) / 3)]);
    if (a > 0 && b > a) {
      rangos = [
        { min: null, max: a, cantidad: precios.filter((x) => x <= a).length },
        { min: a, max: b, cantidad: precios.filter((x) => x > a && x <= b).length },
        { min: b, max: null, cantidad: precios.filter((x) => x > b).length },
      ];
    }
  }
  if (f.min != null) base = base.filter((p) => p.venta >= f.min!);
  if (f.max != null) base = base.filter((p) => p.venta <= f.max!);

  // Categorías: las hijas de la elegida (o las de primer nivel), con cuántos quedan en cada una.
  const hijas = f.familiaId ? arbol.nodos.get(f.familiaId)?.hijas ?? [] : arbol.raices;
  const cuenta = new Map<number, number>();
  const marcas = new Map<string, { nombre: string; cantidad: number }>();
  for (const p of base) {
    for (const id of arbol.cadena(p.familiaId)) cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
    if (p.marca) {
      const k = normalizar(p.marca);
      const m = marcas.get(k) ?? { nombre: p.marca, cantidad: 0 };
      m.cantidad++;
      marcas.set(k, m);
    }
  }
  const facetas: Facetas = {
    familias: hijas.map((h) => ({ id: h.id, nombre: h.nombre, cantidad: cuenta.get(h.id) ?? 0 })).filter((x) => x.cantidad > 0)
      .sort((a, b) => b.cantidad - a.cantidad),
    marcas: [...marcas.values()].sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre)).slice(0, 12),
    precios: rangos,
    envioGratis: base.filter((p) => envioGratis(envio, p.venta)).length,
    ofertas: base.filter((p) => p.lista > p.venta).length,
    hayEnvioGratis: envio.gratisDesde != null,
  };
  const ordenados = ordenar(base, f.orden, f.q);
  const pagina = Math.max(1, f.pagina);
  const productos = await aTarjetas(t, ordenados.slice((pagina - 1) * porPagina, pagina * porPagina));
  return { productos, total: base.length, facetas };
}

/** El estado del pedido como lo entiende el comprador. */
export function estadoCriollo(estado: string, estadoPago: string, metodoTipo: string | null): { texto: string; color: string } {
  if (estado === "cancelado") return { texto: "Cancelado", color: "bg-gray-200 text-gray-700" };
  if (estado === "devuelto") return { texto: "Devuelto", color: "bg-gray-200 text-gray-700" };
  if (estado === "entregado") return { texto: "Entregado", color: "bg-green-100 text-green-800" };
  if (estado === "despachado") return { texto: "En camino", color: "bg-blue-100 text-blue-800" };
  if (estado === "preparado") return { texto: metodoTipo === "retiro" ? "Listo para retirar" : "Listo para enviar", color: "bg-blue-100 text-blue-800" };
  if (estado === "en_preparacion") return { texto: "En preparación", color: "bg-blue-100 text-blue-800" };
  if (estado === "pagado" || estadoPago === "pagado") return { texto: "Pagado", color: "bg-green-100 text-green-800" };
  if (estadoPago === "a_convenir") return { texto: "Recibido", color: "bg-blue-100 text-blue-800" };
  if (estadoPago === "a_cobrar") return { texto: "Recibido · lo pagás al retirar", color: "bg-amber-100 text-amber-900" };
  return { texto: "Pendiente de pago", color: "bg-amber-100 text-amber-900" };
}
