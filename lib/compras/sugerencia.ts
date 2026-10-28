// Sugerencia de compra (pedido de Fer, 12/10): qué comprar para N días según el ritmo real de venta de la historia
// (lib/compras/sugerencia-calculo.ts). Todos los productos, activos o no, salvo notebooks; ventas de todos los canales
// (vista venta_estadistica, sin canceladas). Por producto:
//   · cantidad para N días según el ritmo típico y según el mejor momento, y lo que habría que comprar descontando el stock de hoy;
//   · costo: el último costo en dólares de la ficha (FOB + 40 %, o el de su compra por courier), al dólar oficial de hoy;
//   · precio: la última venta, pasada a dólares con el oficial de ese día y de ahí a pesos de hoy;
//   · ganancia estimada = precio − lo que se lleva Mercado Libre (comisión de su categoría, cargo fijo, envío) − costo.
// Sólo informa: no compra ni cambia nada.

import { unstable_cache } from "next/cache";
import { consulta, una } from "@/lib/erp/base";
import { costosMl, ritmo, sinComprasGrandes, type Grillas, type Renglon } from "@/lib/compras/sugerencia-calculo";
import { comprasDeVariaciones, duracionCompras } from "@/lib/compras/invoices";
import { CATEGORIAS_VIA, calcularVia, configVia, costosResueltos, medidasDe, type CategoriaVia } from "@/lib/compras/via";
import { mejorDelMercado, preciosDeMercado } from "@/lib/compras/precio-mercado";
import { estadosMercado, type EstadoMercado } from "@/lib/seguimiento/estado-mercado";
import { coincideBusqueda, parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { camposProductoConVariaciones } from "@/app/catalogo/busqueda";
import { hoyArgentina } from "@/lib/rango-fechas";
import { ordenarEnMemoria } from "@/lib/lista";

/** `demora`: días desde que se pide hasta que la mercadería llega al depósito (Fer, 28/10: «por lo menos 5 semanas, cerca de
 *  40 días», aun por avión). Lo que se vende mientras tanto sale del stock de hoy. */
export type FiltroSugerencia = { desde: string; hasta: string; dias: number; demora: number;
  /** «Calcular con el precio de mercado» (Fer, 28/10): todo producto con precio de mercado se calcula a ese precio, como si
   *  lo vendiera al precio del más barato, lo venda o no. */
  conMercado: boolean };

/** De entrada, lo que tarda una compra en llegar (pedido, cotización, fabricación, avión y courier hasta Córdoba). */
export const DEMORA_LLEGADA = 40;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function leerFiltroSugerencia(sp: Record<string, string | undefined>, hoy: string): FiltroSugerencia {
  const seisAnios = `${Number(hoy.slice(0, 4)) - 6}${hoy.slice(4)}`;
  const dias = Math.round(Number(sp.dias));
  const demora = sp.demora != null && sp.demora !== "" ? Math.round(Number(sp.demora)) : DEMORA_LLEGADA;
  return {
    desde: FECHA.test(sp.desde ?? "") ? sp.desde! : seisAnios,
    hasta: FECHA.test(sp.hasta ?? "") ? sp.hasta! : hoy,
    dias: Number.isFinite(dias) && dias >= 7 && dias <= 365 ? dias : 60,
    demora: Number.isFinite(demora) && demora >= 0 && demora <= 180 ? demora : DEMORA_LLEGADA,
    conMercado: sp.con_mercado === "1",
  };
}

/** Lo que queda al llegar la compra y lo que hay que comprar (pura): mientras llega se vende al mismo ritmo (`paraDias` u.
 *  cada `dias` días) y eso sale del stock de hoy; lo que se compra tiene que cubrir los `dias` días después de que llega. */
/** La cantidad a pedir, redondeada a decenas (Fer, 28/10): si la unidad es 0 a 3, baja; de 4 a 9, sube. 72 y 73 → 70;
 *  74 → 80; 12 → 10; 14 → 20; de 1 a 3 → 10 (si hace falta algo, se piden 10). Pura. */
export const redondearPedido = (n: number) => (n > 0 ? Math.max(10, Math.floor((n + 6) / 10) * 10) : 0);

/** Qué cantidad va en el Excel del proveedor (Fer, 28/10): la del típico, la del mejor momento o el promedio de las dos
 *  cuentas, redondeado a decenas. Pura. */
export type CantidadPedido = "tipico" | "mejor" | "promedio";
export const CANTIDADES_PEDIDO: [CantidadPedido, string][] = [["tipico", "Típico"], ["mejor", "Mejor momento"], ["promedio", "Promedio de los dos"]];
export const cantidadPedido = (x: Pick<FilaSugerencia, "comprar_tipico" | "comprar_mejor" | "comprar_exacto" | "comprar_mejor_exacto">, c: CantidadPedido) =>
  c === "mejor" ? x.comprar_mejor : c === "promedio" ? redondearPedido(Math.round((x.comprar_exacto + x.comprar_mejor_exacto) / 2)) : x.comprar_tipico;

export function aComprar(paraDias: number, dias: number, demora: number, stock: number): { alLlegar: number; comprar: number } {
  const alLlegar = Math.max(0, Math.max(0, stock) - Math.round((paraDias * demora) / dias));
  return { alLlegar, comprar: Math.max(0, paraDias - alLlegar) };
}

export type FilaSugerencia = {
  clave: string; producto_id: number | null; familia_id: number | null; proveedor_id: number | null; sku: string; titulo: string; fotos: string[] | null; archivado: boolean;
  tipico: number; mejor: number; ventanas: number; dias_con_venta: number; grandes: number; mayor_grande: number;
  /** El costo puesto acá por unidad (Fer, 28/10): el de la vía que le corresponde (`costo_de`): por avión (courier) si por
   *  avión deja el margen mínimo, si no por barco (con la NCM si está cargada); sin peso o FOB, el de la ficha. */
  costo_usd: number | null; costo_ars: number | null; costo_de: "avion" | "barco" | "ficha" | null;
  ultima_fecha: string; ultima_precio: number; ultima_tc: number | null; precio_usd: number | null; precio_hoy: number | null; clasica: number | null;
  /** De qué precio sale la ganancia (precioBase()): la Clásica, el precio de mercado o la última venta llevada a hoy. */
  precio_base: "clasica" | "mercado" | "ultima" | null; precio_venta: number | null;
  /** Lo está vendiendo: tiene publicación activa en Mercado Libre o vendió en los últimos DIAS_VENDIENDO días. */
  vendiendo: boolean;
  /** La Clásica y el precio de mercado difieren más de DIFERENCIA_REVISAR %: para revisar. */
  revisar: boolean; variacion_id: number | null;
  comision_pct: number; costos_ml: number | null; ganancia_unit: number | null; margen_pct: number | null;
  /** La ganancia sobre el costo (lo que rinde cada peso invertido). */
  roi_pct: number | null;
  /** Lo disponible hoy, lo que va a quedar cuando llegue la compra (al ritmo típico) y lo que habría que comprar (lo que se
   *  vendería en los días elegidos menos lo que quede al llegar), según el típico y el mejor momento. */
  stock: number; al_llegar: number; comprar_tipico: number; comprar_mejor: number;
  /** Lo que da la cuenta antes de redondear a decenas (redondearPedido). */
  comprar_exacto: number; comprar_mejor_exacto: number;
  /** Las compras registradas (invoices y courier): cuántas, la última (llegada y cantidad), cuántos días tardaron en
   *  venderse las últimas terminadas (mediana) y lo que se vendería en los días elegidos a ese ritmo. */
  compras_n: number; ultima_compra: string | null; ultima_cant: number | null; dias_compra: number | null; segun_compras: number | null;
  /** Precio de mercado (lib/compras/precio-mercado.ts) de las publicaciones que la IA juzgó iguales: el más barato (Fer,
   *  28/10) y la mediana. Y el estado del
   *  precio de mercado del producto (confirmado, sin confirmar o sin seguimiento). */
  mercado: number | null; mercado_mediana: number | null; mercado_n: number; mercado_ts: string | null; estado_mercado: EstadoMercado | null;
  /** De dónde sale el precio de mercado (mejorDelMercado): la búsqueda de la IA o una publicación seguida, y de qué vendedor. */
  mercado_de: "busqueda" | "seguimiento" | null; mercado_vendedor: string | null;
  /** ¿Avión o barco? (lib/compras/via.ts): FOB de la ficha, flete aéreo como % del FOB, costo final con IVA y ganancia por
   *  cada vía (US$ por unidad, sobre la Clásica), y la categoría. */
  fob_usd: number | null; via: CategoriaVia; medidas: "packing" | "ficha" | null; flete_aereo_pct: number | null; con_ncm: boolean;
  avion_final: number | null; avion_ganancia: number | null; avion_margen: number | null;
  barco_final: number | null; barco_ganancia: number | null; barco_margen: number | null;
  /** La ganancia de cada vía sobre su costo final (Fer, 28/10). */
  avion_sobre_costo: number | null; barco_sobre_costo: number | null;
};

/** Cuántas de las últimas compras terminadas se usan para el ritmo «según compras». */
export const COMPRAS_PARA_RITMO = 3;

const DIA = 86400_000;
const aDia = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DIA);

