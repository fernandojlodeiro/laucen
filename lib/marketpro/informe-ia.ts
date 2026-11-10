// La IA del informe de Market Pro (Fer, 7/11): con los números fijos del informe (informe.ts) como punto de partida,
// explora los datos bajados con consultas SQL de sólo lectura (las mismas del asistente: lib/asistente/sql.ts, como el
// usuario, con sus permisos y las políticas de fila) y escribe qué dicen los números y qué oportunidades ve, cada cosa
// con su número. Corre a pedido (botón «Volver a analizar») o sola cuando cierra un mes nuevo (refrescarInformes, desde
// el plan de cada mañana). Tope de gasto por informe: TOPE_USD.

import { hayClaude } from "@/lib/claude";
import { consulta, una } from "@/lib/erp/base";
import { agenteSql, type QuienIa } from "@/lib/marketpro/agente";
import type { Permisos } from "@/lib/permisos";
import { datosInforme, type DatosInforme } from "@/lib/marketpro/informe";
import { ultimoMes } from "@/lib/marketpro/analisis";
import { DICCIONARIO_MPRO } from "@/lib/marketpro/diccionario";

const TOPE_USD = 1.5;
const MAX_VUELTAS = 24;
const SEGUNDOS = 240;

const SISTEMA = `Sos analista de mercado de una empresa argentina que importa y vende en Mercado Libre. Te dan los números de una categoría de Mercado Libre (datos de Market Pro) y podés consultar la base con consultar_sql (sólo lectura, PostgreSQL) para explorar lo que quieras: precios, franjas, marcas, specs en los atributos, estacionalidad, concentración de vendedores, Full o no, Premium o Clásica, catálogo, conversión, visitas, productos nuevos que crecen, publicaciones sin ventas, provincias, lo que se te ocurra según la categoría. Buscá oportunidades concretas de qué comprar para vender (y a qué precio) y dónde no meterse.

${DICCIONARIO_MPRO}

Cómo trabajar:
- Empezá por los números que te paso; después hacé entre 6 y 15 consultas para confirmar y profundizar lo que parezca más prometedor. Si una consulta falla o tarda, simplificala.
- Cada afirmación lleva su número (unidades, facturación, precio, crecimiento, vendedores) y de qué período es. Un porcentaje siempre dice sobre qué es («+35 % de unidades, últimos 3 meses contra los 3 anteriores»; un margen, sobre la venta y sobre el costo).
- Para comparar en el tiempo, en dólares (tipo_cambio), no en pesos.
- No inventes: si un dato no está, decilo.

Qué escribir al final (en castellano rioplatense, voseo, directo, para un comerciante que sabe del negocio; markdown simple con títulos ##, listas y alguna tabla corta):
## Lo que dicen los números
(5 a 8 puntos: tamaño, tendencia en dólares, estacionalidad, precios, cómo se reparte entre vendedores, Full/Premium/catálogo, lo que más te llamó la atención.)
## Oportunidades
(3 a 7, de la más clara a la menos: qué producto o tipo de producto, a qué precio se vende, cuánto se vende por mes, cuántos vendedores y cuánto se lleva el primero, por qué es oportunidad y el riesgo.)
## Dónde no meterse
(2 a 4 cosas saturadas, en caída o con un líder que se lleva todo.)
## Qué mirar después
(2 a 4 preguntas concretas para seguir investigando.)
No agregues nada antes del primer título ni después del último punto.`;

export type QuienInforme = QuienIa;

/** El resumen de los números fijos que se le pasa a la IA (compacto). */
function resumenParaIa(d: DatosInforme, ruta: string): string {
  const r = (n: number | null | undefined, dec = 0) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** dec) / 10 ** dec);
  const cats = [...d.categorias].sort((a, b) => b.gmv - a.gmv).slice(0, 15).map((c) => ({
    cat: c.cat, ruta: c.ruta, gmv12: r(c.gmv), unidades12: c.unidades, vendedores: c.vendedores, crec3m: r(c.crecimiento, 3), lider: r(c.lider_pct, 3),
    full: r(c.full_pct, 3), premium: r(c.premium_pct, 3), catalogo: r(c.catalogo_pct, 3), conversion: r(c.conversion, 4), oportunidad: c.puntaje,
  }));
  const prod = (p: DatosInforme["productos"][number]) => ({
    producto: p.producto, titulo: p.titulo, marca: p.marca, cat: p.cat, gmv12: r(p.gmv), unidades12: p.unidades, precio_mediana: r(p.precio_mediana),
    vendedores: p.vendedores, crec3m: r(p.crecimiento, 3), lider: r(p.lider_pct, 3), full: r(p.full_pct, 3), oportunidad: p.puntaje, lo_tenemos: !!p.tuyo_producto,
  });
  const top = d.productos.slice(0, 20).map(prod);
  const oport = [...d.productos].sort((a, b) => (b.puntaje ?? 0) - (a.puntaje ?? 0)).slice(0, 20).map(prod);
  return JSON.stringify({
    categoria: ruta, ultimo_mes_cerrado: d.mes.slice(0, 7), kpi_12_meses: d.kpi,
    meses: d.serie.map((m) => ({ mes: m.mes, u: m.unidades, usd: r(m.gmv_usd), ticket_usd: r(m.ticket_usd, 1), vendedores: m.vendedores })),
    franjas_precio_usd_12m: d.franjas.map((f) => ({ ...f, desde: r(f.desde, 1), hasta: r(f.hasta, 1), parte: r(f.parte, 3), gmv_usd: r(f.gmv_usd), crecimiento: r(f.crecimiento, 3) })),
    subcategorias_que_mas_facturan: cats, productos_que_mas_facturan: top, productos_con_mas_puntaje_de_oportunidad: oport,
    nota: "gmv en pesos; usd = pesos ÷ dólar oficial promedio del mes. crec3m = unidades de los últimos 3 meses cerrados contra los 3 anteriores. lider = parte de las unidades del vendedor que más vende. oportunidad = puntaje 0–100 dentro de la lista.",
  });
}

