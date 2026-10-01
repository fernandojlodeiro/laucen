// Levantar el tipo de cambio oficial (orden 136, §3). Lo corre el cron diario
// (/api/tipo-cambio/cron) y el botón de Configuración → Tipo de cambio.
//
// Fuentes públicas, sin llave. La que se usa se elige en la pantalla y queda
// en config_org (clave 'tipo_cambio_fuente', global); por defecto dolarapi.
// Si la elegida falla, se prueba con la otra. Si fallan las dos, el cron lo
// reintenta y deja una entrada 'bloqueo' en la bitácora (pending).
// - dolarapi.com: el oficial del día (BNA, compra/venta).
// - argentinadatos.com: la serie histórica entera del oficial (desde 2011),
//   que sirve para convertir las ventas históricas de Virtual Seller.

import { consulta, una } from "@/lib/erp/base";
import { hoyAR } from "@/lib/moneda";

export const FUENTES = {
  dolarapi: { nombre: "dolarapi.com (oficial BNA)", url: "https://dolarapi.com/v1/dolares/oficial" },
  argentinadatos: { nombre: "argentinadatos.com (oficial)", url: "https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial" },
} as const;
export type Fuente = keyof typeof FUENTES;
export const esFuente = (x: unknown): x is Fuente => typeof x === "string" && Object.hasOwn(FUENTES, x);

export async function fuenteElegida(): Promise<Fuente> {
  const r = await una<{ valor: unknown }>("select valor from config_org where organizacion_id is null and clave = 'tipo_cambio_fuente'");
  return esFuente(r?.valor) ? r!.valor as Fuente : "dolarapi";
}

export async function elegirFuente(f: Fuente) {
  await consulta(`
    insert into config_org (organizacion_id, clave, valor) values (null, 'tipo_cambio_fuente', $1::jsonb)
    on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`,
    [JSON.stringify(f)]);
}

type Cotizacion = { fecha: string; compra: number | null; venta: number };

async function pedir(url: string): Promise<unknown> {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** El oficial de hoy según una fuente. */
async function delDia(f: Fuente): Promise<Cotizacion> {
  if (f === "dolarapi") {
    const d = await pedir(FUENTES.dolarapi.url) as { compra?: number; venta?: number; fechaActualizacion?: string };
    if (!d?.venta) throw new Error("respuesta sin venta");
    const fecha = d.fechaActualizacion
      ? new Date(d.fechaActualizacion).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
      : hoyAR();
    return { fecha, compra: d.compra ?? null, venta: d.venta };
  }
  const serie = await historia();
  if (!serie.length) throw new Error("serie vacía");
  return serie[serie.length - 1];
}

/** La serie histórica completa (argentinadatos). */
export async function historia(): Promise<Cotizacion[]> {
  const d = await pedir(FUENTES.argentinadatos.url) as { fecha?: string; compra?: number; venta?: number }[];
  if (!Array.isArray(d)) throw new Error("respuesta inesperada");
  return d.filter((x) => x.fecha && x.venta).map((x) => ({ fecha: x.fecha!.slice(0, 10), compra: x.compra ?? null, venta: x.venta! }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

async function guardar(c: Cotizacion, origen: string) {
  await consulta(`
    insert into tipo_cambio (organizacion_id, fecha, tipo, compra, venta, origen) values (null, $1::date, 'oficial', $2, $3, $4)
    on conflict (coalesce(organizacion_id, ''), fecha, tipo) do update
      set compra = excluded.compra, venta = excluded.venta, origen = excluded.origen, creado_ts = now()`,
    [c.fecha, c.compra, c.venta, origen]);
}

/** Levanta el oficial del día y lo guarda (global). Prueba la fuente elegida
 *  y, si falla, la otra; hasta 3 vueltas. Devuelve lo guardado o los errores. */
export async function levantarTipoCambio(): Promise<{ ok: true; cotizacion: Cotizacion; fuente: Fuente } | { ok: false; errores: string[] }> {
  const elegida = await fuenteElegida();
  const orden: Fuente[] = [elegida, ...(Object.keys(FUENTES) as Fuente[]).filter((f) => f !== elegida)];
  const errores: string[] = [];
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    for (const f of orden) {
      try {
        const c = await delDia(f);
        await guardar(c, f);
        return { ok: true, cotizacion: c, fuente: f };
      } catch (e) {
        errores.push(`${f}: ${(e as Error).message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 2000 * (vuelta + 1)));
  }
  return { ok: false, errores };
}

/** Carga la serie histórica entera (sólo las fechas que faltan; no pisa las
 *  que ya están). Devuelve cuántos días agregó. */
export async function cargarHistoria(): Promise<number> {
  const serie = await historia();
  let agregados = 0;
  for (let i = 0; i < serie.length; i += 500) {
    const lote = serie.slice(i, i + 500);
    const r = await consulta<{ n: number }>(`
      with nuevos as (
        insert into tipo_cambio (organizacion_id, fecha, tipo, compra, venta, origen)
        select null, (x->>'fecha')::date, 'oficial', (x->>'compra')::numeric, (x->>'venta')::numeric, 'argentinadatos'
          from jsonb_array_elements($1::jsonb) x
        on conflict (coalesce(organizacion_id, ''), fecha, tipo) do nothing
        returning 1)
      select count(*)::int n from nuevos`, [JSON.stringify(lote)]);
    agregados += r[0]?.n ?? 0;
  }
  return agregados;
}
