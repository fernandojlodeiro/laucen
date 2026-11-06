// Lo que se ve de Market Pro (Fer, 5/11): todo sale de las filas por mes (mpro_venta grano m) de los meses CERRADOS
// (el que corre está incompleto y engaña). Se agrupa por categoría, producto, vendedor o marca, con:
//   unidades, facturación (GMV), ticket (facturación ÷ unidades), publicaciones y vendedores con ventas,
//   «líder»: qué parte de las unidades se lleva el vendedor que más vende,
//   crecimiento: unidades de los últimos 3 meses cerrados contra los 3 anteriores,
//   Full / Premium / catálogo: qué parte de las unidades se vendió así,
//   conversión: ventas ÷ visitas (promedio ponderado por visitas),
//   puntaje de oportunidad (0–100 dentro de la lista): mucha facturación por mes, creciendo, con pocos vendedores y sin
//   un líder que se lleve todo.
// Cruce con lo nuestro (Market Pro cifra el número de publicación): una publicación es nuestra si su vendedor quedó
// identificado como una de nuestras cuentas (lib/marketpro/vendedores.ts); un producto «lo tenés» si es el mismo producto
// de catálogo que una publicación nuestra (meli_item) o si el EAN es el código de barras de una variación nuestra.
// Ganancia estimada con el
// costo promedio (sin IVA) de esa variación: precio × (100 − comisión Clásica %) ÷ 121 − costo (como en precio_vs_ml:
// la comisión trae IVA). Sin envío, cargos fijos ni impuestos: es para comparar, no para fijar precios.

import { consulta, una } from "@/lib/erp/base";

export type Filtro = { cat: number | null; meses: number; q: string; vendedor: string | null; marca: string | null; producto: string | null; tuyos: string | null };

export function leerFiltro(sp: Record<string, string | undefined>): Filtro {
  const cat = Number(sp.cat);
  const meses = Number(sp.meses);
  return {
    cat: Number.isInteger(cat) && cat > 0 ? cat : null,
    meses: [1, 3, 6, 12, 24, 36].includes(meses) ? meses : 12,
    q: (sp.q ?? "").trim(),
    vendedor: sp.vendedor?.trim() || null,
    marca: sp.marca?.trim() || null,
    producto: sp.producto?.trim() || null,
    tuyos: sp.tuyos === "si" || sp.tuyos === "no" ? sp.tuyos : null,
  };
}

/** El último mes cerrado con datos (o null si no hay nada bajado). */
export async function ultimoMes(org: string): Promise<string | null> {
  const r = await una<{ m: string | null }>(`
    select to_char(max(periodo), 'YYYY-MM-DD') m from mpro_venta
     where organizacion_id = $1 and grano = 'm' and periodo < date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date`, [org]);
  return r?.m ?? null;
}

