// ¿Qué publicaciones de una búsqueda compiten de verdad con nuestro producto? (Fer, 13/10)
//   1. Preselección (pura): fuera las nuestras, las internacionales, las que tardan más que la demora, las que no
//      están en pesos, las que no comparten casi ninguna palabra del título, las que dicen claramente que son un pack
//      («Pack X25», «x10», «100 unidades»; no «Lupa 6x», que es el aumento) y las que cuestan más del triple o menos de
//      un tercio de nuestra Clásica (Fer, 13/10: un LED por unidad comparado con una bolsa de 100).
//   2. La IA (Claude, el modelo chico) mira nuestro título y descripción contra cada una y dice si es el mismo
//      producto (misma función, modelo y especificaciones, una unidad): la que lo es, «comparable», con el motivo.
//      Sin IA (falta la llave o falla), cuenta el parecido del título (la mitad de las palabras o más).
//   3. Con las comparables: el mínimo, el cuarto más barato y la mediana, y cuáles seguir solas (las más baratas).

import { pedirClaude } from "@/lib/claude";
import { esPack, parecido, type PubEncontrada } from "@/lib/seguimiento";

export type Juicio = { comparable: boolean; motivo: string };
/** Una publicación encontrada con lo que se decidió de ella (se guarda así en la búsqueda del producto). */
export type PubJuzgada = PubEncontrada & { comparable?: boolean | null; motivoIa?: string | null };

/** Cuántas candidatas se le pasan a la IA como mucho. */
const TOPE_IA = 60;

/** ¿El título dice claramente que son varias unidades? («Pack X25», «kit», «x10», «100 unidades»; no «6x» ni «16x2»). Pura. */
export function esPackClaro(titulo: string): boolean {
  return /\b(pack|kit|combo|lote|bolsa|blister|set)\b|\bx\s?\d+\b|\b\d{2,}\s*(unidades|unid|uds|piezas|pzas|pcs|u)\b/i.test(titulo);
}

/** Cuánto más caro o barato que nuestra Clásica puede estar uno igual (más que esto, es otro producto o un pack). */
export const RANGO_PRECIO = 3;

/** ¿Por qué no entra en la preselección? (null = entra). `clasica`: nuestro precio, para descartar las de precio
 *  muy distinto. Pura. */
export function motivoFuera(nuestro: string, p: PubEncontrada, demora: number, clasica: number | null = null): string | null {
  if (p.propia) return "Es nuestra";
  if (p.esCatalogo) return "Es un catálogo (se miran sus vendedores)";
  if (p.internacional) return "Internacional";
  if (p.precio == null || p.precio <= 0) return "Sin precio";
  if ((p.moneda ?? "ARS") !== "ARS") return "No está en pesos";
  if (p.entregaDias != null && p.entregaDias > demora) return `Tarda ${p.entregaDias} días en llegar`;
  if (parecido(nuestro, p.titulo) < 0.25) return "El título casi no se parece";
  if (!esPackClaro(nuestro) && esPackClaro(p.titulo)) return "Pack o varias unidades";
  if (clasica && clasica > 0 && (p.precio > clasica * RANGO_PRECIO || p.precio < clasica / RANGO_PRECIO))
    return `Precio muy distinto al nuestro ($ ${Math.round(p.precio).toLocaleString("es-AR")} contra $ ${Math.round(clasica).toLocaleString("es-AR")}): pack u otro producto`;
  return null;
}

/** Las que entran en la preselección, las más parecidas primero. Pura. */
export function preseleccion(nuestro: string, lista: PubEncontrada[], demora: number, clasica: number | null = null): PubEncontrada[] {
  return lista.filter((p) => !motivoFuera(nuestro, p, demora, clasica))
    .sort((a, b) => parecido(nuestro, b.titulo) - parecido(nuestro, a.titulo)).slice(0, TOPE_IA);
}

/** Lee la respuesta de la IA: un arreglo JSON [{"n":1,"comparable":true,"motivo":"…"}]. Pura. */
export function leerJuicios(texto: string, cuantas: number): Map<number, Juicio> {
  const m = new Map<number, Juicio>();
  const json = texto.match(/\[[\s\S]*\]/)?.[0];
  if (!json) return m;
  let arr: unknown;
  try { arr = JSON.parse(json); } catch { return m; }
  if (!Array.isArray(arr)) return m;
  for (const x of arr as { n?: unknown; comparable?: unknown; motivo?: unknown }[]) {
    const n = Number(x?.n);
    if (Number.isInteger(n) && n >= 1 && n <= cuantas && typeof x.comparable === "boolean")
      m.set(n, { comparable: x.comparable, motivo: String(x.motivo ?? "").slice(0, 200) });
  }
  return m;
}

