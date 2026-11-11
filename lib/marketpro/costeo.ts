// Costeo de importación (Fer, 10/11; Sourcing › Market Pro › Importar): se pega una lista de precios de un proveedor
// (en el formato que venga) y el monto a importar. La IA (agente.ts) lee la lista y busca cada modelo en lo bajado de
// Market Pro (mismo producto de catálogo, EAN, o mismo modelo y specs). Después, sin IA:
//   · el costo nacionalizado de cada modelo: su FOB × (costo del envío ÷ FOB del envío) — todo se reparte en
//     proporción al monto (costeo-config.ts);
//   · lo que se vende de ese producto en Mercado Libre: unidades por mes (últimos 3 meses cerrados), cuántas vende el que
//     más vende (lo que se podría vender ganando el catálogo), el precio más bajo del último mes y la mediana;
//   · la ganancia por unidad al precio más bajo, sobre la venta y sobre el costo;
//   · la cantidad propuesta: de la que más gana sobre el costo a la que menos, hasta `meses_tope` meses de lo que vende
//     el que más vende, mientras alcance el monto (en FOB).

import { consulta, una } from "@/lib/erp/base";
import { agenteSql, type QuienIa } from "@/lib/marketpro/agente";
import { DICCIONARIO_MPRO } from "@/lib/marketpro/diccionario";
import { costearEnvio, gananciaVenta, leerConfigCosteo, type ConfigCosteo, type Envio } from "@/lib/marketpro/costeo-config";
import { COMISION_SUPUESTA } from "@/lib/marketpro/ganancia";

export type ItemLista = { linea: string; marca: string | null; modelo: string; descripcion: string | null; fob: number; disponible: number | null;
  producto: string | null; confianza: "alta" | "media" | "baja" | null; nota: string | null };

export type Mercado = { producto: string; titulo: string | null; foto: string | null; cat: number | null; unidades_mes: number; lider_mes: number;
  vendedores: number; precio_min: number | null; precio_mediana: number | null; comision: number | null };

export type FilaCosteo = ItemLista & {
  mercado: Mercado | null; costo_usd: number; costo_ars: number;
  ganancia: number | null; sobre_venta: number | null; sobre_costo: number | null; cantidad: number;
};
export type EnvioVenta = { promedio: number | null; ventas: number; unidades: number };
export type ResultadoCosteo = { filas: FilaCosteo[]; envio: Envio | null; config: ConfigCosteo; dolar: number; envio_venta?: EnvioVenta };

const SISTEMA = `Te pasan la lista de precios de un proveedor de notebooks (en Miami), en cualquier formato (texto pegado de un Excel, un mail, un PDF). Tenés que:
1. Leer cada modelo: marca, modelo (el código exacto, ej. «15-fd0012la», «82XB0012US»), una descripción corta con las specs (procesador, RAM, disco, pantalla) y el precio unitario FOB en dólares. Si dice cuántas hay disponibles, también.
2. Buscar cada uno en los datos de Market Pro con consultar_sql: el mismo producto que se vende en Mercado Libre Argentina. Buscá por el código de modelo en mpro_publicacion (columnas modelo y titulo, con ilike), por EAN si lo hay, y confirmá que las specs coincidan (RAM, disco, procesador; mirá mpro_atributos si hace falta). Si hay varios productos (columna producto) que coinciden, elegí el que más vendió en los últimos 3 meses (sum de vendidas en mpro_venta grano 'm'). Si no hay ninguno igual, producto = null (no inventes uno parecido con otras specs).
${DICCIONARIO_MPRO}
Consultas rápidas: filtrá mpro_publicacion por categoría (cat in (select category_id from mpro_categoria where pais = 'ar' and (category_id = 430687 or 430687 = any(padres)))) y limitá las filas. Podés buscar varios modelos en una sola consulta (con or / any).

Al final contestá SOLO un bloque \`\`\`json con un arreglo, un objeto por modelo de la lista, en el orden de la lista:
{"linea": "el renglón original, corto", "marca": "...", "modelo": "...", "descripcion": "...", "fob": 0.0, "disponible": null, "producto": "c:123 o null", "confianza": "alta|media|baja|null", "nota": "por qué ese producto o por qué ninguno, corto"}`;

function leerJson(texto: string): ItemLista[] {
  const m = texto.match(/```json\s*([\s\S]*?)```/) ?? texto.match(/(\[[\s\S]*\])/);
  if (!m) throw new Error("La IA no devolvió la lista leída. Probá de nuevo.");
  const crudo = JSON.parse(m[1]) as Partial<ItemLista>[];
  return crudo.filter((x) => x && x.modelo && Number(x.fob) > 0).map((x) => ({
    linea: String(x.linea ?? x.modelo).slice(0, 300), marca: x.marca ?? null, modelo: String(x.modelo), descripcion: x.descripcion ?? null,
    fob: Number(x.fob), disponible: x.disponible == null ? null : Number(x.disponible) || null,
    producto: x.producto && /^[ceim]:/.test(String(x.producto)) ? String(x.producto) : null,
    confianza: x.confianza === "alta" || x.confianza === "media" || x.confianza === "baja" ? x.confianza : null, nota: x.nota ?? null,
  }));
}