/** El orden de las grillas de Mercado Libre (cargo fijo y envío gratis vigentes), para un producto de hasta 300 g. */
async function grillas(): Promise<Grillas> {
  const cf = await consulta<{ desde: number; valor: number }>(
    "select precio::float8 desde, coalesce(cargo_fijo, 0)::float8 valor from ml_costos_cargo_fijo_vigente where tipo = 'gold_special' and logistica = '-' order by precio");
  const env = await consulta<{ desde: number; valor: number }>(
    `select precio::float8 desde, coalesce(costo, 0)::float8 valor from ml_costos_envio_gratis_vigente
      where logistica = 'xd_drop_off' and peso_g = (select min(peso_g) from ml_costos_envio_gratis_vigente where logistica = 'xd_drop_off' and peso_g >= 300) order by precio`);
  // Cada punto de la grilla vale desde su precio; abajo del primero, el valor del primero (cargo fijo) o nada (envío).
  return { cargoFijo: cf.length ? [{ desde: 0, valor: cf[0].valor }, ...cf] : [], envio: env };
}

export async function sugerenciaCompra(org: string, f: FiltroSugerencia): Promise<{ filas: FilaSugerencia[]; tcHoy: number | null }> {
  const tcHoy = (await una<{ tc: number | null }>("select tc_del_dia($1, current_date)::float8 tc", [org]))?.tc ?? null;
  const renglones = await consulta<{ clave: string; dia: string; cantidad: number; precio: number | null; titulo: string | null }>(`
    select coalesce('v' || e.variacion_id, 's' || upper(regexp_replace(coalesce(e.sku, ''), '^DE-', '', 'i'))) clave,
           to_char(e.fecha at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') dia, e.cantidad,
           coalesce(e.precio_unit, e.total / nullif(e.cantidad, 0))::float8 precio, e.titulo
      from venta_estadistica e
      left join variacion va on va.id = e.variacion_id left join producto pr on pr.id = va.producto_id left join familia fa on fa.id = pr.familia_id
     where e.organizacion_id = $1 and e.estado not in ('cancelled', 'cancelado', 'invalid') and e.cantidad > 0
       and e.fecha >= ($2::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'
       and e.fecha < ($3::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
       and coalesce(e.sku, '') <> ''
       and not es_notebook(coalesce(pr.titulo, e.titulo)) and not coalesce(fa.nombre ~* '^notebook', false)`, [org, f.desde, f.hasta]);
  const porClave = new Map<string, Renglon[]>();
  const ventasIso = new Map<string, [string, number][]>();
  // La última venta de cada producto (para el precio): la de fecha más nueva del período.
  const ultima = new Map<string, { dia: string; precio: number; titulo: string | null }>();
  for (const r of renglones) {
    const l = porClave.get(r.clave) ?? [];
    l.push({ dia: aDia(r.dia), cantidad: r.cantidad });
    porClave.set(r.clave, l);
    const vi = ventasIso.get(r.clave) ?? [];
    vi.push([r.dia, r.cantidad]);
    ventasIso.set(r.clave, vi);
    const u = ultima.get(r.clave);
    if (r.precio != null && r.precio > 1 && (!u || r.dia >= u.dia)) ultima.set(r.clave, { dia: r.dia, precio: r.precio, titulo: r.titulo });
  }
  const fin = aDia(f.hasta);
  const ritmos = new Map<string, ReturnType<typeof ritmo> & { grandes: number; mayor: number }>();
  for (const [clave, rs] of porClave) {
    const g = sinComprasGrandes(rs);
    const rt = ritmo(g.quedan, f.dias, fin);
    if (rt.mejor > 0) ritmos.set(clave, { ...rt, grandes: g.grandes, mayor: g.mayor });
  }
  if (!ritmos.size) return { filas: [], tcHoy };
  const claves = [...ritmos.keys()].filter((k) => ultima.has(k));
  const variaciones = claves.filter((k) => k.startsWith("v")).map((k) => Number(k.slice(1)));
  const fechas = [...new Set(claves.map((k) => ultima.get(k)!.dia))];
  const [info, tcs, compras] = await Promise.all([
    consulta<{ id: number; producto_id: number; familia_id: number | null; proveedor_id: number | null; sku: string; titulo: string; fotos: string[] | null; archivado: boolean; costo_usd: number | null; fob_usd: number | null; comision_pct: number | null; clasica: number | null; stock: number; ml_activa: boolean }>(`
      with lista as (select id from lista_precios where organizacion_id = $1
                      order by lower(nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') desc, orden, id limit 1)
      select va.id::int, va.producto_id::int, pr.familia_id::int, pr.proveedor_id::int, va.sku, titulo_variacion(va.id) titulo,
             (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = va.producto_id) fotos,
             pr.estado = 'archivado' or va.estado = 'archivada' archivado, va.costo_ultimo_usd::float8 costo_usd,
             case when va.costo_moneda = 'USD' then va.costo_fob::float8 end fob_usd,
             (select max(c.clasica_pct)::float8 from publicacion pu join canal ca on ca.id = pu.canal_id and ca.tipo = 'mercadolibre'
                join ml_costos_comisiones_vigente c on c.categoria_id = pu.categoria_externa where pu.variacion_id = va.id) comision_pct,
             (select pd.lista_ars from lista, precio_de($1, va.id, lista.id) pd)::float8 clasica,
             (select coalesce(sum(st.cantidad - st.reservado), 0) from stock st where st.variacion_id = va.id)::int stock,
             exists (select 1 from publicacion pu join canal ca on ca.id = pu.canal_id and ca.tipo = 'mercadolibre'
                      where pu.variacion_id = va.id and pu.estado = 'activa') ml_activa
        from variacion va join producto pr on pr.id = va.producto_id
       where va.organizacion_id = $1 and va.id = any($2::bigint[])`, [org, variaciones]),
    consulta<{ dia: string; tc: number | null }>("select d::text dia, tc_del_dia($1, d)::float8 tc from unnest($2::date[]) d", [org, fechas]),
    comprasDeVariaciones(org, variaciones),
  ]);
  // Lo que dicen las compras registradas de cada producto.
  const segunCompras = new Map<string, Pick<FilaSugerencia, "compras_n" | "ultima_compra" | "ultima_cant" | "dias_compra" | "segun_compras">>();
  for (const [vid, cs] of compras) {
    const clave = `v${vid}`;
    const ventas = (ventasIso.get(clave) ?? []).sort((a, b) => a[0].localeCompare(b[0]));
    const d = duracionCompras(cs, ventas); // de la más nueva a la más vieja
    const terminadas = d.filter((x) => x.dias != null).slice(0, COMPRAS_PARA_RITMO);
    const dias = terminadas.map((x) => x.dias!).sort((a, b) => a - b);
    const uds = terminadas.reduce((t, x) => t + x.cantidad, 0), sumaDias = terminadas.reduce((t, x) => t + x.dias!, 0);
    segunCompras.set(clave, {
      compras_n: cs.length, ultima_compra: d[0]?.llegada ?? null, ultima_cant: d[0]?.cantidad ?? null,
      dias_compra: dias.length ? dias[Math.floor(dias.length / 2)] : null,
      segun_compras: sumaDias > 0 ? Math.round((uds / sumaDias) * f.dias) : null,
    });
  }
  const porVariacion = new Map(info.map((x) => [`v${x.id}`, x]));
  const tcDe = new Map(tcs.map((x) => [x.dia, x.tc]));
  const datos = claves.map((clave) => {
    const u = ultima.get(clave)!;
    const v = porVariacion.get(clave);
    return {
      clave, producto_id: v?.producto_id ?? null, familia_id: v?.familia_id ?? null, proveedor_id: v?.proveedor_id ?? null, sku: v?.sku ?? clave.slice(1), titulo: v?.titulo ?? u.titulo ?? clave.slice(1), fotos: v?.fotos ?? null,
      archivado: v ? v.archivado : true, costo_usd: v?.costo_usd ?? null, fob_usd: v?.fob_usd ?? null, variacion_id: v?.id ?? null, comision_pct: v?.comision_pct ?? null, clasica: v?.clasica ?? null, stock: v?.stock ?? 0, ml_activa: v?.ml_activa ?? false,
      ultima_fecha: u.dia, ultima_precio: u.precio, ultima_tc: tcDe.get(u.dia) ?? null,
    };
  });
  const productos = [...new Set(info.map((x) => x.producto_id))];
  const [g, cfgVia, medidas, mercado, mejor, resueltos, estados] = await Promise.all([
    grillas(), configVia(org), medidasDe(org, info.map((x) => x.id)), preciosDeMercado(org, productos), mejorDelMercado(org, productos),
    costosResueltos(org, info.map((x) => ({ id: x.producto_id, familia_id: x.familia_id }))),
    estadosMercado(org, productos),
  ]);
  // Sin categoría conocida, la comisión más común de las categorías donde se publica.
  const conocidas = datos.map((d) => d.comision_pct).filter((x): x is number => x != null).sort((a, b) => a - b);
  const comisionComun = conocidas.length ? conocidas[Math.floor(conocidas.length / 2)] : 16.34;
  const desdeVendiendo = new Date(Date.parse(`${hoyArgentina()}T00:00:00Z`) - DIAS_VENDIENDO * DIA).toISOString().slice(0, 10);
  const filas = datos.map((d): FilaSugerencia => {
    const r = ritmos.get(d.clave)!;
    const precioUsd = d.ultima_tc ? d.ultima_precio / d.ultima_tc : null;
    const precioHoy = precioUsd != null && tcHoy ? Math.round(precioUsd * tcHoy) : null;
    const comision = d.comision_pct ?? comisionComun;
    const m = d.producto_id != null ? mercado.get(d.producto_id) : undefined;
    const mj = d.producto_id != null ? mejor.get(d.producto_id) : undefined;
    const vendiendo = d.ml_activa || d.ultima_fecha >= desdeVendiendo;
    const pb = precioBase({ vendiendo, clasica: d.clasica, mercado: mj?.precio ?? null, ultimaHoy: precioHoy, conMercado: f.conMercado });
    const base = pb.precio;
    const ml = base != null ? costosMl(base, comision, g) : null;
    const vv = d.variacion_id != null && d.producto_id != null
      ? calcularVia(d.fob_usd, medidas.get(d.variacion_id) ?? { peso_g: null, cbm: null, origen: null, exacto: false },
          base != null && ml != null && tcHoy ? (base - ml) / tcHoy : null, resueltos.get(d.producto_id) ?? null, cfgVia,
          base != null && tcHoy ? base / tcHoy : null)
      : null;
    // El costo de la vía que le corresponde: avión si por avión deja el margen mínimo; si no, barco; sin datos, la ficha.
    const [costoUsd, costoDe]: [number | null, FilaSugerencia["costo_de"]] =
      vv?.avion && (vv.categoria === "avion" || vv.categoria === "barco") ? [vv.avion.final, "avion"]
        : vv?.barco ? [vv.barco.final, "barco"] : d.costo_usd != null ? [d.costo_usd, "ficha"] : [null, null];
    const costoArs = costoUsd != null && tcHoy ? costoUsd * tcHoy : null;
    const ganancia = base != null && costoArs != null && ml != null ? base - ml - costoArs : null;
    return {
      clave: d.clave, producto_id: d.producto_id, familia_id: d.familia_id, proveedor_id: d.proveedor_id, sku: d.sku, titulo: d.titulo, fotos: d.fotos, archivado: d.archivado,
      tipico: r.tipico, mejor: r.mejor, ventanas: r.ventanas, dias_con_venta: r.diasConVenta, grandes: r.grandes, mayor_grande: r.mayor,
      costo_usd: costoUsd, costo_ars: costoArs, costo_de: costoDe, ultima_fecha: d.ultima_fecha, ultima_precio: d.ultima_precio, ultima_tc: d.ultima_tc,
      precio_usd: precioUsd, precio_hoy: precioHoy, clasica: d.clasica, comision_pct: comision, costos_ml: ml, ganancia_unit: ganancia,
      precio_base: pb.de, precio_venta: base, vendiendo, revisar: paraRevisar(d.clasica, mj?.precio ?? null), variacion_id: d.variacion_id,
      margen_pct: ganancia != null && base ? Math.round((ganancia / base) * 1000) / 10 : null,
      roi_pct: ganancia != null && costoArs ? Math.round((ganancia / costoArs) * 1000) / 10 : null,
      ...(() => { const t = aComprar(r.tipico, f.dias, f.demora, d.stock);
        const m = aComprar(r.mejor, f.dias, f.demora, d.stock).comprar;
        return { stock: d.stock, al_llegar: t.alLlegar, comprar_exacto: t.comprar, comprar_mejor_exacto: m, comprar_tipico: redondearPedido(t.comprar),
          comprar_mejor: redondearPedido(m) }; })(),
      ...(segunCompras.get(d.clave) ?? { compras_n: 0, ultima_compra: null, ultima_cant: null, dias_compra: null, segun_compras: null }),
      mercado: mj?.precio ?? null, mercado_mediana: m?.mediana ?? null, mercado_n: m?.encontradas ?? 0,
      mercado_ts: mj?.ts ? new Date(mj.ts).toISOString().slice(0, 10) : null, mercado_de: mj?.de ?? null, mercado_vendedor: mj?.vendedor ?? null,
      estado_mercado: d.producto_id != null ? estados.get(d.producto_id) ?? null : null,
      fob_usd: d.fob_usd, via: base == null ? "sin_precio" : vv?.categoria ?? "sin_datos", medidas: vv?.medidas.origen ?? null, flete_aereo_pct: vv?.flete_aereo_pct ?? null, con_ncm: vv?.con_ncm ?? false,
      avion_final: vv?.avion?.final ?? null, avion_ganancia: vv?.avion?.ganancia ?? null, avion_margen: vv?.avion?.margen_pct ?? null,
      barco_final: vv?.barco?.final ?? null, barco_ganancia: vv?.barco?.ganancia ?? null, barco_margen: vv?.barco?.margen_pct ?? null,
      avion_sobre_costo: sobreCosto(vv?.avion), barco_sobre_costo: sobreCosto(vv?.barco),
    };
  });
  filas.sort((a, b) => b.tipico - a.tipico || b.mejor - a.mejor);
  return { filas, tcHoy };
}

