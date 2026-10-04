"use server";

// Acciones de "Vincular con Mercado Libre": traer las publicaciones de una
// cuenta, vincular cada fila de meli_item con una variación, crear el
// producto desde la publicación, desvincular.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { cuentaDelCanal } from "@/lib/mercadolibre/api";
import { traerPublicaciones, vincular, crearProductoDesdeItem, borrarNotebooksSinProducto } from "@/lib/mercadolibre/publicaciones";

const BASE = "/catalogo/publicaciones/ml";

/** A dónde volver: esta pantalla, o la del canal (el "Traer publicaciones
 *  de ML" de Configuración › Canales). */
const volverDe = (fd: FormData) => {
  const v = texto(fd, "volver");
  return v && (v.startsWith(BASE) || v.startsWith("/config/canales?")) ? v : BASE;
};

async function cuentaDe(org: string, fd: FormData) {
  const canalId = id(fd, "canal");
  const cuenta = canalId ? await cuentaDelCanal(org, canalId) : null;
  if (!cuenta) throw new ErrorErp("Ese canal no tiene una cuenta de Mercado Libre conectada.");
  return cuenta;
}

export async function accionTraerPublicaciones(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  const volver = volverDe(fd);
  await intentar(volver, async () => {
    const cuenta = await cuentaDe(s.org.id, fd);
    // Hasta 4 minutos; lo que falte se trae apretando de nuevo.
    const r = await traerPublicaciones(cuenta, Date.now() + 240_000);
    revalidatePath(BASE);
    const n = (x: number) => x.toLocaleString("es-AR");
    return `Leídas ${n(r.leidas)}, vinculadas solas ${n(r.vinculadas)}.` +
      (r.completo ? "" : " No llegó a traer todas: apretá \"Traer publicaciones de ML\" de nuevo para seguir.");
  });
}

export async function accionVincular(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  const volver = volverDe(fd);
  await intentar(volver, async () => {
    const cuenta = await cuentaDe(s.org.id, fd);
    const itemId = texto(fd, "item_id");
    const variationId = texto(fd, "variation_id") ?? "";
    const codigo = texto(fd, "codigo");
    if (!itemId) throw new ErrorErp("Falta la publicación.");
    if (!codigo) throw new ErrorErp("Escribí el SKU o el código de barras de Laucen.");
    const item = await una("select 1 from meli_item where organizacion_id = $1 and canal_id = $2 and item_id = $3 and variation_id = $4",
      [s.org.id, cuenta.canalId, itemId, variationId]);
    if (!item) throw new ErrorErp("Esa publicación no está entre las traídas de Mercado Libre.");
    // Primero por SKU exacto (sin importar mayúsculas), después por código de barras.
    const v = await una<{ id: number; sku: string }>(`
      select id::int, sku from variacion
       where organizacion_id = $1 and (lower(sku) = lower($2) or codigo_barras = $2)
       order by (lower(sku) = lower($2)) desc, id limit 1`, [s.org.id, codigo]);
    if (!v) throw new ErrorErp(`No hay ninguna variación con SKU o código de barras "${codigo}".`);
    await vincular(cuenta, itemId, variationId, v.id);
    revalidatePath(BASE);
    return `Vinculada a ${v.sku}.`;
  });
}

export async function accionCrearProducto(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  const volver = volverDe(fd);
  await intentar(volver, async () => {
    const cuenta = await cuentaDe(s.org.id, fd);
    const itemId = texto(fd, "item_id");
    if (!itemId) throw new ErrorErp("Falta la publicación.");
    const item = await una("select 1 from meli_item where organizacion_id = $1 and canal_id = $2 and item_id = $3",
      [s.org.id, cuenta.canalId, itemId]);
    if (!item) throw new ErrorErp("Esa publicación no está entre las traídas de Mercado Libre.");
    const productoId = await crearProductoDesdeItem(cuenta, itemId);
    revalidatePath(BASE);
    return { ir: `/catalogo/productos/${productoId}?ok=${encodeURIComponent("Producto creado y vinculado con la publicación.")}` };
  });
}

export async function accionDesvincular(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  const volver = volverDe(fd);
  await intentar(volver, async () => {
    const pubId = id(fd, "publicacion");
    if (!pubId) throw new ErrorErp("Falta la publicación.");
    await enTransaccion(async (c) => {
      await c.query("update meli_item set publicacion_id = null where organizacion_id = $1 and publicacion_id = $2", [s.org.id, pubId]);
      const r = await c.query("delete from publicacion where id = $2 and organizacion_id = $1", [s.org.id, pubId]);
      if (!r.rowCount) throw new ErrorErp("Esa vinculación ya no existe.");
    });
    revalidatePath(BASE);
    return "Desvinculada.";
  });
}

/** Borra de Laucen (no de ML) las notebooks pausadas sin producto del canal. */
export async function accionBorrarNotebooks(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  const volver = volverDe(fd);
  await intentar(volver, async () => {
    const cuenta = await cuentaDe(s.org.id, fd);
    const n = await borrarNotebooksSinProducto(s.org.id, cuenta.canalId!);
    revalidatePath(BASE);
    return `Borradas de Laucen ${n.toLocaleString("es-AR")} notebooks pausadas sin producto. En Mercado Libre siguen como estaban.`;
  });
}
