// Costo de importación estimado de un producto, sobre CIF (Fer, 3/10). Misma
// cuenta y nombres que lib/piloto/costo.ts:
//
//   flete = FOB × flete %   ·   seguro = FOB × seguro % (1% de entrada)
//   CIF = FOB + flete + seguro
//   derechos, estadística y arancel/otros = CIF × su alícuota
//   despachante (1% del CIF) + depósito fiscal y otros (2% del CIF) = 3% del CIF
//   costo puesto = CIF + derechos + estadística + otros + despachante + depósito
//
// IVA, IVA adicional, percepción de ganancias e ingresos brutos se calculan
// sobre la base imponible (CIF + derechos + estadística) y van aparte: son
// crédito fiscal / anticipos, no costo.
//
// Cada valor vacío hereda: el del producto (producto_costo) → el de su familia
// (familia_costo) → el de la familia padre → ... → el general de la
// organización (config_org, clave 'costo_importacion').

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { leerNumero } from "@/lib/numeros";

export const VIAS = { avion: "Avión", barco: "Barco", courier: "Courier" } as const;
export type Via = keyof typeof VIAS;
export const esVia = (v: unknown): v is Via => typeof v === "string" && v in VIAS;

export type ClavePct =
  | "flete_pct" | "seguro_pct" | "derecho_pct" | "tasa_estadistica_pct" | "arancel_otros_pct" | "despachante_pct" | "deposito_pct"
  | "iva_pct" | "iva_adicional_pct" | "percepcion_ganancias_pct" | "ingresos_brutos_pct";

/** Los porcentajes, en el orden en que se muestran, con sobre qué se aplican. */
export const PCT_FLETE: [ClavePct, string][] = [["flete_pct", "Flete"], ["seguro_pct", "Seguro"]];
export const PCT_SUMAN: [ClavePct, string][] = [
  ["derecho_pct", "Derecho de importación"], ["tasa_estadistica_pct", "Tasa de estadística"], ["arancel_otros_pct", "Arancel / otros"],
  ["despachante_pct", "Despachante"], ["deposito_pct", "Depósito fiscal y otros"],
];
export const PCT_CREDITO: [ClavePct, string][] = [
  ["iva_pct", "IVA"], ["iva_adicional_pct", "IVA adicional"], ["percepcion_ganancias_pct", "Percepción de ganancias"], ["ingresos_brutos_pct", "Ingresos brutos"],
];
export const TODOS_PCT: [ClavePct, string][] = [...PCT_FLETE, ...PCT_SUMAN, ...PCT_CREDITO];
/** El tope de cada porcentaje (el flete por avión puede pasar el 100% del FOB). */
export const TOPE_PCT: Partial<Record<ClavePct, number>> = { flete_pct: 500 };

export type Valores = Partial<Record<ClavePct, number | null>> & { ncm?: string | null; via?: Via | null };
export type Clave = ClavePct | "ncm" | "via";

/** Lo general de la organización: sólo lo que vale igual para casi todo. */
export const CLAVES_GENERAL: Clave[] = ["flete_pct", "via", "seguro_pct", "despachante_pct", "deposito_pct"];
export const GENERAL_POR_DEFECTO: Valores = { seguro_pct: 1, despachante_pct: 1, deposito_pct: 2, flete_pct: null, via: null };
export const CLAVE_CONFIG = "costo_importacion";

export type Origen = { tipo: "producto" } | { tipo: "familia"; nombre: string } | { tipo: "general" } | null;
export type Resuelto = { [K in Clave]: { valor: K extends "ncm" ? string | null : K extends "via" ? Via | null : number | null; origen: Origen } };

/** Los valores generales de la organización (los cargados, o los de entrada). */
export async function generalDe(org: string): Promise<Valores> {
  const r = await una<{ valor: Record<string, unknown> | null }>(
    "select config_de($1, $2) valor", [org, CLAVE_CONFIG]);
  const v = r?.valor ?? {};
  const salida: Valores = { ...GENERAL_POR_DEFECTO };
  for (const k of CLAVES_GENERAL) {
    if (!(k in v)) continue;
    const x = v[k];
    if (k === "via") salida.via = esVia(x) ? x : null;
    else salida[k as ClavePct] = typeof x === "number" ? x : null;
  }
  return salida;
}

const COLUMNAS = `ncm, via, ${TODOS_PCT.map(([k]) => `${k}::float8`).join(", ")}`;

/** Las familias de un producto con sus costos: la suya primero, después la
 *  padre, y así hasta arriba. Las que no tienen costos cargados también van
 *  (con todo vacío) para que la cadena se lea entera. */
