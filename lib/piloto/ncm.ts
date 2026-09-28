// La NCM por TIPO DE MERCADERÍA, clasificada una sola vez en la vida (Fer,
// 28/9). La clave es un nombre genérico ("colchón inflable de PVC"): otra
// publicación u otro día, el mismo tipo sale del registro sin volver a
// clasificar. Se clasifica con el modelo grande y todo el contexto (la
// publicación de Mercado Libre, la de China por dentro con su material, y las
// aperturas del nomenclador con su arancel). Si Fer la corrige con el lápiz,
// vale la de Fer para ese tipo.

import { pool } from "@/db";
import { MODELOS, jsonDe, pedirClaude } from "@/lib/claude";
import { normalizarNcm } from "./costo";

export type Clasificacion = {
  clave: string; ncm: string; sim: string | null; arancel: number | null; alternativa: string | null;
  material: string | null; motivo: string | null; fuente: "claude" | "fer"; actualizado: string; nueva: boolean;
};

export async function registrada(clave: string): Promise<Clasificacion | null> {
  const r = await pool.query("select * from ncm_clasificaciones where clave = $1", [clave]);
  const f = r.rows[0];
  return f ? { clave, ncm: f.ncm, sim: f.sim, arancel: f.arancel == null ? null : Number(f.arancel), alternativa: f.alternativa,
    material: f.material, motivo: f.motivo, fuente: f.fuente, actualizado: String(f.actualizado), nueva: false } : null;
}

type Apertura = { codigo: string; descripcion: string; arancel: number | null };
async function aperturas(ncm: string): Promise<Apertura[]> {
  const r = await pool.query<{ codigo: string; descripcion: string; alic_3: string | null }>(
    "select codigo, coalesce(descripcion, '') descripcion, alic_3 from ref_ncm_vigente where codigo like $1 || '%' order by codigo", [ncm]);
  return r.rows.map((x) => ({ codigo: x.codigo, descripcion: x.descripcion, arancel: x.alic_3 == null ? null : Number(x.alic_3) }));
}

const REGLAS =
  "Sos despachante de aduana argentino. Clasificás mercadería en la Nomenclatura Común del Mercosur (NCM) según las Reglas Generales " +
  "de Interpretación y las notas legales de sección y capítulo. El MATERIAL y la FUNCIÓN deciden: leé en la publicación de China de qué está " +
  "hecho (PVC, TPU, nylon, poliéster, caucho, etc.). Ejemplos de notas que se olvidan: los colchones neumáticos o inflables no van en 94.04 " +
  "(van en 39.26 si son de plástico, 40.16 si son de caucho, 63.06 si son de materia textil); un tejido recubierto de plástico se clasifica " +
  "según la nota del capítulo 59/39.";

type Contexto = { mlTitulo: string; mlTexto?: string | null; componentes?: string | null; chinaTitulo: string; chinaFicha?: string | null; sugerida?: string | null };

const datosDe = (c: Contexto) =>
  `Producto que se vende en Mercado Libre: ${c.mlTitulo}\n` +
  (c.componentes ? `Qué incluye: ${c.componentes}\n` : "") +
  (c.mlTexto ? `Datos de Mercado Libre: ${c.mlTexto.slice(0, 1500)}\n` : "") +
  `Producto de China que se importaría: ${c.chinaTitulo}\n` +
  (c.chinaFicha ? `Publicación de China por dentro (datos crudos): ${c.chinaFicha.slice(0, 4000)}\n` : "");

const normalizarClave = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Devuelve la clasificación del tipo de mercadería: la registrada si ya hay
 *  una de ese tipo; si no, la hace y la registra. Nunca tira: null si no pudo. */
