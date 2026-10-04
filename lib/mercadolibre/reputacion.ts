// La reputación de cada cuenta de Mercado Libre (seller_reputation de
// GET /users/{id}), guardada en meli_cuenta.reputacion con cuándo se leyó.
// Leer de ML se puede siempre. El tablero (/mercadolibre) la muestra con los
// colores de ML y la actualiza con su botón o, sola, si tiene más de una hora.
//
// Lo que cuenta ML para la reputación (en "últimos N días" que informa cada
// métrica): reclamos, entregas demoradas (despacho fuera de plazo) y
// cancelaciones; el color sale de esas tasas.

import { consulta } from "@/lib/erp/base";
import { ml, cuentasDe, type CuentaMl } from "@/lib/mercadolibre/api";

export type Metrica = { valor: number; tasa: number; periodo: string | null };
export type Reputacion = {
  /** "5_green" … "1_red"; null = todavía sin reputación (cuenta nueva). */
  nivel: string | null;
  /** MercadoLíder: silver · gold · platinum; null = no lo es. */
  lider: string | null;
  transacciones: { total: number; completadas: number; canceladas: number; periodo: string | null } | null;
  /** Fracción (0–1) de calificaciones positivas / neutras / negativas. */
  calificaciones: { positivas: number; neutras: number; negativas: number } | null;
  reclamos: Metrica | null;
  demoras: Metrica | null;
  cancelaciones: Metrica | null;
  ventas: { completadas: number; periodo: string | null } | null;
};

type SellerReputation = {
  level_id?: string | null; power_seller_status?: string | null;
  transactions?: { total?: number; completed?: number; canceled?: number; period?: string; ratings?: { positive?: number; neutral?: number; negative?: number } } | null;
  metrics?: {
    sales?: { period?: string; completed?: number } | null;
    claims?: { period?: string; rate?: number; value?: number } | null;
    delayed_handling_time?: { period?: string; rate?: number; value?: number } | null;
    cancellations?: { period?: string; rate?: number; value?: number } | null;
  } | null;
};

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const metrica = (m?: { period?: string; rate?: number; value?: number } | null): Metrica | null =>
  m ? { valor: num(m.value), tasa: num(m.rate), periodo: m.period ?? null } : null;

/** De lo que contesta ML a lo que guarda y muestra el tablero. */
export function normalizarReputacion(r: SellerReputation | null | undefined): Reputacion {
  const t = r?.transactions;
  return {
    nivel: r?.level_id || null,
    lider: r?.power_seller_status || null,
    transacciones: t ? { total: num(t.total), completadas: num(t.completed), canceladas: num(t.canceled), periodo: t.period ?? null } : null,
    calificaciones: t?.ratings ? { positivas: num(t.ratings.positive), neutras: num(t.ratings.neutral), negativas: num(t.ratings.negative) } : null,
    reclamos: metrica(r?.metrics?.claims),
    demoras: metrica(r?.metrics?.delayed_handling_time),
    cancelaciones: metrica(r?.metrics?.cancellations),
    ventas: r?.metrics?.sales ? { completadas: num(r.metrics.sales.completed), periodo: r.metrics.sales.period ?? null } : null,
  };
}

/** Lee la reputación de una cuenta y la guarda. Devuelve null si ML no contestó. */
export async function actualizarReputacion(cuenta: CuentaMl): Promise<Reputacion | null> {
  const r = await ml<{ seller_reputation?: SellerReputation }>(cuenta, "GET", `/users/${cuenta.meliUserId}`);
  if (r.status !== 200 || !r.datos || typeof r.datos !== "object") return null;
  const rep = normalizarReputacion(r.datos.seller_reputation);
  await consulta("update meli_cuenta set reputacion = $2::jsonb, reputacion_ts = now() where id = $1", [cuenta.id, JSON.stringify(rep)]);
  return rep;
}

/** Actualiza las cuentas activas con canal; sin `forzar`, sólo las que tienen más de `edadMaxMin` minutos (o nunca se leyeron). */
export async function actualizarReputaciones(org: string, { forzar = false, edadMaxMin = 60 }: { forzar?: boolean; edadMaxMin?: number } = {}): Promise<number> {
  const viejas = new Set((await consulta<{ id: number }>(
    `select id::int from meli_cuenta where organizacion_id = $1 and (reputacion_ts is null or reputacion_ts < now() - make_interval(mins => $2))`,
    [org, edadMaxMin])).map((x) => x.id));
  const cuentas = (await cuentasDe(org)).filter((c) => c.canalId != null && c.estado === "activa" && (forzar || viejas.has(c.id)));
  const rs = await Promise.all(cuentas.map((c) => actualizarReputacion(c).catch(() => null)));
  return rs.filter(Boolean).length;
}

// ── Cómo se muestra (los colores de Mercado Libre) ─────────

export const NIVELES_REPUTACION = [
  { id: "1_red", texto: "Rojo", color: "#F23D4F", tinta: "#FFFFFF" },
  { id: "2_orange", texto: "Naranja", color: "#FF7733", tinta: "#FFFFFF" },
  { id: "3_yellow", texto: "Amarillo", color: "#FFE600", tinta: "#333333" },
  { id: "4_light_green", texto: "Verde claro", color: "#9BD649", tinta: "#333333" },
  { id: "5_green", texto: "Verde", color: "#00A650", tinta: "#FFFFFF" },
] as const;

export const LIDER: Record<string, string> = { silver: "MercadoLíder", gold: "MercadoLíder Gold", platinum: "MercadoLíder Platinum" };

export const nivelDe = (id: string | null | undefined) => NIVELES_REPUTACION.find((n) => n.id === id) ?? null;
