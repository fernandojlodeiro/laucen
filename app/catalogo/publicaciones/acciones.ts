"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, entero, id } from "@/lib/erp/acciones";

const BASE = "/catalogo/publicaciones";

function volverDe(fd: FormData) {
  const v = texto(fd, "volver");
  return v && (v === BASE || v.startsWith(`${BASE}?`)) ? v : BASE;
}

const ESTADOS = ["activa", "pausada", "cerrada"];

/** Lee y valida los campos de una publicación (los ids, contra la organización). */
async function leer(org: string, fd: FormData) {
  const sku = texto(fd, "sku");
  if (!sku) throw new ErrorErp("Falta el SKU de la variación.");
  const v = await una<{ id: number }>(
    "select id::int from variacion where organizacion_id = $1 and (sku = $2 or codigo_barras = $2) order by (sku = $2) desc limit 1", [org, sku]);
  if (!v) throw new ErrorErp(`No hay ninguna variación con SKU o código de barras “${sku}”.`);
  const c = await una<{ id: number }>("select id::int from canal where organizacion_id = $1 and id = $2", [org, id(fd, "canal")]);
  if (!c) throw new ErrorErp("Elegí el canal.");
  let atributos: unknown = {};
  const crudo = texto(fd, "atributos");
  if (crudo) {
    try {
      atributos = JSON.parse(crudo);
    } catch {
      throw new ErrorErp("Los atributos externos no se pudieron leer: tienen que ir en formato JSON, por ejemplo {\"BRAND\": \"Laucen\"}. Revisá comillas, comas y llaves.");
    }
    if (atributos === null || typeof atributos !== "object") throw new ErrorErp("Los atributos externos tienen que ser una lista entre llaves, por ejemplo {\"BRAND\": \"Laucen\"}.");
  }
  const umbral = entero(fd, "umbral");
  if (umbral != null && umbral < 0) throw new ErrorErp("El umbral de pausa no puede ser negativo.");
  const estado = String(fd.get("estado"));
  return {
    variacion: v.id, canal: c.id, idExterno: texto(fd, "id_externo"), titulo: texto(fd, "titulo"),
    categoria: texto(fd, "categoria"), tipo: texto(fd, "tipo"), estado: ESTADOS.includes(estado) ? estado : "activa",
    umbral, atributos: JSON.stringify(atributos),
  };
}

export async function accionCrearPublicacion(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  await intentar(volverDe(fd), async () => {
    const p = await leer(s.org.id, fd);
    await consulta(`
      insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo, titulo, categoria_externa, tipo_publicacion, estado, umbral_pausa, atributos_externos)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [s.org.id, p.variacion, p.canal, p.idExterno, p.titulo, p.categoria, p.tipo, p.estado, p.umbral, p.atributos]);
    revalidatePath(BASE);
    return "Publicación creada.";
  });
}

export async function accionGuardarPublicacion(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  await intentar(volverDe(fd), async () => {
    const p = await leer(s.org.id, fd);
    await consulta(`
      update publicacion set variacion_id = $3, canal_id = $4, id_externo = $5, titulo = $6, categoria_externa = $7,
             tipo_publicacion = $8, estado = $9, umbral_pausa = $10, atributos_externos = $11::jsonb
       where id = $2 and organizacion_id = $1`,
      [s.org.id, id(fd), p.variacion, p.canal, p.idExterno, p.titulo, p.categoria, p.tipo, p.estado, p.umbral, p.atributos]);
    revalidatePath(BASE);
    return "Guardado.";
  });
}

export async function accionBorrarPublicacion(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  await intentar(volverDe(fd), async () => {
    await consulta("delete from publicacion where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    revalidatePath(BASE);
    return "Borrada.";
  });
}
