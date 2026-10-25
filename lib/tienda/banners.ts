// Banners de la portada de la tienda (tienda_banner). Se cargan en Configuración ›
// Banners de la tienda; la portada (app/tienda/[slug]/page.tsx) los lee con
// bannersDeLaPortada().
//
// Dos familias, clara y oscura, que se turnan cada 12 horas (cortes a las 0 y a
// las 12, hora argentina). Cada semana (de lunes a domingo) se invierte cuál va
// primero: una semana a la mañana va la clara y a la tarde la oscura; la
// siguiente, al revés. Si a la del turno no le queda ninguno activo para ese
// dominio, va la otra (la portada nunca se queda sin banners por el turno).
// Un banner es para todas las marcas de la tienda (dominio_id null) o para un
// dominio (el principal o uno de otra marca): en cada uno se ven los suyos más
// los de todas.

import type { QueryResultRow } from "pg";
import { consulta, una, ErrorErp, enTransaccion } from "@/lib/erp/base";

export type FamiliaBanner = "clara" | "oscura";
export const FAMILIAS: Record<FamiliaBanner, string> = { clara: "Clara", oscura: "Oscura" };
export const esFamilia = (x: unknown): x is FamiliaBanner => x === "clara" || x === "oscura";

export type Banner = {
  id: number; dominio_id: number | null; familia: FamiliaBanner; imagen: string; imagen_celular: string | null;
  link: string | null; orden: number; activo: boolean;
};

const HORA_AR = -3; // Argentina no cambia la hora en verano
const DIA = 86_400_000;

/** Qué familia va en este momento y hasta cuándo (el próximo corte de las 0 o las 12, hora argentina). */
export function turnoDeBanners(ahora = new Date()): { familia: FamiliaBanner; hasta: Date } {
  const local = ahora.getTime() + HORA_AR * 3_600_000;
  const dias = Math.floor(local / DIA);
  const tarde = local - dias * DIA >= DIA / 2 ? 1 : 0;
  // El 1/1/1970 fue jueves: sumando 3 días, las semanas arrancan el lunes.
  const semana = Math.floor((dias + 3) / 7);
  const familia: FamiliaBanner = (tarde + semana) % 2 === 0 ? "clara" : "oscura";
  const hasta = new Date(dias * DIA + (tarde + 1) * (DIA / 2) - HORA_AR * 3_600_000);
  return { familia, hasta };
}

/** Los banners que se ven ahora en la portada, en orden: los activos de la familia del turno
 *  para ese dominio (o, si no hay, los de la otra). `marcaId`: el dominio de otra marca por
 *  donde se entró; sin él, el principal. */
export async function bannersDeLaPortada(canalId: number, marcaId: number | null | undefined, ahora = new Date()): Promise<Banner[]> {
  const filas = await consulta<Banner>(`
    select id::int, dominio_id::int, familia, imagen, imagen_celular, link, orden::int, activo
      from tienda_banner
     where canal_id = $1 and activo
       and (dominio_id is null or dominio_id = coalesce($2::bigint, (select id from tienda_dominio where canal_id = $1 and principal)))
     order by orden, id`, [canalId, marcaId ?? null]);
  const { familia } = turnoDeBanners(ahora);
  const delTurno = filas.filter((b) => b.familia === familia);
  return delTurno.length ? delTurno : filas.filter((b) => b.familia !== familia);
}

/** Todos los banners de la tienda (para la pantalla de configuración). */
export async function bannersDe(org: string, canalId: number): Promise<Banner[]> {
  return consulta<Banner>(`
    select id::int, dominio_id::int, familia, imagen, imagen_celular, link, orden::int, activo
      from tienda_banner where organizacion_id = $1 and canal_id = $2 order by familia, orden, id`, [org, canalId]);
}

/** Los dominios de la tienda a los que se le puede dedicar un banner: el principal y los de otra marca. */
export async function destinosDeBanner(org: string, canalId: number) {
  return consulta<{ id: number; dominio: string; nombre: string; principal: boolean }>(`
    select id::int, dominio, principal, coalesce(case when principal then null else marca ->> 'nombre' end, dominio) nombre
      from tienda_dominio
     where organizacion_id = $1 and canal_id = $2 and (principal or coalesce(marca ->> 'nombre', '') <> '')
     order by principal desc, dominio`, [org, canalId]);
}

/** Un link de banner: una página de la tienda ("/buscar?ofertas=1") o un sitio de afuera (https://…). Vacío = sin link. */
export function linkValido(link: string | null): string | null {
  const l = (link ?? "").trim();
  if (!l) return null;
  if (/^\/(?!\/)/.test(l) || /^https?:\/\/[^\s]+$/i.test(l)) return l;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(l)) return `https://${l}`;
  throw new ErrorErp("El link tiene que empezar con / (una página de la tienda) o ser una dirección completa (https://…).");
}

