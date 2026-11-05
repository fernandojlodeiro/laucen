// Quién es cada vendedor de Market Pro (Fer, 5/11, opción «sólo por la API de catálogo, sin Apify»).
//
// Market Pro cifra el número de publicación y muestra el vendedor con un apodo («PALABRA.PALABRA.PALABRA»), pero da el
// producto de catálogo de cada publicación. Mercado Libre no deja leer la ficha de una publicación ajena (403), pero sí
// las ofertas de un producto de catálogo (GET /products/{id}/items: cada una con su seller_id) y la ficha pública del
// vendedor (GET /users/{id}). Entonces:
//   1. se leen las ofertas de los catálogos que más facturan (los de los últimos 2 meses cerrados), una vez por semana;
//   2. a cada apodo se le asigna el vendedor que está en los mismos catálogos que él: el que más catálogos comparte,
//      con al menos 2 en común, al menos la mitad de los catálogos del apodo y el doble que el segundo; o, si el apodo
//      vende en un solo catálogo, cuando ese catálogo tiene un solo vendedor;
//   3. de cada vendedor asignado se lee su nombre, ciudad y medalla.
// Los que no venden nada de catálogo quedan «sin_catalogo» (para ellos sirve el alias que se pone a mano en Market Pro).
// Sólo lee de Mercado Libre.

import { consulta, una } from "@/lib/erp/base";
import { cuentasDe, ml, type CuentaMl } from "@/lib/mercadolibre/api";

const A_LA_VEZ = 4;
const RELEER_DIAS = 7;

export type AvanceVendedores = { total: number; ok: number; sin_catalogo: number; no_encontrado: number; trabajando: boolean; catalogos_leidos: number };

export async function avanceVendedores(org: string): Promise<AvanceVendedores> {
  const r = await una<AvanceVendedores>(`
    select (select count(distinct vendedor) from mpro_publicacion where organizacion_id = $1 and vendedor is not null)::int total,
           count(*) filter (where estado = 'ok')::int ok, count(*) filter (where estado = 'sin_catalogo')::int sin_catalogo,
           count(*) filter (where estado = 'no_encontrado')::int no_encontrado,
           coalesce((select vendedores_hasta > now() from mpro_llave where organizacion_id = $1), false) trabajando,
           (select count(*) from mpro_catalogo_leido where organizacion_id = $1)::int catalogos_leidos
      from mpro_vendedor where organizacion_id = $1`, [org]);
  return r ?? { total: 0, ok: 0, sin_catalogo: 0, no_encontrado: 0, trabajando: false, catalogos_leidos: 0 };
}

/** Una vuelta: lee catálogos hasta `segundos` y después asigna. */
export async function descubrirVendedores(org: string, segundos = 150): Promise<{ catalogos: number; ok: number }> {
  const turno = await una(`update mpro_llave set vendedores_hasta = now() + make_interval(secs => $2 + 90)
                            where organizacion_id = $1 and (vendedores_hasta is null or vendedores_hasta < now()) returning 1`, [org, segundos]);
  if (!turno) return { catalogos: 0, ok: 0 };
  const t0 = Date.now();
  let catalogos = 0;
  try {
    const cuenta = (await cuentasDe(org)).find((c) => c.estado === "activa");
    if (!cuenta) return { catalogos: 0, ok: 0 };
    const pendientes = (await consulta<{ catalogo: string }>(`
      select p.catalogo from mpro_publicacion p
        join mpro_venta v on v.organizacion_id = p.organizacion_id and v.item_id = p.item_id and v.grano = 'm'
         and v.periodo >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date - interval '2 months'
       where p.organizacion_id = $1 and p.catalogo is not null
         and not exists (select 1 from mpro_catalogo_leido l where l.organizacion_id = $1 and l.catalogo = p.catalogo
                          and l.ts > now() - make_interval(days => $2))
       group by p.catalogo order by sum(v.gmv) desc nulls last limit 3000`, [org, RELEER_DIAS])).map((x) => x.catalogo);
    while (pendientes.length && Date.now() - t0 < segundos * 1000) {
      const tanda = pendientes.splice(0, A_LA_VEZ);
      await Promise.all(tanda.map((c) => leerCatalogo(org, cuenta, c)));
      catalogos += tanda.length;
    }
    const ok = await asignar(org, cuenta);
    return { catalogos, ok };
  } finally {
    await consulta("update mpro_llave set vendedores_hasta = null where organizacion_id = $1", [org]);
  }
}

async function leerCatalogo(org: string, cuenta: CuentaMl, catalogo: string): Promise<void> {
  const id = `MLA${catalogo.replace(/^MLA/i, "")}`;
  const vendedores = new Set<number>();
  for (let pag = 0; pag < 3; pag++) {
    const r = await ml<{ results?: { seller_id: number }[] }>(cuenta, "GET", `/products/${id}/items?limit=100&offset=${pag * 100}`);
    const res = r.status === 200 ? r.datos.results ?? [] : [];
    for (const o of res) if (o.seller_id) vendedores.add(Number(o.seller_id));
    if (res.length < 100) break;
  }
  const cat = catalogo.replace(/^MLA/i, "");
  await consulta("delete from mpro_catalogo_oferta where organizacion_id = $1 and catalogo = $2", [org, cat]);
  if (vendedores.size) await consulta(`insert into mpro_catalogo_oferta (organizacion_id, catalogo, seller_id) select $1, $2, unnest($3::bigint[])
                                       on conflict do nothing`, [org, cat, [...vendedores]]);
  await consulta(`insert into mpro_catalogo_leido (organizacion_id, catalogo, ofertas) values ($1, $2, $3)
                  on conflict (organizacion_id, catalogo) do update set ofertas = excluded.ofertas, ts = now()`, [org, cat, vendedores.size]);
}

