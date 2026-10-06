// Cómo se busca en todo el panel (Fer, 6/10). Una sola regla para el buscador de
// arriba y todos los buscadores de las pantallas:
//
//   · Lo escrito se busca TAL CUAL, entero (con sus espacios), en cualquier parte
//     del campo. Números y letras son lo mismo: todo es texto ("SKU02252", "2022",
//     "Mini Elm"). Con "Comienza por" tildada, al principio del campo.
//   · "?" separa condiciones que tienen que estar TODAS en el MISMO CAMPO:
//     "note?12gb" trae lo que en un mismo campo (ej. el título) dice "note" y "12gb".
//   · "*" separa condiciones que tienen que estar todas en la MISMA FILA (el
//     mismo producto, cliente…), aunque sea en campos distintos: "note*F412".
//     Se combinan: "note?12gb*asus" = "note" y "12gb" en un mismo campo, y
//     "asus" en cualquier campo de esa fila.
//   · CUIT, teléfonos y CBU se guardan sólo con números (los disparadores de la
//     base, db/moneda.sql): en esos campos ("campos numéricos") se compara también
//     lo escrito sin lo que no sea número, así "20-10225274-9" encuentra
//     "20102252749".
//   · Cada pantalla busca en TODOS los campos de su tabla; el buscador de arriba,
//     en todas las tablas.
//
// Pura (sin base): la usan las consultas SQL y los filtros en memoria.

/** Lo que explica el globito "?" de los buscadores. */
export const AYUDA_BUSQUEDA = "Busca lo que escribís tal cual (números y letras por igual, con sus espacios) en cualquier parte. Con ? pedís varias cosas en un mismo dato: note?12gb trae lo que en el mismo dato (como el título) dice “note” y también “12gb”. Con * pedís varias cosas en el mismo registro aunque estén en datos distintos: note*F412 trae lo que dice “note” en un dato y “F412” en otro.";

/** Lo escrito en grupos (separados por "*") de condiciones (separadas por "?"), sin vacíos (hasta 10 condiciones en total). */
export function gruposBusqueda(q: string | null | undefined): string[][] {
  let n = 0;
  return (q ?? "").split("*")
    .map((g) => [...new Set(g.split("?").map((t) => t.trim()).filter(Boolean))].filter(() => ++n <= 10))
    .filter((g) => g.length);
}

/** Todas las condiciones, sin agrupar. */
export function terminosBusqueda(q: string | null | undefined): string[] {
  return [...new Set(gruposBusqueda(q).flat())];
}

const escapar = (t: string) => t.replace(/[\\%_]/g, (x) => `\\${x}`);

/** El valor para el parámetro de sqlBusqueda: JSON con los grupos de patrones para `ilike`
 *  ("%x%"; con `comienza`, la primera condición de cada grupo "x%"). "[]" si no se escribió nada. */
export function parametroBusqueda(q: string | null | undefined, comienza = false): string {
  return JSON.stringify(gruposBusqueda(q).map((g) => g.map((t, i) => `${comienza && i === 0 ? "" : "%"}${escapar(t)}%`)));
}

/** Un campo donde buscar:
 *  - una columna o expresión de texto ("p.titulo", "c.id::text");
 *  - { num: "c.cuit" }: un campo que se guarda sólo con números (CUIT, teléfono, CBU): se compara
 *    también lo escrito sin lo que no sea número;
 *  - { de: "select 1 from variacion v where v.producto_id = p.id", campos: [...] }: los campos de
 *    otra tabla relacionada (vale si alguna de sus filas cumple). */
export type CampoSimple = string | { num: string };
export type CampoBusqueda = CampoSimple | { de: string; campos: CampoSimple[] };

/** Todas las condiciones del grupo `g` (jsonb de patrones) en el campo `c`. */
function todasEnCampo(c: CampoSimple, g: string): string {
  if (typeof c === "string") {
    if (/(^|[^\w.])_[pg]([^\w]|$)/.test(c)) throw new Error(`sqlBusqueda: "${c}" no puede usar _p ni _g`);
    return `not exists (select 1 from jsonb_array_elements_text(${g}) _p where not coalesce(${c} ilike _p, false))`;
  }
  const f = c.num;
  // Lo escrito sin lo que no sea número (si tiene algún número) contra el campo numérico.
  return `not exists (select 1 from jsonb_array_elements_text(${g}) _p where not coalesce(${f} ilike _p`
    + ` or (regexp_replace(_p, '[^0-9]', '', 'g') <> '' and ${f} like '%' || regexp_replace(_p, '[^0-9]', '', 'g') || '%'), false))`;
}

/** La condición SQL: cada grupo de `param` (el jsonb de parametroBusqueda) tiene todas sus
 *  condiciones en un mismo campo de la fila. Con "[]" (nada escrito) es verdadera: no filtra. */
export function sqlBusqueda(param: string, campos: CampoBusqueda[]): string {
  const g = "_g";
  const enAlguno = campos.map((c) => typeof c === "object" && "de" in c
    ? `exists (${c.de} and (${c.campos.map((x) => todasEnCampo(x, g)).join(" or ")}))`
    : todasEnCampo(c, g));
  if (!enAlguno.length) return "true";
  return `not exists (select 1 from jsonb_array_elements(${param}::jsonb) _g where not (${enAlguno.join(" or ")}))`;
}

/** Lo mismo en memoria: cada grupo tiene todas sus condiciones en alguno de los `textos` (con
 *  `comienza`, la primera condición de cada grupo al principio). `numericos`: textos que se guardan
 *  sólo con números (CUIT, CBU…): se comparan también contra lo escrito sin lo que no sea número. */
export function coincideBusqueda(
  textos: string | null | undefined | (string | null | undefined)[], q: string | null | undefined, comienza = false,
  numericos: (string | null | undefined)[] = [],
): boolean {
  const grupos = gruposBusqueda(q).map((g) => g.map((t) => t.toLowerCase()));
  if (!grupos.length) return true;
  const lista = (Array.isArray(textos) ? textos : [textos]).map((t) => (t ?? "").toLowerCase());
  const nums = numericos.map((t) => (t ?? "").replace(/\D/g, ""));
  const cumple = (x: string, g: string[]) => g.every((b, i) => (comienza && i === 0 ? x.startsWith(b) : x.includes(b)));
  const cumpleNum = (x: string, g: string[]) => g.every((b) => { const d = b.replace(/\D/g, ""); return (!!d && x.includes(d)) || x.includes(b); });
  return grupos.every((g) => lista.some((x) => cumple(x, g)) || nums.some((x) => cumpleNum(x, g)));
}
