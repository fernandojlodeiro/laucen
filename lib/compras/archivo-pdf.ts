// El PDF guardado de un documento de compras (despacho, factura): se baja de Storage (bucket "importaciones") y se
// devuelve para ver en el navegador o, con ?bajar=1, para descargar (Fer, 23/10). Errores en texto llano: es lo que se
// ve en esa pestaña.

import { supabaseServer } from "@/lib/supabase";

export const textoPlano = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function respuestaPdf(org: string, ruta: string | null, nombre: string, bajar: boolean): Promise<Response> {
  if (!ruta) return textoPlano("No tiene el PDF guardado.", 404);
  if (!ruta.startsWith(`${org}/`)) return textoPlano("Ese archivo no es de esta organización.", 403);
  const sb = await supabaseServer();
  const { data, error } = await sb.storage.from("importaciones").download(ruta);
  if (error || !data) return textoPlano("No se pudo traer el PDF. Probá de nuevo en un momento.", 502);
  const limpio = nombre.replace(/[^\w.-]+/g, "_");
  return new Response(await data.arrayBuffer(), {
    headers: { "content-type": "application/pdf", "content-disposition": `${bajar ? "attachment" : "inline"}; filename="${limpio}"`, "cache-control": "private, no-store" },
  });
}
