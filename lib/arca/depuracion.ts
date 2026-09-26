// Depuración de posiciones: qué capítulos y partidas se sacan de la base de
// ARCA porque Fer no los va a estudiar. Lo decide Fer en /importaciones/depurar
// sobre la propuesta de Code (tabla arca_depuracion, en db/arca.sql).

import { pool } from "@/db";

/** Nombres cortos de los 97 capítulos del Sistema Armonizado. */
export const CAPITULOS: Record<string, string> = {
  "01": "Animales vivos", "02": "Carnes", "03": "Pescados y mariscos", "04": "Lácteos, huevos, miel",
  "05": "Otros productos de origen animal", "06": "Plantas y flores", "07": "Hortalizas", "08": "Frutas",
  "09": "Café, té, yerba y especias", "10": "Cereales", "11": "Harinas y almidones", "12": "Semillas y oleaginosas",
  "13": "Gomas y resinas", "14": "Materias vegetales para trenzar", "15": "Grasas y aceites", "16": "Preparaciones de carne y pescado",
  "17": "Azúcares y golosinas", "18": "Cacao y chocolate", "19": "Pastas, galletitas, panificados", "20": "Conservas de frutas y hortalizas",
  "21": "Preparaciones alimenticias diversas", "22": "Bebidas", "23": "Residuos de la industria alimentaria", "24": "Tabaco",
  "25": "Sal, piedras, yeso, cemento", "26": "Minerales metalíferos", "27": "Combustibles", "28": "Químicos inorgánicos",
  "29": "Químicos orgánicos", "30": "Productos farmacéuticos", "31": "Abonos", "32": "Tintas, pinturas, colorantes",
  "33": "Perfumería y cosmética", "34": "Jabones, ceras, velas", "35": "Colas, almidones, enzimas", "36": "Explosivos, fósforos, pirotecnia",
  "37": "Fotografía y cine", "38": "Productos químicos diversos", "39": "Plásticos y sus manufacturas", "40": "Caucho y sus manufacturas",
  "41": "Cueros en bruto", "42": "Marroquinería, bolsos, valijas", "43": "Peletería", "44": "Madera y sus manufacturas",
  "45": "Corcho", "46": "Cestería", "47": "Pasta de papel", "48": "Papel y cartón", "49": "Libros e impresos",
  "50": "Seda", "51": "Lana", "52": "Algodón", "53": "Otras fibras vegetales", "54": "Filamentos sintéticos",
  "55": "Fibras sintéticas", "56": "Guata, fieltro, cordeles", "57": "Alfombras", "58": "Tejidos especiales, puntillas",
  "59": "Telas técnicas", "60": "Tejidos de punto", "61": "Ropa de punto", "62": "Ropa (excepto de punto)",
  "63": "Textiles para el hogar", "64": "Calzado", "65": "Sombreros y gorras", "66": "Paraguas y bastones",
  "67": "Flores artificiales, pelucas", "68": "Manufacturas de piedra, yeso, abrasivos", "69": "Cerámica", "70": "Vidrio y sus manufacturas",
  "71": "Joyería, bijouterie, metales preciosos", "72": "Hierro y acero", "73": "Manufacturas de hierro y acero", "74": "Cobre",
  "75": "Níquel", "76": "Aluminio", "77": "(reservado)", "78": "Plomo", "79": "Cinc", "80": "Estaño",
  "81": "Otros metales comunes", "82": "Herramientas, cuchillería", "83": "Cerraduras, herrajes, manufacturas metálicas", "84": "Máquinas y aparatos mecánicos",
  "85": "Máquinas y aparatos eléctricos y electrónicos", "86": "Ferrocarriles", "87": "Vehículos y sus partes", "88": "Aeronaves",
  "89": "Barcos", "90": "Óptica, medicina, instrumentos", "91": "Relojería", "92": "Instrumentos musicales",
  "93": "Armas", "94": "Muebles, colchones, iluminación", "95": "Juguetes, juegos, deportes", "96": "Manufacturas diversas (cepillos, lapiceras, etc.)",
  "97": "Arte y antigüedades", "00": "Sin posición (código especial)",
};

export type Partida = { prefijo: string; descripcion: string | null; items: number; excluir: boolean; propuesta: boolean; motivo: string | null };
export type Capitulo = Partida & { nombre: string; partidas: Partida[] };

export async function estadoDepuracion(): Promise<{ capitulos: Capitulo[]; total: number; aplicado: Date | null }> {
  const [pesos, dep, desc] = await Promise.all([
    pool.query<{ partida: string; items: string }>("select partida, items from arca_peso_partida").then((r) => r.rows),
    pool.query<{ prefijo: string; excluir: boolean; propuesta: boolean; motivo: string | null; aplicado_ts: Date | null }>(
      "select prefijo, excluir, propuesta, motivo, aplicado_ts from arca_depuracion").then((r) => r.rows),
    pool.query<{ p: string; descripcion: string }>(
      "select replace(codigo, '.', '') p, descripcion from ref_ncm_vigente where tipo = 'partida'").then((r) => r.rows),
  ]);
  const d = new Map(dep.map((x) => [x.prefijo, x]));
  const nombres = new Map(desc.map((x) => [x.p, x.descripcion]));
  const peso = new Map(pesos.map((x) => [x.partida.replace(/\D/g, ""), Number(x.items)]));
  const total = [...peso.values()].reduce((a, b) => a + b, 0);
  const codigos = new Set([...peso.keys(), ...nombres.keys(), ...dep.filter((x) => x.prefijo.length === 4).map((x) => x.prefijo)]);
  const caps = new Map<string, Capitulo>();
  for (const c of Object.keys(CAPITULOS)) {
    const e = d.get(c);
    caps.set(c, { prefijo: c, nombre: CAPITULOS[c], descripcion: null, items: 0, excluir: e?.excluir ?? false,
      propuesta: e?.propuesta ?? false, motivo: e?.motivo ?? null, partidas: [] });
  }
  for (const p of [...codigos].sort()) {
    const cap = caps.get(p.slice(0, 2));
    if (!cap) continue;
    const e = d.get(p);
    const items = peso.get(p) ?? 0;
    cap.items += items;
    cap.partidas.push({ prefijo: p, descripcion: nombres.get(p) ?? null, items, excluir: e?.excluir ?? false,
      propuesta: e?.propuesta ?? false, motivo: e?.motivo ?? null });
  }
  const aplicado = dep.reduce<Date | null>((m, x) => (x.aplicado_ts && (!m || x.aplicado_ts > m) ? x.aplicado_ts : m), null);
  return { capitulos: [...caps.values()], total, aplicado };
}

/** Cuántos ítems se sacan con lo marcado (capítulo entero o partidas sueltas). */
export function itemsASacar(caps: Capitulo[]): number {
  return caps.reduce((t, c) => t + (c.excluir ? c.items : c.partidas.filter((p) => p.excluir).reduce((s, p) => s + p.items, 0)), 0);
}
