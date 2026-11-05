// Ganancia estimada de un producto que ya tenemos, al precio de mercado (lib/marketpro/analisis.ts): precio sin IVA
// menos la comisión Clásica de su categoría (sin IVA: la comisión trae IVA, como en precio_vs_ml) menos el costo
// promedio sin IVA. Sin envío, cargos fijos ni impuestos. Si no conocemos la comisión de la categoría se supone 14,5 %.

export const COMISION_SUPUESTA = 14.5;

export function gananciaEstimada(precio: number | null, costo: number | null, comision: number | null) {
  if (!precio || !costo || costo <= 0) return null;
  const com = comision ?? COMISION_SUPUESTA;
  const neto = precio / 1.21;
  const ganancia = (precio * (100 - com)) / 121 - costo;
  return { ganancia, sobreVenta: ganancia / neto, sobreCosto: ganancia / costo, comisionSupuesta: comision == null };
}
