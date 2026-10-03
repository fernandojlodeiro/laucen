// Precios en Mercado Libre: las LECTURAS (leer de ML sí se puede, AGENTS.md).
//   · GET /items/{id}/price_to_win: el precio para ganar de cada publicación de
//     catálogo (cada 6 h).
//   · GET /seller-promotions/items/{id}: las campañas de cada publicación (en
//     las que está y a las que puede entrar, con su rango de precio; cada 12 h).
//   · La verificación del plan destacado: si dejó de ganar, queda la alerta.
// Corre desde el barrido de ML (después de contestar), por tandas, con un
// pedido cada ≥ 150 ms por cuenta, y sólo en los canales con "Leer precio
// para ganar" prendido (de entrada, prendido: es sólo lectura).

import { consulta } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl, type RespuestaMl } from "@/lib/mercadolibre/api";

export type Leer = (cuenta: CuentaMl, ruta: string) => Promise<RespuestaMl>;
export const RITMO_LECTURA_MS = 150;

type Ptw = { price_to_win?: number | null; current_price?: number | null; status?: string | null; winner?: { price?: number | null } | null };
type Promo = {
  id?: string; type?: string; status?: string; name?: string; price?: number | null; deal_price?: number | null;
  min_discounted_price?: number | null; max_discounted_price?: number | null; finish_date?: string | null;
};

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export type ResultadoLectura = { canales: number; ptw: number; promos: number; errores: number; alertas: number };

