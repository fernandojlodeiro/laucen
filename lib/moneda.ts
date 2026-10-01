// Bimoneda (orden 136, §3). Helper único para convertir y mostrar importes.
//
// - Todo importe de precio o costo se guarda en tres columnas: importe_ars,
//   importe_usd y moneda_origen. Al cargar en una moneda, la otra se calcula
//   con el tipo de cambio del día (`importeDoble`) y queda congelada.
// - La conversión usa el tipo de cambio OFICIAL VENTA del día (tabla
//   tipo_cambio; lo levanta el cron de /api/tipo-cambio/cron).
// - La pantalla muestra en la moneda que eligió cada usuario
//   (`monedaVista`), con el interruptor de la barra de estado.

import { consulta, una, ErrorErp, type Consultor } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";

export type Moneda = "ARS" | "USD";
export const esMoneda = (x: unknown): x is Moneda => x === "ARS" || x === "USD";

/** "2026-10-01" del día de hoy en Argentina. */
export function hoyAR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

/** Tipo de cambio (venta) que rige un día; null si no hay ninguno cargado. */
export async function tcDelDia(org: string, fecha?: string): Promise<{ venta: number; fecha: string; origen: string } | null> {
  const r = await una<{ venta: string; fecha: string; origen: string }>(`
    select venta, to_char(fecha, 'YYYY-MM-DD') fecha, origen from tipo_cambio
     where (organizacion_id = $1 or organizacion_id is null) and tipo = 'oficial' and fecha <= $2::date
     order by fecha desc, (organizacion_id is null) limit 1`, [org, fecha ?? hoyAR()]);
  return r ? { venta: Number(r.venta), fecha: r.fecha, origen: r.origen } : null;
}

/** Convierte un importe entre pesos y dólares con el tipo de cambio del día
 *  (o de `fecha`). Tira ErrorErp si no hay tipo de cambio cargado. */
export async function convertir(org: string, importe: number, de: Moneda, a: Moneda, fecha?: string, c?: Consultor): Promise<number> {
  if (de === a) return importe;
  const sql = "select convertir($1, $2::numeric, $3, $4, $5::date) v";
  const valores = [org, importe, de, a, fecha ?? hoyAR()];
  try {
    const r = c ? (await c.query<{ v: string }>(sql, valores)).rows[0] : await una<{ v: string }>(sql, valores);
    return Number(r!.v);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "P0001") throw new ErrorErp(`${err.message!.charAt(0).toUpperCase()}${err.message!.slice(1)}. Cargalo en Configuración → Tipo de cambio.`, "sin_tipo_de_cambio");
    throw e;
  }
}

/** Las tres columnas de un importe cargado en una moneda. */
export async function importeDoble(org: string, importe: number, moneda: Moneda, fecha?: string, c?: Consultor) {
  const otro = await convertir(org, importe, moneda, moneda === "ARS" ? "USD" : "ARS", fecha, c);
  return moneda === "ARS"
    ? { importe_ars: importe, importe_usd: otro, moneda_origen: moneda }
    : { importe_ars: otro, importe_usd: importe, moneda_origen: moneda };
}

/** "$ 1.234.567" o "US$ 1.234,50": punto de miles según lib/numeros.ts. */
export function formatear(importe: number | string | null | undefined, moneda: Moneda): string {
  if (importe == null || importe === "") return "—";
  const n = Number(importe);
  if (!Number.isFinite(n)) return "—";
  return `${moneda === "USD" ? "US$" : "$"} ${formatearNumero(n, moneda === "USD" ? "usd" : "pesos")}`;
}

/** Muestra un importe guardado en las dos monedas, en la que eligió el usuario. */
export function enVista(fila: { ars: number | string | null; usd: number | string | null }, vista: Moneda): string {
  return formatear(vista === "USD" ? fila.usd : fila.ars, vista);
}

/** La moneda en que este usuario quiere ver las pantallas (por defecto pesos). */
export async function monedaVista(usuarioId: string, org: string): Promise<Moneda> {
  const r = await una<{ moneda_vista: Moneda }>(
    "select moneda_vista from usuario_preferencia where usuario_id = $1 and organizacion_id = $2", [usuarioId, org]);
  return r?.moneda_vista ?? "ARS";
}

export async function fijarMonedaVista(usuarioId: string, org: string, moneda: Moneda): Promise<void> {
  await consulta(`
    insert into usuario_preferencia (usuario_id, organizacion_id, moneda_vista) values ($1, $2, $3)
    on conflict (usuario_id, organizacion_id) do update set moneda_vista = excluded.moneda_vista, actualizado_ts = now()`,
    [usuarioId, org, moneda]);
}