const imagenValida = (u: string | null) => {
  if (u && !/^https:\/\//.test(u)) throw new ErrorErp("La imagen no se subió bien. Probá de nuevo.");
  return u || null;
};

async function dominioValido(org: string, canalId: number, dominioId: number | null) {
  if (dominioId == null) return null;
  if (!(await una("select 1 from tienda_dominio where id = $1 and organizacion_id = $2 and canal_id = $3", [dominioId, org, canalId]))) throw new ErrorErp("Esa tienda no existe.");
  return dominioId;
}

async function canalDeLaOrg(org: string, canalId: number) {
  if (!(await una("select 1 from canal where id = $1 and organizacion_id = $2 and tipo = 'web_minorista'", [canalId, org]))) throw new ErrorErp("La tienda no existe.");
}

/** Da de alta un banner por imagen, al final de su familia. */
export async function agregarBanners(org: string, canalId: number, datos: { imagenes: string[]; familia: FamiliaBanner; dominioId: number | null; link: string | null }) {
  await canalDeLaOrg(org, canalId);
  const imagenes = datos.imagenes.map(imagenValida).filter((x): x is string => !!x);
  if (!imagenes.length) throw new ErrorErp("Subí al menos una imagen.");
  const dominio = await dominioValido(org, canalId, datos.dominioId);
  const link = linkValido(datos.link);
  await enTransaccion(async (c) => {
    const q = <T extends QueryResultRow>(sql: string, v?: unknown[]) => c.query<T>(sql, v);
    const [{ max }] = (await q<{ max: number }>("select coalesce(max(orden), 0)::int max from tienda_banner where canal_id = $1 and familia = $2", [canalId, datos.familia])).rows;
    for (const [k, imagen] of imagenes.entries()) {
      await q("insert into tienda_banner (organizacion_id, canal_id, dominio_id, familia, imagen, link, orden) values ($1, $2, $3, $4, $5, $6, $7)",
        [org, canalId, dominio, datos.familia, imagen, link, max + k + 1]);
    }
  });
  return imagenes.length;
}

export async function guardarBanner(org: string, id: number, datos: { imagen: string | null; imagenCelular: string | null; familia: FamiliaBanner; dominioId: number | null; link: string | null }) {
  const b = await una<{ canal_id: number; familia: FamiliaBanner }>("select canal_id::int, familia from tienda_banner where id = $1 and organizacion_id = $2", [id, org]);
  if (!b) throw new ErrorErp("Ese banner ya no existe.");
  const imagen = imagenValida(datos.imagen);
  if (!imagen) throw new ErrorErp("El banner necesita una imagen.");
  const dominio = await dominioValido(org, b.canal_id, datos.dominioId);
  const link = linkValido(datos.link);
  // Si cambia de familia, va al final de la otra.
  await consulta(`update tienda_banner set imagen = $3, imagen_celular = $4, dominio_id = $5, link = $6, familia = $7,
      orden = case when familia = $7 then orden else (select coalesce(max(orden), 0) + 1 from tienda_banner where canal_id = $8 and familia = $7) end
    where id = $1 and organizacion_id = $2`, [id, org, imagen, imagenValida(datos.imagenCelular), dominio, link, datos.familia, b.canal_id]);
}

export async function activarBanner(org: string, id: number, activo: boolean) {
  await consulta("update tienda_banner set activo = $3 where id = $1 and organizacion_id = $2", [id, org, activo]);
}

export async function borrarBanner(org: string, id: number) {
  await consulta("delete from tienda_banner where id = $1 and organizacion_id = $2", [id, org]);
}

/** Sube (-1) o baja (+1) un banner un lugar dentro de su familia; deja los órdenes parejos (1, 2, 3…). */
export async function moverBanner(org: string, id: number, paso: -1 | 1) {
  await enTransaccion(async (c) => {
    const q = <T extends QueryResultRow>(sql: string, v?: unknown[]) => c.query<T>(sql, v);
    const [b] = (await q<{ canal_id: number; familia: string }>("select canal_id::int, familia from tienda_banner where id = $1 and organizacion_id = $2", [id, org])).rows;
    if (!b) return;
    const ids = (await q<{ id: number }>("select id::int from tienda_banner where canal_id = $1 and familia = $2 order by orden, id", [b.canal_id, b.familia])).rows.map((x) => x.id);
    const i = ids.indexOf(id), j = i + paso;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (const [k, x] of ids.entries()) await q("update tienda_banner set orden = $2 where id = $1", [x, k + 1]);
  });
}
