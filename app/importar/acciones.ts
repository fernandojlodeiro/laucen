"use server";

// Importar datos: leer el Excel ya subido a Storage y borrar el registro de
// una importación. Mapear y ejecutar están en [id]/acciones.ts.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, motivoErp, ErrorErp } from "@/lib/erp/base";
import { intentar, id } from "@/lib/erp/acciones";
import { supabaseServer } from "@/lib/supabase";
import { esDestino } from "@/lib/importar/campos";
import { abrirLibro, leerHoja, guardarImportacion } from "@/lib/importar/leer";

export type ResultadoLectura = { id: number } | { hojas: string[] } | { motivo: string };

/** Baja el archivo de Storage, lo lee y crea la importación. Si el libro
 *  tiene más de una hoja y no se eligió ninguna, devuelve las hojas para
 *  que la persona elija. La llama el componente de subir (Subir.tsx). */
export async function accionLeerArchivo(args: { ruta: string; archivo: string; destino: string; hoja?: string | null }): Promise<ResultadoLectura> {
  const s = await entrarErp("importar_ver");
  try {
    if (!esDestino(args.destino)) throw new ErrorErp("Elegí qué querés importar.");
    // Sólo archivos de la propia organización.
    if (!args.ruta?.startsWith(`${s.org.id}/`) || args.ruta.includes("..")) throw new ErrorErp("El archivo no es de esta organización.");
    const sb = await supabaseServer();
    const { data, error } = await sb.storage.from("importaciones").download(args.ruta);
    if (error || !data) throw new ErrorErp("No se pudo bajar el archivo que subiste. Probá de nuevo.");
    const libro = await abrirLibro(await data.arrayBuffer());
    const nombres = libro.worksheets.map((h) => h.name);
    if (nombres.length > 1 && !args.hoja) return { hojas: nombres };
    const hoja = args.hoja ? libro.getWorksheet(args.hoja) : libro.worksheets[0];
    if (!hoja) throw new ErrorErp(`El archivo no tiene una hoja "${args.hoja}".`);
    const nuevo = await guardarImportacion(s.org.id, {
      destino: args.destino, archivo: args.archivo.slice(0, 200), ruta: args.ruta, hoja: hoja.name, datos: leerHoja(hoja), usuarioId: s.usuario.id,
    });
    revalidatePath("/importar");
    return { id: nuevo };
  } catch (e) {
    return { motivo: motivoErp(e) };
  }
}

export async function accionBorrarImportacion(fd: FormData) {
  const s = await entrarErp("importar_ver");
  await intentar("/importar", async () => {
    await consulta("delete from importacion where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    revalidatePath("/importar");
    return "Registro borrado (lo que ya se importó queda).";
  });
}
