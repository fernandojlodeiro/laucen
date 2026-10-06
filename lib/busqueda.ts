// Cómo se busca en todo el panel (Fer, 6/10). Una sola regla para el buscador de
// arriba y todos los buscadores de las pantallas:
//
//   · Lo escrito se busca TAL CUAL, entero (con sus espacios), en cualquier parte
//     del dato. "SKU02252" busca "SKU02252"; "Mini Elm" busca "Mini Elm" junto.
//     Con "Comienza por" tildada, al principio del dato.
//   · El "?" separa condiciones que tienen que cumplirse TODAS en el MISMO
//     resultado (cada una en cualquiera de sus datos): "note?12gb" trae lo que
//     dice "note" y además "12gb". No es "o".
//   · Un CUIT o DNI escrito con puntos o guiones: una condición de sólo números
//     (sin letras, 4 o más dígitos) se compara también contra los dígitos del
//     documento. "02252" puede ser un pedazo de CUIT; "SKU02252" no.
//
// Pura (sin base): la usan las consultas SQL y los filtros en memoria.

/** Lo que explica el globito "?" de los buscadores. */
export const AYUDA_BUSQUEDA = "Busca lo que escribís tal cual, entero (con sus espacios), en cualquier parte. Para pedir varias condiciones a la vez, separalas con ?: trae lo que cumple todas en el mismo resultado — por ejemplo note?12gb trae lo que dice “note” y también “12gb”.";

/** Las condiciones de lo escrito: separadas por "?", sin espacios en los extremos, sin vacías ni repetidas (hasta 10). */
export function terminosBusqueda(q: string | null | undefined): string[] {
  return [...new Set((q ?? "").split("?").map((t) => t.trim()).filter(Boolean))].slice(0, 10);
}

const escapar = (t: string) => t.replace(/[\\%_]/g, (x) => `\\${x}`);

/** Los patrones para `ilike` de cada condición: "%x%" (o "x%" con `comienza`). [] si no se escribió nada. */
export function patronesBusqueda(q: string | null | undefined, comienza = false): string[] {
  return terminosBusqueda(q).map((t) => `${comienza ? "" : "%"}${escapar(t)}%`);
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

/** La condición SQL: cada patrón de `param` (un text[] con patronesBusqueda) aparece en alguno de
 *  los `campos` del mismo resultado. Un campo puede ser una expresión que ya use `w` (por ejemplo un
 *  exists sobre las variaciones). Con `digitos` (otro text[] con digitosBusqueda, alineado) una
 *  condición de sólo números vale también si está en los dígitos de esos campos. Con el arreglo
 *  vacío (nada escrito) es verdadera: no filtra. */
export function sqlBusqueda(param: string, campos: string[], digitos?: { param: string; campos: string[] }): string {
  const conds = [
    ...campos.map((c) => (/\bw\b/.test(c) ? c : `${c} ilike w`)),
    ...(digitos?.campos ?? []).map((c) => `(d <> '' and regexp_replace(coalesce(${c}, ''), '\\D', '', 'g') like d)`),
  ];
  const desde = digitos ? `unnest(${param}::text[], ${digitos.param}::text[]) t(w, d)` : `unnest(${param}::text[]) w`;
  return `not exists (select 1 from ${desde} where not coalesce(${conds.join(" or ")}, false))`;
}

/** Lo mismo en memoria: cada condición está en alguno de los `textos` (al principio, con `comienza`). */
export function coincideBusqueda(textos: string | null | undefined | (string | null | undefined)[], q: string | null | undefined, comienza = false): boolean {
  const terminos = terminosBusqueda(q);
  if (!terminos.length) return true;
  const lista = (Array.isArray(textos) ? textos : [textos]).map((t) => (t ?? "").toLowerCase());
  return terminos.every((t) => {
    const b = t.toLowerCase();
    return lista.some((x) => (comienza ? x.startsWith(b) : x.includes(b)));
  });
}
