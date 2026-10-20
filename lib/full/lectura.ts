// Lectura de Full (sólo lectura de Mercado Libre; db/full.sql): cuántas unidades tiene ML en Full de
// cada Código ML (inventory_id) de las cuentas con depósito Full, y la conciliación con Laucen.
//
//   GET /inventories/{inventory_id}/stock/fulfillment → available_quantity (lo que se vende),
//   not_available_quantity y not_available_detail [{status, quantity}] (en revisión, dañado,
//   perdido, en retiro…). Un 404 = ese código no tiene nada en Full.
//
// Conciliación (por variación, en el depósito Full de la cuenta): si lo que ML tiene disponible
// lleva al menos MINUTOS_QUIETO sin cambiar y no coincide con el disponible de Laucen:
//   - ML tiene más: primero se recibe de lo que está en camino (el envío más viejo primero) y lo que
//     sobra entra con un ajuste;
//   - ML tiene menos: se ajusta para abajo (una venta que todavía no llegó a Laucen no se toma por
//     faltante gracias a la espera).
// Corre de fondo cada media hora (/api/erp/tareas) y con el botón «Leer Full ahora».

import { consulta, una, enTransaccion } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";
import { SQL_CODIGO } from "@/lib/deposito/etiquetas-full";
import { recibirLinea } from "@/lib/full/envios";

/** Cuánto tiene que quedarse quieto lo que dice ML antes de igualar Laucen. */
export const MINUTOS_QUIETO = 10;
/** Cada cuánto se lee de fondo. */
export const MINUTOS_LECTURA = 25;

export type StockFullMl = { disponible: number; noDisponible: number; detalle: { status: string; quantity: number }[] };

const num = (x: unknown) => (Number.isFinite(Number(x)) ? Math.trunc(Number(x)) : 0);

/** Lo que devuelve ML, venga como venga. */
export function leerRespuestaFull(datos: unknown): StockFullMl {
  const d = (datos ?? {}) as Record<string, unknown>;
  const detalle = (Array.isArray(d.not_available_detail) ? d.not_available_detail : [])
    .map((x) => x as Record<string, unknown>).map((x) => ({ status: String(x.status ?? x.type ?? "otro"), quantity: num(x.quantity) }))
    .filter((x) => x.quantity > 0);
  return { disponible: num(d.available_quantity), noDisponible: num(d.not_available_quantity), detalle };
}

/** Qué hacer con una diferencia: cuánto recibir de lo que está en camino y cuánto ajustar (+ o −). */
export function planConciliacion(ml: number, laucen: number, enCamino: number): { recibir: number; ajuste: number } {
  const diferencia = ml - laucen;
  if (diferencia <= 0) return { recibir: 0, ajuste: diferencia };
  const recibir = Math.min(diferencia, Math.max(0, enCamino));
  return { recibir, ajuste: diferencia - recibir };
}

type DepFull = { organizacion_id: string; deposito_id: number; canal_id: number };

async function depositosFull(org: string | null, canal?: number): Promise<DepFull[]> {
  return consulta<DepFull>(`
    select d.organizacion_id, d.id::int deposito_id, cd.canal_id::int
      from deposito d join canal_deposito cd on cd.deposito_id = d.id join canal c on c.id = cd.canal_id and c.tipo = 'mercadolibre' and c.estado = 'activo'
     where d.tipo = 'full_ml' and d.estado = 'activo' and ($1::text is null or d.organizacion_id = $1) and ($2::bigint is null or cd.canal_id = $2)
     order by d.id`, [org, canal ?? null]);
}

/** ¿Hay alguna cuenta con Full que no se leyó hace un rato? (para el proceso de fondo) */
export async function hayLecturaFullPendiente(): Promise<boolean> {
  const r = await una(`
    select 1 from deposito d join canal_deposito cd on cd.deposito_id = d.id join canal c on c.id = cd.canal_id and c.tipo = 'mercadolibre' and c.estado = 'activo'
      left join full_lectura fl on fl.canal_id = cd.canal_id
     where d.tipo = 'full_ml' and d.estado = 'activo' and (fl.leido_ts is null or fl.leido_ts < now() - make_interval(mins => $1)) limit 1`, [MINUTOS_LECTURA]);
  return !!r;
}

