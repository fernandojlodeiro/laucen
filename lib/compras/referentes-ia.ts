// Vendedores referentes, fase 2 (pedido de Fer, 29/10): la IA ordena lo que leímos de la competencia
// (lib/compras/referentes.ts) en dos pasos, sin tocar nada de Mercado Libre:
//   1. Agrupar: junta en un grupo (referente_grupo) las publicaciones de los distintos vendedores que son el mismo producto.
//      Las candidatas salen de las palabras poco comunes del título que comparten; la IA decide cuáles son iguales. El mismo
//      producto de catálogo de Mercado Libre va junto sin preguntar.
//   2. Comparar con lo nuestro: cada grupo contra TODOS nuestros productos, activos y archivados (Fer, 29/10), con el título,
//      la marca, el modelo, las variaciones y los títulos de nuestras publicaciones. La IA dice cuál es el mismo o ninguno.
// Lo ya hecho no se repite: una pasada nueva sólo trabaja lo que falta (publicaciones sin grupo, grupos sin comparar). Cada
// pasada tiene su tope de gasto (referente_ia) y se corre de a vueltas de unos minutos (/api/referentes-ia).

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { pedirClaude } from "@/lib/claude";
import { urlPanel } from "@/lib/tienda/dominios";

/** Tope de gasto de IA de una pasada, en dólares. */
export const TOPE_IA_USD = 15;
/** Segundos de trabajo por vuelta (la ruta tiene 5 minutos). */
const SEGUNDOS = 230;
/** Pedidos a la IA a la vez. */
const A_LA_VEZ = 6;
/** Candidatas que se le muestran a la IA, como mucho. */
const CANDIDATAS = 12;

const palabrasDe = (t: string) => new Set(t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1));

/** Índice de palabras → posiciones, sin las muy comunes (no sirven para encontrar candidatas). */
function indiceDe(textos: Set<string>[], comunMin: number) {
  const indice = new Map<string, number[]>();
  textos.forEach((ws, i) => { for (const w of ws) { const l = indice.get(w); if (l) l.push(i); else indice.set(w, [i]); } });
  const comun = Math.max(comunMin, textos.length / 25);
  for (const [w, l] of indice) if (l.length > comun) indice.delete(w);
  return indice;
}

/** Las más parecidas a `ws` en el índice: por cantidad de palabras raras en común y la parte de `ws` que cubren. Pura. */
export function candidatasDe(ws: Set<string>, textos: Set<string>[], indice: Map<string, number[]>, max = CANDIDATAS, excluir?: number): number[] {
  const comunes = new Map<number, number>();
  for (const w of ws) for (const i of indice.get(w) ?? []) if (i !== excluir) comunes.set(i, (comunes.get(i) ?? 0) + 1);
  return [...comunes].map(([i, n]) => {
    let todas = 0; for (const w of ws) if (textos[i].has(w)) todas++;
    return { i, n, s: todas / Math.max(1, Math.min(ws.size, textos[i].size)) };
  }).filter((x) => x.n >= 1 && x.s >= 0.35).sort((a, b) => b.s - a.s || b.n - a.n).slice(0, max).map((x) => x.i);
}

/** Cuántas unidades dice el título que trae (1 si no dice): «5 X …», «… X2un», «Pack x10», «Pack 65 …», «3 unidades», «Kit 50 …».
 *  Dos con distinta cantidad nunca son el mismo producto, diga lo que diga la IA (Fer, 29/10: la IA juntaba «Reloj DS3231»
 *  con «5 X Reloj DS3231»). No toma medidas ni códigos («1x40», «X100 atenuador» va igual en los dos). Pura. */