/** Ganancia sobre el costo final de una vía, en %, con un decimal. Pura. */
const sobreCosto = (c: { final: number; ganancia: number | null } | null | undefined) =>
  c && c.ganancia != null && c.final > 0 ? Math.round((c.ganancia / c.final) * 1000) / 10 : null;

/** Días sin vender después de los cuales un producto sin publicación activa en Mercado Libre ya no se toma como «lo estoy
 *  vendiendo» (Fer, 28/10): su Clásica puede estar vieja y la ganancia sale del precio de mercado. */
export const DIAS_VENDIENDO = 45;
/** Diferencia entre la Clásica y el precio de mercado que se marca para revisar, en %. */
export const DIFERENCIA_REVISAR = 5;

/** El precio de venta para calcular la ganancia (Fer, 28/10). Pura. Lo que se está vendiendo, la Clásica (si falta, el
 *  mercado y si no, la última venta llevada a hoy); lo que no, sólo el precio de mercado. */
export function precioBase(o: { vendiendo: boolean; clasica: number | null; mercado: number | null; ultimaHoy: number | null; conMercado?: boolean }): { precio: number | null; de: FilaSugerencia["precio_base"] } {
  const cl = o.clasica != null && o.clasica > 0 ? o.clasica : null;
  const me = o.mercado != null && o.mercado > 0 ? o.mercado : null;
  // Lo que no se vende sólo se calcula con el mercado (Fer, 28/10): su Clásica o su última venta pueden no tener nada que
  // ver con la realidad. Sin mercado, no hay precio («Sin precio de referencia»).
  const orden: [number | null, FilaSugerencia["precio_base"]][] = !o.vendiendo ? [[me, "mercado"]]
    : o.conMercado ? [[me, "mercado"], [cl, "clasica"], [o.ultimaHoy, "ultima"]] : [[cl, "clasica"], [me, "mercado"], [o.ultimaHoy, "ultima"]];
  for (const [p, de] of orden) if (p != null) return { precio: p, de };
  return { precio: null, de: null };
}