/** Los Códigos ML a leer de una cuenta: los de sus publicaciones Full, los de los envíos a Full y los
 *  que ya se leyeron alguna vez (para ver cuando bajan a cero), con su variación de Laucen. */
async function codigosDe(org: string, canal: number, deposito: number) {
  return consulta<{ inventory_id: string; variacion_id: number | null; item_id: string | null }>(`
    select distinct on (inventory_id) inventory_id, variacion_id::int, item_id from (
      select ${SQL_CODIGO} inventory_id, pu.variacion_id, m.item_id, 0 pri
        from meli_item m left join publicacion pu on pu.id = m.publicacion_id
       where m.organizacion_id = $1 and m.canal_id = $2 and m.logistica = 'fulfillment' and coalesce(m.estado, '') <> 'closed'
      union all
      select ${SQL_CODIGO}, l.variacion_id, l.item_id, 1
        from full_envio_linea l join full_envio e on e.id = l.envio_id
        join meli_item m on m.canal_id = e.canal_id and m.item_id = l.item_id and coalesce(m.variation_id, '') = l.variation_id
       where e.organizacion_id = $1 and e.deposito_full_id = $3 and e.estado <> 'borrador'
      union all
      select fs.inventory_id, fs.variacion_id, fs.item_id, 2 from full_stock fs where fs.canal_id = $2
    ) x where inventory_id is not null
    order by inventory_id, (variacion_id is null), pri`, [org, canal, deposito]);
}

export type ResultadoLectura = { cuentas: number; leidos: number; errores: string[]; recibidas: number; ajustes: number; envios_recibidos: number };

/** Lee Full de las cuentas (todas, o las de `org` / `canal`) y concilia. */
export async function leerFull(org: string | null, hastaMs: number = Date.now() + 60_000, canal?: number): Promise<ResultadoLectura> {
  const res: ResultadoLectura = { cuentas: 0, leidos: 0, errores: [], recibidas: 0, ajustes: 0, envios_recibidos: 0 };
  for (const d of await depositosFull(org, canal)) {
    if (Date.now() > hastaMs) break;
    const cuenta = await cuentaDelCanal(d.organizacion_id, d.canal_id);
    if (!cuenta || cuenta.estado !== "activa") continue;
    res.cuentas++;
    for (const x of await codigosDe(d.organizacion_id, d.canal_id, d.deposito_id)) {
      if (Date.now() > hastaMs) break;
      const r = await ml(cuenta, "GET", `/inventories/${encodeURIComponent(x.inventory_id)}/stock/fulfillment`).catch((e) => ({ status: 0, datos: { message: (e as Error).message } }));
      if (r.status === 200 || r.status === 404) {
        const s = r.status === 200 ? leerRespuestaFull(r.datos) : { disponible: 0, noDisponible: 0, detalle: [] };
        await consulta(`
          insert into full_stock (organizacion_id, canal_id, inventory_id, variacion_id, item_id, disponible, no_disponible, detalle, desde_ts, leido_ts, error)
          values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now(), now(), null)
          on conflict (canal_id, inventory_id) do update set
            variacion_id = coalesce(excluded.variacion_id, full_stock.variacion_id), item_id = coalesce(excluded.item_id, full_stock.item_id),
            desde_ts = case when full_stock.disponible is distinct from excluded.disponible then now() else coalesce(full_stock.desde_ts, now()) end,
            disponible = excluded.disponible, no_disponible = excluded.no_disponible, detalle = excluded.detalle, leido_ts = now(), error = null`,
          [d.organizacion_id, d.canal_id, x.inventory_id, x.variacion_id, x.item_id, s.disponible, s.noDisponible, JSON.stringify(s.detalle)]);
        res.leidos++;
      } else {
        const motivo = `ML contestó ${r.status || "sin respuesta"}${typeof r.datos === "object" && r.datos && "message" in r.datos ? `: ${String((r.datos as { message: unknown }).message)}` : ""}`;
        res.errores.push(`${x.inventory_id}: ${motivo}`);
        await consulta(`
          insert into full_stock (organizacion_id, canal_id, inventory_id, variacion_id, item_id, leido_ts, error) values ($1, $2, $3, $4, $5, now(), $6)
          on conflict (canal_id, inventory_id) do update set leido_ts = now(), error = excluded.error`,
          [d.organizacion_id, d.canal_id, x.inventory_id, x.variacion_id, x.item_id, motivo.slice(0, 500)]);
      }
    }
    const c = await conciliar(d.organizacion_id, d.deposito_id, d.canal_id);
    res.recibidas += c.recibidas; res.ajustes += c.ajustes; res.envios_recibidos += c.envios_recibidos;
    await consulta(`insert into full_lectura (canal_id, organizacion_id, leido_ts, resumen) values ($1, $2, now(), $3::jsonb)
                    on conflict (canal_id) do update set leido_ts = now(), resumen = excluded.resumen`,
      [d.canal_id, d.organizacion_id, JSON.stringify({ ...c, errores: res.errores.length })]);
  }
  return res;
}

