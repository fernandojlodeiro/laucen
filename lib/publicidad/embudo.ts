// El embudo de publicidad (Fer, 25/10; como el de CadaMes): por canal de anuncios, del gasto a lo vendido en un período.
//
//   invertido → vieron (impresiones) → clics → escribieron → ventas → vendido, y de ahí cuánto costó cada venta y cuánto
//   volvió por cada peso invertido.
//
// De dónde sale cada cosa:
//   · Mercado Libre (por cuenta): la publicidad de ML (pub_campana_dia, lib/publicidad/lectura.ts). Las ventas son las
//     unidades que ML atribuye a la publicidad (directas + indirectas) y su monto.
//   · El crédito de cada venta y cada consulta sigue la regla de los 30 días (lib/publicidad/atribucion.ts): el último
//     anuncio de los 30 días anteriores, aunque la última visita haya sido por otro lado.
//   · Meta: el gasto, impresiones y clics por anuncio (anuncio_dia, lib/publicidad/meta-ads.ts); «escribieron» = los chats
//     de WhatsApp o Instagram que empezaron desde un anuncio (chat.atribucion); ventas = los pedidos de la tienda web que
//     llegaron desde un anuncio (pedido.atribucion), sin cancelados ni devueltos. Ver lib/publicidad/atribucion.ts.
//   · Google: lo mismo que Meta, con el gasto de Google Ads (lib/publicidad/google-ads.ts).
//   · TikTok: todavía sin conectar el gasto; sí las ventas de la web que llegaron desde sus anuncios.
//   · Tienda web sin anuncio: los pedidos de la web que no vinieron de un anuncio, para comparar; «escribieron» = los
//     chats que empezaron desde el botón de WhatsApp de la tienda sin venir de un anuncio. Desde el botón, el chat lleva
//     el origen de esa visita (whatsapp_clic): si venía de un anuncio de Google, cuenta en Google.
// Los montos en pesos de cada momento; un gasto en dólares se pasa a pesos con el dólar de ese día.

import { consulta } from "@/lib/erp/base";

export type FilaEmbudo = {
  clave: string; canal: string; detalle: string | null;
  /** null: no se puede leer el gasto de ese canal (todavía sin conectar). */
  gasto: number | null; vieron: number | null; clics: number | null; escribieron: number | null;
  ventas: number; vendido: number; unidad: "unidades" | "pedidos";
};

export type AnuncioEmbudo = {
  plataforma: "meta" | "google"; anuncioId: string; anuncio: string | null; campana: string | null;
  gasto: number; vieron: number | null; clics: number | null; escribieron: number; ventas: number; vendido: number;
};

const SIN_CANCELAR = "p.estado not in ('cancelado', 'devuelto')";
const EN_PERIODO = (col: string) => `${col} >= ($2::date)::timestamp at time zone 'America/Argentina/Buenos_Aires' and ${col} < ($3::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'`;
const GASTO_ARS = "case when d.moneda = 'ARS' then d.gasto else d.gasto * coalesce(tc_de_ts(d.organizacion_id, d.fecha::timestamptz), 0) end";