/** ¿La Clásica y el mercado difieren más de lo tolerado? Pura. */
export const paraRevisar = (clasica: number | null, mercado: number | null) =>
  clasica != null && clasica > 0 && mercado != null && mercado > 0 && Math.abs(mercado / clasica - 1) * 100 > DIFERENCIA_REVISAR;

export function totalesSugerencia(filas: FilaSugerencia[]) {
  const s = (f: (x: FilaSugerencia) => number | null) => filas.reduce((t, x) => t + (f(x) ?? 0), 0);
  return {
    productos: filas.length, conCosto: filas.filter((x) => x.costo_usd != null).length,
    fobTipicoUsd: s((x) => (x.fob_usd != null ? x.fob_usd * x.comprar_tipico : null)),
    fobMejorUsd: s((x) => (x.fob_usd != null ? x.fob_usd * x.comprar_mejor : null)),
    inversionTipicaUsd: s((x) => (x.costo_usd != null ? x.costo_usd * x.comprar_tipico : null)), inversionMejorUsd: s((x) => (x.costo_usd != null ? x.costo_usd * x.comprar_mejor : null)),
    gananciaTipica: s((x) => (x.ganancia_unit != null ? x.ganancia_unit * x.comprar_tipico : null)), gananciaMejor: s((x) => (x.ganancia_unit != null ? x.ganancia_unit * x.comprar_mejor : null)),
    unidadesTipicas: s((x) => x.comprar_tipico), unidadesMejor: s((x) => x.comprar_mejor),
  };
}

