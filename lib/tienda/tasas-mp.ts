// La tasa de referencia de Mercado Pago para los planes de cuotas que se cobran por ahí (esquema de
// cuotas, lib/tienda/financiacion.ts): se le pregunta a Mercado Pago con la cuenta conectada a la
// tienda (el medio de pago Mercado Pago del canal) y se guarda 6 horas. Si no contesta, vacío: la
// tienda dice "Hasta N cuotas con Mercado Pago" sin valor de cuota.

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { una } from "@/lib/erp/base";
import { tasasCuotas } from "@/lib/tienda/pagos/mercadopago";
import { financiacionTienda, hayPlanMp } from "@/lib/tienda/financiacion";
import type { Tienda } from "@/lib/tienda/tienda";

const leer = (org: string, canalId: number) => unstable_cache(async () => {
  const c = await una<{ datos: { access_token?: string } }>(`
    select cr.datos from medio_pago m join medio_pago_credencial cr on cr.medio_pago_id = m.id
     where m.organizacion_id = $1 and (m.canal_id is null or m.canal_id = $2) and m.tipo = 'mercadopago' and m.activo order by m.canal_id nulls last limit 1`, [org, canalId]);
  if (!c?.datos?.access_token) return [] as [number, number][];
  const m = await tasasCuotas(c.datos.access_token);
  // Sin respuesta, se tira: así no queda guardado el vacío 6 horas y se vuelve a preguntar.
  if (!m.size) throw new Error("Mercado Pago no devolvió tasas");
  return [...m.entries()];
}, ["tasas-mp", org, String(canalId)], { revalidate: 6 * 3600 })();

/** Las tasas (cuotas → %) si la tienda tiene algún plan por Mercado Pago; si no, null (no se consulta). */
export const tasasMpDe = cache(async (t: Tienda): Promise<Map<number, number> | null> => {
  if (!hayPlanMp(financiacionTienda(t))) return null;
  const filas = await leer(t.organizacionId, t.canalId).catch(() => []);
  return filas.length ? new Map(filas) : null;
});
