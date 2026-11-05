// Quién es cada vendedor de Market Pro (Fer, 5/11, opción «sólo por la API de catálogo, sin Apify»). Market Pro muestra
// el apodo ofuscado; Mercado Libre no deja leer la ficha de una publicación ajena (403), pero sí la lista de ofertas de
// un producto de catálogo (GET /products/{id}/items: cada publicación con su seller_id) y la ficha pública del vendedor
// (GET /users/{id}). Así, de cada apodo se toman sus publicaciones de catálogo (las que más facturan primero), se busca
// la publicación en las ofertas del catálogo y se lee el vendedor. Los que no tienen ninguna de catálogo quedan
// «sin_catalogo» (para ellos sirve el alias que se pone a mano en Market Pro). Sólo lee de Mercado Libre.

import { consulta, una } from "@/lib/erp/base";
import { cuentasDe, ml, type CuentaMl } from "@/lib/mercadolibre/api";

const PAGINAS_POR_CATALOGO = 3; // de a 100 ofertas
const CATALOGOS_POR_VENDEDOR = 3;
const REINTENTOS = 3;

const normalItem = (s: string) => { const x = s.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); return /^\d+$/.test(x) ? `MLA${x}` : x; };
const normalCatalogo = (s: string) => `MLA${s.trim().toUpperCase().replace(/^MLA/, "").replace(/\D/g, "")}`;

export type AvanceVendedores = { total: number; ok: number; sin_catalogo: number; no_encontrado: number; trabajando: boolean };

export async function avanceVendedores(org: string): Promise<AvanceVendedores> {
  const r = await una<AvanceVendedores>(`
    select (select count(distinct vendedor) from mpro_publicacion where organizacion_id = $1 and vendedor is not null)::int total,
           count(*) filter (where estado = 'ok')::int ok, count(*) filter (where estado = 'sin_catalogo')::int sin_catalogo,
           count(*) filter (where estado = 'no_encontrado')::int no_encontrado,
           coalesce((select vendedores_hasta > now() from mpro_llave where organizacion_id = $1), false) trabajando
      from mpro_vendedor where organizacion_id = $1`, [org]);
  return r ?? { total: 0, ok: 0, sin_catalogo: 0, no_encontrado: 0, trabajando: false };
}

/** Una vuelta: hasta `segundos`, los apodos que falten, de los que más facturan a los que menos. */
export async function descubrirVendedores(org: string, segundos = 150): Promise<{ hechos: number; ok: number }> {
  const turno = await una(`update mpro_llave set vendedores_hasta = now() + make_interval(secs => $2 + 60)
                            where organizacion_id = $1 and (vendedores_hasta is null or vendedores_hasta < now()) returning 1`, [org, segundos]);
  if (!turno) return { hechos: 0, ok: 0 };
  const t0 = Date.now();
  let hechos = 0, ok = 0;
  try {
    const cuenta = (await cuentasDe(org)).find((c) => c.estado === "activa");
    if (!cuenta) return { hechos, ok };
    const faltan = await consulta<{ apodo: string }>(`
      select p.vendedor apodo from mpro_publicacion p
        left join mpro_venta v on v.organizacion_id = p.organizacion_id and v.item_id = p.item_id and v.grano = 'm'
        left join mpro_vendedor x on x.organizacion_id = p.organizacion_id and x.apodo = p.vendedor
       where p.organizacion_id = $1 and p.vendedor is not null
         and (x.apodo is null or (x.estado = 'no_encontrado' and x.intentos < $2 and x.ts < now() - interval '1 day'))
       group by p.vendedor order by sum(v.gmv) desc nulls last limit 300`, [org, REINTENTOS]);
    for (const { apodo } of faltan) {
      if (Date.now() - t0 > segundos * 1000) break;
      if (await uno(org, cuenta, apodo)) ok++;
      hechos++;
    }
  } finally {
    await consulta("update mpro_llave set vendedores_hasta = null where organizacion_id = $1", [org]);
  }
  return { hechos, ok };
}

