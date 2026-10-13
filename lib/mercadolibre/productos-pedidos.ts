// Cuando alguien pregunta por OTROS productos además del de la publicación (Fer, 13/10: arma un carrito y pide
// «1x Sensor BME280, 1x Sensor DHT22»), la IA tiene que buscarlos entre las publicaciones propias de esa cuenta.
// Un pedido corto a la IA chica separa qué productos nombra; después se buscan como con el "#" (primero el mismo
// plan que la publicación de la pregunta) y se le pasan a la IA que redacta, con link y stock. Nunca tira: si
// algo falla, la respuesta sigue como siempre.

import { pedirClaude, hayClaude } from "@/lib/claude";
import { buscarPublicaciones } from "@/lib/mercadolibre/buscar-publicaciones";

export type ProductoPedido = {
  pedido: string;
  publicaciones: { titulo: string; link: string; plan: string | null; disponible: number | null }[];
};

const INSTRUCCIONES = `Te paso el título de una publicación de una tienda y la pregunta de un comprador. Si el comprador nombra OTROS productos distintos al de la publicación (por ejemplo una lista de cosas que quiere comprar juntas), listalos. Si pregunta sólo por el producto de la publicación, o por envío, precio o garantía, devolvé la lista vacía.
Para cada producto devolvé "pedido" (como lo nombró, corto) y "palabras": de 1 a 3 palabras o códigos que lo identifiquen mejor (modelo, tipo de pieza; sin cantidades, sin "1x", sin palabras sueltas como "placa" o "para").
Contestá SOLO con JSON, sin texto antes ni después: {"productos":[{"pedido":"Sensor BME280","palabras":["BME280"]}]}. Hasta 6 productos.`;

/** Lee el JSON de la IA chica (puro: se prueba sin red). Tolera texto alrededor. */
export function leerProductos(texto: string): { pedido: string; palabras: string[] }[] {
  const m = /\{[\s\S]*\}/.exec(texto);
  if (!m) return [];
  try {
    const j = JSON.parse(m[0]) as { productos?: { pedido?: unknown; palabras?: unknown }[] };
    return (j.productos ?? []).slice(0, 6).flatMap((p) => {
      const palabras = (Array.isArray(p.palabras) ? p.palabras : []).map((x) => String(x).replace(/[?*]/g, " ").trim()).filter((x) => x.length >= 2).slice(0, 3);
      return typeof p.pedido === "string" && p.pedido.trim() && palabras.length ? [{ pedido: p.pedido.trim().slice(0, 80), palabras }] : [];
    });
  } catch { return []; }
}

export async function buscarProductosPedidos(org: string, canalId: number, o: { pregunta: string; tituloPublicacion: string | null; itemId: string; plan: string | null }): Promise<ProductoPedido[]> {
  if (!hayClaude()) return [];
  try {
    const r = await pedirClaude({
      system: INSTRUCCIONES, modelo: "chico", maxTokens: 400,
      contenido: `PUBLICACIÓN: ${o.tituloPublicacion ?? "(sin título)"}\n\nPREGUNTA:\n${o.pregunta.slice(0, 1500)}`,
    });
    if ("error" in r) return [];
    const pedidos = leerProductos(r.texto);
    const salida: ProductoPedido[] = [];
    for (const p of pedidos) {
      // Primero todas las palabras juntas en el mismo dato ("a?b"); si no hay nada, sólo la primera (la más específica).
      let enc = await buscarPublicaciones(org, p.palabras.join("?"), { canalId, plan: o.plan, limite: 6 });
      if (!enc.length && p.palabras.length > 1) enc = await buscarPublicaciones(org, p.palabras[0], { canalId, plan: o.plan, limite: 6 });
      salida.push({
        pedido: p.pedido,
        publicaciones: enc.filter((e) => e.item_id !== o.itemId).slice(0, 3).map((e) => ({ titulo: e.titulo, link: e.permalink, plan: e.planTexto, disponible: e.disponible })),
      });
    }
    return salida;
  } catch (e) {
    console.error("[preguntas] productos pedidos", e);
    return [];
  }
}