/** Asigna a cada apodo su vendedor por los catálogos en común y lee la ficha de los nuevos. Devuelve cuántos quedaron identificados. */
async function asignar(org: string, cuenta: CuentaMl): Promise<number> {
  const elegidos = await consulta<{ apodo: string; seller_id: string; k: number; n: number }>(`
    with ap as (
      select distinct p.vendedor apodo, p.catalogo from mpro_publicacion p
        join mpro_venta v on v.organizacion_id = p.organizacion_id and v.item_id = p.item_id and v.grano = 'm'
         and v.periodo >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date - interval '2 months'
       where p.organizacion_id = $1 and p.vendedor is not null and p.catalogo is not null
         and exists (select 1 from mpro_catalogo_leido l where l.organizacion_id = $1 and l.catalogo = p.catalogo)
    ),
    n as (select apodo, count(*)::int n from ap group by 1),
    c as (select ap.apodo, o.seller_id, count(*)::int k from ap join mpro_catalogo_oferta o on o.organizacion_id = $1 and o.catalogo = ap.catalogo group by 1, 2),
    r as (select c.*, n.n, row_number() over (partition by c.apodo order by c.k desc, c.seller_id) rk,
                 lead(c.k) over (partition by c.apodo order by c.k desc, c.seller_id) k2 from c join n using (apodo)),
    buenos as (select apodo, seller_id, k, n from r
                where rk = 1 and ((k >= 2 and k * 2 >= n and (k2 is null or k >= 2 * k2)) or (n = 1 and k = 1 and k2 is null)))
    -- Un vendedor, un apodo: si dos apodos caen en el mismo, gana el que más coincide.
    select distinct on (seller_id) apodo, seller_id::text, k, n from buenos order by seller_id, k desc, n`, [org]);

  const conocidos = new Map((await consulta<{ seller_id: string; nombre: string | null }>(
    "select seller_id::text, nombre from mpro_vendedor where organizacion_id = $1 and estado = 'ok' and nombre is not null", [org])).map((x) => [x.seller_id, x.nombre]));
  const asignados = new Set<string>();
  for (let i = 0; i < elegidos.length; i += A_LA_VEZ) {
    await Promise.all(elegidos.slice(i, i + A_LA_VEZ).map(async (e) => {
      asignados.add(e.apodo);
      type U = { nickname?: string; address?: { city?: string; state?: string }; seller_reputation?: { level_id?: string; power_seller_status?: string; transactions?: { total?: number } } };
      const d: U = conocidos.has(e.seller_id) ? {} : await ml<U>(cuenta, "GET", `/users/${e.seller_id}`).then((u) => (u.status === 200 ? u.datos : {}));
      await consulta(`insert into mpro_vendedor (organizacion_id, apodo, estado, seller_id, nombre, ciudad, provincia, medalla, nivel, ventas, coincidencias, de)
                      values ($1, $2, 'ok', $3, $4, $5, $6, $7, $8, $9, $10, $11)
                      on conflict (organizacion_id, apodo) do update set estado = 'ok', seller_id = excluded.seller_id,
                         nombre = coalesce(excluded.nombre, case when mpro_vendedor.seller_id = excluded.seller_id then mpro_vendedor.nombre end),
                         ciudad = coalesce(excluded.ciudad, mpro_vendedor.ciudad), provincia = coalesce(excluded.provincia, mpro_vendedor.provincia),
                         medalla = coalesce(excluded.medalla, mpro_vendedor.medalla), nivel = coalesce(excluded.nivel, mpro_vendedor.nivel),
                         ventas = coalesce(excluded.ventas, mpro_vendedor.ventas), coincidencias = excluded.coincidencias, de = excluded.de, ts = now()`,
        [org, e.apodo, e.seller_id, d.nickname ?? null, d.address?.city ?? null, d.address?.state?.replace(/^AR-/, "") ?? null,
          d.seller_reputation?.power_seller_status ?? null, d.seller_reputation?.level_id ?? null, d.seller_reputation?.transactions?.total ?? null, e.k, e.n]);
    }));
  }
  // Los demás: sin catálogo (nunca vendieron algo de catálogo) o todavía sin asegurar. Uno que antes estaba asignado y ya no
  // cierra, vuelve a «no_encontrado».
  await consulta(`
    insert into mpro_vendedor (organizacion_id, apodo, estado)
    select $1, p.vendedor, case when bool_or(p.catalogo is not null) then 'no_encontrado' else 'sin_catalogo' end
      from mpro_publicacion p where p.organizacion_id = $1 and p.vendedor is not null and not (p.vendedor = any($2::text[]))
     group by p.vendedor
    on conflict (organizacion_id, apodo) do update set estado = excluded.estado, seller_id = null, nombre = null, coincidencias = null, ts = now()
     where mpro_vendedor.estado is distinct from excluded.estado or mpro_vendedor.seller_id is not null`, [org, [...asignados]]);
  return asignados.size;
}