async function uno(org: string, cuenta: CuentaMl, apodo: string): Promise<boolean> {
  const pubs = await consulta<{ item_id: string; catalogo: string | null }>(`
    select p.item_id, p.catalogo from mpro_publicacion p
      left join mpro_venta v on v.organizacion_id = p.organizacion_id and v.item_id = p.item_id and v.grano = 'm'
     where p.organizacion_id = $1 and p.vendedor = $2 group by p.item_id, p.catalogo order by sum(v.gmv) desc nulls last`, [org, apodo]);
  const items = new Set(pubs.map((p) => normalItem(p.item_id)));
  // Primero lo ya leído de otros catálogos.
  let seller = (await una<{ seller_id: string; item_id: string }>(
    "select seller_id::text, item_id from mpro_item_vendedor where organizacion_id = $1 and item_id = any($2::text[]) limit 1", [org, [...items]]));
  const catalogos = [...new Set(pubs.filter((p) => p.catalogo).map((p) => normalCatalogo(p.catalogo!)))].filter((c) => c.length > 3).slice(0, CATALOGOS_POR_VENDEDOR);
  if (!seller) {
    if (!catalogos.length) {
      await guardar(org, apodo, { estado: "sin_catalogo" });
      return false;
    }
    buscar: for (const cat of catalogos) {
      for (let pag = 0; pag < PAGINAS_POR_CATALOGO; pag++) {
        const r = await ml<{ results?: { item_id: string; seller_id: number }[]; paging?: { total?: number } }>(cuenta, "GET", `/products/${cat}/items?limit=100&offset=${pag * 100}`);
        const res = r.status === 200 ? r.datos.results ?? [] : [];
        if (res.length) await consulta(`insert into mpro_item_vendedor (organizacion_id, item_id, seller_id)
                                        select $1, x.item_id, x.seller_id from jsonb_to_recordset($2::jsonb) x(item_id text, seller_id bigint)
                                        on conflict (organizacion_id, item_id) do update set seller_id = excluded.seller_id, ts = now()`,
          [org, JSON.stringify(res.map((o) => ({ item_id: normalItem(o.item_id), seller_id: o.seller_id })))]);
        const hit = res.find((o) => items.has(normalItem(o.item_id)));
        if (hit) { seller = { seller_id: String(hit.seller_id), item_id: normalItem(hit.item_id) }; break buscar; }
        if (res.length < 100) break;
      }
    }
  }
  if (!seller) {
    await guardar(org, apodo, { estado: "no_encontrado" });
    return false;
  }
  const u = await ml<{ nickname?: string; address?: { city?: string; state?: string }; seller_reputation?: { level_id?: string; power_seller_status?: string; transactions?: { total?: number } } }>(
    cuenta, "GET", `/users/${seller.seller_id}`);
  const d = u.status === 200 ? u.datos : {};
  await guardar(org, apodo, {
    estado: "ok", seller_id: Number(seller.seller_id), nombre: d.nickname ?? null, ciudad: d.address?.city ?? null,
    provincia: d.address?.state?.replace(/^AR-/, "") ?? null, medalla: d.seller_reputation?.power_seller_status ?? null,
    nivel: d.seller_reputation?.level_id ?? null, ventas: d.seller_reputation?.transactions?.total ?? null, item_id: seller.item_id,
  });
  return true;
}

async function guardar(org: string, apodo: string, v: { estado: string; seller_id?: number; nombre?: string | null; ciudad?: string | null; provincia?: string | null;
  medalla?: string | null; nivel?: string | null; ventas?: number | null; item_id?: string }) {
  await consulta(`insert into mpro_vendedor (organizacion_id, apodo, estado, seller_id, nombre, ciudad, provincia, medalla, nivel, ventas, item_id)
                  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                  on conflict (organizacion_id, apodo) do update set estado = excluded.estado, seller_id = coalesce(excluded.seller_id, mpro_vendedor.seller_id),
                     nombre = coalesce(excluded.nombre, mpro_vendedor.nombre), ciudad = excluded.ciudad, provincia = excluded.provincia, medalla = excluded.medalla,
                     nivel = excluded.nivel, ventas = excluded.ventas, item_id = excluded.item_id, intentos = mpro_vendedor.intentos + 1, ts = now()`,
    [org, apodo, v.estado, v.seller_id ?? null, v.nombre ?? null, v.ciudad ?? null, v.provincia ?? null, v.medalla ?? null, v.nivel ?? null, v.ventas ?? null, v.item_id ?? null]);
}
