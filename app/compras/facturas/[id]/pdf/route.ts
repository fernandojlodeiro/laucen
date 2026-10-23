// El PDF (o la foto) de la factura de compra subida, para verlo (o bajarlo con ?bajar=1).

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";
import { supabaseServer } from "@/lib/supabase";
import { respuestaPdf, textoPlano } from "@/lib/compras/archivo-pdf";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionActual();
  if (!sesion) return textoPlano("Tenés que entrar a Laucen para ver la factura.", 401);
  if (!tienePermiso(sesion.permisos, "compras_ver")) return textoPlano("No tenés permiso de compras.", 403);
  const id = Number((await params).id);
  const f = Number.isInteger(id) && id > 0
    ? await una<{ archivo: string | null; letra: string; punto_venta: number | null; numero: string | null }>(
      "select archivo, letra, punto_venta, numero::text from factura_compra where id = $1 and organizacion_id = $2", [id, sesion.org.id]) : null;
  if (!f) return textoPlano("Esa factura no existe.", 404);
  const bajar = new URL(req.url).searchParams.get("bajar") === "1";
  const nombre = `factura-${f.letra}-${String(f.punto_venta ?? 0).padStart(5, "0")}-${String(f.numero ?? id).padStart(8, "0")}`;
  // Una foto se devuelve como imagen.
  const ext = f.archivo?.match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase();
  if (f.archivo && ext && f.archivo.startsWith(`${sesion.org.id}/`)) {
    const { data, error } = await (await supabaseServer()).storage.from("importaciones").download(f.archivo);
    if (error || !data) return textoPlano("No se pudo traer el archivo. Probá de nuevo en un momento.", 502);
    return new Response(await data.arrayBuffer(), { headers: { "content-type": `image/${ext === "jpg" ? "jpeg" : ext}`,
      "content-disposition": `${bajar ? "attachment" : "inline"}; filename="${nombre}.${ext}"`, "cache-control": "private, no-store" } });
  }
  return respuestaPdf(sesion.org.id, f.archivo, `${nombre}.pdf`, bajar);
}