// La base de toda consulta: filas por mes de la ventana (como mínimo 6 meses, para el crecimiento), con lo fijo de la
// publicación. $1 org, $2 último mes, $3 meses de la ventana, $4 categoría (con sus hijas), $5 vendedor, $6 marca, $7 producto.
const BASE = `
  with yo as (
    -- Los apodos que son nuestras cuentas (lib/marketpro/vendedores.ts los identifica por catálogo).
    select mv.apodo from mpro_vendedor mv join meli_cuenta mc on mc.organizacion_id = mv.organizacion_id and mc.meli_user_id = mv.seller_id
     where mv.organizacion_id = $1 and mv.estado = 'ok'
  ),
  base as (
    select v.periodo, v.item_id, v.vendidas, v.gmv, v.precio, v.envio, v.tipo, v.catalogo, v.conversion, v.visitas_dia,
           p.producto, p.vendedor, p.alias, coalesce(p.marca, '—') marca, p.vendedor in (select apodo from yo) es_nuestra, p.cat, p.titulo, p.foto, p.ean, p.reputacion, p.provincia,
           v.periodo > $2::date - make_interval(months => $3::int) en_ventana,
           v.periodo > $2::date - interval '3 months' ult3,
           v.periodo <= $2::date - interval '3 months' and v.periodo > $2::date - interval '6 months' ant3
      from mpro_venta v join mpro_publicacion p on p.organizacion_id = v.organizacion_id and p.item_id = v.item_id
     where v.organizacion_id = $1 and v.grano = 'm' and v.periodo <= $2::date
       and v.periodo > $2::date - make_interval(months => greatest($3::int, 6))
       and ($4::int is null or p.cat in (select category_id from mpro_categoria where pais = 'ar' and (category_id = $4 or $4 = any(padres))))
       and ($5::text is null or p.vendedor = $5) and ($6::text is null or lower(p.marca) = lower($6)) and ($7::text is null or p.producto = $7)
  ),
  tuyos as (
    -- Nuestros productos por producto de catálogo de ML (Market Pro no da el número de publicación: viene cifrado).
    select distinct on (producto) producto, variacion_id from (
      select 'c:' || regexp_replace(mi.datos_externos -> 'ml' ->> 'catalog_product_id', '^MLA', '') producto, pu.variacion_id
        from meli_item mi join publicacion pu on pu.id = mi.publicacion_id
       where mi.organizacion_id = $1 and mi.datos_externos -> 'ml' ->> 'catalog_product_id' is not null) t
     order by producto, variacion_id
  )`;

const params = (org: string, mes: string, f: Filtro) => [org, mes, f.meses, f.cat, f.vendedor, f.marca, f.producto];

// Las medidas comunes de un grupo (sobre `base`, agrupado). `g` es la expresión del grupo.
const MEDIDAS = `
    sum(b.vendidas) filter (where b.en_ventana)::int unidades,
    sum(b.gmv) filter (where b.en_ventana)::float8 gmv,
    (sum(b.gmv) filter (where b.en_ventana) / nullif(sum(b.vendidas) filter (where b.en_ventana), 0))::float8 ticket,
    count(distinct b.item_id) filter (where b.en_ventana and b.vendidas > 0)::int publicaciones,
    count(distinct b.vendedor) filter (where b.en_ventana and b.vendidas > 0)::int vendedores,
    (sum(b.vendidas) filter (where b.ult3)::float8 / nullif(sum(b.vendidas) filter (where b.ant3), 0) - 1) crecimiento,
    (sum(b.vendidas) filter (where b.en_ventana and b.envio = 'full')::float8 / nullif(sum(b.vendidas) filter (where b.en_ventana), 0)) full_pct,
    (sum(b.vendidas) filter (where b.en_ventana and b.tipo in ('premium', 'gold_pro'))::float8 / nullif(sum(b.vendidas) filter (where b.en_ventana), 0)) premium_pct,
    (sum(b.vendidas) filter (where b.en_ventana and b.catalogo)::float8 / nullif(sum(b.vendidas) filter (where b.en_ventana), 0)) catalogo_pct,
    (sum(b.conversion * b.visitas_dia) filter (where b.en_ventana)::float8 / nullif(sum(b.visitas_dia) filter (where b.en_ventana and b.conversion is not null), 0)) conversion`;

export type Medidas = {
  unidades: number; gmv: number; ticket: number | null; publicaciones: number; vendedores: number; crecimiento: number | null;
  full_pct: number | null; premium_pct: number | null; catalogo_pct: number | null; conversion: number | null; lider_pct: number | null; puntaje: number | null;
};

/** El puntaje de oportunidad, 0–100 dentro de la lista. */
function puntuar<T extends Medidas>(filas: T[], meses: number): T[] {
  const crudo = filas.map((f) => {
    if (!f.gmv || f.unidades < 3) return 0;
    const crec = Math.max(-0.5, Math.min(1, f.crecimiento ?? 0));
    return Math.log1p(f.gmv / meses) * (1 + crec) * (1 - 0.5 * (f.lider_pct ?? 0)) / Math.log(2 + f.vendedores);
  });
  const max = Math.max(0, ...crudo);
  return filas.map((f, i) => ({ ...f, puntaje: max > 0 ? Math.round((crudo[i] / max) * 100) : null }));
}