const SISTEMA = `Sos un comprador experto de Mercado Libre Argentina. Te paso un producto nuestro y publicaciones de otros vendedores.
Para cada publicación decidí si es EL MISMO producto que el nuestro, de modo que un comprador las elegiría indistintamente:
misma función, mismo modelo o especificaciones principales (medidas, potencia, voltaje, capacidad, cantidad de lentes, etc.) y una sola unidad.
No es comparable si es otro modelo, una versión claramente superior o inferior, un repuesto o accesorio, un kit o pack, o un producto distinto que comparte palabras.
Si el nuestro se vende por unidad y la publicación cuesta mucho más que el nuestro, casi seguro es un pack o bolsa aunque el título no lo diga: no es comparable.
Las diferencias de marca genérica, color o redacción del título no importan.
Respondé SOLO un arreglo JSON, una entrada por publicación: [{"n":1,"comparable":true,"motivo":"mismo modelo, 5 lentes y luz LED"}, ...]. El motivo, corto y en castellano.`;

/** Lo que juzga la IA de cada candidata (por su número de publicación). null si no hay IA o falló. */
export async function juzgarConIa(nuestro: { titulo: string; descripcion?: string | null; clasica?: number | null }, candidatas: PubEncontrada[]): Promise<{ juicios: Map<string, Juicio>; usd: number } | null> {
  if (!candidatas.length) return { juicios: new Map(), usd: 0 };
  const lista = candidatas.map((p, i) => `${i + 1}. ${p.titulo} — $ ${Math.round(p.precio ?? 0)}`).join("\n");
  const desc = (nuestro.descripcion ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
  const r = await pedirClaude({
    system: SISTEMA, modelo: "chico", maxTokens: 2500,
    contenido: `Nuestro producto: ${nuestro.titulo}${nuestro.clasica ? ` — $ ${Math.round(nuestro.clasica)}` : ""}${desc ? `\nDescripción: ${desc}` : ""}\n\nPublicaciones:\n${lista}`,
  });
  if ("error" in r) return null;
  const leidos = leerJuicios(r.texto, candidatas.length);
  if (!leidos.size) return null;
  const juicios = new Map<string, Juicio>();
  candidatas.forEach((p, i) => { const j = leidos.get(i + 1); if (j) juicios.set(p.itemId, j); });
  return { juicios, usd: r.usd };
}

const cuantil = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q, b = Math.floor(i);
  return s[b] + (s[Math.min(b + 1, s.length - 1)] - s[b]) * (i - b);
};

export type Analisis = {
  /** La lista entera, con «comparable» y el motivo en cada una (las que no entraron, con el motivo de afuera). */
  lista: PubJuzgada[];
  comparables: PubJuzgada[];
  minimo: number | null; p25: number | null; mediana: number | null;
  conIa: boolean; usdIa: number;
};

/** Junta todo: preselección, juicio (IA o parecido del título) y los números de las comparables. */
export async function analizar(nuestro: { titulo: string; descripcion?: string | null; clasica?: number | null }, lista: PubEncontrada[], demora: number,
  juzgar: typeof juzgarConIa = juzgarConIa): Promise<Analisis> {
  const pre = preseleccion(nuestro.titulo, lista, demora, nuestro.clasica ?? null);
  const ia = await juzgar(nuestro, pre);
  const enPre = new Set(pre.map((p) => p.itemId));
  const juzgadas: PubJuzgada[] = lista.map((p) => {
    if (!enPre.has(p.itemId)) return { ...p, comparable: false, motivoIa: motivoFuera(nuestro.titulo, p, demora, nuestro.clasica ?? null) ?? "Quedó afuera de las más parecidas" };
    const j = ia?.juicios.get(p.itemId);
    if (j) return { ...p, comparable: j.comparable, motivoIa: j.motivo };
    // Sin IA: el parecido del título.
    const ok = parecido(nuestro.titulo, p.titulo) >= 0.5 && (esPackClaro(nuestro.titulo) || !esPack(p.titulo));
    return { ...p, comparable: ok, motivoIa: ok ? "Título parecido (sin IA)" : "Título poco parecido (sin IA)" };
  });
  const comparables = juzgadas.filter((p) => p.comparable).sort((a, b) => a.precio! - b.precio!);
  const precios = comparables.map((p) => p.precio!);
  return {
    lista: juzgadas, comparables, minimo: precios.length ? precios[0] : null, p25: cuantil(precios, 0.25), mediana: cuantil(precios, 0.5),
    conIa: !!ia, usdIa: ia?.usd ?? 0,
  };
}