/** Lo que se vende de cada producto: últimos 3 meses cerrados (y el último para el precio más bajo). */
export async function mercadoDe(org: string, productos: string[]): Promise<Map<string, Mercado>> {
  if (!productos.length) return new Map();
  const filas = await consulta<Mercado>(`
    with mes as (select max(periodo) m from mpro_venta where organizacion_id = $1 and grano = 'm'
                  and periodo < date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date),
    v as (select v.* from mpro_venta v, mes where v.organizacion_id = $1 and v.grano = 'm' and v.producto = any($2::text[])
            and v.periodo > mes.m - interval '3 months' and v.periodo <= mes.m and v.vendidas > 0),
    por_vend as (select producto, vendedor, sum(vendidas) u from v group by 1, 2),
    top as (select distinct on (producto) producto, item_id from v order by producto, vendidas desc)
    select v.producto, (sum(v.vendidas) / 3.0)::float8 unidades_mes,
           (select max(u) / 3.0 from por_vend p where p.producto = v.producto)::float8 lider_mes,
           count(distinct v.vendedor)::int vendedores,
           min(v.precio) filter (where v.periodo = (select m from mes))::float8 precio_min,
           percentile_cont(0.5) within group (order by v.precio)::float8 precio_mediana,
           (array_agg(v.cat order by v.vendidas desc))[1] cat,
           pt.titulo, pt.foto,
           (select cv.clasica_pct::float8 from ml_costos_comisiones_vigente cv where cv.categoria_id = 'MLA' || (array_agg(v.cat order by v.vendidas desc))[1]) comision
      from v join top t on t.producto = v.producto
      left join mpro_publicacion pt on pt.organizacion_id = $1 and pt.item_id = t.item_id
     group by v.producto, pt.titulo, pt.foto`, [org, productos]);
  return new Map(filas.map((f) => [f.producto, f]));
}

/** Arma el resultado: costo de cada modelo, su ganancia y la cantidad propuesta para el monto. */
export function calcular(items: ItemLista[], mercado: Map<string, Mercado>, c: ConfigCosteo, dolar: number, monto: number | null, ev: EnvioVenta = { promedio: null, ventas: 0, unidades: 0 }): ResultadoCosteo {
  // Primero, el orden y las cantidades con un coeficiente aproximado; después, el coeficiente del envío propuesto.
  const filasCon = (coef: number) => items.map((it) => {
    const m = it.producto ? mercado.get(it.producto) ?? null : null;
    const costo_usd = it.fob * coef;
    const costo_ars = costo_usd * dolar;
    const g = m ? gananciaVenta(c, m.precio_min, m.comision ?? COMISION_SUPUESTA, costo_ars, ev.promedio ?? 0) : null;
    return { ...it, mercado: m, costo_usd, costo_ars, ganancia: g?.ganancia ?? null, sobre_venta: g?.sobreVenta ?? null, sobre_costo: g?.sobreCosto ?? null, cantidad: 0 };
  });
  const proponer = (filas: FilaCosteo[]) => {
    let resta = monto ?? 0;
    const orden = [...filas].filter((f) => (f.sobre_costo ?? 0) > 0).sort((a, b) => (b.sobre_costo ?? 0) - (a.sobre_costo ?? 0));
    for (const f of orden) {
      if (resta < f.fob) continue;
      let tope = Math.max(1, Math.floor((f.mercado?.lider_mes ?? 0) * c.meses_tope));
      if (f.disponible != null) tope = Math.min(tope, f.disponible);
      f.cantidad = Math.max(0, Math.min(tope, Math.floor(resta / f.fob)));
      resta -= f.cantidad * f.fob;
    }
    return filas;
  };
  let coef = costearEnvio(c, Math.max(monto ?? 0, 1000), Math.max(1, Math.round((monto ?? 0) / Math.max(1, items[0]?.fob ?? 500)))).coef;
  let filas = proponer(filasCon(coef));
  let envio: Envio | null = null;
  for (let i = 0; i < 3; i++) {
    const fob = filas.reduce((s, f) => s + f.cantidad * f.fob, 0);
    const u = filas.reduce((s, f) => s + f.cantidad, 0);
    if (!fob) break;
    envio = costearEnvio(c, fob, u);
    if (Math.abs(envio.coef - coef) < 0.0005) break;
    coef = envio.coef;
    filas = proponer(filasCon(coef));
  }
  return { filas, envio, config: c, dolar, envio_venta: ev };
}