/** Las columnas por las que se puede ordenar (lista blanca para ?orden=). */
export const ORDEN_SUGERENCIA: Record<string, (x: FilaSugerencia) => number | string | null> = {
  sku: (x) => x.sku, tipico: (x) => x.tipico, mejor: (x) => x.mejor, stock: (x) => x.stock, al_llegar: (x) => x.al_llegar, comprar: (x) => x.comprar_tipico,
  costo: (x) => x.costo_usd, inversion: (x) => (x.costo_usd == null ? null : x.costo_usd * x.comprar_tipico), ultima: (x) => x.ultima_fecha,
  precio: (x) => x.precio_hoy, clasica: (x) => x.clasica, ganancia_unit: (x) => x.ganancia_unit, margen: (x) => x.margen_pct, roi: (x) => x.roi_pct, dias_venta: (x) => x.dias_con_venta,
  ganancia: (x) => (x.ganancia_unit == null ? null : x.ganancia_unit * x.comprar_tipico),
  ganancia_mejor: (x) => (x.ganancia_unit == null ? null : x.ganancia_unit * x.comprar_mejor),
  segun_compras: (x) => x.segun_compras, compras: (x) => x.ultima_compra,
  mercado: (x) => x.mercado, mercado_dif: (x) => (x.mercado != null && x.clasica ? x.mercado / x.clasica : null),
  flete_aereo: (x) => x.flete_aereo_pct, avion_margen: (x) => x.avion_margen, barco_margen: (x) => x.barco_margen,
  avion_final: (x) => x.avion_final, barco_final: (x) => x.barco_final, avion_sobre_costo: (x) => x.avion_sobre_costo, barco_sobre_costo: (x) => x.barco_sobre_costo,
};