export function cantidadDe(titulo: string): number {
  const t = ` ${titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()} `;
  const m = t.match(/^\s*(\d{1,3})\s*x\s/) ?? t.match(/\s(?:pack|kit|set|combo|lote)\s*(?:x\s*|de\s+)?(\d{1,3})\b/)
    ?? t.match(/\sx\s*(\d{1,3})\s*(?:u|un|uds?|unid|unidades|pcs|piezas)?\b(?!\s*(?:mm|cm|m|v|w|a|mhz|ghz|gb|mb)\b)/)
    ?? t.match(/\s(\d{1,3})\s*(?:unidades|unid|uds|un|u\.)\s/);
  const n = m ? Number(m[1]) : 1;
  return n >= 1 ? n : 1;
}

/** Lee {"iguales":[1,3]} o [1,3] de la respuesta. Pura. */
export function leerIguales(texto: string, cuantas: number): number[] | null {
  const json = texto.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0];
  if (!json) return null;
  try {
    const x = JSON.parse(json) as unknown;
    const arr = Array.isArray(x) ? x : (x as { iguales?: unknown }).iguales;
    if (!Array.isArray(arr)) return null;
    return [...new Set(arr.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= cuantas))];
  } catch { return null; }
}

/** Lee {"n":2,"motivo":"…"} (0 = ninguno) de la respuesta. Pura. */
export function leerElegido(texto: string, cuantas: number): { n: number; motivo: string } | null {
  const json = texto.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const x = JSON.parse(json) as { n?: unknown; motivo?: unknown };
    const n = Number(x.n);
    if (!Number.isInteger(n) || n < 0 || n > cuantas) return null;
    return { n, motivo: String(x.motivo ?? "").slice(0, 200) };
  } catch { return null; }
}

// Lo que más confunde (Fer, 29/10, primera pasada con el modelo chico: 1 de cada 4 grupos mal): la cantidad («Pack x10»,
// «2 X», «X2un», «6 cintas» contra una unidad) y las versiones (relé mecánico contra estado sólido, 2000 W contra 4000 W).
const REGLAS = `Es el mismo producto sólo si un comprador los elegiría indistintamente: misma función, mismo modelo y mismas
especificaciones principales (medidas, potencia, voltaje, capacidad, cantidad de canales o de pines, tipo de conector, etc.) y
LA MISMA CANTIDAD DE UNIDADES.
Mirá la cantidad con cuidado: "Pack X10", "x36u", "2 X", "X2un", "Kit 50", "6 Cintas", "3 Unidades" son packs; una unidad suelta y un
pack (o dos packs de distinta cantidad) NO son el mismo producto.
Tampoco lo son: otro modelo o código (TCRT5000 no es LDR; STC-1000 no es STC-3028), otra potencia o capacidad (2000 W no es 4000 W,
aunque uno diga "pico 4000 W"), otra tecnología (relé mecánico no es relé de estado sólido), una versión superior o inferior, un
repuesto o accesorio, o un kit contra el producto suelto.
La marca genérica, el color, el vendedor o cómo está escrito el título no importan.`;

const SISTEMA_AGRUPAR = `Sos un comprador experto de Mercado Libre Argentina. Te paso una publicación base y otras candidatas.
Decí cuáles son EL MISMO producto que la base.
${REGLAS}
Ante la duda, NO es el mismo. Respondé SOLO JSON: {"iguales":[2,5]} (o {"iguales":[]}).`;

const SISTEMA_NUESTRO = `Sos un comprador experto de Mercado Libre Argentina. Te paso un producto que vende la competencia (sus títulos) y
productos de nuestro catálogo. Decí cuál de los nuestros es EL MISMO producto.
${REGLAS}
Si ninguno lo es, n = 0. Respondé SOLO JSON: {"n":2,"motivo":"mismo módulo HC-SR04, una unidad"}. El motivo, corto y en castellano.`;

type PubIa = { item_id: string; titulo: string; precio: number | null; vendidos: number | null; catalogo: string | null; grupo_id: number | null };

