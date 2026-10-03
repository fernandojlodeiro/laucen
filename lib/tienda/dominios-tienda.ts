// Host → tienda, leído de tienda_dominio (los carga cada organización desde
// Configuración › Tienda web). Lo usa el middleware en cada pedido a un
// dominio que no es del sistema, así que la tabla entera (son pocos) se
// guarda en memoria 60 segundos. Va contra el pool directo (sin
// asegurarEsquemaErp: el middleware no lee los .sql).

import { pool } from "@/db";
import { slugDe, type Tienda } from "@/lib/tienda/tienda";
import { urlPanel } from "@/lib/tienda/dominios";

/** Lo que es un dominio de tienda: el principal abre la tienda (`slug`); los
 *  demás redirigen al principal (`redirigeA`). */
export type DestinoDominio = { slug: string; canalId: number; principal: boolean; redirigeA: string | null; conCertificado: boolean };

const VIGENCIA_MS = 60_000;
let cache: { hasta: number; mapa: Map<string, DestinoDominio> } | null = null;
let cargando: Promise<Map<string, DestinoDominio>> | null = null;

async function cargar(): Promise<Map<string, DestinoDominio>> {
  const { rows } = await pool.query<{ dominio: string; principal: boolean; estado: string; canal_id: string; slug: string | null; nombre: string; principal_de: string | null }>(`
    select d.dominio, d.principal, d.estado, d.canal_id, c.config ->> 'slug' slug, c.nombre,
           (select p.dominio from tienda_dominio p where p.canal_id = d.canal_id and p.principal) principal_de
      from tienda_dominio d join canal c on c.id = d.canal_id
     where c.tipo = 'web_minorista' and c.estado <> 'archivado'`);
  return new Map(rows.map((f) => [f.dominio, {
    slug: f.slug || slugDe(f.nombre), canalId: Number(f.canal_id), principal: f.principal,
    redirigeA: f.principal ? null : f.principal_de, conCertificado: f.estado === "con_certificado",
  }]));
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
 *  del pedido, vuelta de los pagos, feed): su dominio principal si ya abre
 *  con https; si no, el panel + /tienda/<slug>. */
export function urlTienda(t: Tienda, resto = ""): Promise<string> {
  return urlTiendaDe(t.canalId, t.slug, resto);
}

export async function urlTiendaDe(canalId: number, slug: string, resto = ""): Promise<string> {
  const d = await dominioPrincipal(canalId, true);
  return d ? `https://${d}${resto}` : `${urlPanel()}/tienda/${slug}${resto}`;
}
