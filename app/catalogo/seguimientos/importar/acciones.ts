"use server";

// Importar los seguimientos de Virtual Seller (lib/seguimiento/importar-vs.ts): el archivo ya está en Storage; se lee
// acá (si no es el informe, el error sale enseguida) y la grabación corre de fondo. «Volver a importar» relee el mismo
// archivo (la importación no duplica: suma lo que antes no entró).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { una, consulta, motivoErp, ErrorErp } from "@/lib/erp/base";
import { id } from "@/lib/erp/acciones";
import { supabaseServer } from "@/lib/supabase";
import { leerHtml, esHtml, abrirLibro, leerHoja } from "@/lib/importar/leer";
import { lanzarTarea } from "@/lib/tareas-fondo";
import { leerSeguimientosVs, importarSeguimientosVs, textoResumen } from "@/lib/seguimiento/importar-vs";

async function importar(s: Awaited<ReturnType<typeof entrarErp>>, ruta: string, nombre: string): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    if (!ruta?.startsWith(`${s.org.id}/`) || ruta.includes("..")) throw new ErrorErp("El archivo no es de esta organización.");
    const sb = await supabaseServer();
    const { data, error } = await sb.storage.from("importaciones").download(ruta);
    if (error || !data) throw new ErrorErp("No se pudo bajar el archivo. Probá de nuevo.");
    const contenido = await data.arrayBuffer();
    const hoja = esHtml(contenido) ? leerHtml(contenido) : leerHoja((await abrirLibro(contenido)).worksheets[0]);
    const filas = leerSeguimientosVs(hoja);
    if (!filas.length) throw new ErrorErp("El archivo no tiene filas.");
    const imp = await una<{ id: number }>("insert into seguimiento_importacion (organizacion_id, archivo, usuario_id, ruta) values ($1, $2, $3, $4) returning id::int",
      [s.org.id, nombre, s.usuario.id, ruta]);
    await lanzarTarea(s.org.id, s.usuario.id, "seguimientos-vs", "Importar seguimientos de Virtual Seller", async () => {
      try {
        const r = await importarSeguimientosVs(s.org.id, filas, nombre);
        await consulta("update seguimiento_importacion set estado = 'terminada', resumen = $2::jsonb where id = $1", [imp!.id, JSON.stringify(r)]);
        revalidatePath("/catalogo/seguimientos/importar");
        return textoResumen(r);
      } catch (e) {
        await consulta("update seguimiento_importacion set estado = 'error', error = $2 where id = $1", [imp!.id, motivoErp(e)]);
        throw e;
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}

export async function accionImportarSeguimientosVs(a: { ruta: string; nombre: string }): Promise<{ ok: boolean; mensaje?: string }> {
  const s = await entrarErp("productos_ver");
  return importar(s, a.ruta, a.nombre);
}

/** «Volver a importar»: el mismo archivo de una importación anterior. */
export async function accionReimportarSeguimientosVs(fd: FormData): Promise<{ ok: boolean; mensaje?: string }> {
  const s = await entrarErp("productos_ver");
  const f = await una<{ ruta: string | null; archivo: string }>("select ruta, archivo from seguimiento_importacion where id = $1 and organizacion_id = $2", [id(fd), s.org.id]);
  if (!f?.ruta) return { ok: false, mensaje: "De esa importación no quedó el archivo: subilo de nuevo." };
  return importar(s, f.ruta, f.archivo);
}
