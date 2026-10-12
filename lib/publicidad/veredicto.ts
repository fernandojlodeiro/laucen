// Publicidad: el veredicto por producto (orden 596). Suma, por producto (SKU),
// lo que gastaron y vendieron sus anuncios en todas las cuentas en los últimos
// `ventanaDias`, y lo compara con lo que se acepta pagar de publicidad por
// venta (config general o la excepción del producto o su familia):
//   · tope por venta = % máximo × precio de venta (el promedio de lo vendido;
//     sin ventas, el precio de sus anuncios);
//   · "de más" = gasto − ventas × tope por venta. Si lo gastado de más llega
//     al equivalente a N ventas (o al tope en pesos): CORTAR, aunque haya
//     pocos datos;
//   · con ventas y datos suficientes (días y clics mínimos): publicidad por
//     venta (gasto ÷ monto vendido) hasta el % de SUBIR → SUBIR; hasta el
//     tope → SEGUIR; hasta el % de CORTAR → BAJAR; más → CORTAR.
// Las ventas que cuentan son las atribuidas a la publicidad (directas o
// directas + indirectas, según la config). Las ventas totales del producto
// (todos los canales) se muestran al lado, sin mezclarlas.

import { consulta } from "@/lib/erp/base";
import { configPublicidad, type ConfigPublicidad } from "@/lib/publicidad/config";
import { hoyAr } from "@/lib/publicidad/lectura";

export type Veredicto = "subir" | "seguir" | "bajar" | "cortar" | "esperar";
export type Color = "verde" | "amarillo" | "rojo" | "gris";

export type Metr = { clics: number; impresiones: number; costo: number; montoDir: number; montoInd: number; udsDir: number; udsInd: number; diasConGasto: number };

export type FilaPublicacion = Metr & { itemId: string; canalId: number; canal: string; titulo: string | null; precio: number | null; estado: string | null;
  campanaId: number | null; permalink: string | null };

export type FilaProducto = Metr & {
  clave: string;
  productoId: number | null;
  sku: string | null;
  titulo: string;
  fotos: string[] | null;
  precio: number | null;
  costoUnit: number | null;
  pctMax: number;
  origenTope: string;
  ventas: number;
  monto: number;
  porVenta: number | null;
  pctPorVenta: number | null;
  topePorVenta: number | null;
  deMas: number;
  topeSinVentas: number | null;
  ventasTotales: number | null;
  veredicto: Veredicto;
  color: Color;
  motivo: string;
  publicaciones: FilaPublicacion[];
};

const fmt = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;
const pct = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;

/** El veredicto de una suma de métricas (separado para poder probarlo). */
export function juzgar(m: Metr, precio: number | null, pctMax: number, cfg: ConfigPublicidad):
  Pick<FilaProducto, "ventas" | "monto" | "porVenta" | "pctPorVenta" | "topePorVenta" | "deMas" | "topeSinVentas" | "veredicto" | "color" | "motivo"> {
  const ventas = cfg.ventas === "totales" ? m.udsDir + m.udsInd : m.udsDir;
  const monto = cfg.ventas === "totales" ? m.montoDir + m.montoInd : m.montoDir;
  const ticket = ventas > 0 ? monto / ventas : precio;
  const topePorVenta = ticket ? ticket * pctMax / 100 : null;
  const porVenta = ventas > 0 ? m.costo / ventas : null;
  const pctPorVenta = monto > 0 ? m.costo / monto * 100 : null;
  const deMas = Math.max(0, m.costo - ventas * (topePorVenta ?? 0));
  let topeSinVentas = topePorVenta != null ? topePorVenta * cfg.topeVentas : null;
  if (cfg.topePesos > 0) topeSinVentas = topeSinVentas == null ? cfg.topePesos : Math.min(topeSinVentas, cfg.topePesos);
  const base = { ventas, monto, porVenta, pctPorVenta, topePorVenta, deMas, topeSinVentas };
  const queVentas = cfg.ventas === "totales" ? "ventas por publicidad (directas e indirectas)" : "ventas directas por publicidad";

  if (m.costo <= 0) return { ...base, veredicto: "esperar", color: "gris", motivo: "Sin gasto en los días que se miran." };
  if (topeSinVentas != null && deMas >= topeSinVentas) {
    return { ...base, veredicto: "cortar", color: "rojo", motivo: ventas
      ? `Gastó ${fmt(m.costo)} y vendió ${ventas}: lleva ${fmt(deMas)} de más sobre el tope (${pct(pctMax)} por venta), más que el corte de ${fmt(topeSinVentas)}.`
      : `Gastó ${fmt(m.costo)} sin vender: llegó al corte de ${fmt(topeSinVentas)} (el equivalente a ${cfg.topeVentas.toLocaleString("es-AR")} ventas${cfg.topePesos > 0 ? ` o ${fmt(cfg.topePesos)}` : ""}).` };
  }
  if (!ventas) {
    return { ...base, veredicto: "seguir", color: "amarillo",
      motivo: `Sin ${queVentas} todavía: gastó ${fmt(m.costo)}${topeSinVentas != null ? ` de ${fmt(topeSinVentas)} antes de cortar` : ""}.` };
  }
  const pocos = m.diasConGasto < cfg.diasMinimos || m.clics < cfg.clicsMinimos;
  const p = pctPorVenta ?? 0;
  const cuenta = `Gastó ${fmt(m.costo)}, ${ventas} ${ventas === 1 ? "venta" : "ventas"} (${fmt(monto)}): ${fmt(porVenta ?? 0)} por venta = ${pct(p)} del precio; tope ${pct(pctMax)}.`;
  if (p > pctMax * cfg.cortarDesde / 100 && !pocos) return { ...base, veredicto: "cortar", color: "rojo", motivo: `${cuenta} Pasa el ${cfg.cortarDesde} % del tope.` };
  if (p > pctMax) return { ...base, veredicto: pocos ? "seguir" : "bajar", color: "amarillo", motivo: `${cuenta}${pocos ? " Todavía con pocos datos para bajar." : " Conviene bajar el presupuesto o el objetivo."}` };
  if (p <= pctMax * cfg.subirHasta / 100 && !pocos) return { ...base, veredicto: "subir", color: "verde", motivo: `${cuenta} Rinde: se puede subir el presupuesto.` };
  return { ...base, veredicto: "seguir", color: "verde", motivo: `${cuenta} Dentro del tope.` };
}

