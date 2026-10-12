// Sugerencia de compra: las cuentas sin base (las prueban los tests; lo que lee la base está en lib/compras/sugerencia.ts).
//
// No hay historia del stock, así que se deduce de las ventas (Fer, 12/10): un producto «tuvo stock» en los tramos en que
// se vendió con regularidad. Se recorre el período con una ventana de N días que arranca en cada día con venta; la ventana
// vale si adentro no hay un hueco sin ventas más largo de lo normal para ESE producto (tolerancia = 3 veces su hueco
// típico, nunca menos de 7 días) y si siguió vendiendo hasta cerca del final. De las ventanas que valen:
//   · típico = la mediana de lo vendido;  · mejor momento = el máximo.
// Las compras grandes de una vez (un renglón con más de 3 veces la cantidad típica de ese producto, y 6 o más unidades)
// no cuentan: inflan el ritmo y no se repiten. Se informan aparte.

export const TOLERANCIA_MINIMA_DIAS = 7;
export const VECES_HUECO = 3;
export const VECES_COMPRA_GRANDE = 3;
export const COMPRA_GRANDE_MINIMA = 6;

export type Renglon = { dia: number; cantidad: number };

const mediana = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Separa las compras grandes. Devuelve los renglones que cuentan y cuántas grandes hubo (y la mayor). */
export function sinComprasGrandes(rs: Renglon[]): { quedan: Renglon[]; grandes: number; mayor: number } {
  const m = mediana(rs.map((r) => r.cantidad));
  const tope = Math.max(VECES_COMPRA_GRANDE * m, COMPRA_GRANDE_MINIMA - 1);
  const quedan: Renglon[] = [];
  let grandes = 0, mayor = 0;
  for (const r of rs) {
    if (r.cantidad > tope) { grandes++; mayor = Math.max(mayor, r.cantidad); } else quedan.push(r);
  }
  return { quedan, grandes, mayor };
}

export type Ritmo = { tipico: number; mejor: number; ventanas: number; tolerancia: number; diasConVenta: number };

/** Lo que se vende en `dias` días a un ritmo real de la historia. `fin` = último día del período (inclusive). */
export function ritmo(rs: Renglon[], dias: number, fin: number): Ritmo {
  const porDia = new Map<number, number>();
  for (const r of rs) porDia.set(r.dia, (porDia.get(r.dia) ?? 0) + r.cantidad);
  const S = [...porDia.keys()].sort((a, b) => a - b);
  const U = S.map((d) => porDia.get(d)!);
  const n = S.length;
  const huecos = S.slice(1).map((d, i) => d - S[i]);
  const tolerancia = Math.max(TOLERANCIA_MINIMA_DIAS, Math.ceil(VECES_HUECO * mediana(huecos)));
  if (n < 2) return { tipico: 0, mejor: 0, ventanas: 0, tolerancia, diasConVenta: n };
  // Sumas acumuladas de unidades y de huecos demasiado largos.
  const acumU = [0];
  for (const u of U) acumU.push(acumU[acumU.length - 1] + u);
  const acumMalo = [0];
  for (const h of huecos) acumMalo.push(acumMalo[acumMalo.length - 1] + (h > tolerancia ? 1 : 0));
  const sumas: number[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const finVentana = S[i] + dias; // exclusivo
    if (finVentana > fin + 1) break;
    if (j < i) j = i;
    while (j + 1 < n && S[j + 1] < finVentana) j++;
    const huecosMalos = acumMalo[j] - acumMalo[i]; // huecos entre las ventas i..j
    if (huecosMalos > 0 || finVentana - S[j] > tolerancia) continue;
    sumas.push(acumU[j + 1] - acumU[i]);
  }
  return { tipico: Math.round(mediana(sumas)), mejor: sumas.length ? Math.max(...sumas) : 0, ventanas: sumas.length, tolerancia, diasConVenta: n };
}

export type Grillas = { cargoFijo: { desde: number; valor: number }[]; envio: { desde: number; valor: number }[] };

/** Lo que se lleva Mercado Libre de una venta Clásica a ese precio: comisión + cargo fijo (precios bajos) + envío gratis
 *  (precios altos, lo paga el vendedor). Las grillas, de menor a mayor «desde». */
export function costosMl(precio: number, comisionPct: number, g: Grillas): number {
  const tramo = (xs: { desde: number; valor: number }[]) => xs.reduce((v, x) => (precio >= x.desde ? x.valor : v), 0);
  return precio * (comisionPct / 100) + tramo(g.cargoFijo) + tramo(g.envio);
}