/** Las categorías de vía elegidas en la dirección (?via=avion,barco). Vacío = todas. Pura. */
export function viasElegidas(v: string | undefined): Set<CategoriaVia> {
  const ks = (v ?? "").split(",").flatMap((k) => (k === "rentable" ? ["avion", "barco"] : [k])).filter((k): k is CategoriaVia => k in CATEGORIAS_VIA);
  return new Set(ks);
}

/** Opciones del filtro «Días con venta» (más de N). */
export const MIN_DIAS_VENTA = [5, 10, 20, 30, 50, 100, 200];

/** Lo que se MUESTRA (Fer, 12/10): sin los que tienen stock suficiente (salvo «Incluye…»), proveedor preferido, buscador, categorías destildadas, «más de N días con venta» y «última venta en los últimos N meses». No cambia los cálculos: el
 *  ritmo se calcula con todo el período elegido; esto sólo esconde renglones. */
export function filtrarMuestra(filas: FilaSugerencia[], sp: Record<string, string | undefined>, coincide: (x: FilaSugerencia) => boolean): FilaSugerencia[] {
  const minDias = Number(sp.min_dias) || 0;
  const meses = Number(sp.vmeses) || 0;
  const desde = meses > 0 ? new Date(Date.now() - meses * 30.44 * DIA).toISOString().slice(0, 10) : "";
  const conStock = sp.con_stock === "1";
  // Proveedor preferido: un id, o «0» = los que no tienen.
  const prov = sp.prov != null && sp.prov !== "" ? Number(sp.prov) : null;
  // Vía (Fer, 28/10: elegir más de una): las categorías tildadas, separadas por coma; «rentable» = Avión y Conviene barco.
  const vias = viasElegidas(sp.via);
  const pasaVia = (x: FilaSugerencia) => !vias.size || vias.has(x.via);
  return filas.filter((x) => (conStock || x.comprar_tipico > 0) && (prov == null || (x.proveedor_id ?? 0) === prov) && pasaVia(x) && x.dias_con_venta > minDias && (!desde || x.ultima_fecha >= desde) && coincide(x));
}

