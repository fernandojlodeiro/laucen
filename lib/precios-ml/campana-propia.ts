// La campaña propia de cada cuenta de Mercado Libre (Fer, 8/10): «Promociones
// Daitom», una campaña del vendedor (SELLER_CAMPAIGN, porcentaje flexible: el
// precio lo pone Laucen en cada publicación). Sirve para que una publicación
// con descuento (al tachado) muestre su precio con descuento cuando Mercado
// Libre no le ofrece ninguna campaña suya; en cuanto ML le ofrece una que
// acepta el precio, el motor la pasa a la de ML (motor.ts, `campanaPropia`).
//
// Se crea con el botón de Precios en ML (clic de Fer) y, en las cuentas con
// «Sincronizar precios» prendido, se renueva sola unos días antes de vencer.
// Queda en canal.config.campana_propia = { id, nombre, desde, hasta }.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";

export const NOMBRE_CAMPANA_PROPIA = "Promociones Daitom";
/** Cuánto dura cada campaña y con cuántos días de anticipación se arma la siguiente. */
const DURACION_DIAS = 30;
const RENOVAR_ANTES_DIAS = 3;

export type CampanaPropia = { id: string; nombre: string; desde: string; hasta: string };

const dia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

/** La campaña propia vigente de un canal (o null si no hay o ya venció). */
export async function campanaPropiaDe(org: string, canal: number): Promise<CampanaPropia | null> {
  const c = await una<{ x: CampanaPropia | null }>("select config -> 'campana_propia' x from canal where id = $1 and organizacion_id = $2", [canal, org]);
  const x = c?.x;
  if (!x?.id || !x.hasta) return null;
  return new Date(`${x.hasta}T23:59:59-03:00`).getTime() > Date.now() ? x : null;
}

/** ¿Hay que armar la próxima? (no hay, o vence en pocos días) */
export function hayQueRenovar(x: CampanaPropia | null, ahora = new Date()): boolean {
  if (!x) return true;
  return new Date(`${x.hasta}T23:59:59-03:00`).getTime() - ahora.getTime() < RENOVAR_ANTES_DIAS * 86_400_000;
}

/** Crea en Mercado Libre la campaña propia de la cuenta (desde hoy, DURACION_DIAS días) y la deja como vigente.
 *  Si la vigente todavía no está por vencer, no hace nada. Modifica Mercado Libre: sólo por el clic de Fer o con
 *  «Sincronizar precios» prendido. */
export async function asegurarCampanaPropia(org: string, canal: number, forzar = false): Promise<{ campana: CampanaPropia; nueva: boolean }> {
  const vigente = await campanaPropiaDe(org, canal);
  if (vigente && !forzar && !hayQueRenovar(vigente)) return { campana: vigente, nueva: false };
  const cuenta = await cuentaDelCanal(org, canal);
  if (!cuenta || cuenta.estado !== "activa") throw new ErrorErp("La cuenta de Mercado Libre no está conectada.");
  const desde = new Date();
  // Si la vigente vence pronto, la nueva arranca el día que termina (se superponen un día: nada queda sin campaña).
  if (vigente) desde.setTime(Math.max(desde.getTime(), new Date(`${vigente.hasta}T12:00:00-03:00`).getTime()));
  const hasta = new Date(desde.getTime() + DURACION_DIAS * 86_400_000);
  const r = await ml<{ id?: string; message?: string; error?: string }>(cuenta, "POST", "/seller-promotions/promotions?app_version=v2", {
    promotion_type: "SELLER_CAMPAIGN", sub_type: "FLEXIBLE_PERCENTAGE", name: NOMBRE_CAMPANA_PROPIA,
    start_date: `${dia(desde)}T00:00:00`, finish_date: `${dia(hasta)}T00:00:00`,
  });
  if (r.status >= 300 || !r.datos?.id) throw new ErrorErp(`Mercado Libre no creó la campaña propia: ${r.datos?.message ?? r.datos?.error ?? `error ${r.status}`}.`);
  const campana: CampanaPropia = { id: String(r.datos.id), nombre: NOMBRE_CAMPANA_PROPIA, desde: dia(desde), hasta: dia(hasta) };
  await consulta("update canal set config = config || jsonb_build_object('campana_propia', $3::jsonb) where id = $2 and organizacion_id = $1",
    [org, canal, JSON.stringify(campana)]);
  return { campana, nueva: true };
}
