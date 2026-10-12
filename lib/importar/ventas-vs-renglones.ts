// Historial de ventas de Virtual Seller: de las filas del informe "Ventas por producto" a los renglones de
// venta_historica. Sin base (lo prueban los tests); lo que toca la base está en lib/importar/ventas-vs.ts.

import { leerNumero } from "@/lib/numeros";
import { documentoValido } from "@/lib/clientes";
import { leerFecha } from "@/lib/importar/fecha";
import type { Valor } from "@/lib/importar/leer";

export type RenglonVs = {
  n: number;
  clave: string;
  pedido: string;
  fecha: string;            // "2026-09-15"
  canal: string;
  mlOrder: string | null;   // n.º de venta de ML (texto: no entra en un número de JavaScript sin perder dígitos… por las dudas)
  sku: string;
  titulo: string | null;
  cantidad: number;
  precio: number | null;
  descuento: number | null;
  total: number;
  cliente: string | null;
  documento: string | null;
  cuit: string | null;
};

const txt = (v: Valor | undefined): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
function num(v: Valor | undefined, que: string): number | null {
  const t = txt(v);
  if (t == null) return null;
  const n = typeof v === "number" ? v : leerNumero(t);
  if (n == null) throw new Error(`${que}: "${t}" no es un número.`);
  return n;
}
const dosDecimales = (x: number) => Math.round(x * 100) / 100;

/** Arma los renglones de un pedido de VS (todas sus filas juntas, en orden). Los que tienen un problema vuelven
 *  en `errores` con el motivo en criollo; los demás entran aunque otro renglón del mismo pedido falle. */
export function renglonesVs(filas: { n: number; datos: Record<string, Valor> }[], mapeo: Record<string, string>) {
  const get = (d: Record<string, Valor>, campo: string) => (mapeo[campo] ? d[mapeo[campo]] : null);
  const ok: RenglonVs[] = [];
  const errores: { n: number; motivo: string }[] = [];
  const vistos = new Map<string, number>();
  for (const f of filas) {
    try {
      const pedido = txt(get(f.datos, "id_externo"));
      if (!pedido) throw new Error("Falta el n.º de pedido.");
      const sku = txt(get(f.datos, "sku"));
      if (!sku) throw new Error("Falta el SKU.");
      const fechaTxt = get(f.datos, "fecha");
      const fecha = leerFecha(fechaTxt)?.slice(0, 10) ?? null;
      if (!fecha) throw new Error(fechaTxt == null ? "Falta la fecha." : `La fecha "${fechaTxt}" no se entiende.`);
      const canal = txt(get(f.datos, "canal"));
      if (!canal) throw new Error("Falta el canal de venta.");
      const cantidad = num(get(f.datos, "cantidad"), "La cantidad");
      if (cantidad == null || !Number.isInteger(cantidad) || cantidad <= 0) throw new Error("La cantidad tiene que ser un entero mayor que cero.");
      const precio = num(get(f.datos, "precio_unitario"), "El precio unitario");
      const descuento = num(get(f.datos, "descuento"), "El descuento");
      const subtotal = num(get(f.datos, "subtotal"), "El subtotal");
      const total = subtotal ?? (precio != null ? precio * cantidad - (descuento ?? 0) : null);
      if (total == null) throw new Error("Falta el precio unitario o el subtotal.");
      const ml = txt(get(f.datos, "venta_ml"))?.replace(/\D/g, "") || null;
      // Mismo pedido, SKU y venta de ML dos veces = dos renglones distintos (VS los muestra así): se numeran.
      const base = `${pedido}|${sku.toUpperCase()}|${ml ?? ""}`;
      const vez = (vistos.get(base) ?? 0) + 1;
      vistos.set(base, vez);
      const cuit = txt(get(f.datos, "cuit"))?.replace(/\D/g, "") || null;
      ok.push({
        n: f.n, clave: `${base}|${vez}`, pedido, fecha, canal, mlOrder: ml, sku, titulo: txt(get(f.datos, "titulo")),
        cantidad, precio: precio == null ? null : dosDecimales(precio), descuento: descuento ? dosDecimales(descuento) : null, total: dosDecimales(total),
        cliente: txt(get(f.datos, "cliente")), documento: documentoValido(txt(get(f.datos, "documento"))),
        cuit: cuit && cuit.length === 11 ? cuit : null,
      });
    } catch (e) {
      errores.push({ n: f.n, motivo: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ok, errores };
}

/** El SKU de VS sin el «DE-» de las cuentas de DEIROLAB (para buscar el producto). */
export const skuSinPrefijo = (sku: string) => sku.replace(/^DE-/i, "");
