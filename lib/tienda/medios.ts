// Los medios de pago que ofrece la tienda, con su descuento (o recargo) del
// momento. Con el esquema de cuotas y descuentos prendido (lib/tienda/financiacion.ts),
// el descuento de transferencia y efectivo lo pone el esquema, y si incluye el
// débito aparece aparte "Tarjeta de débito" (payway_debito: Payway en un pago
// con tarjeta de débito, con el descuento); Payway queda como "Tarjeta de crédito".

import { cache } from "react";
import { consulta } from "@/lib/erp/base";
import { descuentoContado, financiacionTienda, textoContado, type MedioContado } from "@/lib/tienda/financiacion";
import type { Tienda } from "@/lib/tienda/tienda";

export type Medio = { id: number; tipo: string; nombre: string; descuento_pct: number; instrucciones: string | null };

/** El tipo de medio_pago que hay detrás (payway_debito es Payway). */
export const tipoBase = (tipo: string) => (tipo === "payway_debito" ? "payway" : tipo);

export const mediosActivos = cache(async (t: Tienda): Promise<Medio[]> => {
  const filas = await consulta<Medio>(`select distinct on (tipo) id::int, tipo, nombre, descuento_pct::float, instrucciones from medio_pago
                                        where organizacion_id = $1 and (canal_id is null or canal_id = $2) and activo order by tipo, canal_id nulls last`,
    [t.organizacionId, t.canalId]);
  const f = financiacionTienda(t);
  if (!f.activo) return filas;
  const r: Medio[] = [];
  for (const m of filas) {
    const d = descuentoContado(f, m.tipo);
    if (m.tipo === "payway" && f.medios_descuento.includes("debito")) {
      r.push({ ...m, nombre: "Tarjeta de crédito", descuento_pct: 0 });
      r.push({ ...m, tipo: "payway_debito", nombre: "Tarjeta de débito", descuento_pct: f.descuento_pct });
    } else r.push(d == null ? m : { ...m, descuento_pct: d });
  }
  return r;
});

/** El precio de contado que se muestra debajo del precio ("$ 90.000 con transferencia"): el
 *  descuento del esquema y los medios activos que lo tienen; null si no hay. */
export const contadoDe = cache(async (t: Tienda): Promise<{ pct: number; texto: string } | null> => {
  const f = financiacionTienda(t);
  if (!f.activo || f.descuento_pct <= 0) return null;
  const tipos = new Set((await mediosActivos(t)).filter((m) => m.descuento_pct === f.descuento_pct).map((m) => m.tipo));
  const claves = (["transferencia", "efectivo", "debito"] as MedioContado[])
    .filter((c) => tipos.has(c === "debito" ? "payway_debito" : c));
  return claves.length ? { pct: f.descuento_pct, texto: textoContado(claves) } : null;
});
