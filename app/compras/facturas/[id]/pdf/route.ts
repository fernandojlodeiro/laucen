// El PDF (o la foto) de la factura de compra subida, para verlo (o bajarlo con ?bajar=1).

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";
import { supabaseServer } from "@/lib/supabase";
import { respuestaPdf, textoPlano } from "@/lib/compras/archivo-pdf";
import { bajarDelDrive, tokenDeAcceso } from "@/lib/google/drive";

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
  // Leída de una carpeta del Drive: se trae de ahí (lib/compras/drive-facturas.ts).
  if (f.archivo?.startsWith("drive:")) {
    try {
      const token = await tokenDeAcceso(sesion.org.id);
      const id = f.archivo.slice(6);
      const meta: { mimeType?: string } = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=mimeType`, { headers: { authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      const tipo = meta.mimeType?.startsWith("image/") ? meta.mimeType : "application/pdf";
      const ext = tipo === "application/pdf" ? "pdf" : tipo.split("/")[1].replace("jpeg", "jpg");
      return new Response(await bajarDelDrive(token, id), { headers: { "content-type": tipo,
        "content-disposition": `${bajar ? "attachment" : "inline"}; filename="${nombre}.${ext}"`, "cache-control": "private, no-store" } });
    } catch {
      return textoPlano("No se pudo traer el archivo del Drive (¿lo movieron o borraron?).", 502);
    }
  }
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