export async function cadenaDeFamilias(org: string, familiaId: number | null): Promise<{ id: number; nombre: string; valores: Valores }[]> {
  if (!familiaId) return [];
  const filas = await consulta<{ id: number; nombre: string } & Valores>(`
    with recursive arriba as (
      select f.id, f.padre_id, f.nombre, 0 nivel from familia f where f.id = $2 and f.organizacion_id = $1
      union all
      select f.id, f.padre_id, f.nombre, a.nivel + 1 from familia f join arriba a on f.id = a.padre_id where a.nivel < 50
    )
    select a.id::int, a.nombre, ${COLUMNAS.split(", ").map((c) => `fc.${c}`).join(", ")}
      from arriba a left join familia_costo fc on fc.familia_id = a.id
     order by a.nivel`, [org, familiaId]);
  return filas.map(({ id, nombre, ...valores }) => ({ id, nombre, valores }));
}

/** Los costos propios de un producto (null si nunca se cargaron). */
export async function propiosDe(org: string, productoId: number): Promise<(Valores & { notas: string | null; actualizado: string | null }) | null> {
  return una(`
    select ${COLUMNAS}, notas, to_char(actualizado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') actualizado
      from producto_costo where producto_id = $2 and organizacion_id = $1`, [org, productoId]);
}

/** Cada valor con de dónde sale: el propio, el de la primera familia de la
 *  cadena que lo tenga, o el general. */
export function resolver(propios: Valores | null, cadena: { nombre: string; valores: Valores }[], general: Valores): Resuelto {
  const claves: Clave[] = ["ncm", "via", ...TODOS_PCT.map(([k]) => k)];
  const salida = {} as Record<Clave, { valor: unknown; origen: Origen }>;
  for (const k of claves) {
    const vacio = (x: unknown) => x == null || x === "";
    if (propios && !vacio(propios[k])) { salida[k] = { valor: propios[k], origen: { tipo: "producto" } }; continue; }
    const f = cadena.find((c) => !vacio(c.valores[k]));
    if (f) { salida[k] = { valor: f.valores[k], origen: { tipo: "familia", nombre: f.nombre } }; continue; }
    if (!vacio(general[k])) { salida[k] = { valor: general[k], origen: { tipo: "general" } }; continue; }
    salida[k] = { valor: null, origen: null };
  }
  return salida as Resuelto;
}

/** "de la categoría Notebooks", "general", "propio", "sin cargar". */
export function textoOrigen(o: Origen): string {
  if (!o) return "sin cargar";
  if (o.tipo === "producto") return "propio";
  if (o.tipo === "familia") return `de la categoría ${o.nombre}`;
  return "general";
}

export type Cuenta = {
  fob: number; flete: number; seguro: number; cif: number;
  derechos: number; estadistica: number; otros: number; despachante: number; deposito: number;
  costo: number; baseImponible: number; credito: number;
};

/** La cuenta de una unidad, en la moneda del FOB. Lo que no está cargado vale 0. */
export function calcular(fob: number, r: Resuelto): Cuenta {
  const p = (k: ClavePct) => (r[k].valor ?? 0) / 100;
  const flete = fob * p("flete_pct");
  const seguro = fob * p("seguro_pct");
  const cif = fob + flete + seguro;
  const derechos = cif * p("derecho_pct");
  const estadistica = cif * p("tasa_estadistica_pct");
  const otros = cif * p("arancel_otros_pct");
  const despachante = cif * p("despachante_pct");
  const deposito = cif * p("deposito_pct");
  const baseImponible = cif + derechos + estadistica;
  const credito = baseImponible * PCT_CREDITO.reduce((t, [k]) => t + p(k), 0);
  return {
    fob, flete, seguro, cif, derechos, estadistica, otros, despachante, deposito,
    costo: cif + derechos + estadistica + otros + despachante + deposito, baseImponible, credito,
  };
}

/** Todo lo de un producto de una vez: propios, cadena, general y resueltos. */
export async function costoDeProducto(org: string, productoId: number, familiaId: number | null) {
  const [propios, cadena, general] = await Promise.all([propiosDe(org, productoId), cadenaDeFamilias(org, familiaId), generalDe(org)]);
  return { propios, cadena, general, resuelto: resolver(propios, cadena, general) };
}

// ── Lectura de formularios (pestaña Costo, familias, valores generales) ──

/** Los porcentajes de un formulario, en el orden de `claves`, validados. */
export function leerPctsCosto(fd: FormData, claves: ClavePct[] = TODOS_PCT.map(([k]) => k)): (number | null)[] {
  return claves.map((k) => {
    const n = leerNumero(fd.get(k));
    const tope = TOPE_PCT[k] ?? 100;
    const t = TODOS_PCT.find(([c]) => c === k)?.[1] ?? k;
    if (n != null && (n < 0 || n > tope)) throw new ErrorErp(`${t}: va de 0 a ${tope} %.`);
    return n;
  });
}

/** La posición arancelaria, sin espacios y en mayúsculas. */
export function leerNcm(fd: FormData): string | null {
  const v = fd.get("ncm");
  const ncm = typeof v === "string" && v.trim() ? v.toUpperCase().replace(/\s+/g, "") : null;
  if (ncm && ncm.length > 20) throw new ErrorErp("La posición arancelaria es muy larga (ej. 8516.79.90.990X).");
  return ncm;
}