const vacio = (): Metr => ({ clics: 0, impresiones: 0, costo: 0, montoDir: 0, montoInd: 0, udsDir: 0, udsInd: 0, diasConGasto: 0 });
const sumar = (a: Metr, b: Metr) => { for (const k of Object.keys(a) as (keyof Metr)[]) a[k] += b[k]; };

/** Todos los productos con publicidad en la ventana, con su veredicto. */
export async function veredictos(org: string, cfgDada?: ConfigPublicidad): Promise<FilaProducto[]> {
  const cfg = cfgDada ?? await configPublicidad(org);
  const desde = new Date(Date.parse(`${hoyAr()}T12:00:00Z`) - (cfg.ventanaDias - 1) * 86400_000).toISOString().slice(0, 10);
  const filas = await consulta<{
    item_id: string; canal_id: string; canal: string; titulo: string | null; precio: string | null; estado: string | null; campana_id: string | null; permalink: string | null; foto_ml: string | null;
    clics: string; impresiones: string; costo: string; monto_dir: string; monto_ind: string; uds_dir: string; uds_ind: string; dias: string;
    producto_id: string | null; sku: string | null; producto: string | null; costo_unit: string | null; familia_id: string | null; fotos: string[] | null;
  }>(`
    with m as (
      select d.item_id, max(d.canal_id) canal_id, sum(d.clics) clics, sum(d.impresiones) impresiones, sum(d.costo) costo,
             sum(d.monto_directo) monto_dir, sum(d.monto_indirecto) monto_ind, sum(d.unidades_directas) uds_dir, sum(d.unidades_indirectas) uds_ind,
             count(*) filter (where d.costo > 0) dias
        from pub_anuncio_dia d where d.organizacion_id = $1 and d.fecha >= $2::date group by d.item_id
    )
    select m.*, ca.nombre canal, a.titulo, a.precio, a.estado, a.campana_id, a.permalink, a.foto foto_ml,
           v.producto_id, coalesce(pr.sku_base, v.sku) sku, pr.titulo producto, pr.familia_id,
           coalesce(v.costo_promedio_usd * tc_del_dia($1, current_date), v.costo_promedio_ars) costo_unit,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = v.producto_id) fotos
      from m
      join canal ca on ca.id = m.canal_id
      left join pub_anuncio a on a.organizacion_id = $1 and a.item_id = m.item_id
      left join lateral (select p.variacion_id from publicacion p where p.organizacion_id = $1 and p.canal_id = m.canal_id and p.id_externo = m.item_id
                          order by p.variacion_id limit 1) pu on true
      left join variacion v on v.id = pu.variacion_id
      left join producto pr on pr.id = v.producto_id`, [org, desde]);

  // Topes por producto y por familia (con sus subfamilias: gana la más cercana).
  const topes = await consulta<{ producto_id: string | null; familia_id: string | null; pct_max: string }>(
    "select producto_id, familia_id, pct_max from pub_tope where organizacion_id = $1", [org]);
  const porProducto = new Map(topes.filter((t) => t.producto_id).map((t) => [Number(t.producto_id), Number(t.pct_max)]));
  const porFamilia = new Map(topes.filter((t) => t.familia_id).map((t) => [Number(t.familia_id), Number(t.pct_max)]));
  const padres = porFamilia.size
    ? new Map((await consulta<{ id: string; padre_id: string | null; nombre: string }>("select id, padre_id, nombre from familia where organizacion_id = $1", [org]))
      .map((f) => [Number(f.id), { padre: f.padre_id ? Number(f.padre_id) : null, nombre: f.nombre }]))
    : new Map<number, { padre: number | null; nombre: string }>();
  const topeDe = (productoId: number | null, familiaId: number | null): [number, string] => {
    if (productoId != null && porProducto.has(productoId)) return [porProducto.get(productoId)!, "del producto"];
    for (let f = familiaId, vueltas = 0; f != null && vueltas < 30; f = padres.get(f)?.padre ?? null, vueltas++) {
      if (porFamilia.has(f)) return [porFamilia.get(f)!, `de la familia ${padres.get(f)?.nombre ?? f}`];
    }
    return [cfg.pctMax, "general"];
  };

  // Ventas totales del producto en la ventana (todos los canales), para mostrar al lado.
  const ids = [...new Set(filas.map((f) => f.producto_id).filter(Boolean))];
  const totales = new Map<number, number>();
  if (ids.length) {
    for (const t of await consulta<{ producto_id: string; uds: string }>(`
      select v.producto_id, sum(l.cantidad) uds from pedido_linea l join pedido p on p.id = l.pedido_id join variacion v on v.id = l.variacion_id
       where p.organizacion_id = $1 and p.fecha >= $2::date and p.estado not in ('presupuesto', 'nuevo', 'cancelado', 'devuelto') and v.producto_id = any($3::bigint[])
       group by v.producto_id`, [org, desde, ids])) totales.set(Number(t.producto_id), Number(t.uds));
  }

  const grupos = new Map<string, FilaProducto>();
  for (const f of filas) {
    const productoId = f.producto_id ? Number(f.producto_id) : null;
    const clave = f.sku ?? f.item_id;
    const metr: Metr = { clics: Number(f.clics), impresiones: Number(f.impresiones), costo: Number(f.costo), montoDir: Number(f.monto_dir), montoInd: Number(f.monto_ind),
      udsDir: Number(f.uds_dir), udsInd: Number(f.uds_ind), diasConGasto: Number(f.dias) };
    let g = grupos.get(clave);
    if (!g) {
      const [pctMax, origenTope] = topeDe(productoId, f.familia_id ? Number(f.familia_id) : null);
      g = { ...vacio(), clave, productoId, sku: f.sku, titulo: f.producto ?? f.titulo ?? f.item_id, fotos: f.fotos ?? (f.foto_ml ? [f.foto_ml] : null), precio: null,
        costoUnit: f.costo_unit != null ? Number(f.costo_unit) : null, pctMax, origenTope, ventas: 0, monto: 0, porVenta: null, pctPorVenta: null,
        topePorVenta: null, deMas: 0, topeSinVentas: null, ventasTotales: productoId != null ? totales.get(productoId) ?? 0 : null,
        veredicto: "esperar", color: "gris", motivo: "", publicaciones: [] };
      grupos.set(clave, g);
    }
    const dias = g.diasConGasto;
    sumar(g, metr);
    g.diasConGasto = Math.max(dias, metr.diasConGasto);
    g.publicaciones.push({ ...metr, itemId: f.item_id, canalId: Number(f.canal_id), canal: f.canal, titulo: f.titulo, precio: f.precio != null ? Number(f.precio) : null,
      estado: f.estado, campanaId: f.campana_id ? Number(f.campana_id) : null, permalink: f.permalink });
  }
  const orden: Record<Veredicto, number> = { cortar: 0, bajar: 1, seguir: 2, subir: 3, esperar: 4 };
  const salida = [...grupos.values()].map((g) => {
    const precios = g.publicaciones.map((p) => p.precio).filter((x): x is number => x != null && x > 0);
    g.precio = precios.length ? precios.reduce((a, b) => a + b, 0) / precios.length : null;
    g.publicaciones.sort((a, b) => b.costo - a.costo);
    return { ...g, ...juzgar(g, g.precio, g.pctMax, cfg) };
  });
  return salida.sort((a, b) => orden[a.veredicto] - orden[b.veredicto] || b.costo - a.costo);
}
