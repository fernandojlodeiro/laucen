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
import { intentar, texto, entero, numero, id } from "@/lib/erp/acciones";
import { leerMotivosPendientes } from "@/lib/mercadolibre/moderaciones";
import { cuentaDelCanal } from "@/lib/mercadolibre/api";
import { encolar, PRIORIDAD } from "@/lib/mercadolibre/cola";

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

type PubMl = { id: number; canal_id: number; variacion_id: number; id_externo: string; variacion_externa: string | null; estado: string; disponible: number; umbral: number };

async function publicacionMl(org: string, publicacion: number): Promise<PubMl> {
  const p = await una<PubMl>(`
    select pu.id::int, pu.canal_id::int, pu.variacion_id::int, pu.id_externo, pu.variacion_externa, pu.estado,
           stock_disponible_canal(pu.organizacion_id, pu.variacion_id, pu.canal_id)::int disponible,
           umbral_pausa_de(pu.organizacion_id, pu.variacion_id, pu.canal_id)::int umbral
      from publicacion pu join canal c on c.id = pu.canal_id
     where pu.id = $2 and pu.organizacion_id = $1 and c.tipo = 'mercadolibre' and pu.id_externo is not null`, [org, publicacion]);
  if (!p) throw new ErrorErp("Esa publicación no es de Mercado Libre o ya no existe.");
  const cuenta = await cuentaDelCanal(org, p.canal_id);
  if (!cuenta || cuenta.estado !== "activa") throw new ErrorErp("La cuenta de Mercado Libre de esa publicación está desconectada.");
  return p;
}

/** "Pausar" (clic de Fer, 4/10): pausa la publicación en Mercado Libre y la marca como pausada a mano:
 *  la automatización de stock no la reactiva nunca, sólo "Sacar la pausa". Sale por la cola. */
export async function accionPausarPublicacion(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  await intentar(volverDe(fd), async () => {
    const p = await publicacionMl(s.org.id, id(fd));
    if (p.estado !== "activa") throw new ErrorErp("Esa publicación no está activa.");
    // Primero la marca (así ninguna revisión de stock la pisa) y después el pedido a ML.
    await consulta("update publicacion set pausada_manual = true where id = $2 and organizacion_id = $1", [s.org.id, p.id]);
    await encolar(s.org.id, [{
      canalId: p.canal_id, itemId: p.id_externo, variationId: p.variacion_externa, publicacionId: p.id, tipo: "stock", prioridad: PRIORIDAD.pausa,
      antes: { estado: p.estado },
      // Una variación no se pausa sola en ML: se le informa 0 (igual que la pausa por stock).
      payload: p.variacion_externa ? { cantidad: 0 } : { estado: "paused" },
      efecto: { publicacion: { id: p.id, estado: "pausada", pausada_por_stock: false, pausada_manual: true, ...(p.variacion_externa ? { cantidad_publicada: 0 } : {}) } },
    }], { origen: "boton", usuarioId: s.usuario.id });
    revalidatePath(BASE);
    return "Listo: la pausa salió a Mercado Libre. Queda pausada hasta que vos le saques la pausa.";
  });
}

/** "Sacar la pausa" (clic de Fer): saca la marca de pausada a mano y, si hay stock, la reactiva en ML. */
export async function accionSacarPausa(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  await intentar(volverDe(fd), async () => {
    const p = await publicacionMl(s.org.id, id(fd));
    await consulta("update publicacion set pausada_manual = false where id = $2 and organizacion_id = $1", [s.org.id, p.id]);
    revalidatePath(BASE);
    if (p.estado === "activa") return "Listo: se sacó la marca de pausada.";
    if (p.disponible <= p.umbral) return "Se sacó la marca. Sigue pausada porque no hay stock disponible: se reactiva sola cuando lo haya.";
    await encolar(s.org.id, [{
      canalId: p.canal_id, itemId: p.id_externo, variationId: p.variacion_externa, publicacionId: p.id, tipo: "stock", prioridad: PRIORIDAD.boton,
      antes: { estado: p.estado },
      payload: p.variacion_externa ? { cantidad: p.disponible } : { cantidad: p.disponible, estado: "active" },
      efecto: { publicacion: { id: p.id, estado: "activa", pausada_por_stock: false, pausada_manual: false, cantidad_publicada: p.disponible } },
    }], { origen: "boton", usuarioId: s.usuario.id });
    return "Listo: se sacó la marca y la reactivación salió a Mercado Libre.";
  });
}

/** "Corregir precio" de una publicación en revisión (Fer, 5/10): el precio nuevo sale a ML con
 *  este clic (por la cola). Si el motivo era el precio, ML la vuelve a revisar y la levanta. */
export async function accionCorregirPrecio(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  await intentar(volverDe(fd), async () => {
    const p = await publicacionMl(s.org.id, id(fd));
    const precio = numero(fd, "precio");
    if (!precio || precio <= 0) throw new ErrorErp("Escribí el precio nuevo.");
    await encolar(s.org.id, [{
      canalId: p.canal_id, itemId: p.id_externo, variationId: p.variacion_externa, publicacionId: p.id, tipo: "precio", prioridad: PRIORIDAD.boton,
      payload: { precio: Math.round(precio) },
      efecto: { publicacion: { id: p.id, precio_canal: Math.round(precio) } },
    }], { origen: "boton", usuarioId: s.usuario.id });
    await consulta("update meli_moderacion set precio_corregido_ts = now() where organizacion_id = $1 and canal_id = $2 and item_id = $3",
      [s.org.id, p.canal_id, p.id_externo]);
    revalidatePath(BASE);
    return "Listo: el precio nuevo salió a Mercado Libre. Si el motivo era el precio, ML la vuelve a revisar (puede tardar).";
  });
}

/** "Leer motivos de revisión": pregunta a ML (sólo lectura) por qué está en revisión cada
 *  publicación que no se leyó en el último día. Hasta ~50 segundos por clic. */
export async function accionLeerMotivos(fd: FormData) {
  const s = await entrarErp("publicaciones_ver");
  await intentar(volverDe(fd), async () => {
    const r = await leerMotivosPendientes(s.org.id, Date.now() + 50_000);
    revalidatePath(BASE);
    if (!r.leidas && !r.quedan) return "Todos los motivos están al día (se vuelven a leer una vez por día).";
    return `Leídas ${r.leidas} publicaciones en revisión (${r.conMotivo} con motivo informado por ML).${r.quedan ? ` Faltan ${r.quedan}: apretá de nuevo.` : ""}`;
  });
}