export async function clasificar(contexto: Contexto): Promise<Clasificacion & { usd: number; tokensIn: number; tokensOut: number } | null> {
  const datos = datosDe(contexto);
  const tipos = (await pool.query<{ clave: string; ncm: string }>("select clave, ncm from ncm_clasificaciones order by clave")).rows;

  // 1) Qué tipo de mercadería es; si ya está registrado, ése. Si no, su NCM de 8 dígitos.
  const r1 = await pedirClaude({
    modelo: "grande", effort: "high", maxTokens: 3000,
    system: `${REGLAS}\nPrimero nombrá el TIPO DE MERCADERÍA en pocas palabras, genérico y sin marca ni medida: el tipo de producto, su ` +
      "material principal y, si cambia la posición, su función (ej: \"colchón inflable de PVC\", \"colchoneta inflable de nylon con TPU\"). " +
      "Te paso los tipos ya registrados: si el producto es de un tipo registrado (misma mercadería a efectos aduaneros), devolvé ese nombre " +
      "EXACTO en \"registrado\" y nada más. Si no, clasificalo.\n" +
      'Respondé sólo JSON: {"registrado":"nombre exacto de la lista"} o {"tipo":"...","ncm":"0000.00.00","alternativa":"0000.00.00 o null",' +
      '"material":"...","motivo":"por qué, en una o dos frases"}. Poné alternativa sólo si de verdad dudás entre dos posiciones.',
    contenido: datos + `\nTipos registrados:\n${tipos.length ? tipos.map((t) => `- ${t.clave} (${t.ncm})`).join("\n") : "(ninguno todavía)"}` +
      (contexto.sugerida ? `\n(Una primera lectura sugirió la NCM ${contexto.sugerida}; verificala.)` : ""),
  });
  let usd = r1.usd, tokensIn = r1.tokensIn, tokensOut = r1.tokensOut;
  const j1 = "texto" in r1 ? jsonDe<{ registrado?: string; tipo?: string; ncm?: string; alternativa?: string | null; material?: string; motivo?: string }>(r1.texto) : null;
  if (j1?.registrado) {
    const ya = await registrada(normalizarClave(j1.registrado));
    if (ya) return { ...ya, usd, tokensIn, tokensOut };
  }
  const ncm = normalizarNcm(j1?.ncm);
  const clave = j1?.tipo ? normalizarClave(j1.tipo) : null;
  if (!ncm || !clave) return null;
  const ya = await registrada(clave);
  if (ya) return { ...ya, usd, tokensIn, tokensOut };

  // 2) La apertura SIM, que es la que fija el arancel exacto.
  const abiertas = (await aperturas(ncm)).filter((a) => a.arancel != null);
  let sim: Apertura | null = abiertas.length === 1 ? abiertas[0] : null;
  if (abiertas.length > 1) {
    const aranceles = new Set(abiertas.map((a) => a.arancel));
    const todas = await aperturas(ncm); // con los títulos intermedios, para que se entienda el árbol
    const r2 = await pedirClaude({
      modelo: "grande", effort: "high", maxTokens: 1500,
      system: `${REGLAS} Te doy las aperturas SIM de la posición ${ncm} con su arancel. Elegí la que corresponde al producto. ` +
        'Respondé sólo JSON: {"sim":"código exacto de la lista","motivo":"..."}.',
      contenido: `${datos}\nAperturas de ${ncm}:\n${todas.map((a) => `${a.codigo} — ${a.descripcion}${a.arancel != null ? ` (arancel ${a.arancel}%)` : ""}`).join("\n")}`,
    });
    usd += r2.usd; tokensIn += r2.tokensIn; tokensOut += r2.tokensOut;
    const j2 = "texto" in r2 ? jsonDe<{ sim?: string }>(r2.texto) : null;
    sim = abiertas.find((a) => a.codigo === j2?.sim?.trim()) ?? (aranceles.size === 1 ? abiertas[0] : null);
  }
  const c: Clasificacion = {
    clave, ncm, sim: sim?.codigo ?? null, arancel: sim?.arancel ?? null, alternativa: normalizarNcm(j1?.alternativa ?? null),
    material: j1?.material ?? null, motivo: j1?.motivo ?? null, fuente: "claude", actualizado: new Date().toISOString(), nueva: true,
  };
  await pool.query(
    `insert into ncm_clasificaciones (clave, titulo, ncm, sim, arancel, alternativa, material, motivo, fuente, modelo)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'claude', $9) on conflict (clave) do nothing`,
    [clave, contexto.chinaTitulo, c.ncm, c.sim, c.arancel, c.alternativa, c.material, c.motivo, MODELOS.grande.id]);
  return { ...c, usd, tokensIn, tokensOut };
}

/** La corrección de Fer (lápiz): vale para todo ese tipo de mercadería, hasta que la vuelva a cambiar. */
export async function corregir(clave: string, ncmTexto: string, titulo: string | null) {
  const ncm = normalizarNcm(ncmTexto);
  if (!ncm) return null;
  // Si escribió la apertura completa, se toma su arancel; si no, el de la única apertura o el más alto.
  const pedida = ncmTexto.replace(/\s/g, "").toUpperCase();
  const abiertas = (await aperturas(ncm)).filter((a) => a.arancel != null);
  const sim = abiertas.find((a) => a.codigo.toUpperCase() === pedida) ?? (abiertas.length === 1 ? abiertas[0] : null);
  const arancel = sim?.arancel ?? (abiertas.length ? Math.max(...abiertas.map((a) => a.arancel!)) : null);
  await pool.query(
    `insert into ncm_clasificaciones (clave, titulo, ncm, sim, arancel, fuente, motivo) values ($1, $2, $3, $4, $5, 'fer', 'corregida por Fer')
     on conflict (clave) do update set ncm = excluded.ncm, sim = excluded.sim, arancel = excluded.arancel, alternativa = null,
       fuente = 'fer', motivo = 'corregida por Fer', actualizado = now()`,
    [clave, titulo, ncm, sim?.codigo ?? null, arancel]);
  return registrada(clave);
}
