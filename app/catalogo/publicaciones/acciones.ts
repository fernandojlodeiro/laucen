"use server";

// Publicaciones es un espejo de Mercado Libre (decisión de Fer, 3/10): acá no
// se crea, no se borra ni se cambia nada de lo publicado (id externo, título,
// categoría, tipo, estado, atributos) — eso lo escribe la sincronización
// (lib/mercadolibre/*) y la importación (lib/importar/*). Sólo se editan los
// datos propios de Laucen: el umbral de pausa y, para canales que no son de
// Mercado Libre, a qué variación corresponde. El vínculo de una publicación de
// ML se cambia en "Vincular con Mercado Libre" (/catalogo/publicaciones/ml).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, entero, id } from "@/lib/erp/acciones";

const BASE = "/catalogo/publicaciones";

function volverDe(fd: FormData) {
  const v = texto(fd, "volver");
  return v && (v === BASE || v.startsWith(`${BASE}?`)) ? v : BASE;
}

/** Guarda lo propio de Laucen de una publicación: el umbral de pausa (vacío =
 *  hereda) y, si el canal no es de Mercado Libre, el SKU de la variación. */
export async function accionGuardarPublicacion(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  await intentar(volverDe(fd), async () => {
    const org = s.org.id;
    const pub = await una<{ id: number; canal_tipo: string }>(`
      select pu.id::int, c.tipo canal_tipo from publicacion pu join canal c on c.id = pu.canal_id
       where pu.id = $2 and pu.organizacion_id = $1`, [org, id(fd)]);
    if (!pub) throw new ErrorErp("Esa publicación ya no existe.");
    const umbral = entero(fd, "umbral");
    if (umbral != null && umbral < 0) throw new ErrorErp("El umbral de pausa no puede ser negativo.");
    let variacion: number | null = null;
    const sku = texto(fd, "sku");
    if (sku && pub.canal_tipo !== "mercadolibre") {
      const v = await una<{ id: number }>(`
        select id::int from variacion where organizacion_id = $1 and (lower(sku) = lower($2) or codigo_barras = $2)
         order by (lower(sku) = lower($2)) desc, id limit 1`, [org, sku]);
      if (!v) throw new ErrorErp(`No hay ninguna variación con SKU o código de barras “${sku}”.`);
      variacion = v.id;
    }
    await consulta(
      "update publicacion set umbral_pausa = $3, variacion_id = coalesce($4, variacion_id) where id = $2 and organizacion_id = $1",
      [org, pub.id, umbral, variacion]);
    revalidatePath(BASE);
    return "Guardado.";
  });
}