/** «Última venta» (sólo muestra): en los últimos N meses. */
export const ULTIMA_VENTA_MESES = [[1, "el último mes"], [3, "los últimos 3 meses"], [6, "los últimos 6 meses"], [12, "el último año"], [24, "los últimos 2 años"], [36, "los últimos 3 años"]] as const;

/** El cálculo pesado (el ritmo de cada producto) queda guardado 30 minutos por período y días (Fer, 12/10: «está un poco
 *  lento»): filtrar, ordenar y pasar de página usan lo guardado. `calculado` dice cuándo se hizo. */
export function sugerenciaGuardada(org: string, f: FiltroSugerencia): Promise<{ filas: FilaSugerencia[]; tcHoy: number | null; calculado: string }> {
  return unstable_cache(async () => ({ ...(await sugerenciaCompra(org, f)), calculado: new Date().toISOString() }),
    ["sugerencia-compra-18", org, f.desde, f.hasta, String(f.dias), String(f.demora), f.conMercado ? "m" : ""], { revalidate: 1800, tags: [`sugerencia-compra-${org}`] })();
}

export type NodoCategoria = { id: number; nombre: string; padre: number | null; nivel: number; productos: number };

/** El árbol de categorías (hasta el tercer nivel) de los productos de la lista, con cuántos tiene cada una, y para cada
 *  categoría de producto sus antecesoras (para filtrar). */
