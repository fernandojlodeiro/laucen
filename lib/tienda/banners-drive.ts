// Los banners desde el Google Drive (Fer, 26/10): cada tienda (o todas) tiene su carpeta de banners en el Drive de
// la organización (tienda_banner_drive) y «Leer Drive», en Banners de la tienda, la recorre. Convención:
//   - adentro, una subcarpeta para la compu («Escritorio», «Compu», «PC») y otra para el celular («Celulares»);
//   - la familia sale del nombre de la imagen («…Clara…», «…Oscura…») o de una subcarpeta «Claros» / «Oscuros».
// Las imágenes nuevas se suman al final de su familia, las que cambiaron en el Drive se reemplazan y las que ya no
// están se borran. Los banners subidos a mano no se tocan (los del Drive son los que apuntan a banner-drive).
// La imagen la sirve /api/tienda/banner-drive/<id>, que la guarda en la base la primera vez.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { tokenDeAcceso, archivosDe, carpetasDe } from "@/lib/google/drive";
import { urlPanel } from "@/lib/tienda/dominios";
import type { FamiliaBanner, PantallaBanner } from "@/lib/tienda/banners";

export type Lectura = { agregados: number; reemplazados: number; borrados: number; avisos: string[] };

/** El id de una carpeta del Drive a partir del link que se pega (o el id solo). */
export function idDeCarpeta(texto: string | null): string | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  const m = t.match(/folders\/([\w-]{10,})/) ?? t.match(/[?&]id=([\w-]{10,})/) ?? t.match(/^([\w-]{10,})$/);
  if (!m) throw new ErrorErp("Pegá el link de la carpeta del Drive (el que empieza con https://drive.google.com/drive/folders/…).");
  return m[1];
}

export const pantallaDeCarpeta = (nombre: string): PantallaBanner | null =>
  /celu|m[oó]vil|phone/i.test(nombre) ? "celular" : /escrit|compu|\bpc\b|desktop/i.test(nombre) ? "compu" : null;
export const familiaDe = (nombre: string): FamiliaBanner | null => (/oscur/i.test(nombre) ? "oscura" : /clar/i.test(nombre) ? "clara" : null);

const MARCA = "/api/tienda/banner-drive/";
const idDeImagen = (imagen: string) => imagen.split(MARCA)[1]?.split("?")[0] ?? null;

type Archivo = { id: string; nombre: string; version: string; pantalla: PantallaBanner; familia: FamiliaBanner };

/** Las imágenes de la carpeta de una tienda, con su pantalla y su familia. */
async function imagenesDe(token: string, carpeta: string, avisos: string[]): Promise<Archivo[]> {
  const out: Archivo[] = [];
  const subcarpetas = await carpetasDe(token, carpeta);
  if (!subcarpetas.some((c) => pantallaDeCarpeta(c.name))) avisos.push("La carpeta no tiene «Escritorio» ni «Celulares» adentro.");
  for (const sub of subcarpetas) {
    const pantalla = pantallaDeCarpeta(sub.name);
    if (!pantalla) continue;
    const tandas: { familia: FamiliaBanner | null; carpeta: string }[] = [{ familia: null, carpeta: sub.id }];
    for (const f of await carpetasDe(token, sub.id)) if (familiaDe(f.name)) tandas.push({ familia: familiaDe(f.name), carpeta: f.id });
    for (const t of tandas) {
      for (const a of await archivosDe(token, t.carpeta)) {
        if (!a.mimeType.startsWith("image/")) continue;
        const familia = familiaDe(a.name) ?? t.familia;
        if (!familia) { avisos.push(`«${a.name}» no dice si es Clara u Oscura: quedó afuera.`); continue; }
        out.push({ id: a.id, nombre: a.name, version: String(Date.parse(a.modifiedTime) || 0), pantalla, familia });
      }
    }
  }
  return out.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
}

