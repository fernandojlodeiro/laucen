// Cómo se cuenta un cambio de meli_item_cambio (db/mercadolibre.sql): el
// estado en criollo, los precios con punto de miles y la variación en %.
// Sin JSX: lo usan la pantalla y el Excel.

import { formatear } from "@/lib/moneda";
import { TEXTO_ESTADO_ML } from "@/app/catalogo/publicaciones/lista";

export const CAMPOS_CAMBIO = { estado: "Estado", precio: "Precio", stock: "Stock" } as const;
export type CampoCambio = keyof typeof CAMPOS_CAMBIO;
export const esCampoCambio = (v: unknown): v is CampoCambio => typeof v === "string" && Object.hasOwn(CAMPOS_CAMBIO, v);

export const ORIGENES_CAMBIO: Record<string, string> = { laucen: "Laucen", externo: "Fuera de Laucen", mixto: "Laucen y fuera" };

/** Un valor de un campo, para leer. */
export function valorCambio(campo: string, v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  if (campo === "estado") return TEXTO_ESTADO_ML[v] ?? v;
  if (campo === "precio") return formatear(v, "ARS");
  if (campo === "stock") return Number(v).toLocaleString("es-AR");
  return v;
}

/** La variación en % entre dos números (precio o stock); null si no se puede. */
export function variacionPct(antes: string | null | undefined, despues: string | null | undefined): number | null {
  const a = Number(antes), d = Number(despues);
  if (antes == null || despues == null || !Number.isFinite(a) || !Number.isFinite(d) || a === 0) return null;
  return Math.round((d / a - 1) * 1000) / 10;
}

/** "+1,0 %" / "−2,5 %". */
export function textoPct(p: number): string {
  const n = Math.abs(p).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${n} %`;
}

/** "Activa → Pausada", "$ 19.638 → $ 19.836 (+1,0 %)". */
export function describirCambioMl(campo: string, antes: string | null | undefined, despues: string | null | undefined): string {
  const base = `${valorCambio(campo, antes)} → ${valorCambio(campo, despues)}`;
  if (campo !== "precio") return base;
  const p = variacionPct(antes, despues);
  return p == null ? base : `${base} (${textoPct(p)})`;
}