/** Pide una pasada de la IA (si no hay otra corriendo) y la arranca de fondo. Devuelve el número de pasada. */
export async function pedirIa(org: string): Promise<number> {
  const corriendo = await una<{ id: number; token: string }>("select id::int, token::text from referente_ia where organizacion_id = $1 and estado = 'corriendo' order by id desc limit 1", [org]);
  if (corriendo) { await relanzar(corriendo.id, corriendo.token); return corriendo.id; }
  const f = await una<{ id: number; token: string }>("insert into referente_ia (organizacion_id, tope_usd) values ($1, $2) returning id::int, token::text", [org, TOPE_IA_USD]);
  await relanzar(f!.id, f!.token);
  return f!.id;
}

async function relanzar(id: number, token: string) {
  const base = urlPanel();
  if (base) await fetch(`${base}/api/referentes-ia?id=${id}&token=${token}`, { cache: "no-store", signal: AbortSignal.timeout(3000) }).catch(() => {});
}

/** Una vuelta de una pasada: agrupa lo que falta y, cuando no falta nada, compara los grupos con nuestro catálogo. */
export async function correrIa(id: number, token: string): Promise<void> {
  const p = await una<{ organizacion_id: string; estado: string; tope_usd: number; gastado_usd: number }>(
    "select organizacion_id, estado, tope_usd::float8, gastado_usd::float8 from referente_ia where id = $1 and token = $2::uuid", [id, token]);
  if (!p) throw new ErrorErp("Pasada desconocida.");
  if (p.estado !== "corriendo") return;
  const org = p.organizacion_id;
  await consulta("update referente_ia set actualizado_ts = now() where id = $1", [id]);
  const t0 = Date.now();
  let gastado = p.gastado_usd;
  const queda = () => Date.now() - t0 < SEGUNDOS * 1000 && gastado < p.tope_usd;
  let avances = 0; // lo agrupado o comparado en esta vuelta: sin avance no se relanza (p. ej., la IA no responde)
  const sumar = async (usd: number, avanzo = false) => {
    gastado += usd; if (avanzo) avances++;
    await consulta("update referente_ia set gastado_usd = $2, actualizado_ts = now() where id = $1", [id, gastado]);
  };
  try {
    const faltan1 = await agrupar(org, queda, sumar);
    const faltan2 = faltan1 ? 1 : await compararConNuestros(org, queda, sumar);
    if (!faltan1 && !faltan2) { await consulta("update referente_ia set estado = 'terminada', actualizado_ts = now() where id = $1", [id]); return; }
    if (gastado >= p.tope_usd) {
      await consulta("update referente_ia set estado = 'terminada', error = $2, actualizado_ts = now() where id = $1",
        [id, `Llegó al tope de US$ ${p.tope_usd.toFixed(2)}: quedó a medias (otra pasada sigue desde ahí).`]);
      return;
    }
    if (!avances) {
      await consulta("update referente_ia set estado = 'error', error = $2, actualizado_ts = now() where id = $1", [id, "La IA no respondió en toda una vuelta."]);
      return;
    }
    await relanzar(id, token);
  } catch (e) {
    console.error("[referentes-ia]", e);
    await consulta("update referente_ia set estado = 'error', error = $2, actualizado_ts = now() where id = $1", [id, (e instanceof Error ? e.message : String(e)).slice(0, 300)]);
  }
}

/** Corre `trabajo` sobre los elementos, de a A_LA_VEZ, mientras `queda()`. */
async function deAVarios<T>(xs: T[], queda: () => boolean, trabajo: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: A_LA_VEZ }, async () => { while (i < xs.length && queda()) await trabajo(xs[i++]); }));
}

