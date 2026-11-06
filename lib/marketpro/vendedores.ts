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
//      si dos o tres comparten casi los mismos catálogos (revendedores del mismo producto), desempatan la provincia y la
//      medalla que da Market Pro (Fer, 6/11);
//   3. de cada vendedor asignado se lee su nombre, ciudad y medalla (mpro_vendedor_ml, una vez).
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
export async function descubrirVendedores(org: string, segundos = 110): Promise<{ catalogos: number; ok: number }> {
  const turno = await una(`update mpro_llave set vendedores_hasta = now() + make_interval(secs => $2 + 150)
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
    const ok = await asignar(org, cuenta, t0 + (segundos + 80) * 1000);
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

/** Las provincias como las da Mercado Libre (ISO 3166-2:AR, «AR-B») y como las da Market Pro («Buenos Aires»). */
const PROVINCIAS: Record<string, string> = {
  A: "salta", B: "buenos aires", C: "capital federal", D: "san luis", E: "entre rios", F: "la rioja", G: "santiago del estero",
  H: "chaco", J: "san juan", K: "catamarca", L: "la pampa", M: "mendoza", N: "misiones", P: "formosa", Q: "neuquen",
  R: "rio negro", S: "santa fe", T: "tucuman", U: "chubut", V: "tierra del fuego", W: "corrientes", X: "cordoba", Y: "jujuy", Z: "santa cruz",
};
const sinAcento = (t: string | null | undefined) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const mismaProvincia = (ml: string | null, mp: string | null) => {
  if (!ml || !mp) return false;
  const a = PROVINCIAS[ml.replace(/^AR-/, "").toUpperCase()] ?? sinAcento(ml);
  const b = sinAcento(mp);
  return a === b || (a === "capital federal" && /ciudad|caba|capital/.test(b));
};
/** La medalla de Market Pro contra la de ML (official_store no se puede comparar: vale). */
const mismaMedalla = (ml: string | null, mp: string | null) =>
  !mp || mp === "official_store" ? true : mp === "no_medal" ? !ml : (ml ?? "") === mp;

type Ficha = { nombre: string | null; ciudad: string | null; provincia: string | null; medalla: string | null; nivel: string | null; ventas: number | null };
type U = { nickname?: string; address?: { city?: string; state?: string }; seller_reputation?: { level_id?: string; power_seller_status?: string; transactions?: { total?: number } } };

/** Asigna a cada apodo su vendedor por los catálogos en común y lee la ficha de los nuevos. Si dos o tres vendedores
 *  comparten casi los mismos catálogos (revendedores del mismo producto), desempata la provincia y la medalla que da
 *  Market Pro: gana el único que coincide en las dos, o el que coincide y comparte al menos 1,5 veces más catálogos que
 *  el siguiente que también coincide. Devuelve cuántos quedaron identificados. */
async function asignar(org: string, cuenta: CuentaMl, hasta: number): Promise<number> {
  const filas = await consulta<{ apodo: string; seller_id: string; k: number; n: number; rk: number; provincia: string | null; reputacion: string | null }>(`
    with ap as (
      select distinct p.vendedor apodo, p.catalogo from mpro_publicacion p
        join mpro_venta v on v.organizacion_id = p.organizacion_id and v.item_id = p.item_id and v.grano = 'm'
         and v.periodo >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date - interval '2 months'
       where p.organizacion_id = $1 and p.vendedor is not null and p.catalogo is not null
         and exists (select 1 from mpro_catalogo_leido l where l.organizacion_id = $1 and l.catalogo = p.catalogo)
    ),
    n as (select apodo, count(*)::int n from ap group by 1),
    c as (select ap.apodo, o.seller_id, count(*)::int k from ap join mpro_catalogo_oferta o on o.organizacion_id = $1 and o.catalogo = ap.catalogo group by 1, 2),
    r as (select c.*, n.n, row_number() over (partition by c.apodo order by c.k desc, c.seller_id)::int rk from c join n using (apodo)),
    datos as (select vendedor apodo, mode() within group (order by provincia) provincia, mode() within group (order by reputacion) reputacion
                from mpro_publicacion where organizacion_id = $1 and vendedor is not null group by 1)
    select r.apodo, r.seller_id::text, r.k, r.n, r.rk, d.provincia, d.reputacion from r join datos d using (apodo) where r.rk <= 3
     order by r.apodo, r.rk`, [org]);
  const porApodo = new Map<string, typeof filas>();
  for (const f of filas) porApodo.set(f.apodo, [...(porApodo.get(f.apodo) ?? []), f]);

  const fichas = new Map((await consulta<Ficha & { seller_id: string }>(
    "select seller_id::text, nombre, ciudad, provincia, medalla, nivel, ventas from mpro_vendedor_ml where organizacion_id = $1", [org])).map((x) => [x.seller_id, x as Ficha]));
  const ficha = async (id: string): Promise<Ficha> => {
    const ya = fichas.get(id);
    if (ya) return ya;
    const u = await ml<U>(cuenta, "GET", `/users/${id}`);
    const d: U = u.status === 200 ? u.datos : {};
    const f: Ficha = { nombre: d.nickname ?? null, ciudad: d.address?.city ?? null, provincia: d.address?.state ?? null,
      medalla: d.seller_reputation?.power_seller_status ?? null, nivel: d.seller_reputation?.level_id ?? null, ventas: d.seller_reputation?.transactions?.total ?? null };
    if (u.status === 200) await consulta(`insert into mpro_vendedor_ml (organizacion_id, seller_id, nombre, ciudad, provincia, medalla, nivel, ventas)
                                          values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (organizacion_id, seller_id) do update set nombre = excluded.nombre,
                                          ciudad = excluded.ciudad, provincia = excluded.provincia, medalla = excluded.medalla, nivel = excluded.nivel,
                                          ventas = excluded.ventas, ts = now()`, [org, id, f.nombre, f.ciudad, f.provincia, f.medalla, f.nivel, f.ventas]);
    fichas.set(id, f);
    return f;
  };

  // Primero por catálogos solos; los dudosos, con la ficha de sus candidatos.
  const elegidos: { apodo: string; seller_id: string; k: number; n: number; metodo: string }[] = [];
  const dudosos: (typeof filas)[] = [];
  for (const cands of porApodo.values()) {
    const [a, b] = cands;
    if ((a.k >= 2 && a.k * 2 >= a.n && (!b || a.k >= 2 * b.k)) || (a.n === 1 && a.k === 1 && !b)) elegidos.push({ ...a, metodo: "catalogos" });
    else if (a.k >= 2 && a.k * 2 >= a.n) dudosos.push(cands.filter((c) => c.k * 2 >= a.k));
  }
  // Los dudosos piden fichas de ML: hasta el tope de tiempo (las fichas quedan guardadas y la próxima vuelta sigue).
  for (let i = 0; i < dudosos.length && Date.now() < hasta; i += A_LA_VEZ) {
    await Promise.all(dudosos.slice(i, i + A_LA_VEZ).map(async (cands) => {
      const ok: (typeof filas)[number][] = [];
      for (const c of cands) {
        const f = await ficha(c.seller_id);
        if (mismaProvincia(f.provincia, c.provincia) && mismaMedalla(f.medalla, c.reputacion)) ok.push(c);
      }
      if (ok.length === 1 || (ok.length > 1 && ok[0].k >= 1.5 * ok[1].k)) elegidos.push({ ...ok[0], metodo: "provincia" });
    }));
  }
  // Un vendedor, un apodo: si dos apodos caen en el mismo, gana el que más coincide.
  const porVendedor = new Map<string, (typeof elegidos)[number]>();
  for (const e of elegidos) { const ya = porVendedor.get(e.seller_id); if (!ya || e.k > ya.k) porVendedor.set(e.seller_id, e); }

  const asignados = new Set<string>();
  const lista = [...porVendedor.values()];
  for (let i = 0; i < lista.length; i += A_LA_VEZ) {
    await Promise.all(lista.slice(i, i + A_LA_VEZ).map(async (e) => {
      asignados.add(e.apodo);
      const f = await ficha(e.seller_id);
      await consulta(`insert into mpro_vendedor (organizacion_id, apodo, estado, seller_id, nombre, ciudad, provincia, medalla, nivel, ventas, coincidencias, de, metodo)
                      values ($1, $2, 'ok', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                      on conflict (organizacion_id, apodo) do update set estado = 'ok', seller_id = excluded.seller_id, nombre = excluded.nombre,
                         ciudad = excluded.ciudad, provincia = excluded.provincia, medalla = excluded.medalla, nivel = excluded.nivel,
                         ventas = excluded.ventas, coincidencias = excluded.coincidencias, de = excluded.de, metodo = excluded.metodo, ts = now()`,
        [org, e.apodo, e.seller_id, f.nombre, f.ciudad, f.provincia?.replace(/^AR-/, "") ?? null, f.medalla, f.nivel, f.ventas, e.k, e.n, e.metodo]);
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
