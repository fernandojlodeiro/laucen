// Las fotos (y archivos) que mandan los compradores en los mensajes de Mercado Libre y en los reclamos (Fer, 29/10:
// no se veían en Laucen). Laucen las pide a ML con la llave de la cuenta, en el momento, y las muestra; no las guarda.
//   ?m=<id del mensaje de ML>&f=<archivo>     → GET /messages/attachments/{f}?tag=post_sale&site_id=MLA
//   ?r=<id del mensaje del reclamo>&f=<archivo> → GET /post-purchase/v1/claims/{reclamo}/attachments/{f}/download
// Sólo un archivo que el mensaje tiene anotado (nunca una ruta cualquiera).

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";
import { cuentaDelCanal, mlBinario } from "@/lib/mercadolibre/api";

export const dynamic = "force-dynamic";

const ARCHIVO = /^[\w.-]{1,200}$/;

export async function GET(req: Request) {
  const s = await sesionActual();
  if (!s) return new Response("sin sesión", { status: 401 });
  const puede = (p: Parameters<typeof tienePermiso>[1]) => tienePermiso(s.permisos, p);
  const q = new URL(req.url).searchParams;
  const f = q.get("f") ?? "";
  if (!ARCHIVO.test(f)) return new Response("archivo inválido", { status: 400 });
  const tiene = (col: string) => `exists (select 1 from jsonb_array_elements(coalesce(${col}, '[]'::jsonb)) a where a ->> 'filename' = $3)`;
  let canal: number | null = null, ruta = "";
  if (q.get("m") && (puede("preguntas_ver") || puede("mensajes_ver"))) {
    const m = await una<{ canal_id: number | null }>(`select canal_id::int from meli_mensaje where id = $1 and organizacion_id = $2 and ${tiene("adjuntos")}`, [q.get("m"), s.org.id, f]);
    if (m) { canal = m.canal_id; ruta = `/messages/attachments/${encodeURIComponent(f)}?tag=post_sale&site_id=MLA`; }
  } else if (q.get("r") && puede("reclamos_ver")) {
    const r = await una<{ canal_id: number | null; claim: string | null }>(`
      select r.canal_id::int, r.id_externo claim from reclamo_mensaje m join reclamo r on r.id = m.reclamo_id
       where m.id = $1 and m.organizacion_id = $2 and r.origen = 'mercadolibre' and ${tiene("m.adjuntos")}`, [Number(q.get("r")) || 0, s.org.id, f]);
    if (r?.claim) { canal = r.canal_id; ruta = `/post-purchase/v1/claims/${encodeURIComponent(r.claim)}/attachments/${encodeURIComponent(f)}/download`; }
  }
  if (!canal || !ruta) return new Response("no encontrado", { status: 404 });
  const cuenta = await cuentaDelCanal(s.org.id, canal);
  const a = cuenta ? await mlBinario(cuenta, ruta) : null;
  if (!a) return new Response("Mercado Libre no dio el archivo", { status: 502 });
  return new Response(a.datos, { headers: { "content-type": a.tipo, "cache-control": "private, max-age=86400" } });
}
