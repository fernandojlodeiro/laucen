// Host → tienda, leído de tienda_dominio (los carga cada organización desde
// Configuración › Tienda web). Lo usa el middleware en cada pedido a un
// dominio que no es del sistema, así que la tabla entera (son pocos) se
// guarda en memoria 60 segundos. Va contra el pool directo (sin
// asegurarEsquemaErp: el middleware no lee los .sql).

import { pool } from "@/db";
import { slugDe, type ConfigTienda, type Tienda } from "@/lib/tienda/tienda";
import { urlPanel } from "@/lib/tienda/dominios";

/** Lo que muestra un dominio de "otra marca" en vez de lo de la tienda. */
export type Marca = Pick<ConfigTienda, "nombre" | "logo" | "color_marca" | "color_marca_texto" | "banner" | "banner_2" | "banner_3" | "email">;

/** Lo que es un dominio de tienda: el principal abre la tienda (`slug`); uno con
 *  `marca` también la abre, con otro nombre y logo; los demás redirigen
 *  (`redirigeA`: al principal o al dominio de una marca). */
export type DestinoDominio = { slug: string; canalId: number; principal: boolean; marca: Marca | null; redirigeA: string | null; conCertificado: boolean };

/** ¿Este dominio abre la tienda (principal u otra marca)? */
export const abreLaTienda = (d: DestinoDominio) => d.principal || !!d.marca;

const VIGENCIA_MS = 60_000;
let cache: { hasta: number; mapa: Map<string, DestinoDominio> } | null = null;
let cargando: Promise<Map<string, DestinoDominio>> | null = null;

async function cargar(): Promise<Map<string, DestinoDominio>> {
  const { rows } = await pool.query<{ dominio: string; principal: boolean; estado: string; canal_id: string; slug: string | null; nombre: string;
    marca: Marca | null; principal_de: string | null; redirige_a: string | null }>(`
    select d.dominio, d.principal, d.estado, d.canal_id, c.config ->> 'slug' slug, c.nombre, d.marca,
           (select p.dominio from tienda_dominio p where p.canal_id = d.canal_id and p.principal) principal_de,
           (select r.dominio from tienda_dominio r where r.id = d.redirige_a_id and r.canal_id = d.canal_id) redirige_a
      from tienda_dominio d join canal c on c.id = d.canal_id
     where c.tipo = 'web_minorista' and c.estado <> 'archivado'`);
  return new Map(rows.map((f) => {
    const marca = !f.principal && f.marca?.nombre ? f.marca : null;
    return [f.dominio, {
      slug: f.slug || slugDe(f.nombre), canalId: Number(f.canal_id), principal: f.principal, marca,
      redirigeA: f.principal || marca ? null : f.redirige_a ?? f.principal_de, conCertificado: f.estado === "con_certificado",
    }];
  }));
}

async function mapa(): Promise<Map<string, DestinoDominio>> {
  if (cache && cache.hasta > Date.now()) return cache.mapa;
  cargando ??= cargar()
    .then((m) => { cache = { hasta: Date.now() + VIGENCIA_MS, mapa: m }; return m; })
    .finally(() => { cargando = null; });
  try {
    return await cargando;
  } catch (e) {
    if (cache) return cache.mapa; // la base no contesta: lo último que se supo
    throw e;
  }
}

/** ¿A qué tienda va este host? null = no está cargado. */
export async function destinoDeHost(host: string): Promise<DestinoDominio | null> {
  return (await mapa()).get(host) ?? null;
}

/** Que el próximo pedido vuelva a leer la tabla (después de un alta o un borrado). */
export function olvidarDominios() {
  cache = null;
}

/** El dominio principal de la tienda de ese canal, o null. `listo`: sólo si
 *  ya abre con https (mientras espera el DNS, puede apuntar a otro lado). */
export async function dominioPrincipal(canalId: number, listo = false): Promise<string | null> {
  for (const [d, x] of await mapa().catch(() => new Map<string, DestinoDominio>())) {
    if (x.canalId === canalId && x.principal && (!listo || x.conCertificado)) return d;
  }
  return null;
}

/** La dirección pública de una tienda (para links que salen: seguimiento
 *  del pedido, vuelta de los pagos, feed): el dominio de la marca por donde
 *  entró el comprador (t.dominio), o el principal si ya abre con https; si
 *  no, el panel + /tienda/<slug>. */
export async function urlTienda(t: Tienda, resto = ""): Promise<string> {
  return t.dominio ? `https://${t.dominio}${resto}` : urlTiendaDe(t.canalId, t.slug, resto);
}

/** La tienda como se ve desde ese dominio: si es de "otra marca" de esa
 *  tienda, con su nombre, logo, colores, banners y mail (y `dominio`, para
 *  que los links que salen —vuelta de los pagos, seguimiento— vuelvan ahí).
 *  Cualquier otro dominio (el principal, el panel) deja la tienda como está. */
export async function conMarca(t: Tienda, host: string | null | undefined): Promise<Tienda> {
  if (!host) return t;
  const d = await destinoDeHost(host.split(":")[0].toLowerCase()).catch(() => null);
  if (!d?.marca || d.canalId !== t.canalId) return t;
  const m = d.marca;
  return {
    ...t, dominio: d.conCertificado ? host.split(":")[0].toLowerCase() : null,
    // Nombre, logo y mail propios; colores de la franja y banners, los suyos si los tiene
    // (sin banners propios, la franja con el nombre: nunca los banners de la otra marca).
    config: {
      ...t.config, nombre: m.nombre, logo: m.logo || undefined, email: m.email || t.config.email,
      color_marca: m.color_marca || t.config.color_marca, color_marca_texto: m.color_marca_texto || t.config.color_marca_texto,
      banner: m.banner || undefined, banner_2: m.banner_2 || undefined, banner_3: m.banner_3 || undefined,
    },
  };
}

export async function urlTiendaDe(canalId: number, slug: string, resto = ""): Promise<string> {
  const d = await dominioPrincipal(canalId, true);
  return d ? `https://${d}${resto}` : `${urlPanel()}/tienda/${slug}${resto}`;
}
