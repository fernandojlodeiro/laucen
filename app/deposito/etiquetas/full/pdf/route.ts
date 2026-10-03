// El PDF de las etiquetas de Full (lib/deposito/etiquetas-full.ts). Lo abre
// "Imprimir" de Stock › Etiquetas › Full de Mercado Libre, en otra pestaña:
//   ?canal=<id>&e=<item>~<variación>~<cantidad>… (en el orden cargado)
//   &imp=termica|a4 (queda en una cookie) &desde=<1..30> (A4)
// Los títulos y códigos salen de la base, no de la dirección. Una
// publicación sin Código ML no se imprime. Los errores, en texto llano.

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { motivoErp } from "@/lib/erp/base";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { publicacionesFull, armarPdfFull, esImpresoraFull, COOKIE_IMPRESORA_FULL, MAXIMO_FULL, type EtiquetaFull } from "@/lib/deposito/etiquetas-full";

export const dynamic = "force-dynamic";

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  const sesion = await sesionActual();
  if (!sesion) return texto("Tenés que entrar a Laucen para imprimir.", 401);
  if (!tienePermiso(sesion.permisos, "etiquetas_ver")) return texto("No tenés permiso para imprimir etiquetas.", 403);
  await asegurarEsquemaErp();
  const p = new URL(req.url).searchParams;
  const canal = Number(p.get("canal")) || 0;
  const imp = esImpresoraFull(p.get("imp")) ? p.get("imp") as "termica" | "a4" : "termica";
  const pedidas = p.getAll("e").map((x) => {
    const [item, variacion = "", n = "0"] = x.split("~");
    return { item, variacion, cantidad: Math.max(0, Math.min(MAXIMO_FULL, Math.trunc(Number(n) || 0))) };
  }).filter((x) => /^[A-Z]{3}\d+$/.test(x.item) && x.cantidad > 0);
  if (!canal || !pedidas.length) return texto("No elegiste ninguna etiqueta. Volvé y agregá productos con su cantidad.", 400);

  try {
    const filas = await publicacionesFull(sesion.org.id, canal, pedidas.map(({ item, variacion }) => ({ item, variacion })));
    const de = new Map(filas.map((f) => [`${f.item_id}~${f.variation_id}`, f]));
    const etiquetas: EtiquetaFull[] = [];
    for (const x of pedidas) {
      const f = de.get(`${x.item}~${x.variacion}`);
      if (!f?.codigo) continue;
      for (let i = 0; i < x.cantidad && etiquetas.length < MAXIMO_FULL; i++) etiquetas.push({ codigo: f.codigo, titulo: f.titulo, variante: f.atributos });
    }
    if (!etiquetas.length) return texto("Ninguna de esas publicaciones tiene Código ML (el de Full): no hay nada para imprimir.", 400);
    const { pdf } = await armarPdfFull(etiquetas, { impresora: imp, desde: Number(p.get("desde")) || 1 });
    return new Response(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="etiquetas-full-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "cache-control": "no-store",
        "set-cookie": `${COOKIE_IMPRESORA_FULL}=${imp}; Path=/; Max-Age=31536000; SameSite=Lax`,
      },
    });
  } catch (e) {
    return texto(motivoErp(e), 500);
  }
}
