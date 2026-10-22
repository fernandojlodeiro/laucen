// Los textos de cada canal de Mercado Libre (pedido de Fer, 10/10), en
// canal.config (Configuración › Canales, recuadro «Textos del canal»):
// - firma: la pone Laucen (no la IA) al final de cada respuesta a preguntas y
//   mensajes, la proponga la IA o la escriba una persona. Escrita por el usuario, tal cual.
// - reglas de la IA: NO son del canal (pedido de Fer, 13/10): son una sola para toda
//   la empresa (config_org 'reglas_ia', Configuración › Respuestas de la IA) y valen
//   para preguntas, mensajes y WhatsApp. Acá se leen para sumarlas a las instrucciones.
// - desc_encabezado / desc_pie: van arriba y abajo de la descripción técnica
//   del producto al publicarlo en ese canal (lib/mercadolibre/publicar-nueva.ts).

import { consulta, una } from "@/lib/erp/base";

/** `cuenta`: el nombre del canal, para que la IA sepa en qué cuenta entró la pregunta o el mensaje
 *  (Fer, 22/10: hay reglas que valen para una sola cuenta, ej. el retiro en ML PUNTO). */
export type TextosCanal = { firma: string; reglasIa: string; encabezado: string; pie: string; cuenta?: string };

export const TEXTOS_VACIOS: TextosCanal = { firma: "", reglasIa: "", encabezado: "", pie: "" };

export async function textosCanal(org: string, canal: number | string | null | undefined): Promise<TextosCanal> {
  if (!canal) return { ...TEXTOS_VACIOS, reglasIa: await reglasIaEmpresa(org) };
  const r = await una<{ firma: string | null; reglas: string | null; enc: string | null; pie: string | null; nombre: string | null }>(`
    select config ->> 'firma' firma, (${SQL_REGLAS}) reglas, config ->> 'desc_encabezado' enc, config ->> 'desc_pie' pie, nombre
      from canal where id = $2 and organizacion_id = $1`, [org, canal]).catch(() => null);
  return r ? { firma: r.firma ?? "", reglasIa: r.reglas ?? "", encabezado: r.enc ?? "", pie: r.pie ?? "", cuenta: r.nombre ?? "" } : TEXTOS_VACIOS;
}

/** Los textos propios del canal (las reglas de la IA son de la empresa y no se tocan acá). */
export async function guardarTextosCanal(org: string, canal: number, t: Omit<TextosCanal, "reglasIa">): Promise<void> {
  await consulta(`
    update canal set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('firma', $3::text, 'desc_encabezado', $4::text, 'desc_pie', $5::text)
     where id = $2 and organizacion_id = $1`, [org, canal, t.firma.trim(), t.encabezado.trim(), t.pie.trim()]);
}

// ── Las reglas de la IA de la empresa (una sola para preguntas, mensajes y WhatsApp) ──
const SQL_REGLAS = `select valor ->> 'texto' from config_org where organizacion_id = $1 and clave = 'reglas_ia'`;

export async function reglasIaEmpresa(org: string): Promise<string> {
  const r = await una<{ texto: string | null }>(`select (${SQL_REGLAS}) texto`, [org]).catch(() => null);
  return r?.texto ?? "";
}

export async function guardarReglasIa(org: string, texto: string): Promise<void> {
  await consulta(`
    insert into config_org (organizacion_id, clave, valor) values ($1, 'reglas_ia', jsonb_build_object('texto', $2::text))
    on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`, [org, texto.trim()]);
}

/** Lo que se suma a las instrucciones de la IA de preguntas y mensajes. Con firma, la IA no se despide
 *  (la despedida es la firma). Pura: se prueba sin base. */
export function instruccionesExtra(t: TextosCanal): string {
  const partes: string[] = [];
  if (t.cuenta) partes.push(`Esta conversación entró por la cuenta «${t.cuenta}» de la tienda.`);
  if (t.firma) partes.push("No termines con saludo ni firma: al final de tu texto se agrega sola la firma de la tienda.");
  if (t.reglasIa) partes.push(`Reglas de esta tienda, que valen por encima de lo anterior:\n${t.reglasIa}`);
  return partes.length ? `\n\n${partes.join("\n\n")}` : "";
}

/** El texto de la IA con la firma al final, dentro del tope de caracteres (la firma nunca se corta). Pura. */
export function conFirma(texto: string, firma: string, tope: number): string {
  const f = firma.trim();
  if (!f) return texto.slice(0, tope);
  const cuerpo = texto.trim().slice(0, Math.max(0, tope - f.length - 1)).trim();
  return cuerpo ? `${cuerpo}\n${f}` : f.slice(0, tope);
}

/** La firma al final de lo que se manda (lo escriba una persona o la IA), salvo que ya termine con ella. Pura. */
export function agregarFirma(texto: string, firma: string): string {
  const t = texto.trim(), f = firma.trim();
  if (!f || t.replace(/\s+/g, " ").endsWith(f.replace(/\s+/g, " "))) return t;
  return `${t}\n${f}`;
}

/** La descripción con el encabezado y el pie del canal (los vacíos no dejan renglones de más). Pura. */
export function descripcionDelCanal(tecnica: string, t: Pick<TextosCanal, "encabezado" | "pie">): string {
  return [t.encabezado.trim(), tecnica.trim(), t.pie.trim()].filter(Boolean).join("\n\n");
}

/** Al copiar una publicación de una cuenta a otra: saca el encabezado y el pie de la cuenta de origen
 *  (tal cual están cargados en «Textos de …») y pone los de la cuenta de destino. Si la de origen no
 *  tiene cargados o la descripción no empieza o termina con ellos, no se puede saber dónde empieza la
 *  parte técnica: va tal cual (`separada: false`). Pura. */
export function descripcionCopiada(desc: string, origen: Pick<TextosCanal, "encabezado" | "pie">, destino: Pick<TextosCanal, "encabezado" | "pie">): { texto: string; tecnica: string; separada: boolean } {
  const norm = (t: string) => t.replace(/\r\n?/g, "\n").trim();
  let t = norm(desc);
  const enc = norm(origen.encabezado), pie = norm(origen.pie);
  if (!enc && !pie) return { texto: t, tecnica: t, separada: false };
  if (enc) {
    if (!t.startsWith(enc)) return { texto: t, tecnica: t, separada: false };
    t = t.slice(enc.length).trim();
  }
  if (pie) {
    if (!t.endsWith(pie)) return { texto: norm(desc), tecnica: norm(desc), separada: false };
    t = t.slice(0, t.length - pie.length).trim();
  }
  return { texto: descripcionDelCanal(t, destino), tecnica: t, separada: true };
}