export async function arbolCategorias(org: string, filas: FilaSugerencia[]): Promise<{ nodos: NodoCategoria[]; ancestros: Map<number, number[]> }> {
  const ids = [...new Set(filas.map((x) => x.familia_id).filter((x): x is number => x != null))];
  if (!ids.length) return { nodos: [], ancestros: new Map() };
  const cadenas = await consulta<{ hoja: number; cadena: number[]; nombres: string[] }>(`
    with recursive c as (
      select f.id hoja, f.id, f.padre_id, array[f.id]::bigint[] cadena, array[f.nombre]::text[] nombres, 0 vuelta
        from familia f where f.organizacion_id = $1 and f.id = any($2::bigint[])
      union all
      select c.hoja, p.id, p.padre_id, p.id || c.cadena, p.nombre || c.nombres, c.vuelta + 1
        from c join familia p on p.id = c.padre_id where c.vuelta < 10)
    select hoja::int, cadena::int[], nombres from c where padre_id is null`, [org, ids]);
  const nodos = new Map<number, NodoCategoria>();
  const ancestros = new Map<number, number[]>();
  const porFamilia = new Map<number, number>();
  for (const x of filas) if (x.familia_id != null) porFamilia.set(x.familia_id, (porFamilia.get(x.familia_id) ?? 0) + 1);
  for (const c of cadenas) {
    const tope = c.cadena.slice(0, 3);
    ancestros.set(c.hoja, tope);
    tope.forEach((id, i) => {
      const n = nodos.get(id) ?? { id, nombre: c.nombres[i], padre: i ? tope[i - 1] : null, nivel: i + 1, productos: 0 };
      n.productos += porFamilia.get(c.hoja) ?? 0;
      nodos.set(id, n);
    });
  }
  return { nodos: [...nodos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)), ancestros };
}

/** El buscador de la sugerencia (Fer, 28/10: «kit?start» no traía los kits que lo dicen en la descripción): como en todo el
 *  panel, busca en TODOS los datos del producto y de sus variaciones (lib/busqueda.ts); los códigos viejos que ya no están
 *  en el catálogo, por su SKU y su título. */
export async function coincidenConBusqueda(org: string, q: string, comienza: boolean): Promise<(x: Pick<FilaSugerencia, "producto_id" | "sku" | "titulo">) => boolean> {
  if (!q) return () => true;
  const ids = new Set((await consulta<{ id: number }>(
    `select p.id::int from producto p where p.organizacion_id = $1 and ${sqlBusqueda("$2", camposProductoConVariaciones())}`,
    [org, parametroBusqueda(q, comienza)])).map((x) => x.id));
  return (x) => (x.producto_id != null ? ids.has(x.producto_id) : coincideBusqueda([x.sku, x.titulo], q, comienza));
}

/** Las filas que se ven en la pantalla con los filtros de la dirección (todas las páginas, en su orden): las usan las
 *  descargas en Excel. */
export async function filasDeLaPantalla(org: string, sp: Record<string, string | undefined>, hoy: string): Promise<{ f: FiltroSugerencia; filas: FilaSugerencia[]; tcHoy: number | null }> {
  const f = leerFiltroSugerencia(sp, hoy);
  const { filas: todas, tcHoy } = await sugerenciaGuardada(org, f);
  const { ancestros } = await arbolCategorias(org, todas);
  const sinCat = new Set((sp.sin_cat ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && sp.sin_cat));
  const categoriaFuera = (x: FilaSugerencia) => x.familia_id == null ? sinCat.has(0) : (ancestros.get(x.familia_id) ?? []).some((id) => sinCat.has(id));
  const q = sp.q?.trim() ?? "";
  const coincide = await coincidenConBusqueda(org, q, sp.contiene !== "1");
  const filas = filtrarMuestra(todas, sp, (x) => !categoriaFuera(x) && coincide(x));
  return { f, filas: ordenarEnMemoria(filas, sp, ORDEN_SUGERENCIA), tcHoy };
}
