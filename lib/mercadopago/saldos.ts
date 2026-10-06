// Mercado Pago de cada cuenta de Mercado Libre (Fer, 6/10): el saldo de este
// momento (total, disponible, a liberar y sus desgloses). Sólo LEE.
//
// La cuenta de Mercado Pago es el mismo usuario que la de Mercado Libre, así
// que primero se prueba con la llave de la conexión de ML; si Mercado Libre
// no la deja leer Mercado Pago, con la llave de Mercado Pago propia de la
// cuenta (mp_credencial, se carga en la pantalla). Se prueban las dos
// direcciones conocidas del saldo y queda anotado qué contestó cada una
// (mp_saldo.intentos), así se ve por qué no anduvo.
//
// Cada lectura se guarda entera (mp_saldo.datos) para los análisis que vengan.

import { consulta, una } from "@/lib/erp/base";
import { tokenDeCuenta } from "@/lib/meli";
import type { CuentaMl } from "@/lib/mercadolibre/api";

export type Intento = { fuente: string; llave: "ml" | "mp"; status: number; motivo?: string };
export type Lectura = { canalId: number; leidoTs: Date; fuente: string | null; datos: Record<string, unknown> | null; intentos: Intento[] };

const FUENTES = (uid: number) => [
  { fuente: "Mercado Libre · saldo de Mercado Pago", url: `https://api.mercadolibre.com/users/${uid}/mercadopago_account/balance` },
  { fuente: "Mercado Pago · saldo de la cuenta", url: `https://api.mercadopago.com/users/${uid}/mercadopago_account/balance` },
];

async function pedir(url: string, token: string): Promise<{ status: number; datos: unknown }> {
  try {
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const texto = await r.text();
    let datos: unknown = texto;
    try { datos = JSON.parse(texto); } catch { /* texto */ }
    return { status: r.status, datos };
  } catch (e) {
    return { status: 0, datos: { message: String(e) } };
  }
}

/** ¿La respuesta trae algún número? (un 200 vacío no sirve). */
const tieneNumeros = (d: unknown): boolean =>
  typeof d === "number" || (!!d && typeof d === "object" && Object.values(d as object).some(tieneNumeros));

const motivoDe = (status: number, d: unknown) => {
  const x = d as { message?: string; error?: string } | null;
  const txt = typeof d === "string" ? d.slice(0, 120) : [x?.message, x?.error].filter(Boolean).join(" · ").slice(0, 160);
  const que = status === 401 ? "sin permiso con esta llave" : status === 403 ? "no autorizado" : status === 404 ? "no existe esa dirección"
    : status === 0 ? "no respondió" : `contestó ${status}`;
  return txt ? `${que}: ${txt}` : que;
};

/** Lee el saldo de una cuenta y guarda la lectura. */
export async function leerSaldo(cuenta: CuentaMl): Promise<Lectura> {
  const llaves: { llave: "ml" | "mp"; token: string }[] = [];
  const mp = await una<{ t: string }>("select access_token t from mp_credencial where canal_id = $1 and organizacion_id = $2", [cuenta.canalId, cuenta.organizacionId]);
  const mlTok = await tokenDeCuenta(cuenta.id);
  if (mlTok) llaves.push({ llave: "ml", token: mlTok });
  if (mp?.t) llaves.push({ llave: "mp", token: mp.t });
  // La llave de Mercado Pago de la tienda web, si es de esta misma cuenta (el número del final de la llave es el usuario).
  const web = await una<{ t: string }>(`
    select cr.datos ->> 'access_token' t from medio_pago_credencial cr join medio_pago m on m.id = cr.medio_pago_id
     where m.organizacion_id = $1 and m.tipo = 'mercadopago' and cr.datos ->> 'access_token' like '%-' || $2::text`, [cuenta.organizacionId, String(cuenta.meliUserId)]);
  if (web?.t && web.t !== mp?.t) llaves.push({ llave: "mp", token: web.t });
  const intentos: Intento[] = [];
  let fuente: string | null = null;
  let datos: Record<string, unknown> | null = null;
  fuera: for (const { llave, token } of llaves) {
    for (const f of FUENTES(cuenta.meliUserId)) {
      const r = await pedir(f.url, token);
      const ok = r.status === 200 && tieneNumeros(r.datos);
      intentos.push({ fuente: f.fuente, llave, status: r.status, ...(ok ? {} : { motivo: motivoDe(r.status, r.datos) }) });
      if (ok) { fuente = `${f.fuente} (llave de ${llave === "ml" ? "Mercado Libre" : "Mercado Pago"})`; datos = r.datos as Record<string, unknown>; break fuera; }
    }
  }
  if (!llaves.length) intentos.push({ fuente: "—", llave: "ml", status: 401, motivo: "la cuenta de Mercado Libre está desconectada y no hay llave de Mercado Pago" });
  const fila = await una<{ leido_ts: Date }>(`
    insert into mp_saldo (organizacion_id, canal_id, fuente, datos, intentos) values ($1, $2, $3, $4::jsonb, $5::jsonb) returning leido_ts`,
    [cuenta.organizacionId, cuenta.canalId, fuente, datos ? JSON.stringify(datos) : null, JSON.stringify(intentos)]);
  return { canalId: cuenta.canalId!, leidoTs: fila!.leido_ts, fuente, datos, intentos };
}

