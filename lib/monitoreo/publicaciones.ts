// Informes › Monitoreo de precios y publicaciones (pedido de Fer, 12/10): de
// cada producto (cada SKU), todas sus publicaciones ACTIVAS de Mercado Libre en
// un cuadro: planes en filas (Clásica, 3x, Premium, 9x, 12x) y cuentas en
// columnas. En cada plan, la cuenta más barata «gana» (es la que el comprador ve
// primero); si el esquema de precios dice que tendría que ganar otra, se avisa.
// La «cucarda» es el % de descuento que ve el comprador por la campaña.
// Sólo lee: no cambia nada.

import { consulta } from "@/lib/erp/base";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { cadenaFamilias } from "@/lib/precios-ml/motor";
import { familiasDe, canalesMl } from "@/lib/precios-ml/datos";
import { gruposPlanes, grupoDeLugar, ganadorDe } from "@/lib/precios-ml/grupos";
import { PLAN_PUBLICACION, UNIR_MELI_ITEM, UNIR_PRECIO_COMPRADOR, ES_CATALOGO, ORDEN_PLANES } from "@/app/catalogo/publicaciones/lista";

export type Celda = {
  pubId: number; itemId: string; canalId: number; precio: number | null; tachado: number | null;
  /** El % de descuento que ve el comprador (la cucarda), si tiene. */
  off: number | null; catalogo: boolean; recuadro: string | null; gana: boolean;
};
export type FilaPlan = { plan: string; celdas: Record<number, Celda[]>; ganador: number | null; deberia: number | null; conExcepcion: boolean };
export type Bloque = {
  variacionId: number; productoId: number; sku: string; titulo: string; foto: string | null; clasica: number | null; planes: FilaPlan[];
  /** Algo para mirar: gana otra cuenta que la del esquema, o en un mismo plan unas tienen cucarda y otras no. */
  raro: string[];
};
export type FiltroMonitoreo = { q?: string; contiene?: boolean; familia?: number | null; canal?: number | null; raro?: boolean };

export type Fila = { pub: number; item: string; canal: number; variacion: number; producto: number; sku: string; titulo: string; familia: number | null;
  plan: string; precio: number | null; tachado: number | null; catalogo: boolean; recuadro: string | null; clasica: number | null; foto: string | null };

/** El % que ve el comprador: tachado contra lo que paga (redondeado, como lo muestra ML). Pura. */
export function descuentoVisto(precio: number | null, tachado: number | null): number | null {
  if (!precio || !tachado || tachado <= precio) return null;
  const d = Math.round((1 - precio / tachado) * 100);
  return d > 0 ? d : null;
}

/** Arma los cuadros: por SKU, por plan; en cada plan, quién gana (el más barato). Pura (salvo `deberia`, que llega armado). */
export function armarBloques(filas: Fila[], deberiaDe: (f: Fila) => { cuenta: number | null; excepcion: boolean }): Bloque[] {
  const porVar = new Map<number, Fila[]>();
  for (const f of filas) porVar.set(f.variacion, [...(porVar.get(f.variacion) ?? []), f]);
  const bloques: Bloque[] = [];
  for (const [variacionId, fs] of porVar) {
    const f0 = fs[0];
    const planes = [...new Set(fs.map((f) => f.plan))].sort((a, b) => rango(a) - rango(b));
    const raro: string[] = [];
    const filasPlan: FilaPlan[] = planes.map((plan) => {
      const delPlan = fs.filter((f) => f.plan === plan);
      const celdas: Record<number, Celda[]> = {};
      for (const f of delPlan) {
        (celdas[f.canal] ??= []).push({ pubId: f.pub, itemId: f.item, canalId: f.canal, precio: f.precio, tachado: f.tachado,
          off: descuentoVisto(f.precio, f.tachado), catalogo: f.catalogo, recuadro: f.recuadro, gana: false });
      }
      // Gana la más barata del plan (con precio).
      const conPrecio = delPlan.filter((f) => f.precio != null);
      const minimo = conPrecio.length ? Math.min(...conPrecio.map((f) => f.precio!)) : null;
      let ganador: number | null = null;
      if (minimo != null) {
        for (const lista of Object.values(celdas)) for (const c of lista) if (c.precio === minimo) { c.gana = true; ganador ??= c.canalId; }
      }
      const d = deberiaDe(delPlan[0]);
      const cucardas = delPlan.map((f) => descuentoVisto(f.precio, f.tachado) != null);
      if (cucardas.some(Boolean) && !cucardas.every(Boolean)) raro.push(`${nombrePlan(plan)}: unas con % OFF y otras sin`);
      if (!d.excepcion && d.cuenta != null && ganador != null && !celdas[d.cuenta]?.some((c) => c.gana) && celdas[d.cuenta]) {
        raro.push(`${nombrePlan(plan)}: gana otra cuenta que la del esquema`);
      }
      return { plan, celdas, ganador, deberia: d.cuenta, conExcepcion: d.excepcion };
    });
    bloques.push({ variacionId, productoId: f0.producto, sku: f0.sku, titulo: f0.titulo, foto: f0.foto, clasica: f0.clasica, planes: filasPlan, raro });
  }
  return bloques;
}

