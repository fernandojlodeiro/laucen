// Cómo se busca en todo el panel (Fer, 6/10). Una sola regla para el buscador de
// arriba y todos los buscadores de las pantallas:
//
//   · Lo escrito se busca TAL CUAL, entero (con sus espacios), en cualquier parte
//     del dato. "SKU02252" busca "SKU02252"; "Mini Elm" busca "Mini Elm" junto.
//     Con "Comienza por" tildada, al principio del dato.
//   · El "?" separa condiciones que tienen que cumplirse TODAS en el MISMO
//     DATO (el mismo campo: por ejemplo, las dos en el título): "note?12gb"
//     trae lo que en un mismo dato dice "note" y además "12gb". No es "o", y no
//     vale una en el título y otra en el SKU (Fer, 6/10).
//   · Un CUIT o DNI escrito con puntos o guiones: una condición de sólo números
//     (sin letras, 4 o más dígitos) se compara también contra los dígitos del
//     documento. "02252" puede ser un pedazo de CUIT; "SKU02252" no.
//
// Pura (sin base): la usan las consultas SQL y los filtros en memoria.

/** Lo que explica el globito "?" de los buscadores. */
export const AYUDA_BUSQUEDA = "Busca lo que escribís tal cual, entero (con sus espacios), en cualquier parte. Para pedir varias condiciones a la vez, separalas con ?: trae lo que las cumple todas en un mismo dato — por ejemplo note?12gb trae lo que en el mismo dato (como el título) dice “note” y también “12gb”.";

/** Las condiciones de lo escrito: separadas por "?", sin espacios en los extremos, sin vacías ni repetidas (hasta 10). */
export function terminosBusqueda(q: string | null | undefined): string[] {
  return [...new Set((q ?? "").split("?").map((t) => t.trim()).filter(Boolean))].slice(0, 10);
}

const escapar = (t: string) => t.replace(/[\\%_]/g, (x) => `\\${x}`);

/** Los patrones para `ilike` de cada condición: "%x%" (con `comienza`, la primera "x%": el dato empieza
 *  con ella y las demás van en cualquier parte del mismo dato). [] si no se escribió nada. */
export function patronesBusqueda(q: string | null | undefined, comienza = false): string[] {
  return terminosBusqueda(q).map((t, i) => `${comienza && i === 0 ? "" : "%"}${escapar(t)}%`);
}

/** Alineado con patronesBusqueda: el patrón de dígitos de cada condición que es sólo números
 *  (sin letras, 4 o más dígitos), o "" si no lo es. Para comparar CUIT y DNI sin puntos ni guiones. */
export function digitosBusqueda(q: string | null | undefined): string[] {
  return terminosBusqueda(q).map((t) => {
    const d = /\p{L}/u.test(t) ? "" : t.replace(/\D/g, "");
    return d.length >= 4 ? `%${d}%` : "";
  });
}

/** El número interno (id) a buscar: sólo si lo escrito es un número solo; si no, null. */
export function numeroBusqueda(q: string | null | undefined): number | null {
  const t = terminosBusqueda(q);
  return t.length === 1 && /^\d{1,15}$/.test(t[0]) ? Number(t[0]) : null;
}

/** Un campo donde buscar: una columna o expresión (ej. "p.titulo"), o los campos de otra tabla
 *  relacionada: { de: "select 1 from variacion v where v.producto_id = p.id", campos: ["v.sku", "v.titulo"] }
 *  (vale si alguna fila de esa tabla tiene alguno de esos campos con todas las condiciones). */
export type CampoBusqueda = string | { de: string; campos: string[] };

/** La condición SQL: algún campo tiene TODAS las condiciones de `param` (un text[] con
 *  patronesBusqueda) — todas en el mismo campo. Con `digitos` (otro text[] con digitosBusqueda,
 *  alineado) en esos campos una condición de sólo números vale también si está en sus dígitos.
 *  Con el arreglo vacío (nada escrito) es verdadera: no filtra. */
export function sqlBusqueda(param: string, campos: CampoBusqueda[], digitos?: { param: string; campos: string[] }): string {
  const enDigitos = new Set(digitos?.campos ?? []);
  /** Todas las condiciones en el campo `c`. */
  const todas = (c: string) => {
    if (/(^|[^\w.])w([^\w]|$)/.test(c)) throw new Error(`sqlBusqueda: "${c}" usa w; para otra tabla usá { de, campos }`);
    if (digitos && enDigitos.has(c)) {
      return `not exists (select 1 from unnest(${param}::text[], ${digitos.param}::text[]) t(w, d) where not coalesce(${c} ilike w or (d <> '' and regexp_replace(coalesce(${c}, ''), '\\D', '', 'g') like d), false))`;
    }
    return `not exists (select 1 from unnest(${param}::text[]) w where not coalesce(${c} ilike w, false))`;
  };
  const extra = [...enDigitos].filter((c) => !campos.includes(c));
  const partes = [...campos, ...extra].map((c) => typeof c === "string" ? todas(c) : `exists (${c.de} and (${c.campos.map(todas).join(" or ")}))`);
  return partes.length ? `(${partes.join(" or ")})` : "true";
}

/** Lo mismo en memoria: algún texto tiene todas las condiciones (al principio, con `comienza`: la
 *  primera al principio del texto y las demás en cualquier parte). */
export function coincideBusqueda(textos: string | null | undefined | (string | null | undefined)[], q: string | null | undefined, comienza = false): boolean {
  const terminos = terminosBusqueda(q).map((t) => t.toLowerCase());
  if (!terminos.length) return true;
  const lista = (Array.isArray(textos) ? textos : [textos]).map((t) => (t ?? "").toLowerCase());
  return lista.some((x) => terminos.every((b, i) => (comienza && i === 0 ? x.startsWith(b) : x.includes(b))));
}