/** Paso 1. Devuelve cuántas publicaciones quedaron sin grupo. */
async function agrupar(org: string, queda: () => boolean, sumar: (usd: number, avanzo?: boolean) => Promise<void>): Promise<number> {
  const pubs = await consulta<PubIa>(`
    select item_id, titulo, precio::float8 precio, vendidos, case when grupo ~ '^MLA[0-9]+$' then grupo end catalogo, grupo_id::float8 grupo_id
      from referente_pub where organizacion_id = $1 order by vendidos desc nulls last, item_id`, [org]);
  const textos = pubs.map((x) => palabrasDe(x.titulo));
  const indice = indiceDe(textos, 30);
  const asignar = async (items: number[], grupo: number | null): Promise<number> => {
    const g = grupo ?? (await una<{ id: number }>("insert into referente_grupo (organizacion_id) values ($1) returning id::float8 id", [org]))!.id;
    const nuevos = items.filter((i) => pubs[i].grupo_id == null);
    for (const i of nuevos) pubs[i].grupo_id = g;
    if (nuevos.length) await consulta("update referente_pub set grupo_id = $3 where organizacion_id = $1 and item_id = any($2::text[])", [org, nuevos.map((i) => pubs[i].item_id), g]);
    return g;
  };
  // El mismo producto de catálogo de Mercado Libre va junto sin preguntar.
  const porCatalogo = new Map<string, number[]>();
  pubs.forEach((x, i) => { if (x.catalogo) porCatalogo.set(x.catalogo, [...(porCatalogo.get(x.catalogo) ?? []), i]); });
  for (const is of porCatalogo.values()) if (is.length > 1 && is.some((i) => pubs[i].grupo_id == null)) {
    await asignar(is, is.map((i) => pubs[i].grupo_id).find((g) => g != null) ?? null);
    await sumar(0, true);
  }
  const semillas = pubs.map((_, i) => i).filter((i) => pubs[i].grupo_id == null);
  await deAVarios(semillas, queda, async (i) => {
    if (pubs[i].grupo_id != null) return; // la juntó otra mientras tanto
    const cant = cantidadDe(pubs[i].titulo);
    const cands = candidatasDe(textos[i], textos, indice, CANDIDATAS * 2, i).filter((c) => cantidadDe(pubs[c].titulo) === cant).slice(0, CANDIDATAS);
    if (!cands.length) { await asignar([i], null); await sumar(0, true); return; }
    const lista = cands.map((c, k) => `${k + 1}. ${pubs[c].titulo} — $ ${Math.round(pubs[c].precio ?? 0)}`).join("\n");
    const r = await pedirClaude({ system: SISTEMA_AGRUPAR, modelo: "medio", effort: "low", maxTokens: 300,
      contenido: `Base: ${pubs[i].titulo} — $ ${Math.round(pubs[i].precio ?? 0)}\n\nCandidatas:\n${lista}` });
    await sumar(r.usd);
    if ("error" in r) return; // queda para la próxima vuelta
    const iguales = leerIguales(r.texto, cands.length);
    if (!iguales) return;
    await sumar(0, true);
    const juntas = iguales.map((n) => cands[n - 1]);
    if (pubs[i].grupo_id != null) { await asignar(juntas, pubs[i].grupo_id); return; }
    const existente = juntas.map((c) => pubs[c].grupo_id).find((g) => g != null) ?? null;
    await asignar([i, ...juntas], existente);
  });
  const sueltas = pubs.filter((x) => x.grupo_id == null).length;
  if (!sueltas) await consulta(`delete from referente_grupo g where g.organizacion_id = $1 and not exists (select 1 from referente_pub p where p.grupo_id = g.id)`, [org]);
  return sueltas;
}

