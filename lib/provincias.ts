// Las 24 jurisdicciones de Argentina, escritas siempre igual (Fer, 22/10): las direcciones
// se eligen de esta lista (ElegirProvincia) y lo que llega escrito de otra forma ("CORDOBA",
// "CABA", "Ciudad Autónoma de Buenos Aires") se pasa al nombre de acá. La Ciudad de Buenos
// Aires va como "Capital Federal", como la nombra Mercado Libre. La base hace lo mismo con
// provincia_normal() (db/administracion.sql). Pura: la usan también las pantallas.

export const PROVINCIAS = [
  "Buenos Aires", "Capital Federal", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy",
  "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz",
  "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
] as const;

/** La que se sugiere de entrada: donde está el local. */
export const PROVINCIA_POR_DEFECTO = "Córdoba";

/** Otras formas de escribirlas (sin acentos ni mayúsculas) → el nombre de la lista. */
const OTRAS: Record<string, string> = {
  caba: "Capital Federal", "c.a.b.a.": "Capital Federal", capital: "Capital Federal", "ciudad de buenos aires": "Capital Federal",
  "ciudad autonoma de buenos aires": "Capital Federal", "ciudad autonoma buenos aires": "Capital Federal",
  "provincia de buenos aires": "Buenos Aires", "bs as": "Buenos Aires", "bs. as.": "Buenos Aires", "pba": "Buenos Aires",
  "tierra del fuego, antartida e islas del atlantico sur": "Tierra del Fuego",
};

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** El nombre de la lista para lo que venga escrito; null si no es ninguna. */
export function provinciaNormal(v: string | null | undefined): string | null {
  const t = sinAcentos(String(v ?? ""));
  if (!t) return null;
  return PROVINCIAS.find((p) => sinAcentos(p) === t) ?? OTRAS[t] ?? null;
}

/** Para buscarla escribiendo: la sigla o el otro nombre con que se la conoce. */
export const DETALLE_PROVINCIA: Partial<Record<(typeof PROVINCIAS)[number], string>> = { "Capital Federal": "CABA · Ciudad de Buenos Aires" };
