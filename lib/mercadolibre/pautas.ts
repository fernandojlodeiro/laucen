// Pautas de las publicaciones nuevas en Mercado Libre (Fer, 10/10):
//   · Título: la primera palabra queda; el resto se mezcla distinto en cada cuenta y
//     plan (así no hay dos títulos idénticos). Hasta 60 letras.
//   · Marca: los productos «sin marca» (Tiendavirtual, Daitom, Deirolab, Laucen,
//     Genérico, OEM, en blanco) y los «Arduino» (no son originales: trajeron denuncias)
//     llevan la marca de la cuenta (canal.config.marca_publicaciones: DEIROLAB SA y SAS
//     → Deirolab, ML PUNTO → Laucen, ML .BAIRES y TIENDAVIRTUAL S → Daitom). Las otras
//     marcas de fábrica quedan. La marca no va en el título.
//   · Descripción: sin el encabezado («Tiendavirtual - Importadores…») ni el pie
//     («Llevamos más de 20 años…», «Enviamos a todo el país…»): sólo lo técnico.

import { una } from "@/lib/erp/base";

/** La marca que lleva esta cuenta en los productos «sin marca» (canal.config.marca_publicaciones). */
export async function marcaDeCuenta(org: string, canal: number): Promise<string | null> {
  const r = await una<{ m: string | null }>("select nullif(trim(config ->> 'marca_publicaciones'), '') m from canal where id = $2 and organizacion_id = $1", [org, canal]);
  return r?.m ?? null;
}

/** ¿Entra al catálogo? Si la marca se cambió por la de la cuenta, sólo a un catálogo de esa misma marca. */
export function catalogoSegunMarca(catalogo: string | null, cat: { marca: string | null; decision: string } | null, marca: { marca: string | null; cambiada: boolean }): string | null {
  if (!catalogo || !cat) return null;
  if (marca.cambiada) return normal(cat.marca) === normal(marca.marca) ? catalogo : null;
  return cat.decision === "entra" ? catalogo : null;
}

const normal = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Marcas que se reemplazan por la de la cuenta. */
const REEMPLAZABLES = new Set(["", "tiendavirtual", "tienda virtual", "daitom", "deirolab", "laucen", "generico", "generica", "generic",
  "oem", "ome", "sin marca", "arduino", "para arduino"]);

export const esMarcaReemplazable = (marca: string | null | undefined) => REEMPLAZABLES.has(normal(marca));

type Atributo = { id: string; value_id?: string | null; value_name?: string | null };

/** La marca que queda en la publicación: la de la cuenta si la del producto es reemplazable, si no la del producto. */
export function marcaFinal(atributos: Atributo[] | undefined, marcaCuenta: string | null): { marca: string | null; cambiada: boolean } {
  const actual = atributos?.find((a) => a.id === "BRAND")?.value_name ?? null;
  if (marcaCuenta && esMarcaReemplazable(actual) && normal(actual) !== normal(marcaCuenta)) return { marca: marcaCuenta, cambiada: true };
  return { marca: actual, cambiada: false };
}

/** Reemplaza (o pone) la marca en los atributos. */
export function ponerMarca<T extends Atributo>(atributos: T[], marca: string): T[] {
  return [...atributos.filter((a) => a.id !== "BRAND"), { id: "BRAND", value_name: marca } as T];
}

/** Un número entre 0 y 1 que depende sólo de la semilla (siempre el mismo para la misma cuenta y plan). */
function azar(semilla: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i++) { h ^= semilla.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const LARGO_TITULO = 60;

/** La primera palabra queda; el resto, mezclado según la semilla. Si pasa de 60 letras, se cortan palabras del final. */
export function mezclarTitulo(titulo: string, semilla: string): string {
  const palabras = titulo.trim().split(/\s+/).filter(Boolean);
  if (palabras.length < 3) return palabras.join(" ").slice(0, LARGO_TITULO);
  const [primera, ...resto] = palabras;
  const r = azar(semilla);
  const mezcla = [...resto];
  for (let i = mezcla.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [mezcla[i], mezcla[j]] = [mezcla[j], mezcla[i]];
  }
  // Si la mezcla dio igual al original, se rota una posición.
  if (mezcla.join(" ") === resto.join(" ")) mezcla.push(mezcla.shift()!);
  const salida = [primera];
  for (const p of mezcla) if ([...salida, p].join(" ").length <= LARGO_TITULO) salida.push(p);
  return salida.join(" ");
}

const ENCABEZADO = /^\s*(somos\s+)?(tienda\s*virtual|tiendavirtual|deirolab|daitom|laucen)\b.*(importador|tecnolog)/i;
const SEPARADOR = /^\s*[-_=*~]{5,}\s*$/;
const PIE = [
  /^\s*llevamos m[aá]s de \d+ a[nñ]os/i,
  /^\s*enviamos a todo el pa[ií]s/i,
  /^\s*todos nuestros productos son nuevos/i,
  /^\s*realizamos factura/i,
  /^\s*si ves la publicaci[oó]n es porque tenemos stock/i,
];

/** La descripción sin el encabezado ni el pie de la casa: sólo lo del producto. */
export function limpiarDescripcion(texto: string): string {
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n")
    .filter((l) => !ENCABEZADO.test(l) && !SEPARADOR.test(l) && !PIE.some((p) => p.test(l)));
  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