/** Paso 2. Devuelve cuántos grupos quedaron sin comparar. */
async function compararConNuestros(org: string, queda: () => boolean, sumar: (usd: number, avanzo?: boolean) => Promise<void>): Promise<number> {
  const grupos = await consulta<{ id: number; titulos: string[]; precio: number | null }>(`
    select g.id::float8 id, array_agg(distinct p.titulo) titulos, min(p.precio)::float8 precio
      from referente_grupo g join referente_pub p on p.grupo_id = g.id
     where g.organizacion_id = $1 and g.juzgado_ts is null
     group by g.id order by sum(coalesce(p.vendidos, 0)) desc`, [org]);
  if (!grupos.length) return 0;
  // Todos nuestros productos, activos y archivados, con todo el texto que los describe.
  const nuestros = await consulta<{ id: number; sku: string | null; titulo: string; estado: string; texto: string }>(`
    select p.id::float8 id, (select v.sku from variacion v where v.producto_id = p.id order by v.id limit 1) sku, p.titulo, p.estado,
           concat_ws(' ', p.titulo, p.marca, p.modelo, p.linea,
             (select string_agg(distinct v.titulo, ' ') from variacion v where v.producto_id = p.id),
             (select string_agg(distinct pu.titulo, ' ') from publicacion pu join variacion v on v.id = pu.variacion_id where v.producto_id = p.id)) texto
      from producto p where p.organizacion_id = $1 and p.titulo is not null`, [org]);
  const textos = nuestros.map((x) => palabrasDe(x.texto));
  const indice = indiceDe(textos, 50);
  await deAVarios(grupos, queda, async (g) => {
    const ws = palabrasDe(g.titulos.join(" "));
    const cands = candidatasDe(palabrasDe(g.titulos[0]), textos, indice, 10).concat(candidatasDe(ws, textos, indice, 10));
    const cant = cantidadDe(g.titulos[0]);
    const unicas = [...new Set(cands)].filter((c) => cantidadDe(nuestros[c].titulo) === cant).slice(0, CANDIDATAS);
    if (!unicas.length) {
      await consulta("update referente_grupo set producto_id = null, motivo = $2, juzgado_ts = now() where id = $1", [g.id, "Ningún producto tuyo se le parece"]);
      await sumar(0, true);
      return;
    }
    const lista = unicas.map((c, k) => `${k + 1}. ${nuestros[c].titulo}${nuestros[c].estado === "archivado" ? " (archivado)" : ""}`).join("\n");
    const r = await pedirClaude({ system: SISTEMA_NUESTRO, modelo: "medio", effort: "low", maxTokens: 300,
      contenido: `De la competencia${g.precio ? ` (desde $ ${Math.round(g.precio)})` : ""}:\n${g.titulos.slice(0, 5).map((t) => `- ${t}`).join("\n")}\n\nNuestros productos:\n${lista}` });
    await sumar(r.usd);
    if ("error" in r) return;
    const e = leerElegido(r.texto, unicas.length);
    if (!e) return;
    await sumar(0, true);
    await consulta("update referente_grupo set producto_id = $2, motivo = $3, juzgado_ts = now() where id = $1",
      [g.id, e.n ? nuestros[unicas[e.n - 1]].id : null, e.motivo || null]);
  });
  return (await una<{ n: number }>("select count(*)::int n from referente_grupo where organizacion_id = $1 and juzgado_ts is null", [org]))!.n;
}

/** El avance de la última pasada, para la pantalla. */
export async function avanceIa(org: string) {
  return una<{ id: number; estado: string; gastado: number; tope: number; error: string | null; ts: string; sin_grupo: number; publicaciones: number; grupos: number; sin_comparar: number; atascada: boolean }>(`
    select i.id::int, i.estado, i.gastado_usd::float8 gastado, i.tope_usd::float8 tope, i.error, i.actualizado_ts::text ts,
           (select count(*)::int from referente_pub where organizacion_id = $1 and grupo_id is null) sin_grupo,
           (select count(*)::int from referente_pub where organizacion_id = $1) publicaciones,
           (select count(*)::int from referente_grupo where organizacion_id = $1) grupos,
           (select count(*)::int from referente_grupo where organizacion_id = $1 and juzgado_ts is null) sin_comparar,
           i.estado = 'corriendo' and i.actualizado_ts < now() - interval '6 minutes' atascada
      from referente_ia i where i.organizacion_id = $1 order by i.id desc limit 1`, [org]);
}

/** Vuelve a comparar todos los grupos con el catálogo (por ejemplo, después de cargar productos nuevos). */
export async function recompararTodo(org: string): Promise<void> {
  await consulta("update referente_grupo set juzgado_ts = null where organizacion_id = $1", [org]);
}
