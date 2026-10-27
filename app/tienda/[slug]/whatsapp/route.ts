// El botón de WhatsApp de la tienda: /tienda/<slug>/whatsapp?t=<texto>&p=<página>&e=<id del evento> (Fer, 26/10).
// Anota el clic con lo acreditado a esa visita (el sello de entradas del visitante y la regla de los 30 días,
// lib/publicidad/atribucion.ts), la página y el producto, y manda a WhatsApp con un código invisible al final del texto.
// Cuando entra ese mensaje, el chat se queda con ese origen (anotarOrigen, lib/mensajes/chats.ts). Le avisa el clic a
// Meta desde el servidor («Contact», con el mismo id que el píxel). Anda aunque el navegador corte Google y Meta.

import { cookies, headers } from "next/headers";
import { NextResponse, after } from "next/server";
import { consulta } from "@/lib/erp/base";
import { tiendaPorSlug, nombreTienda } from "@/lib/tienda/tienda";
import { atribucionDe, codigoRef, conCodigo, esRobot } from "@/lib/publicidad/atribucion";
import { registrarEvento, visitaActual } from "@/lib/tienda/visitantes";
import { enviarAMeta, fbcDe } from "@/lib/tienda/meta-capi";
import { whatsappDe } from "../catalogo";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const t = await tiendaPorSlug((await params).slug);
  const numero = t ? whatsappDe(t) : null;
  if (!t || !numero) return NextResponse.redirect(new URL("/", req.url), 302);
  const sp = new URL(req.url).searchParams;
  const texto = (sp.get("t") ?? "").trim().slice(0, 300) || `Hola ${nombreTienda(t)}, tengo una consulta.`;
  // Un robot que sigue el link: va a WhatsApp sin anotar nada.
  if (esRobot(req.headers.get("user-agent"))) return NextResponse.redirect(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, 302);
  // La página donde lo tocó: la manda el botón (?p=) y, si no, el navegador (referer).
  const pagina = (sp.get("p")?.startsWith("/") ? sp.get("p") : req.headers.get("referer"))?.slice(0, 500) ?? null;
  const producto = Number(/\/producto\/(\d+)/.exec(pagina ?? "")?.[1]) || null;
  const { visitante, entradas } = await visitaActual();
  const atribucion = atribucionDe(entradas, visitante, "web");
  let codigo: string | null = null;
  for (let i = 0; i < 5 && !codigo; i++) {
    const c = codigoRef();
    const r = await consulta<{ id: number }>(`
      insert into whatsapp_clic (organizacion_id, codigo, atribucion, pagina, producto_id, visitante) values ($1, $2, $3::jsonb, $4, $5, $6)
      on conflict (organizacion_id, codigo) do nothing returning id::int`,
      [t.organizacionId, c, JSON.stringify(atribucion), pagina, producto, visitante]).catch((e) => { console.error("[whatsapp-clic]", e); return []; });
    if (r.length) codigo = c;
  }
  await registrarEvento(t.organizacionId, "whatsapp", { productoId: producto, pagina });

  const evento = sp.get("e");
  if (evento && /^[\w-]{6,40}$/.test(evento)) {
    const [h, c] = [await headers(), await cookies()];
    const host = h.get("host");
    const anuncio = entradas?.anuncios.filter((a) => a.plataforma === "meta").at(-1);
    const datos = { ip: h.get("x-forwarded-for")?.split(",")[0].trim() ?? null, navegador: h.get("user-agent"),
      fbp: c.get("_fbp")?.value ?? null, fbc: fbcDe(c.get("_fbc")?.value, anuncio?.clid, anuncio?.ts) };
    after(() => enviarAMeta(host, { nombre: "Contact", id: evento, url: `https://${host}${pagina?.startsWith("/") ? pagina : ""}`, ...datos }));
  }
  // Si no se pudo anotar, igual se va a WhatsApp (sin código): la consulta no se pierde.
  const final = codigo ? conCodigo(texto, codigo) : texto;
  return NextResponse.redirect(`https://wa.me/${numero}?text=${encodeURIComponent(final)}`, 302);
}