/** Lo que cobró Mercado Libre de envío por unidad en las ventas de los últimos 90 días de los productos de la familia
 *  (y sus subfamilias) `familia`: la suma de los cargos de envío de la facturación de ML (ml_cargo tipo envio, con IVA)
 *  de esos pedidos ÷ las unidades de esa familia en ellos. Sólo pedidos con el envío ya facturado. */
export async function envioDeVentas(org: string, familia: string): Promise<EnvioVenta> {
  if (!familia.trim()) return { promedio: null, ventas: 0, unidades: 0 };
  const r = await una<EnvioVenta>(`
    with fam as (select f.id from familia f where f.organizacion_id = $1 and lower(f.nombre) = lower($2)),
    p as (
      select p.id, sum(l.cantidad) u from pedido p join pedido_linea l on l.pedido_id = p.id
        join variacion v on v.id = l.variacion_id join producto pr on pr.id = v.producto_id
       where p.organizacion_id = $1 and p.fecha > now() - interval '90 days' and p.estado not in ('presupuesto', 'nuevo', 'cancelado', 'devuelto')
         and (pr.familia_id in (select id from fam) or pr.familia_id in (select h.id from familia h where h.padre_id in (select id from fam)))
       group by p.id
    ),
    e as (select p.id, p.u, (select sum(c.monto) from ml_cargo c where c.pedido_id = p.id and c.tipo = 'envio') envio from p)
    select (sum(envio) / nullif(sum(u), 0))::float8 promedio, count(*)::int ventas, coalesce(sum(u), 0)::int unidades from e where envio is not null`, [org, familia.trim()]);
  return r ?? { promedio: null, ventas: 0, unidades: 0 };
}

export async function dolarOficial(): Promise<number> {
  const r = await una<{ v: number }>("select venta::float8 v from tipo_cambio where organizacion_id is null and tipo = 'oficial' order by fecha desc limit 1");
  return r?.v ?? 0;
}

/** Lee la lista con la IA, cruza con Market Pro y guarda el resultado en el costeo `id`. */
export async function correrCosteo(org: string, id: number, quien: QuienIa): Promise<string> {
  const c = await una<{ lista: string; monto_usd: number | null; dolar: number | null }>(
    "select lista, monto_usd::float8, dolar::float8 from mpro_costeo where organizacion_id = $1 and id = $2", [org, id]);
  if (!c) throw new Error("No encuentro ese costeo.");
  try {
    const { texto, usd } = await agenteSql({ sistema: SISTEMA, mensaje: `La lista:\n\n${c.lista.slice(0, 60_000)}`, quien, topeUsd: 2, segundos: 250, maxVueltas: 30 });
    const items = leerJson(texto);
    if (!items.length) throw new Error("No encontré modelos con precio en la lista.");
    const [config, mercado, dolar] = await Promise.all([leerConfigCosteo(org), mercadoDe(org, [...new Set(items.map((i) => i.producto).filter((p): p is string => !!p))]), c.dolar ? Promise.resolve(c.dolar) : dolarOficial()]);
    const r = calcular(items, mercado, config, dolar, c.monto_usd, await envioDeVentas(org, config.envio_familia));
    await consulta(`update mpro_costeo set estado = 'listo', items = $3, resultado = $4, dolar = $5, costo_ia_usd = $6, terminado_ts = now(), error = null
                     where organizacion_id = $1 and id = $2`, [org, id, JSON.stringify(items), JSON.stringify(r), dolar, usd]);
    const cruzados = items.filter((i) => i.producto).length;
    return `Costeo listo: ${items.length} modelos, ${cruzados} encontrados en Market Pro.`;
  } catch (e) {
    await consulta("update mpro_costeo set estado = 'error', error = $3, terminado_ts = now() where organizacion_id = $1 and id = $2",
      [org, id, (e instanceof Error ? e.message : String(e)).slice(0, 500)]).catch(() => {});
    throw e;
  }
}

/** Vuelve a calcular un costeo ya leído (otro monto, otro dólar o cambió la configuración), sin volver a usar la IA. */
export async function recalcularCosteo(org: string, id: number, monto: number | null, dolar: number | null) {
  const c = await una<{ items: ItemLista[] | null; monto_usd: number | null; dolar: number | null }>(
    "select items, monto_usd::float8, dolar::float8 from mpro_costeo where organizacion_id = $1 and id = $2", [org, id]);
  if (!c?.items) throw new Error("Ese costeo todavía no tiene la lista leída.");
  const m = monto ?? c.monto_usd, d = dolar ?? c.dolar ?? await dolarOficial();
  const [config, mercado] = await Promise.all([leerConfigCosteo(org), mercadoDe(org, [...new Set(c.items.map((i) => i.producto).filter((p): p is string => !!p))])]);
  const r = calcular(c.items, mercado, config, d, m, await envioDeVentas(org, config.envio_familia));
  await consulta("update mpro_costeo set monto_usd = $3, dolar = $4, resultado = $5 where organizacion_id = $1 and id = $2", [org, id, m, d, JSON.stringify(r)]);
}