const rango = (p: string) => { const i = ORDEN_PLANES.indexOf(p as (typeof ORDEN_PLANES)[number]); return i < 0 ? ORDEN_PLANES.length : i; };
const NOMBRES: Record<string, string> = { clasica: "Clásica", premium: "Premium", "3x_campaign": "Premium 3x", "9x_campaign": "Premium 9x", "12x_campaign": "Premium 12x" };
export const nombrePlan = (p: string) => NOMBRES[p] ?? p;

/** Todos los cuadros con los filtros (sólo publicaciones activas de Mercado Libre). Ordenados por título. */
export async function monitoreo(org: string, f: FiltroMonitoreo): Promise<{ bloques: Bloque[]; cuentas: { id: number; nombre: string }[] }> {
  const cuentas = (await canalesMl(org)).map((c) => ({ id: c.id, nombre: c.nombre, listaId: c.listaId }));
  const lista = cuentas.find((c) => c.listaId)?.listaId ?? null;
  const valores: unknown[] = [org, parametroBusqueda(f.q, f.contiene !== false), lista];
  const donde = [`pu.organizacion_id = $1`, `c.tipo = 'mercadolibre'`, `pu.estado = 'activa'`, `coalesce(mi.estado, 'active') = 'active'`,
    sqlBusqueda("$2", ["v.sku", "p.sku_base", "p.titulo", "v.titulo", "pu.id_externo", "pu.titulo"])];
  if (f.familia) {
    valores.push(f.familia);
    donde.push(`p.familia_id in (with recursive d as (select $${valores.length}::bigint id union select x.id from familia x join d on x.padre_id = d.id where x.organizacion_id = $1) select id from d)`);
  }
  if (f.canal) { valores.push(f.canal); donde.push(`pu.canal_id = $${valores.length}`); }
  const filas = await consulta<Fila>(`
    select pu.id::int pub, pu.id_externo item, pu.canal_id::int canal, v.id::int variacion, p.id::int producto, v.sku, titulo_variacion(v.id) titulo,
           p.familia_id::int familia, ${PLAN_PUBLICACION} plan,
           coalesce(pc.monto, mi.precio, pu.precio_canal)::float8 precio,
           coalesce(pc.regular, nullif(mi.datos_externos -> 'ml' ->> 'original_price', '')::numeric, pu.precio_tachado)::float8 tachado,
           ${ES_CATALOGO} catalogo, w.estado recuadro,
           (select lista_ars::float8 from precio_de(pu.organizacion_id, v.id, $3::bigint, (now() at time zone 'America/Argentina/Buenos_Aires')::date) where $3::bigint is not null) clasica,
           (select pf.url from producto_foto pf where pf.producto_id = p.id order by pf.orden, pf.id limit 1) foto
      from publicacion pu
      join variacion v on v.id = pu.variacion_id join producto p on p.id = v.producto_id join canal c on c.id = pu.canal_id
      ${UNIR_MELI_ITEM}
      ${UNIR_PRECIO_COMPRADOR}
      left join ml_price_to_win w on w.canal_id = pu.canal_id and w.item_id = pu.id_externo and w.error is null
     where ${donde.join(" and ")}
     order by titulo_variacion(v.id), v.sku`, valores);

  // Quién tendría que ganar según el esquema (Precios en ML › Planes de cuotas). Si el producto o su categoría
  // tienen una excepción de «¿gana?», no se avisa: lo decide la excepción.
  const [grupos, familias, excepciones] = await Promise.all([
    gruposPlanes(org), familiasDe(org),
    consulta<{ producto_id: number | null; familia_id: number | null }>(`
      select producto_id::int, familia_id::int from ml_regla_precio where organizacion_id = $1 and ajuste_pct is not null and nivel <> 'general'
      union select producto_id::int, familia_id::int from ml_plan_config where organizacion_id = $1 and ajuste_pct is not null and nivel <> 'general'`, [org]),
  ]);
  const excProd = new Set(excepciones.map((e) => e.producto_id).filter(Boolean));
  const excFam = new Set(excepciones.map((e) => e.familia_id).filter(Boolean));
  const idsCuentas = cuentas.map((c) => c.id);
  const deberiaDe = (x: Fila) => {
    const cadena = cadenaFamilias(x.familia, familias.padres);
    const excepcion = excProd.has(x.producto) || cadena.some((fa) => excFam.has(fa));
    const g = grupoDeLugar(grupos, cadena);
    const plan = (x.plan === "clasica" || ORDEN_PLANES.includes(x.plan as (typeof ORDEN_PLANES)[number]) ? x.plan : null) as Parameters<typeof ganadorDe>[1] | null;
    return { cuenta: g && plan ? ganadorDe(g, plan, x.producto, idsCuentas) : null, excepcion };
  };
  let bloques = armarBloques(filas, deberiaDe);
  if (f.raro) bloques = bloques.filter((b) => b.raro.length);
  return { bloques, cuentas: cuentas.map(({ id, nombre }) => ({ id, nombre })) };
}