// ---- Resumen por mes ----

export type Mes = { mes: string; unidades: number; gmv: number; publicaciones: number; vendedores: number; ticket: number | null; total_pubs: number | null };

export async function serieMensual(org: string, f: Pick<Filtro, "cat" | "vendedor" | "marca" | "producto">): Promise<Mes[]> {
  return consulta<Mes>(`
    select to_char(v.periodo, 'YYYY-MM') mes, sum(v.vendidas)::int unidades, sum(v.gmv)::float8 gmv, count(distinct v.item_id) filter (where v.vendidas > 0)::int publicaciones,
           count(distinct p.vendedor) filter (where v.vendidas > 0)::int vendedores, (sum(v.gmv) / nullif(sum(v.vendidas), 0))::float8 ticket,
           (select c.publicaciones from mpro_conteo c where c.organizacion_id = $1 and c.category_id = $2 and c.mes = v.periodo) total_pubs
      from mpro_venta v join mpro_publicacion p on p.organizacion_id = v.organizacion_id and p.item_id = v.item_id
     where v.organizacion_id = $1 and v.grano = 'm'
       and ($2::int is null or p.cat in (select category_id from mpro_categoria where pais = 'ar' and (category_id = $2 or $2 = any(padres))))
       and ($3::text is null or p.vendedor = $3) and ($4::text is null or lower(p.marca) = lower($4)) and ($5::text is null or p.producto = $5)
     group by v.periodo order by v.periodo`, [org, f.cat, f.vendedor, f.marca, f.producto]);
}

// ---- Por grupo ----

export type FilaCategoria = Medidas & { cat: number; ruta: string | null; comision: number | null };
export type FilaProducto = Medidas & {
  producto: string; titulo: string | null; foto: string | null; marca: string; cat: number | null; ruta: string | null; precio_min: number | null; precio_mediana: number | null;
  item_top: string | null; lider: string | null; tuyo_producto: number | null; tuyo_costo: number | null; nuestras: number; comision: number | null;
};
export type FilaVendedor = Medidas & { vendedor: string; alias: string | null; nombre: string | null; seller_id: number | null; reputacion: string | null; provincia: string | null; productos: number; nuestras: number; categoria_top: string | null };
export type FilaMarca = Medidas & { marca: string; productos: number };

async function conLider<T extends Medidas>(org: string, mes: string, f: Filtro, grupo: string, sql: string, extra: unknown[] = []): Promise<T[]> {
  const filas = await consulta<T>(`${BASE},
    lider as (
      select g, max(u)::float8 / nullif(sum(u), 0) lider_pct, (array_agg(vendedor order by u desc))[1] lider
        from (select ${grupo} g, vendedor, sum(vendidas) u from base where en_ventana group by 1, 2) x group by g
    )
    ${sql}`, [...params(org, mes, f), ...extra]);
  return filas;
}

export async function porCategoria(org: string, mes: string, f: Filtro): Promise<FilaCategoria[]> {
  const filas = await conLider<FilaCategoria>(org, mes, f, "cat", `
    select b.cat, c.ruta, ${MEDIDAS}, max(l.lider_pct) lider_pct,
           (select cv.clasica_pct::float8 from ml_costos_comisiones_vigente cv where cv.categoria_id = 'MLA' || b.cat) comision
      from base b left join lider l on l.g = b.cat left join mpro_categoria c on c.pais = 'ar' and c.category_id = b.cat
     group by b.cat, c.ruta having sum(vendidas) filter (where en_ventana) > 0`);
  return puntuar(filas, f.meses).sort((a, b) => b.gmv - a.gmv);
}

