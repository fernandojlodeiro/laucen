// Resumen del checkout: cotiza el carrito con el envío y el medio elegidos
// (lib/tienda/cotizar.ts, la misma cuenta que usa comprar) y además el costo
// de cada método de envío, para mostrarlo al lado de cada opción.

import { consulta } from "@/lib/erp/base";
import { cotizar } from "@/lib/tienda/cotizar";
import type { LineaCarrito } from "@/lib/tienda/cotizar";
import type { Tienda } from "@/lib/tienda/tienda";

export type MetodoEnvio = { id: number; tipo: string; nombre: string; plazo: string | null; instrucciones: string | null; disponible: boolean };

/** Métodos de envío activos del canal (o generales). OCA y Andreani todavía no cotizan: van deshabilitados. */
export async function metodosEnvio(t: Tienda): Promise<MetodoEnvio[]> {
  const filas = await consulta<Omit<MetodoEnvio, "disponible">>(`
    select id::int, tipo, nombre, plazo, instrucciones from metodo_envio
     where organizacion_id = $1 and activo and (canal_id is null or canal_id = $2) order by orden, id`, [t.organizacionId, t.canalId]);
  return filas.map((m) => ({ ...m, disponible: m.tipo !== "oca" && m.tipo !== "andreani" }));
}

export type Eleccion = { metodoEnvioId: number | null; medio: string | null; provincia: string | null };

export type Resumen = {
  /** subtotal de cada línea a precio de venta (los descuentos van aparte, en `descuentos`). */
  lineas: { variacionId: number; titulo: string; foto: string | null; cantidad: number; subtotal: number }[];
  subtotal: number;
  descuentos: { nombre: string; importe: number }[];
  envio: { nombre: string | null; costo: number; bonificado: boolean; aConvenir: boolean } | null;
  total: number;
  sinStock: string[];
  /** Costo de cada método de envío (null si no se pudo calcular). */
  costos: Record<number, { costo: number; bonificado: boolean; aConvenir: boolean } | null>;
  moneda: "ARS" | "USD";
};

export async function resumir(t: Tienda, carrito: LineaCarrito[], e: Eleccion, metodos?: MetodoEnvio[]): Promise<Resumen> {
  const lista = metodos ?? await metodosEnvio(t);
  const elegido = lista.find((m) => m.id === e.metodoEnvioId && m.disponible);
  const cot = await cotizar(t, carrito, { medio: e.medio, metodoEnvioId: elegido?.id ?? null, provincia: e.provincia });
  const costos: Resumen["costos"] = {};
  await Promise.all(lista.filter((m) => m.disponible).map(async (m) => {
    if (m.id === elegido?.id && cot.envio) { costos[m.id] = { costo: cot.envio.costo, bonificado: cot.envio.bonificado, aConvenir: cot.envio.aConvenir }; return; }
    try {
      const c = await cotizar(t, carrito, { medio: e.medio, metodoEnvioId: m.id, provincia: e.provincia });
      costos[m.id] = c.envio ? { costo: c.envio.costo, bonificado: c.envio.bonificado, aConvenir: c.envio.aConvenir } : null;
    } catch {
      costos[m.id] = null;
    }
  }));
  return {
    lineas: cot.lineas.map((l) => ({ variacionId: l.variacionId, titulo: l.titulo, foto: l.foto, cantidad: l.cantidad, subtotal: Math.round(l.ventaUnit * l.cantidad * 100) / 100 })),
    subtotal: cot.subtotal, descuentos: cot.descuentos,
    envio: cot.envio ? { nombre: cot.envio.nombre, costo: cot.envio.costo, bonificado: cot.envio.bonificado, aConvenir: cot.envio.aConvenir } : null,
    total: cot.total, sinStock: cot.sinStock, costos, moneda: t.moneda,
  };
}
