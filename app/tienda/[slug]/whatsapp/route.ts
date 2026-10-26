// El botón de WhatsApp de la tienda: /tienda/<slug>/whatsapp?t=<texto> (Fer, 26/10).
// Anota el clic con el origen de la visita (la galleta lc_origen que deja el link de un anuncio, la página donde lo tocó
// y el producto, si era una ficha) y manda a WhatsApp con el código en el texto: «Hola Daitom, tengo una consulta.
// (ref A7K2)». Cuando entra ese mensaje, el chat se queda con ese origen (anotarOrigen, lib/mensajes/chats.ts).
// Anda aunque el navegador corte Google Analytics: todo pasa en Laucen.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { consulta } from "@/lib/erp/base";
import { tiendaPorSlug, nombreTienda } from "@/lib/tienda/tienda";
import { codigoRef, conRef, deGalleta, GALLETA_ORIGEN } from "@/lib/publicidad/atribucion";
import { whatsappDe } from "../catalogo";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const t = await tiendaPorSlug((await params).slug);
  const numero = t ? whatsappDe(t) : null;
  if (!t || !numero) return NextResponse.redirect(new URL("/", req.url), 302);
  const texto = (new URL(req.url).searchParams.get("t") ?? "").trim().slice(0, 300) || `Hola ${nombreTienda(t)}, tengo una consulta.`;
  // La página donde lo tocó: la manda el botón (?p=) y, si no, el navegador (referer).
  const sp = new URL(req.url).searchParams;
  const pagina = (sp.get("p")?.startsWith("/") ? sp.get("p") : req.headers.get("referer"))?.slice(0, 500) ?? null;
  const producto = Number(/\/producto\/(\d+)/.exec(pagina ?? "")?.[1]) || null;
  const atribucion = deGalleta((await cookies()).get(GALLETA_ORIGEN)?.value);
  let codigo: string | null = null;
  for (let i = 0; i < 5 && !codigo; i++) {
    const c = codigoRef();
    const r = await consulta<{ id: number }>(`
      insert into whatsapp_clic (organizacion_id, codigo, atribucion, pagina, producto_id) values ($1, $2, $3::jsonb, $4, $5)
      on conflict (organizacion_id, codigo) do nothing returning id::int`,
      [t.organizacionId, c, atribucion ? JSON.stringify(atribucion) : null, pagina, producto]).catch((e) => { console.error("[whatsapp-clic]", e); return []; });
    if (r.length) codigo = c;
  }
  // Si no se pudo anotar, igual se va a WhatsApp (sin código): la consulta no se pierde.
  const final = codigo ? conRef(texto, codigo) : texto;
  return NextResponse.redirect(`https://wa.me/${numero}?text=${encodeURIComponent(final)}`, 302);
}