/** Lee las carpetas de una tienda y deja sus banners del Drive iguales a lo que hay en ellas. */
export async function leerBannersDelDrive(org: string, canalId: number): Promise<Lectura> {
  const destinos = await consulta<{ id: number; dominio_id: number | null; carpeta: string }>(
    "select id::int, dominio_id::int, carpeta from tienda_banner_drive where organizacion_id = $1 and canal_id = $2 order by id", [org, canalId]);
  if (!destinos.length) throw new ErrorErp("Todavía no hay ninguna carpeta del Drive cargada.");
  const token = await tokenDeAcceso(org);
  const r: Lectura = { agregados: 0, reemplazados: 0, borrados: 0, avisos: [] };
  for (const d of destinos) {
    let archivos: Archivo[];
    try { archivos = await imagenesDe(token, d.carpeta, r.avisos); } catch (e) {
      console.error("[banners-drive] carpeta", d.carpeta, e instanceof Error ? e.message : e);
      r.avisos.push("Una carpeta no se pudo leer: fijate que el link sea de una carpeta del Drive conectado.");
      continue;
    }
    const ya = await consulta<{ id: number; imagen: string }>(`
      select id::int, imagen from tienda_banner where organizacion_id = $1 and canal_id = $2 and dominio_id is not distinct from $3 and imagen like '%${MARCA}%'`,
    [org, canalId, d.dominio_id]);
    const porArchivo = new Map(ya.map((b) => [idDeImagen(b.imagen), b]));
    for (const a of archivos) {
      const imagen = `${urlPanel()}${MARCA}${a.id}?v=${a.version}`;
      const b = porArchivo.get(a.id);
      if (b) {
        porArchivo.delete(a.id);
        if (b.imagen !== imagen) {
          // Cambió en el Drive: la imagen guardada se vuelve a bajar.
          await consulta("delete from tienda_banner_archivo where id = $1", [a.id]);
          r.reemplazados++;
        }
        await consulta("update tienda_banner set imagen = $2, pantalla = $3, familia = $4 where id = $1 and (imagen, pantalla, familia) is distinct from ($2, $3, $4)",
          [b.id, imagen, a.pantalla, a.familia]);
        continue;
      }
      await consulta(`insert into tienda_banner (organizacion_id, canal_id, dominio_id, familia, pantalla, imagen, orden)
        values ($1, $2, $3, $4, $5, $6, (select coalesce(max(orden), 0) + 1 from tienda_banner where canal_id = $2 and familia = $4))`,
      [org, canalId, d.dominio_id, a.familia, a.pantalla, imagen]);
      r.agregados++;
    }
    for (const [archivo, b] of porArchivo) {
      await consulta("delete from tienda_banner where id = $1", [b.id]);
      if (archivo) await consulta("delete from tienda_banner_archivo where id = $1", [archivo]);
      r.borrados++;
    }
    await consulta("update tienda_banner_drive set leido_ts = now() where id = $1", [d.id]);
  }
  return r;
}

/** Graba la carpeta de un destino (vacía: la saca). */
export async function grabarCarpeta(org: string, canalId: number, dominioId: number | null, link: string | null) {
  const carpeta = idDeCarpeta(link);
  if (!(await una("select 1 from canal where id = $1 and organizacion_id = $2", [canalId, org]))) throw new ErrorErp("La tienda no existe.");
  if (dominioId != null && !(await una("select 1 from tienda_dominio where id = $1 and canal_id = $2", [dominioId, canalId]))) throw new ErrorErp("Esa tienda no existe.");
  if (!carpeta) {
    await consulta("delete from tienda_banner_drive where canal_id = $1 and dominio_id is not distinct from $2", [canalId, dominioId]);
    return;
  }
  await consulta(`insert into tienda_banner_drive (organizacion_id, canal_id, dominio_id, carpeta) values ($1, $2, $3, $4)
    on conflict (canal_id, (coalesce(dominio_id, 0))) do update set carpeta = excluded.carpeta`, [org, canalId, dominioId, carpeta]);
}

export const carpetasDeBanners = (org: string, canalId: number) =>
  consulta<{ dominio_id: number | null; carpeta: string; leido: string | null }>(`
    select dominio_id::int, carpeta, to_char(leido_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') leido
      from tienda_banner_drive where organizacion_id = $1 and canal_id = $2`, [org, canalId]);