export async function porProducto(org: string, mes: string, f: Filtro): Promise<FilaProducto[]> {
  const filas = await conLider<FilaProducto>(org, mes, f, "producto", `,
    agr as (
      select b.producto, ${MEDIDAS},
             (array_agg(b.titulo order by b.vendidas desc))[1] titulo, (array_agg(b.foto order by b.vendidas desc) filter (where b.foto is not null))[1] foto,
             (array_agg(b.marca order by b.vendidas desc))[1] marca, (array_agg(b.cat order by b.vendidas desc))[1] cat,
             (array_agg(b.item_id order by b.vendidas desc))[1] item_top,
             min(b.precio) filter (where en_ventana and b.vendidas > 0 and b.periodo > $2::date - interval '3 months')::float8 precio_min,
             percentile_cont(0.5) within group (order by b.precio) filter (where en_ventana and b.vendidas > 0 and b.periodo > $2::date - interval '3 months')::float8 precio_mediana,
             (array_agg(distinct b.ean) filter (where b.ean is not null)) eans,
             count(distinct b.item_id) filter (where b.es_nuestra)::int nuestras
        from base b
       where $8::text = '' or b.titulo ilike '%' || $8 || '%' or b.marca ilike $8 || '%' or b.item_id = upper($8)
       group by b.producto having sum(vendidas) filter (where en_ventana) > 0
    )
    select a.*, l.lider_pct, l.lider, c.ruta,
           (select cv.clasica_pct::float8 from ml_costos_comisiones_vigente cv where cv.categoria_id = 'MLA' || a.cat) comision,
           coalesce(vn.producto_id, ve.producto_id)::int tuyo_producto, coalesce(vn.costo_promedio_ars, ve.costo)::float8 tuyo_costo
      from agr a left join lider l on l.g = a.producto left join mpro_categoria c on c.pais = 'ar' and c.category_id = a.cat
      left join tuyos tu on tu.producto = a.producto left join variacion vn on vn.id = tu.variacion_id
      left join lateral (select va.producto_id, va.costo_promedio_ars costo from variacion va
                          where va.organizacion_id = $1 and a.eans is not null and va.codigo_barras = any(a.eans) limit 1) ve on true`, [f.q]);
  const conTuyos = f.tuyos === "si" ? filas.filter((x) => x.tuyo_producto) : f.tuyos === "no" ? filas.filter((x) => !x.tuyo_producto) : filas;
  return puntuar(conTuyos, f.meses).sort((a, b) => b.gmv - a.gmv);
}

export async function porVendedor(org: string, mes: string, f: Filtro): Promise<FilaVendedor[]> {
  const filas = await conLider<FilaVendedor>(org, mes, f, "vendedor", `,
    cattop as (
      select distinct on (vendedor) vendedor, cat from (select vendedor, cat, sum(gmv) g from base where en_ventana group by 1, 2) x
       order by vendedor, g desc nulls last
    )
    select b.vendedor, (array_agg(b.alias) filter (where b.alias is not null))[1] alias, max(mv.nombre) nombre, max(mv.seller_id)::float8 seller_id,
           ${MEDIDAS}, null::float8 lider_pct,
           (array_agg(b.reputacion order by b.periodo desc))[1] reputacion, (array_agg(b.provincia order by b.periodo desc))[1] provincia,
           count(distinct b.producto) filter (where en_ventana and b.vendidas > 0)::int productos,
           count(distinct b.item_id) filter (where en_ventana and b.es_nuestra)::int nuestras,
           max(c.ruta) categoria_top
      from base b left join cattop t on t.vendedor = b.vendedor
      left join mpro_vendedor mv on mv.organizacion_id = $1 and mv.apodo = b.vendedor and mv.estado = 'ok'
      left join mpro_categoria c on c.pais = 'ar' and c.category_id = t.cat
     where b.vendedor is not null and ($8::text = '' or b.vendedor ilike '%' || $8 || '%')
     group by b.vendedor having sum(vendidas) filter (where en_ventana) > 0`, [f.q]);
  // La «parte del mercado» de un vendedor: su facturación sobre la del total filtrado.
  const total = filas.reduce((s, x) => s + (x.gmv || 0), 0);
  return filas.map((x) => ({ ...x, lider_pct: total ? x.gmv / total : null, puntaje: null })).sort((a, b) => b.gmv - a.gmv);
}

