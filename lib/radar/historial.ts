// Historial del Radar: cada vez que alguien de la organización (o el cron)
// apretó "Ver publicaciones" / "Mejorar con Apify" en una palabra. No hay
// tabla aparte: sale de meli_busquedas, así que incluye todo lo ya buscado.
// Todos los de la organización ven lo de todos, con el nombre de quién buscó.

import { sql } from "drizzle-orm";
import { db } from "@/db";

export type FilaHistorial = {
  id: number;
  palabra: string;
  categoria_id: string | null;
  ruta: string | null;
  fuente: string;
  origen: string;
  estado: string;
  pedida_el: Date;
  costo_usd: number | null;
  publicaciones: number;
  quien: string | null;
  grupo: string | null;
  semilla: string;
};

/** Últimas búsquedas de la organización, con la ruta completa de la
 *  categoría, quién la hizo y en qué grupo estaba la palabra esa semana. */
export async function historial(organizacionId: string, { automaticas = true, texto = "", limite = 200 } = {}) {
  const filtroTexto = texto.trim() ? `%${texto.trim().replace(/[%_]/g, "")}%` : null;
  const r = await db.execute(sql`
    select b.id, b.palabra, b.categoria_id, c.ruta, b.fuente, b.origen, b.estado, b.pedida_el, b.costo_usd, b.semilla,
           (select count(*)::int from meli_publicaciones p where p.busqueda_id = b.id) as publicaciones,
           u.nombre as quien,
           (select t.grupo from meli_tendencias_lecturas l join meli_tendencias t on t.lectura_id = l.id
             where l.categoria_id = coalesce(b.categoria_id, 'MLA')
               and l.semana <= (b.pedida_el at time zone 'America/Argentina/Buenos_Aires')::date
               and lower(t.palabra) = lower(b.palabra)
             order by l.semana desc, t.posicion limit 1) as grupo
      from meli_busquedas b
      left join meli_categorias c on c.id = b.categoria_id
      left join usuarios u on u.id = b.usuario_id
     where b.organizacion_id = ${organizacionId}
       ${automaticas ? sql`` : sql`and b.origen <> 'cron'`}
       ${filtroTexto ? sql`and (b.palabra ilike ${filtroTexto} or c.ruta ilike ${filtroTexto})` : sql``}
     order by b.pedida_el desc
     limit ${limite}`);
  return (r.rows as FilaHistorial[]).map((f) => ({ ...f, pedida_el: new Date(f.pedida_el) }));
}

export type Vista = { cuando: Date; quien: string | null; automatica: boolean };

/** De estas palabras, cuáles ya se vieron alguna vez en la organización
 *  (cualquier fuente, cualquier semana): la última vez y quién. */
export async function vistas(organizacionId: string, palabras: string[]): Promise<Map<string, Vista>> {
  const mapa = new Map<string, Vista>();
  if (!palabras.length) return mapa;
  const minus = palabras.map((p) => p.toLowerCase());
  const r = await db.execute(sql`
    select distinct on (lower(b.palabra)) lower(b.palabra) as palabra, b.pedida_el, b.origen, u.nombre as quien
      from meli_busquedas b
      left join usuarios u on u.id = b.usuario_id
     where b.organizacion_id = ${organizacionId}
       and b.estado = 'terminada'
       and lower(b.palabra) in (${sql.join(minus.map((p) => sql`${p}`), sql`, `)})
     order by lower(b.palabra), b.pedida_el desc`);
  for (const f of r.rows as { palabra: string; pedida_el: string | Date; origen: string; quien: string | null }[]) {
    mapa.set(f.palabra, { cuando: new Date(f.pedida_el), quien: f.quien, automatica: f.origen === "cron" });
  }
  return mapa;
}
