"use server";

// Publicidad de la tienda (lib/tienda/publicidad.ts y lib/tienda/feed.ts): las etiquetas de
// Google, Meta y TikTok de cada dominio y lo que entra a los catálogos.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, id } from "@/lib/erp/acciones";
import { olvidarDominios } from "@/lib/tienda/dominios-tienda";
import { GA4_ID, LABEL, PIXEL_META, PIXEL_TIKTOK, TAG_ID, publicidadDe, type Publicidad } from "@/lib/tienda/publicidad";

const BASE = "/config/tienda/publicidad";

async function dominioDeLaOrg(org: string, dominioId: number) {
  const d = await una<{ canal_id: string; publicidad: unknown }>(
    "select canal_id, publicidad from tienda_dominio where id = $1 and organizacion_id = $2", [dominioId, org]);
  if (!d) throw new ErrorErp("Ese dominio no existe.");
  return { canalId: Number(d.canal_id), pub: publicidadDe(d.publicidad) };
}

async function grabar(org: string, dominioId: number, pub: Publicidad) {
  await consulta("update tienda_dominio set publicidad = $3::jsonb where id = $1 and organizacion_id = $2", [dominioId, org, JSON.stringify(pub)]);
  olvidarDominios();
  revalidatePath(BASE);
}

/** Un ID tal como lo pegan (con espacios, en minúsculas): vacío = null; con otro formato, error en criollo. */
function idDe(fd: FormData, campo: string, re: RegExp, mayusculas: boolean, error: string): string | null {
  let v = String(fd.get(campo) ?? "").trim().replace(/\s+/g, "");
  if (mayusculas) v = v.toUpperCase();
  if (!v) return null;
  if (!re.test(v)) throw new ErrorErp(error);
  return v;
}

export async function accionGuardarPublicidad(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const dominio = id(fd, "dominio_id");
  const canal = Number(fd.get("canal_id")) || 0;
  await intentar(`${BASE}?canal=${canal}`, async () => {
    const { pub } = await dominioDeLaOrg(s.org.id, dominio);
    await grabar(s.org.id, dominio, {
      google: { ...pub.google,
        tag_id: idDe(fd, "tag_id", TAG_ID, true, "El ID de la etiqueta de Google empieza con AW- y sigue con números (ej. AW-123456789)."),
        conversion_label: idDe(fd, "conversion_label", LABEL, false, "La etiqueta de conversión son letras, números, guiones (la parte que va después de la barra en «AW-…/…»)."),
        ga4_id: idDe(fd, "ga4_id", GA4_ID, true, "El ID de medición de Google Analytics empieza con G- (ej. G-ABC123XYZ).") },
      meta: { ...pub.meta, pixel_id: idDe(fd, "meta_pixel", PIXEL_META, false, "El ID del píxel de Meta son sólo números (15 o 16).") },
      tiktok: { ...pub.tiktok, pixel_id: idDe(fd, "tiktok_pixel", PIXEL_TIKTOK, true, "El ID del píxel de TikTok son letras y números (ej. C1ABC2DEF3GH4IJ5KL6M).") },
      contar_al_crear: fd.get("contar_al_crear") === "1", datos_comprador: fd.get("datos_comprador") === "1",
    });
    return "Grabado. La tienda ya usa estas etiquetas (puede tardar un minuto).";
  });
}

export async function accionActivarPlataforma(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const dominio = id(fd, "dominio_id");
  const canal = Number(fd.get("canal_id")) || 0;
  const plataforma = String(fd.get("plataforma"));
  await intentar(`${BASE}?canal=${canal}`, async () => {
    if (plataforma !== "google" && plataforma !== "meta" && plataforma !== "tiktok") throw new ErrorErp("Esa plataforma no existe.");
    const { pub } = await dominioDeLaOrg(s.org.id, dominio);
    const activo = fd.get("valor") === "1";
    const tieneId = plataforma === "google" ? !!(pub.google.tag_id || pub.google.ga4_id) : !!pub[plataforma].pixel_id;
    if (activo && !tieneId) throw new ErrorErp("Cargá primero el ID (lápiz del dominio).");
    await grabar(s.org.id, dominio, { ...pub, [plataforma]: { ...pub[plataforma], activo } });
    return activo ? "Prendido: la tienda ya manda los eventos (puede tardar un minuto)." : "Apagado.";
  });
}