export async function porMarca(org: string, mes: string, f: Filtro): Promise<FilaMarca[]> {
  const filas = await conLider<FilaMarca>(org, mes, f, "marca", `
    select b.marca, ${MEDIDAS}, max(l.lider_pct) lider_pct, count(distinct b.producto) filter (where en_ventana and b.vendidas > 0)::int productos
      from base b left join lider l on l.g = b.marca
     where $8::text = '' or b.marca ilike $8 || '%'
     group by b.marca having sum(vendidas) filter (where en_ventana) > 0`, [f.q]);
  return puntuar(filas, f.meses).sort((a, b) => b.gmv - a.gmv);
}

// ---- Ficha de un producto: quién lo vende y a cuánto ----

export type Oferta = {
  item_id: string; vendedor: string | null; alias: string | null; nombre: string | null; reputacion: string | null; provincia: string | null; titulo: string | null; foto: string | null;
  unidades: number; gmv: number; precio: number | null; envio: string | null; tipo: string | null; catalogo: boolean | null; conversion: number | null;
  visitas_dia: number | null; dias_activa: number | null; nuestra: boolean;
};

export async function ofertasDeProducto(org: string, mes: string, f: Filtro): Promise<Oferta[]> {
  return consulta<Oferta>(`${BASE}
    select b.item_id, max(b.vendedor) vendedor, max(b.alias) alias, (select mv.nombre from mpro_vendedor mv where mv.organizacion_id = $1 and mv.apodo = max(b.vendedor) and mv.estado = 'ok') nombre, max(b.reputacion) reputacion, max(b.provincia) provincia, max(b.titulo) titulo, max(b.foto) foto,
           sum(b.vendidas) filter (where en_ventana)::int unidades, sum(b.gmv) filter (where en_ventana)::float8 gmv,
           (array_agg(b.precio order by b.periodo desc))[1]::float8 precio, (array_agg(b.envio order by b.periodo desc))[1] envio,
           (array_agg(b.tipo order by b.periodo desc))[1] tipo, (array_agg(b.catalogo order by b.periodo desc))[1] catalogo,
           (array_agg(b.conversion order by b.periodo desc))[1]::float8 conversion, (array_agg(b.visitas_dia order by b.periodo desc))[1]::float8 visitas_dia,
           (select v.dias_activa from mpro_venta v where v.organizacion_id = $1 and v.item_id = b.item_id order by v.periodo desc limit 1) dias_activa,
           bool_or(b.es_nuestra) nuestra
      from base b group by b.item_id having sum(b.vendidas) filter (where en_ventana) > 0 order by 8 desc nulls last`, params(org, mes, f));
}

/** Los atributos de la publicación más vendida del producto (del último mes cerrado). */
export async function atributosDe(org: string, itemId: string): Promise<{ nombre: string; valor: string }[]> {
  const r = await una<{ atributos: unknown }>("select atributos from mpro_atributos where organizacion_id = $1 and item_id = $2", [org, itemId]);
  const a = r?.atributos;
  if (!a) return [];
  if (Array.isArray(a)) return a.map((x) => {
    const o = x as Record<string, unknown>;
    return { nombre: String(o.name ?? o.id ?? ""), valor: String(o.value_name ?? o.value ?? (Array.isArray(o.values) ? (o.values as { name?: string }[]).map((v) => v.name).join(", ") : "")) };
  }).filter((x) => x.nombre && x.valor && x.valor !== "null");
  if (typeof a === "object") return Object.entries(a as Record<string, unknown>).map(([nombre, v]) => ({ nombre, valor: typeof v === "string" ? v : JSON.stringify(v) }));
  return [{ nombre: "Atributos", valor: String(a) }];
}

// ---- Estado de la descarga ----

export type AvanceCategoria = {
  category_id: number; ruta: string | null; habilitada: boolean | null; publicaciones: number | null;
  meses_listos: number; meses_total: number; dias_listos: number; dias_total: number; filas: number; pendientes: number; errores: number;
};