/** Lee lo que toque de cada canal hasta `hastaMs`. */
export async function leerPreciosMl(hastaMs: number, opts: { leer?: Leer; org?: string; ritmoMs?: number; tanda?: number } = {}): Promise<ResultadoLectura> {
  const leer: Leer = opts.leer ?? ((c, r) => ml(c, "GET", r));
  const ritmo = opts.ritmoMs ?? RITMO_LECTURA_MS;
  const tanda = opts.tanda ?? 200;
  const res: ResultadoLectura = { canales: 0, ptw: 0, promos: 0, errores: 0, alertas: 0 };
  const canales = await consulta<{ id: number; organizacion_id: string }>(`
    select c.id::int, c.organizacion_id from canal c join meli_cuenta m on m.canal_id = c.id and m.estado = 'activa'
     where c.tipo = 'mercadolibre' and c.estado = 'activo' and coalesce((c.config ->> 'leer_precio_ganar')::boolean, true)
       and ($1::text is null or c.organizacion_id = $1)`, [opts.org ?? null]);
  await Promise.all(canales.map(async ({ id: canal, organizacion_id: org }) => {
    const cuenta = await cuentaDelCanal(org, canal);
    if (!cuenta || cuenta.estado !== "activa") return;
    res.canales++;
    let ultimo = 0;
    const pedir = async (ruta: string) => {
      const espera = ultimo + ritmo - Date.now();
      if (espera > 0) await dormir(espera);
      ultimo = Date.now();
      return leer(cuenta, ruta);
    };
    // 1. Precio para ganar: las de catálogo activas, la más vieja primero (los destacados antes).
    const ptw = await consulta<{ item: string }>(`
      select item from (
      select distinct on (p.id_externo) p.id_externo item, w.leido_ts, d.item_id is not null destacado
        from publicacion p
        left join ml_price_to_win w on w.canal_id = p.canal_id and w.item_id = p.id_externo
        left join ml_plan_destacado d on d.canal_id = p.canal_id and d.item_id = p.id_externo
       where p.canal_id = $1 and p.id_externo is not null and p.estado = 'activa'
         and coalesce((p.datos_externos ->> 'catalogo')::boolean, false)
         and (w.leido_ts is null or w.leido_ts < now() - interval '6 hours' or (d.item_id is not null and w.leido_ts < now() - interval '1 hour'))
       order by p.id_externo) x
       order by destacado desc, leido_ts nulls first limit $2`, [canal, tanda]);
    for (const { item } of ptw) {
      if (Date.now() > hastaMs - 2_000) return;
      const r = await pedir(`/items/${item}/price_to_win?siteId=MLA&version=v2`);
      const d = (r.datos ?? {}) as Ptw;
      const ok = r.status === 200;
      await consulta(`
        insert into ml_price_to_win (organizacion_id, canal_id, item_id, precio, precio_actual, estado, ganador_precio, error, leido_ts)
        values ($1, $2, $3, $4, $5, $6, $7, $8, now())
        on conflict (canal_id, item_id) do update set precio = coalesce(excluded.precio, ml_price_to_win.precio), precio_actual = coalesce(excluded.precio_actual, ml_price_to_win.precio_actual),
          estado = coalesce(excluded.estado, ml_price_to_win.estado), ganador_precio = excluded.ganador_precio, error = excluded.error, leido_ts = now()`,
        [org, canal, item, ok ? d.price_to_win ?? null : null, ok ? d.current_price ?? null : null, ok ? d.status ?? null : null,
          ok ? d.winner?.price ?? null : null, ok ? null : `ML contestó ${r.status}`]);
      if (ok) res.ptw++; else res.errores++;
    }
    // 2. Campañas: las activas, cada 12 h.
    const promos = await consulta<{ item: string }>(`
      select distinct p.id_externo item from publicacion p
        left join ml_promo_leida l on l.canal_id = p.canal_id and l.item_id = p.id_externo
       where p.canal_id = $1 and p.id_externo is not null and p.estado = 'activa'
         and (l.leido_ts is null or l.leido_ts < now() - interval '12 hours')
       limit $2`, [canal, tanda]);
    for (const { item } of promos) {
      if (Date.now() > hastaMs - 2_000) return;
      const r = await pedir(`/seller-promotions/items/${item}?app_version=v2`);
      if (r.status !== 200 || !Array.isArray(r.datos)) {
        await consulta(`insert into ml_promo_leida (canal_id, item_id, organizacion_id, error) values ($1, $2, $3, $4)
          on conflict (canal_id, item_id) do update set leido_ts = now(), error = excluded.error`, [canal, item, org, `ML contestó ${r.status}`]);
        res.errores++;
        continue;
      }
      const lista = (r.datos as Promo[]).filter((x) => x?.id && x?.type).map((x) => ({
        promocion_id: String(x.id), tipo: x.type, estado: x.status ?? null, nombre: x.name ?? null,
        precio: x.status === "started" || x.status === "pending" ? x.price ?? x.deal_price ?? null : null,
        min_precio: x.min_discounted_price ?? null, max_precio: x.max_discounted_price ?? null, hasta: x.finish_date ?? null,
      }));
      await consulta("delete from ml_promo_item where canal_id = $1 and item_id = $2", [canal, item]);
      if (lista.length) {
        await consulta(`
          insert into ml_promo_item (organizacion_id, canal_id, item_id, promocion_id, tipo, estado, nombre, precio, min_precio, max_precio, hasta)
          select $1, $2, $3, x.promocion_id, x.tipo, x.estado, x.nombre, x.precio, x.min_precio, x.max_precio, x.hasta
            from jsonb_to_recordset($4::jsonb) x(promocion_id text, tipo text, estado text, nombre text, precio numeric, min_precio numeric, max_precio numeric, hasta timestamptz)
          on conflict do nothing`, [org, canal, item, JSON.stringify(lista)]);
      }
      await consulta(`insert into ml_promo_leida (canal_id, item_id, organizacion_id) values ($1, $2, $3)
        on conflict (canal_id, item_id) do update set leido_ts = now(), error = null`, [canal, item, org]);
      res.promos++;
    }
  }));
  res.alertas = await verificarDestacados(opts.org);
  return res;
}

/** El destacado que dejó de ganar (según el último precio para ganar leído)
 *  queda con su alerta; el que gana, sin. Devuelve cuántos tienen alerta. */
export async function verificarDestacados(org?: string): Promise<number> {
  await consulta(`
    update ml_plan_destacado d set verificado_ts = w.leido_ts, gana = (w.estado = 'winning'),
           alerta = case when w.estado = 'winning' then null
                         else 'Dejó de ganar en el recuadro de cuotas' || coalesce(' (ML: ' || w.estado || ')', '')
                              || coalesce('; precio para ganar $ ' || replace(to_char(w.precio, 'FM999,999,990'), ',', '.'), '') end
      from ml_price_to_win w
     where w.canal_id = d.canal_id and w.item_id = d.item_id and w.error is null and w.estado is not null
       and ($1::text is null or d.organizacion_id = $1)
       and (d.verificado_ts is null or w.leido_ts > d.verificado_ts)`, [org ?? null]);
  const r = await consulta<{ n: number }>("select count(*)::int n from ml_plan_destacado where alerta is not null and ($1::text is null or organizacion_id = $1)", [org ?? null]);
  return r[0]?.n ?? 0;
}