// ── Catálogos ──
async function canalDeLaOrg(org: string, canalId: number) {
  if (!(await una("select 1 from canal where id = $1 and organizacion_id = $2 and tipo = 'web_minorista'", [canalId, org]))) throw new ErrorErp("La tienda no existe.");
}

export async function accionGuardarFeed(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const canal = id(fd, "canal_id");
  await intentar(`${BASE}?canal=${canal}`, async () => {
    await canalDeLaOrg(s.org.id, canal);
    const bandas = String(fd.get("bandas") ?? "").split(/[\s;/]+/).map((x) => Number(x.replace(/\./g, "").replace(",", "."))).filter((n) => n > 0);
    if (String(fd.get("bandas") ?? "").trim() && !bandas.length) throw new ErrorErp("Las bandas de precio son montos separados por espacio (ej. 33.000 300.000).");
    const valor = { bandas: [...new Set(bandas)].sort((a, b) => a - b).slice(0, 6), sin_stock: fd.get("sin_stock") === "agotado" ? "agotado" : "no_va" };
    await consulta(`update canal set config = jsonb_set(coalesce(config, '{}'::jsonb), '{publicidad_feed}', $3::jsonb) where id = $1 and organizacion_id = $2`,
      [canal, s.org.id, JSON.stringify(valor)]);
    revalidatePath(BASE);
    return "Grabado.";
  });
}

export async function accionReglaFamilia(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const canal = id(fd, "canal_id");
  await intentar(`${BASE}?canal=${canal}`, async () => {
    await canalDeLaOrg(s.org.id, canal);
    const familia = Number(fd.get("familia_id")) || 0;
    if (!(await una("select 1 from familia where id = $1 and organizacion_id = $2", [familia, s.org.id]))) throw new ErrorErp("Elegí una categoría.");
    const excluir = fd.get("excluir") === "1";
    const grupo = String(fd.get("grupo") ?? "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_ñáéíóú-]/g, "").slice(0, 40) || null;
    if (!excluir && !grupo) throw new ErrorErp("Poné el grupo (ej. notebooks).");
    await consulta(`insert into tienda_feed_familia (organizacion_id, canal_id, familia_id, grupo, excluida) values ($1, $2, $3, $4, $5)
                    on conflict (canal_id, familia_id) do update set grupo = excluded.grupo, excluida = excluded.excluida`,
      [s.org.id, canal, familia, excluir ? null : grupo, excluir]);
  });
}

export async function accionQuitarReglaFamilia(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const canal = id(fd, "canal_id");
  await intentar(`${BASE}?canal=${canal}`, async () => {
    await consulta("delete from tienda_feed_familia where organizacion_id = $1 and canal_id = $2 and familia_id = $3", [s.org.id, canal, id(fd, "familia_id")]);
  });
}

export async function accionExcluirProducto(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const canal = id(fd, "canal_id");
  await intentar(`${BASE}?canal=${canal}`, async () => {
    await canalDeLaOrg(s.org.id, canal);
    const codigo = String(fd.get("codigo") ?? "").trim();
    if (!codigo) throw new ErrorErp("Poné el SKU del producto.");
    const p = await una<{ id: string }>(`
      select p.id from producto p where p.organizacion_id = $1 and (lower(p.sku_base) = lower($2)
          or exists (select 1 from variacion v where v.producto_id = p.id and lower(v.sku) = lower($2))) limit 1`, [s.org.id, codigo]);
    if (!p) throw new ErrorErp(`No hay ningún producto con el SKU ${codigo}.`);
    await consulta("insert into tienda_feed_producto (organizacion_id, canal_id, producto_id) values ($1, $2, $3) on conflict do nothing", [s.org.id, canal, p.id]);
  });
}

export async function accionQuitarProducto(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const canal = id(fd, "canal_id");
  await intentar(`${BASE}?canal=${canal}`, async () => {
    await consulta("delete from tienda_feed_producto where organizacion_id = $1 and canal_id = $2 and producto_id = $3", [s.org.id, canal, id(fd, "producto_id")]);
  });
}