export async function avance(org: string): Promise<{ categorias: AvanceCategoria[]; cola: { pendientes: number; errores: number; pedidos: number; filas: number; probando: number; arbol: string | null }; errores: { id: number; tipo: string; clave: string; error: string | null }[]; venta: { filas: number; pubs: number } }> {
  const [categorias, cola, errores, venta] = await Promise.all([
    consulta<AvanceCategoria>(`
      select s.category_id, coalesce(s.ruta, c.ruta) ruta, s.habilitada, s.publicaciones,
             count(*) filter (where d.tipo = 'mes' and d.estado = 'terminada')::int meses_listos, count(*) filter (where d.tipo = 'mes')::int meses_total,
             count(*) filter (where d.tipo = 'dia' and d.estado = 'terminada')::int dias_listos, count(*) filter (where d.tipo = 'dia')::int dias_total,
             coalesce(sum(d.filas) filter (where d.tipo in ('mes', 'dia')), 0)::int filas,
             count(*) filter (where d.estado in ('pendiente', 'corriendo'))::int pendientes, count(*) filter (where d.estado = 'error')::int errores
        from mpro_seguida s left join mpro_categoria c on c.pais = 'ar' and c.category_id = s.category_id
        left join mpro_descarga d on d.organizacion_id = s.organizacion_id and d.category_id = s.category_id and d.tipo in ('mes', 'dia', 'conteo')
       where s.organizacion_id = $1 group by s.category_id, s.ruta, c.ruta, s.habilitada, s.publicaciones order by coalesce(s.ruta, c.ruta)`, [org]),
    una<{ pendientes: number; errores: number; pedidos: number; filas: number; probando: number; arbol: string | null }>(`
      select count(*) filter (where estado in ('pendiente', 'corriendo'))::int pendientes, count(*) filter (where estado = 'error')::int errores,
             coalesce(sum(pedidos), 0)::int pedidos, coalesce(sum(filas) filter (where tipo in ('mes', 'dia')), 0)::int filas,
             count(*) filter (where tipo = 'probar' and estado in ('pendiente', 'corriendo'))::int probando,
             (select case when estado = 'terminada' then null else desplazamiento::text || coalesce(' de ' || total, '') end from mpro_descarga
               where organizacion_id = $1 and tipo = 'categorias' order by id desc limit 1) arbol
        from mpro_descarga where organizacion_id = $1`, [org]),
    consulta<{ id: number; tipo: string; clave: string; error: string | null }>(
      "select id::int, tipo, clave, error from mpro_descarga where organizacion_id = $1 and estado = 'error' order by id desc limit 20", [org]),
    una<{ filas: number; pubs: number }>(`select (select count(*) from mpro_venta where organizacion_id = $1)::int filas,
                                                 (select count(*) from mpro_publicacion where organizacion_id = $1)::int pubs`, [org]),
  ]);
  return { categorias, cola: cola ?? { pendientes: 0, errores: 0, pedidos: 0, filas: 0, probando: 0, arbol: null }, errores, venta: venta ?? { filas: 0, pubs: 0 } };
}

/** Las categorías para elegir (las seguidas y todo su árbol con datos). */
export async function categoriasParaElegir(org: string): Promise<{ valor: string; texto: string }[]> {
  const filas = await consulta<{ category_id: number; ruta: string }>(`
    select distinct c.category_id, c.ruta from mpro_categoria c
     where c.pais = 'ar' and (c.category_id in (select category_id from mpro_seguida where organizacion_id = $1 and habilitada)
        or c.category_id in (select distinct cat from mpro_publicacion where organizacion_id = $1)
        or exists (select 1 from mpro_seguida s where s.organizacion_id = $1 and s.habilitada and s.category_id = any(c.padres)
                    and c.category_id in (select unnest(padres) from mpro_categoria x where x.pais = 'ar' and x.category_id in (select distinct cat from mpro_publicacion where organizacion_id = $1))))
     order by c.ruta`, [org]);
  return filas.map((x) => ({ valor: String(x.category_id), texto: x.ruta }));
}
