"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { slugDe } from "@/lib/tienda/tienda";

const VOLVER = "/config/tienda";

/** Crea la tienda (un canal web_minorista) con la lista "Web minorista" si
 *  existe. Nace pausada: toma pedidos cuando se la activa en Canales. */
export async function accionCrearTienda() {
  const s = await entrarErp("tienda_config");
  await intentar(VOLVER, async () => {
    const ya = await una("select 1 from canal where organizacion_id = $1 and tipo = 'web_minorista' and estado <> 'archivado'", [s.org.id]);
    if (ya) return "Ya hay una tienda web.";
    const lista = await una<{ id: string }>(
      "select id from lista_precios where organizacion_id = $1 and lower(nombre) = 'web minorista' and estado = 'activa' order by id limit 1", [s.org.id]);
    const otroNombre = await una("select 1 from canal where organizacion_id = $1 and nombre = 'Tienda web'", [s.org.id]);
    if (otroNombre) throw new ErrorErp("Ya hay un canal que se llama \"Tienda web\": cambiale el tipo a Web minorista en Configuración → Canales.");
    let slug = "tienda";
    if (await slugOcupado(slug, 0)) slug = `tienda-${s.org.id.slice(0, 6).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    await consulta(`insert into canal (organizacion_id, nombre, tipo, lista_precios_id, estado, config)
                    values ($1, 'Tienda web', 'web_minorista', $2, 'pausado', $3::jsonb)`,
      [s.org.id, lista?.id ?? null, JSON.stringify({ nombre: s.org.nombre ?? "Tienda web", slug, sin_stock: "mostrar" })]);
    revalidatePath(VOLVER);
    return lista ? "Tienda creada (pausada). Completá los datos y activala en Canales." : "Tienda creada (pausada). No encontré la lista \"Web minorista\": elegí una en Canales.";
  });
}

/** ¿Otra tienda (de cualquier organización: las direcciones son de todos) ya usa ese slug? */
async function slugOcupado(slug: string, canalId: number) {
  const filas = await consulta<{ id: number; nombre: string; slug: string | null }>(
    "select id::int, nombre, config ->> 'slug' slug from canal where tipo = 'web_minorista' and estado <> 'archivado' and id <> $1", [canalId]);
  return filas.some((f) => (f.slug || slugDe(f.nombre)) === slug);
}

const CLAVES = ["nombre", "slug", "color", "logo", "banner", "bajada", "whatsapp", "email", "direccion", "horario", "sin_stock"] as const;

export async function accionGuardarTienda(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(VOLVER, async () => {
    const canalId = id(fd, "canal_id");
    const c = await una("select 1 from canal where id = $1 and organizacion_id = $2 and tipo = 'web_minorista'", [canalId, s.org.id]);
    if (!c) throw new ErrorErp("La tienda no existe.");

    const v: Record<string, string | null> = {};
    for (const k of CLAVES) v[k] = texto(fd, k);
    if (!v.nombre) throw new ErrorErp("Poné el nombre que ve el comprador.");
    if (!v.slug) throw new ErrorErp("Poné la dirección de la tienda (el slug).");
    v.slug = v.slug.toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug)) throw new ErrorErp("La dirección sólo lleva minúsculas, números y guiones (ej. mi-tienda).");
    if (await slugOcupado(v.slug, canalId)) throw new ErrorErp(`La dirección "${v.slug}" ya la usa otra tienda. Elegí otra.`);
    if (v.color && !/^#[0-9a-fA-F]{6}$/.test(v.color)) v.color = null;
    if (v.whatsapp) {
      v.whatsapp = v.whatsapp.replace(/\D/g, "");
      if (v.whatsapp.length < 10 || v.whatsapp.length > 15) throw new ErrorErp("El WhatsApp va en formato internacional, sólo números (ej. 5493511234567).");
    }
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) throw new ErrorErp("El mail no parece válido.");
    for (const k of ["logo", "banner"] as const) if (v[k] && !/^https:\/\//.test(v[k]!)) v[k] = null;
    v.sin_stock = v.sin_stock === "ocultar" ? "ocultar" : "mostrar";

    // Se mezcla en config: las claves vacías se sacan y las demás (token,
    // sincronizar_stock, etc.) quedan como estaban.
    const poner = Object.fromEntries(Object.entries(v).filter(([, x]) => x != null));
    const sacar = Object.entries(v).filter(([, x]) => x == null).map(([k]) => k);
    await consulta("update canal set config = (config - $3::text[]) || $4::jsonb where id = $1 and organizacion_id = $2",
      [canalId, s.org.id, sacar, JSON.stringify(poner)]);
    revalidatePath(VOLVER);
    return "Guardado.";
  });
}