/** Iguala el depósito Full de Laucen con lo que ML muestra (ver arriba). */
export async function conciliar(org: string, deposito: number, canal: number): Promise<{ recibidas: number; ajustes: number; envios_recibidos: number }> {
  const out = { recibidas: 0, ajustes: 0, envios_recibidos: 0 };
  const filas = await consulta<{ variacion_id: number; ml: number }>(`
    select variacion_id::int, sum(disponible)::int ml from full_stock
     where organizacion_id = $1 and canal_id = $2 and variacion_id is not null
     group by variacion_id
    having bool_and(error is null and disponible is not null) and max(desde_ts) <= now() - make_interval(mins => $3)`, [org, canal, MINUTOS_QUIETO]);
  for (const f of filas) {
    await enTransaccion(async (c) => {
      await c.query("select pg_advisory_xact_lock(hashtext($1))", [`full:${deposito}:${f.variacion_id}`]);
      const laucen = Number((await c.query<{ n: number }>("select stock_disponible_deposito($1, $2, $3)::int n", [org, f.variacion_id, deposito])).rows[0].n);
      const lineas = (await c.query<{ id: string; envio_id: string; pendiente: number }>(`
        select l.id, l.envio_id, (l.cantidad - l.recibido - l.faltante)::int pendiente
          from full_envio_linea l join full_envio e on e.id = l.envio_id
         where e.organizacion_id = $1 and e.deposito_full_id = $2 and e.estado = 'despachado' and l.variacion_id = $3 and l.cantidad > l.recibido + l.faltante
         order by e.despachado_ts, e.id`, [org, deposito, f.variacion_id])).rows;
      const plan = planConciliacion(f.ml, laucen, lineas.reduce((t, l) => t + l.pendiente, 0));
      let resta = plan.recibir;
      for (const l of lineas) {
        if (resta <= 0) break;
        const n = Math.min(resta, l.pendiente);
        await recibirLinea(c, org, Number(l.id), n, "sistema", "Recibido en Full (según Mercado Libre)");
        const e = (await c.query<{ estado: string }>("select estado from full_envio where id = $1", [l.envio_id])).rows[0];
        if (e?.estado === "recibido") out.envios_recibidos++;
        resta -= n; out.recibidas += n;
      }
      if (plan.ajuste !== 0) {
        const general = Number((await c.query<{ id: string }>("select id from ubicacion where deposito_id = $1 and es_default", [deposito])).rows[0].id);
        await c.query("select mover_stock($1, $2, 'ajuste', $3, $4, $5, 'full_lectura', $6, 'sistema', $7)",
          [org, f.variacion_id, Math.abs(plan.ajuste), plan.ajuste < 0 ? general : null, plan.ajuste > 0 ? general : null, String(canal),
            `Igualado con Full de Mercado Libre (ML: ${f.ml}, Laucen: ${laucen})`]);
        out.ajustes++;
      }
      await c.query("update full_stock set conciliado_ts = now() where canal_id = $1 and variacion_id = $2", [canal, f.variacion_id]);
    });
  }
  return out;
}
