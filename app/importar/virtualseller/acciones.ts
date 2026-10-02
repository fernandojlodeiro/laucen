"use server";

// Importar productos desde Virtual Seller + Mercado Libre: leer los tres
// archivos ya subidos a Storage, correr el análisis, corregir el IVA en ML e
// importar. El trabajo largo lo siguen las tareas periódicas.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, motivoErp, ErrorErp } from "@/lib/erp/base";
import { intentar, id } from "@/lib/erp/acciones";
import { supabaseServer } from "@/lib/supabase";
import { abrirLibro, leerHoja, leerCsv, leerHtml, esHtml, type Hoja } from "@/lib/importar/leer";
import { cargarArchivos, avanzar, corregirIvaMl } from "@/lib/importar/virtualseller";

async function leerDeStorage(org: string, ruta: string): Promise<Hoja> {
  if (!ruta?.startsWith(`${org}/`) || ruta.includes("..")) throw new ErrorErp("El archivo no es de esta organización.");
  const sb = await supabaseServer();
  const { data, error } = await sb.storage.from("importaciones").download(ruta);
  if (error || !data) throw new ErrorErp("No se pudo bajar un archivo que subiste. Probá de nuevo.");
  const contenido = await data.arrayBuffer();
  if (/\.csv$/i.test(ruta)) return leerCsv(contenido);
  if (esHtml(contenido)) return leerHtml(contenido);
  const libro = await abrirLibro(contenido);
  return leerHoja(libro.worksheets[0]);
}

export async function accionCargarVs(args: { stock: { ruta: string; nombre: string }; maestro: { ruta: string; nombre: string }; precios: { ruta: string; nombre: string } }):
  Promise<{ id: number } | { motivo: string }> {
  const s = await entrarErp("importar_ver");
  try {
    const [stock, maestro, precios] = await Promise.all([leerDeStorage(s.org.id, args.stock.ruta), leerDeStorage(s.org.id, args.maestro.ruta), leerDeStorage(s.org.id, args.precios.ruta)]);
    const nuevo = await cargarArchivos(s.org.id, s.usuario.id, {
      stock, maestro, precios, nombres: { stock: args.stock.nombre, maestro: args.maestro.nombre, precios: args.precios.nombre },
    });
    // Arranca el análisis acá mismo; si no termina, lo siguen las tareas.
    await avanzar(s.org.id, nuevo, Date.now() + 40_000);
    revalidatePath("/importar/virtualseller");
    return { id: nuevo };
  } catch (e) {
    return { motivo: motivoErp(e) };
  }
}

const volver = (n: number) => `/importar/virtualseller/${n}`;

export async function accionCorregirIva(fd: FormData) {
  const s = await entrarErp("importar_ver");
  const iid = id(fd);
  await intentar(volver(iid), async () => {
    const r = await corregirIvaMl(s.org.id, iid);
    revalidatePath(volver(iid));
    return r.errores.length ? `Se corrigieron ${r.ok}; ${r.errores.length} no se pudieron (ver abajo).` : `Listo: se corrigió el IVA de ${r.ok} publicaciones en Mercado Libre.`;
  });
}

export async function accionImportarVs(fd: FormData) {
  const s = await entrarErp("importar_ver");
  const iid = id(fd);
  await intentar(volver(iid), async () => {
    const r = await una("update importacion_vs set estado = 'importando', error = null where id = $1 and organizacion_id = $2 and estado = 'analizado' returning id", [iid, s.org.id]);
    if (!r) throw new ErrorErp("Esta importación no está lista para importar.");
    await avanzar(s.org.id, iid, Date.now() + 40_000);
    revalidatePath(volver(iid));
    return "Arrancó la importación. Sigue sola en segundo plano: podés cerrar la pestaña.";
  });
}

/** Vuelve a dejar pendientes los SKU con error y retoma. */
export async function accionReintentarVs(fd: FormData) {
  const s = await entrarErp("importar_ver");
  const iid = id(fd);
  await intentar(volver(iid), async () => {
    await consulta("update importacion_vs_sku set resultado = null, motivo = null where importacion_id = $1 and organizacion_id = $2 and resultado = 'error'", [iid, s.org.id]);
    await consulta("update importacion_vs set estado = 'importando', error = null where id = $1 and organizacion_id = $2", [iid, s.org.id]);
    revalidatePath(volver(iid));
    return "Se reintentan los que dieron error, en segundo plano.";
  });
}