export async function embudo(org: string, desde: string, hasta: string): Promise<{ filas: FilaEmbudo[]; anuncios: AnuncioEmbudo[] }> {
  const v = [org, desde, hasta];
  const [ml, meta, chats, pedidos, web, anuncios] = await Promise.all([
    consulta<{ canal_id: number; nombre: string; gasto: number; vieron: number; clics: number; ventas: number; vendido: number }>(`
      select c.canal_id::int, ca.nombre, sum(d.costo)::float8 gasto, sum(d.impresiones)::float8 vieron, sum(d.clics)::float8 clics,
             sum(d.unidades_directas + d.unidades_indirectas)::float8 ventas, sum(d.monto_directo + d.monto_indirecto)::float8 vendido
        from pub_campana_dia d
        join pub_campana c on c.organizacion_id = d.organizacion_id and c.campana_id = d.campana_id
        join canal ca on ca.id = c.canal_id
       where d.organizacion_id = $1 and d.fecha between $2::date and $3::date
       group by c.canal_id, ca.nombre order by c.canal_id`, v),
    consulta<{ plataforma: string; gasto: number | null; vieron: number | null; clics: number | null; n: number }>(`
      select d.plataforma, sum(${GASTO_ARS})::float8 gasto, sum(d.impresiones)::float8 vieron, sum(d.clics)::float8 clics, count(*)::int n
        from anuncio_dia d where d.organizacion_id = $1 and d.fecha between $2::date and $3::date group by d.plataforma`, v),
    consulta<{ plataforma: string; n: number }>(`
      select coalesce(ch.atribucion ->> 'plataforma', case when ch.atribucion ->> 'desde' = 'web' then 'web' end) plataforma, count(*)::int n from chat ch
       where ch.organizacion_id = $1 and ch.atribucion is not null and ${EN_PERIODO("ch.creado_ts")} group by 1`, v),
    consulta<{ plataforma: string; ventas: number; vendido: number }>(`
      select coalesce(p.atribucion ->> 'plataforma', 'otro') plataforma, count(*)::int ventas, coalesce(sum(p.total_ars), 0)::float8 vendido from pedido p
       where p.organizacion_id = $1 and (p.atribucion ->> 'plataforma' is not null or p.atribucion ->> 'tipo' = 'campana')
         and ${SIN_CANCELAR} and ${EN_PERIODO("p.fecha")} group by 1`, v),
    consulta<{ ventas: number; vendido: number }>(`
      select count(*)::int ventas, coalesce(sum(p.total_ars), 0)::float8 vendido from pedido p join canal ca on ca.id = p.canal_id
       where p.organizacion_id = $1 and ca.tipo in ('web_minorista', 'web_mayorista') and p.atribucion ->> 'plataforma' is null and coalesce(p.atribucion ->> 'tipo', '') <> 'campana' and ${SIN_CANCELAR} and ${EN_PERIODO("p.fecha")}`, v),
    consulta<AnuncioEmbudo>(`
      with g as (
        select d.plataforma, d.anuncio_id, max(d.anuncio) anuncio, max(d.campana) campana, sum(${GASTO_ARS})::float8 gasto,
               sum(d.impresiones)::float8 vieron, sum(d.clics)::float8 clics
          from anuncio_dia d where d.organizacion_id = $1 and d.plataforma in ('meta', 'google') and d.fecha between $2::date and $3::date
         group by d.plataforma, d.anuncio_id),
      c as (select ch.atribucion ->> 'plataforma' plataforma, ch.atribucion ->> 'anuncio_id' anuncio_id, count(*)::int n from chat ch
             where ch.organizacion_id = $1 and ch.atribucion ->> 'plataforma' in ('meta', 'google') and ch.atribucion ->> 'anuncio_id' is not null
               and ${EN_PERIODO("ch.creado_ts")} group by 1, 2),
      p as (select p.atribucion ->> 'plataforma' plataforma, p.atribucion ->> 'anuncio_id' anuncio_id, count(*)::int n, coalesce(sum(p.total_ars), 0)::float8 monto
              from pedido p
             where p.organizacion_id = $1 and p.atribucion ->> 'plataforma' in ('meta', 'google') and p.atribucion ->> 'anuncio_id' is not null
               and ${SIN_CANCELAR} and ${EN_PERIODO("p.fecha")} group by 1, 2)
      select coalesce(g.plataforma, c.plataforma, p.plataforma) plataforma, coalesce(g.anuncio_id, c.anuncio_id, p.anuncio_id) "anuncioId",
             g.anuncio, g.campana, coalesce(g.gasto, 0) gasto, g.vieron, g.clics,
             coalesce(c.n, 0) escribieron, coalesce(p.n, 0) ventas, coalesce(p.monto, 0) vendido
        from g full join c on c.plataforma = g.plataforma and c.anuncio_id = g.anuncio_id
        full join p on p.plataforma = coalesce(g.plataforma, c.plataforma) and p.anuncio_id = coalesce(g.anuncio_id, c.anuncio_id)
       order by coalesce(g.gasto, 0) desc, coalesce(p.monto, 0) desc`, v),
  ]);
  const chatsDe = (pl: string) => chats.find((x) => x.plataforma === pl)?.n ?? 0;
  const ped = (pl: string) => pedidos.find((x) => x.plataforma === pl) ?? { ventas: 0, vendido: 0 };
  const gastoDe = (pl: string) => meta.find((x) => x.plataforma === pl);
  const m = gastoDe("meta"), go = gastoDe("google");
  const filas: FilaEmbudo[] = [
    ...ml.map((c): FilaEmbudo => ({ clave: `ml:${c.canal_id}`, canal: "Mercado Libre", detalle: c.nombre, gasto: c.gasto, vieron: c.vieron, clics: c.clics,
      escribieron: null, ventas: c.ventas, vendido: c.vendido, unidad: "unidades" })),
    { clave: "meta", canal: "Meta (Facebook e Instagram)", detalle: null, gasto: m?.n ? m.gasto ?? 0 : null, vieron: m?.n ? m.vieron : null, clics: m?.n ? m.clics : null,
      escribieron: chatsDe("meta"), ventas: ped("meta").ventas, vendido: ped("meta").vendido, unidad: "pedidos" },
    { clave: "google", canal: "Google", detalle: null, gasto: go?.n ? go.gasto ?? 0 : null, vieron: go?.n ? go.vieron : null, clics: go?.n ? go.clics : null,
      escribieron: chatsDe("google") || null, ventas: ped("google").ventas, vendido: ped("google").vendido, unidad: "pedidos" },
    { clave: "tiktok", canal: "TikTok", detalle: null, gasto: null, vieron: null, clics: null, escribieron: null, ventas: ped("tiktok").ventas, vendido: ped("tiktok").vendido, unidad: "pedidos" },
    ...(ped("otro").ventas ? [{ clave: "otro", canal: "Otras campañas (con utm)", detalle: null, gasto: null, vieron: null, clics: null, escribieron: null,
      ventas: ped("otro").ventas, vendido: ped("otro").vendido, unidad: "pedidos" as const }] : []),
    { clave: "web", canal: "Tienda web sin anuncio", detalle: "para comparar", gasto: null, vieron: null, clics: null, escribieron: chatsDe("web") || null,
      ventas: web[0]?.ventas ?? 0, vendido: web[0]?.vendido ?? 0, unidad: "pedidos" },
  ];
  return { filas, anuncios };
}
