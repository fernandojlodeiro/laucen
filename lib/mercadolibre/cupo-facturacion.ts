// El cupo de la API de facturación de Mercado Libre (Fer, 4/11): ML deja unos 5 pedidos por minuto a esa API
// (/billing/integration/…) y rechaza el resto con 429. La usan la lectura de la facturación
// (lib/mercadolibre/facturacion.ts), los PDF de las facturas (facturas-pdf.ts) y los cargos de Full (lib/full/costos.ts).
// Todos piden turno acá: un pedido cada 13 segundos para todo Laucen, repartido en la base (ml_cupo_facturacion), así
// dos procesos que corren a la vez no se pisan.

import { una } from "@/lib/erp/base";

export const PASO_FACTURACION_S = 13;

/** Espera el turno del próximo pedido a la API de facturación. false si el turno cae después de `hastaMs` (no se
 *  espera ni se pide: se sigue en la próxima vuelta). */
export async function turnoFacturacion(hastaMs: number): Promise<boolean> {
  const r = await una<{ espera: number }>(`
    insert into ml_cupo_facturacion (id, libre_ts) values (1, now() + make_interval(secs => $1))
    on conflict (id) do update set libre_ts = greatest(ml_cupo_facturacion.libre_ts, now()) + make_interval(secs => $1)
    returning greatest(0, extract(epoch from (libre_ts - make_interval(secs => $1) - now())) * 1000)::float espera`, [PASO_FACTURACION_S]);
  const espera = r?.espera ?? 0;
  if (Date.now() + espera > hastaMs) {
    // No se usa: se devuelve para el que venga.
    await una("update ml_cupo_facturacion set libre_ts = libre_ts - make_interval(secs => $1) where id = 1 returning id", [PASO_FACTURACION_S]).catch(() => null);
    return false;
  }
  if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
  return true;
}