export async function rutaCategoria(cat: number): Promise<string> {
  if (!cat) return "Todas las categorías bajadas";
  const c = await una<{ ruta: string | null }>("select ruta from mpro_categoria where pais = 'ar' and category_id = $1", [cat]);
  return c?.ruta ?? `MLA${cat}`;
}

/** Escribe (o reescribe) el informe de una categoría. Devuelve el mensaje para el cartel. */
export async function generarInforme(org: string, cat: number, quien: QuienInforme): Promise<string> {
  if (!hayClaude()) throw new Error("Falta la llave de Claude (ANTHROPIC_API_KEY).");
  // Uno por vez por categoría (otro que quedó «trabajando» más de 10 minutos se dio por caído).
  const turno = await una(`
    insert into mpro_informe (organizacion_id, cat, estado, pedido_por, empezado_ts) values ($1, $2, 'trabajando', $3, now())
    on conflict (organizacion_id, cat) do update set estado = 'trabajando', pedido_por = excluded.pedido_por, empezado_ts = now(), error = null
     where mpro_informe.estado <> 'trabajando' or mpro_informe.empezado_ts < now() - interval '10 minutes'
    returning 1`, [org, cat, quien.usuarioId]);
  if (!turno) return "Ese informe ya se está escribiendo: en unos minutos aparece.";
  try {
    const d = await datosInforme(org, cat || null);
    if (!d) throw new Error("Todavía no hay meses cerrados bajados de Market Pro.");
    const ruta = await rutaCategoria(cat);
    const { texto, usd, consultas } = await correrIa(resumenParaIa(d, ruta), quien);
    await consulta(`update mpro_informe set texto = $3, estado = 'listo', costo_usd = $4, consultas = $5, datos_hasta = $6, generado_ts = now(), error = null
                     where organizacion_id = $1 and cat = $2`, [org, cat, texto, usd, consultas, d.mes]);
    return `Informe de «${ruta}» listo (${consultas} consultas, US$ ${usd.toFixed(2)}).`;
  } catch (e) {
    const msj = e instanceof Error ? e.message : String(e);
    await consulta("update mpro_informe set estado = 'error', error = $3 where organizacion_id = $1 and cat = $2", [org, cat, msj.slice(0, 500)]).catch(() => {});
    throw e;
  }
}

async function correrIa(resumen: string, quien: QuienInforme) {
  return agenteSql({ sistema: SISTEMA, mensaje: `Los números de partida (JSON):\n${resumen}\n\nExplorá y escribí el informe.`, quien, topeUsd: TOPE_USD, maxVueltas: MAX_VUELTAS, segundos: SEGUNDOS });
}

/** Quién firma los informes automáticos: el dueño de la organización (siempre superadministrador). */
async function duenoDe(org: string): Promise<QuienInforme | null> {
  const u = await una<{ id: string; auth_id: string | null }>(
    "select u.id, u.auth_id from organizaciones o join usuarios u on u.id = o.dueno_usuario_id where o.id = $1", [org]);
  return u?.auth_id ? { authId: u.auth_id, permisos: {} as Permisos, superadmin: true, usuarioId: null } : null;
}

/** Cada mañana: los informes ya pedidos que quedaron atrás (cerró un mes nuevo, o tienen más de 30 días) se vuelven a
 *  escribir, de a uno por día para no gastar de golpe. */
export async function refrescarInformes(org: string): Promise<void> {
  const mes = await ultimoMes(org);
  if (!mes || !hayClaude()) return;
  const viejo = await una<{ cat: number }>(`
    select cat from mpro_informe where organizacion_id = $1 and estado <> 'trabajando'
       and (datos_hasta is null or datos_hasta < $2::date or generado_ts < now() - interval '30 days')
     order by generado_ts nulls first limit 1`, [org, mes]);
  if (!viejo) return;
  const quien = await duenoDe(org);
  if (!quien) return;
  await generarInforme(org, viejo.cat, quien);
}
