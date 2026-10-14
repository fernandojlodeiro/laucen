"use server";

// Importar los seguimientos de Virtual Seller (lib/seguimiento/importar-vs.ts): el archivo ya está en Storage; se lee
// acá (si no es el informe, el error sale enseguida) y la grabación corre de fondo.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { una, consulta, motivoErp, ErrorErp } from "@/lib/erp/base";
import { supabaseServer } from "@/lib/supabase";
import { leerHtml, esHtml, abrirLibro, leerHoja } from "@/lib/importar/leer";
import { lanzarTarea } from "@/lib/tareas-fondo";
import { leerSeguimientosVs, importarSeguimientosVs, textoResumen } from "@/lib/seguimiento/importar-vs";

export async function accionImportarSeguimientosVs(a: { ruta: string; nombre: string }): Promise<{ ok: boolean; mensaje?: string }> {
  const s = await entrarErp("productos_ver");
  try {
    if (!a.ruta?.startsWith(`${s.org.id}/`) || a.ruta.includes("..")) throw new ErrorErp("El archivo no es de esta organización.");
    const sb = await supabaseServer();
    const { data, error } = await sb.storage.from("importaciones").download(a.ruta);
    if (error || !data) throw new ErrorErp("No se pudo bajar el archivo que subiste. Probá de nuevo.");
    const contenido = await data.arrayBuffer();
    const hoja = esHtml(contenido) ? leerHtml(contenido) : leerHoja((await abrirLibro(contenido)).worksheets[0]);
    const filas = leerSeguimientosVs(hoja);
    if (!filas.length) throw new ErrorErp("El archivo no tiene filas.");
    const imp = await una<{ id: number }>("insert into seguimiento_importacion (organizacion_id, archivo, usuario_id) values ($1, $2, $3) returning id::int",
      [s.org.id, a.nombre, s.usuario.id]);
    await lanzarTarea(s.org.id, s.usuario.id, "seguimientos-vs", "Importar seguimientos de Virtual Seller", async () => {
      try {
        const r = await importarSeguimientosVs(s.org.id, filas, a.nombre);
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
