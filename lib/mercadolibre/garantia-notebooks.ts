// Un año de garantía en las notebooks activas de Mercado Libre (pedido de Fer, 13/10). Se lee la
// cuenta entera en ML (sólo lectura) y se prepara UN lote por cuenta que pone WARRANTY_TYPE y
// WARRANTY_TIME = 12 meses en cada notebook activa que no la tenga ya. Sale recién con el clic de
// Fer en "Mandar a Mercado Libre" (lib/mercadolibre/cola.ts). Las no activas no se tocan.

import { ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { encolar, encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";
import { idsEnMl } from "@/lib/mercadolibre/fantasmas";
import { esNotebook } from "@/lib/mercadolibre/es-notebook";
import { consulta } from "@/lib/erp/base";

export const DESCRIPCION_LOTE_GARANTIA = "Poner 1 año de garantía a las notebooks activas";
const TIEMPO = "12 meses";
const TIPO_POR_DEFECTO = "Garantía del vendedor";

type Termino = { id: string; value_name?: string | null };
type ItemCorto = { id: string; title?: string; status?: string; category_id?: string; sale_terms?: Termino[] };

/** ¿Ya tiene un año (o más) de garantía? Puro: se prueba sin base ni red. */
export function tieneUnAnio(terminos: Termino[] | null | undefined): boolean {
  const t = (id: string) => (terminos ?? []).find((x) => x.id === id)?.value_name?.trim().toLowerCase() ?? "";
  if (/^sin garant/.test(t("WARRANTY_TYPE"))) return false;
  const m = t("WARRANTY_TIME").match(/^(\d+)\s*(mes|meses|año|años|dia|dias|día|días)/);
  if (!m) return false;
  const n = Number(m[1]);
  const meses = m[2].startsWith("a") ? n * 12 : m[2].startsWith("m") ? n : n / 30;
  return meses >= 12;
}

/** Lo que se manda a cada publicación: el tipo que ya tenía (si no era "Sin garantía") y 12 meses. */
export function cuerpoGarantia(terminos: Termino[] | null | undefined) {
  const tipo = (terminos ?? []).find((x) => x.id === "WARRANTY_TYPE")?.value_name?.trim();
  return { sale_terms: [
    { id: "WARRANTY_TYPE", value_name: tipo && !/^sin garant/i.test(tipo) ? tipo : TIPO_POR_DEFECTO },
    { id: "WARRANTY_TIME", value_name: TIEMPO },
  ] };
}

export type PreparacionGarantia = { cuenta: string; loteId: number | null; preparadas: number; yaTenian: number; activas: number; revisadas: number; quedan: number };

export async function prepararGarantiaNotebooks(org: string, canalId: number, usuarioId: string, hastaMs: number): Promise<PreparacionGarantia> {
  const cuenta: CuentaMl | null = await cuentaDelCanal(org, canalId);
  if (!cuenta || cuenta.estado !== "activa") throw new ErrorErp("Esa cuenta de Mercado Libre no está conectada.");
  const nombre = (await consulta<{ nombre: string }>("select nombre from canal where id = $1", [canalId]))[0]?.nombre ?? `canal ${canalId}`;
  const lectura = await idsEnMl(cuenta, hastaMs);
  if (!lectura.completo || !lectura.ids.size) throw new ErrorErp(`${nombre}: la lectura de Mercado Libre no terminó. Probá de nuevo.`);

  // Lo que Laucen ya sabe que NO es notebook no se vuelve a pedir; lo que ya tiene la garantía pedida en un lote, tampoco.
  const conocidas = new Map((await consulta<{ item_id: string; titulo: string | null; categoria: string | null }>(
    "select distinct on (item_id) item_id, titulo, categoria from meli_item where organizacion_id = $1 and canal_id = $2 order by item_id", [org, canalId]))
    .map((f) => [f.item_id, f]));
  const yaPedidas = new Set((await consulta<{ item_id: string }>(
    `select distinct item_id from ml_cola where canal_id = $1 and tipo = 'atributos' and estado in ('preparado', 'pendiente', 'enviando', 'ok')
        and payload::text like '%WARRANTY_TIME%12 meses%'`, [canalId])).map((f) => f.item_id));
  const aRevisar = [...lectura.ids].filter((i) => {
    if (yaPedidas.has(i)) return false;
    const c = conocidas.get(i);
    return !c || esNotebook(c.titulo, c.categoria);
  }).sort();

  const cambios: CambioMl[] = [];
  let activas = 0, yaTenian = 0, revisadas = 0, quedan = 0;
  for (let i = 0; i < aRevisar.length; i += 20) {
    if (Date.now() > hastaMs - 4_000) { quedan = aRevisar.length - i; break; }
    const r = await ml<{ code: number; body: ItemCorto }[]>(cuenta, "GET", `/items?ids=${aRevisar.slice(i, i + 20).join(",")}&attributes=id,title,status,category_id,sale_terms`);
    if (r.status !== 200 || !Array.isArray(r.datos)) throw new ErrorErp(`${nombre}: Mercado Libre no contestó. Probá de nuevo (lo ya preparado no se pierde).`);
    revisadas += Math.min(20, aRevisar.length - i);
    for (const { code, body: it } of r.datos) {
      if (code !== 200 || !it?.id || it.status !== "active" || !esNotebook(it.title, it.category_id)) continue;
      activas++;
      if (tieneUnAnio(it.sale_terms)) { yaTenian++; continue; }
      cambios.push({
        canalId, itemId: it.id, tipo: "atributos",
        antes: { titulo: it.title, garantia: (it.sale_terms ?? []).filter((t) => /^WARRANTY/.test(t.id)).map((t) => `${t.id}: ${t.value_name ?? ""}`) },
        payload: { cuerpo: cuerpoGarantia(it.sale_terms), descripcion: `1 año de garantía: ${it.title ?? it.id}` },
      });
    }
  }
  if (!cambios.length) return { cuenta: nombre, loteId: null, preparadas: 0, yaTenian, activas, revisadas, quedan };
  // Un solo lote preparado por cuenta: si ya hay uno de una vuelta anterior, se suma a ése.
  const previo = (await consulta<{ id: string }>(
    "select id from ml_lote where organizacion_id = $1 and canal_id = $2 and estado = 'preparado' and descripcion = $3 order by id desc limit 1",
    [org, canalId, DESCRIPCION_LOTE_GARANTIA]))[0];
  let loteId: number;
  if (previo) { loteId = Number(previo.id); await encolar(org, cambios, { origen: "boton", usuarioId, loteId }); }
  else loteId = await encolarLoteConBoton(org, canalId, cambios, DESCRIPCION_LOTE_GARANTIA, usuarioId);
  return { cuenta: nombre, loteId, preparadas: cambios.length, yaTenian, activas, revisadas, quedan };
}

export function textoGarantia(r: PreparacionGarantia): string {
  const n = (x: number) => x.toLocaleString("es-AR");
  const partes = [`${r.cuenta}: se revisaron ${n(r.revisadas)} publicaciones; ${n(r.activas)} notebooks activas.`];
  if (r.preparadas) partes.push(`${n(r.preparadas)} preparadas con 1 año de garantía: revisá el lote en Configuración › Canales › Cola de Mercado Libre y apretá «Mandar a Mercado Libre».`);
  else partes.push("No hay notebooks activas para cambiar.");
  if (r.yaTenian) partes.push(`${n(r.yaTenian)} ya tenían un año o más.`);
  if (r.quedan) partes.push(`No alcanzó el tiempo: quedan ${n(r.quedan)} por revisar, apretá de nuevo.`);
  return partes.join(" ");
}