/** La última lectura de cada canal (sin volver a pedir). */
export async function ultimasLecturas(org: string): Promise<Map<number, Lectura>> {
  const filas = await consulta<{ canal_id: number; leido_ts: Date; fuente: string | null; datos: Record<string, unknown> | null; intentos: Intento[] }>(`
    select distinct on (canal_id) canal_id::int, leido_ts, fuente, datos, intentos from mp_saldo
     where organizacion_id = $1 order by canal_id, leido_ts desc`, [org]);
  return new Map(filas.map((f) => [f.canal_id, { canalId: f.canal_id, leidoTs: f.leido_ts, fuente: f.fuente, datos: f.datos, intentos: f.intentos ?? [] }]));
}

// ── De la respuesta a renglones ───────────────────────────────

/** Nombres en criollo de lo que manda Mercado Pago; lo que no está acá se muestra con su nombre original. */
const NOMBRES: Record<string, string> = {
  total_amount: "Saldo total",
  available_balance: "Disponible",
  unavailable_balance: "No disponible (a liberar)",
  unavailable_balance_by_reason: "No disponible por",
  available_balance_by_transaction_type: "Disponible por tipo",
  pending_amount: "Pendiente",
  blocked_amount: "Bloqueado",
  available_to_withdraw: "Disponible para retirar",
};
const MOTIVOS: Record<string, string> = {
  dispute: "reclamos o disputas", fraud: "revisión por fraude", time_period: "plazo de liberación", payment_review: "pago en revisión",
  restriction: "restricción de la cuenta", money_in_transit: "dinero en tránsito", collection: "cobros", shipping: "envíos",
  mediation: "mediaciones", chargeback: "contracargos", withdraw: "retiros",
  payment: "pagos recibidos", money_transfer: "transferencias", account_fund: "ingresos de dinero", regular_payment: "pagos",
};
const nombre = (k: string) => NOMBRES[k] ?? k.replace(/_/g, " ");
const motivo = (k: string) => MOTIVOS[k] ?? k.replace(/_/g, " ");

export type Renglon = { clave: string; titulo: string; nivel: number };

/** Todos los números de la respuesta, en orden y con nombre: "Disponible",
 *  "No disponible por · reclamos o disputas"… Una lista de objetos se nombra
 *  por su primer texto (reason, transaction_type…). */
export function numeros(d: unknown, base = "", nivel = 0, salida = new Map<string, { titulo: string; nivel: number; valor: number }>()) {
  if (!d || typeof d !== "object") return salida;
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    if (k === "user_id" || k === "id") continue;
    const clave = base ? `${base}.${k}` : k;
    const titulo = base ? `${salida.get(base)?.titulo ?? nombre(base)} · ${nombre(k)}` : nombre(k);
    if (typeof v === "number") salida.set(clave, { titulo, nivel, valor: v });
    else if (Array.isArray(v)) {
      for (const el of v) {
        if (!el || typeof el !== "object") continue;
        const e = el as Record<string, unknown>;
        const etiqueta = Object.values(e).find((x) => typeof x === "string") as string | undefined;
        for (const [k2, v2] of Object.entries(e)) {
          if (typeof v2 !== "number") continue;
          const c2 = `${clave}[${etiqueta ?? "?"}].${k2}`;
          const extra = k2 === "amount" ? "" : ` (${nombre(k2)})`;
          salida.set(c2, { titulo: `${nombre(k)} · ${motivo(etiqueta ?? "?")}${extra}`, nivel: nivel + 1, valor: v2 });
        }
      }
    } else if (v && typeof v === "object") numeros(v, clave, nivel + 1, salida);
  }
  return salida;
}
