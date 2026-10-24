// El PDF (o la foto) de una declaración jurada subida, para verlo (o bajarlo con ?bajar=1).

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";
import { supabaseServer } from "@/lib/supabase";
import { respuestaPdf, textoPlano } from "@/lib/compras/archivo-pdf";
import { bajarDelDrive, tokenDeAcceso } from "@/lib/google/drive";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionActual();
  if (!sesion) return textoPlano("Tenés que entrar a Laucen para ver la declaración.", 401);
  if (!tienePermiso(sesion.permisos, "impuestos_ver")) return textoPlano("No tenés permiso de Impuestos.", 403);
  const id = Number((await params).id);
  const d = Number.isInteger(id) && id > 0
    ? await una<{ archivo: string | null; archivo_nombre: string | null; impuesto: string; periodo: string }>("select archivo, archivo_nombre, impuesto, periodo from ddjj where id = $1 and organizacion_id = $2", [id, sesion.org.id]) : null;
  if (!d) return textoPlano("Esa declaración no existe.", 404);
  const bajar = new URL(req.url).searchParams.get("bajar") === "1";
  const nombre = `ddjj-${d.impuesto}-${d.periodo}`;
  // Leída del Drive del contador: se trae de ahí.
  if (d.archivo?.startsWith("drive:")) {
    try {
      const datos = await bajarDelDrive(await tokenDeAcceso(sesion.org.id), d.archivo.slice(6));
      const tipo = d.archivo_nombre?.match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase();
      return new Response(datos, { headers: { "content-type": tipo ? `image/${tipo === "jpg" ? "jpeg" : tipo}` : "application/pdf",
        "content-disposition": `${bajar ? "attachment" : "inline"}; filename="${nombre}.${tipo ?? "pdf"}"`, "cache-control": "private, no-store" } });
    } catch {
      return textoPlano("No se pudo traer el archivo del Drive (¿lo movieron o borraron?).", 502);
    }
  }
  const ext = d.archivo?.match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase();
  if (d.archivo && ext && d.archivo.startsWith(`${sesion.org.id}/`)) {
    const { data, error } = await (await supabaseServer()).storage.from("importaciones").download(d.archivo);
    if (error || !data) return textoPlano("No se pudo traer el archivo. Probá de nuevo en un momento.", 502);
    return new Response(await data.arrayBuffer(), { headers: { "content-type": `image/${ext === "jpg" ? "jpeg" : ext}`,
      "content-disposition": `${bajar ? "attachment" : "inline"}; filename="${nombre}.${ext}"`, "cache-control": "private, no-store" } });
  }
  return respuestaPdf(sesion.org.id, d.archivo, `${nombre}.pdf`, bajar);
}
