// ¿Una publicación nueva entra al catálogo de ML? (Fer, 10/10). Según la marca del
// producto de catálogo y si es un catálogo de verdad o una página que armó ML:
//   · marca nuestra (Daitom, Deirolab, Tiendavirtual) → entra;
//   · marca propia de otro vendedor que no se toca (Nubbeo, Libercam, ST Smart Tech)
//     → el producto no se publica en esa cuenta (ML lo metería igual en ese catálogo);
//   · otra marca: si es un catálogo de verdad (marca de fábrica: Arduino, Mastech…)
//     entra; si es una página armada por ML con la marca de otro vendedor, no entra
//     y la publicación sale común.

import { ml, type CuentaMl } from "@/lib/mercadolibre/api";

export const MARCAS_NUESTRAS = ["daitom", "deirolab", "tiendavirtual"];
export const MARCAS_VETADAS = ["nubbeo", "libercam", "st smart tech"];

export type DecisionCatalogo = "entra" | "no_entra" | "no_publicar";

const normal = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function decidirCatalogo(marca: string | null, tipo: string | null): DecisionCatalogo {
  const m = normal(marca);
  if (MARCAS_NUESTRAS.includes(m)) return "entra";
  if (MARCAS_VETADAS.includes(m)) return "no_publicar";
  return tipo === "flex" ? "no_entra" : "entra";
}

const cache = new Map<string, Promise<{ marca: string | null; tipo: string | null; decision: DecisionCatalogo }>>();

/** Lee el producto de catálogo de ML (una vez por arranque) y decide. Si ML no contesta, no entra. */
export function catalogoParaAlta(cuenta: CuentaMl, productoId: string): Promise<{ marca: string | null; tipo: string | null; decision: DecisionCatalogo }> {
  let p = cache.get(productoId);
  if (!p) {
    p = (async () => {
      const r = await ml<{ type?: string; attributes?: { id: string; value_name?: string | null }[] }>(cuenta, "GET", `/products/${productoId}`);
      if (r.status !== 200) return { marca: null, tipo: null, decision: "no_entra" as const };
      const marca = r.datos.attributes?.find((a) => a.id === "BRAND")?.value_name ?? null;
      const tipo = r.datos.type ?? null;
      return { marca, tipo, decision: decidirCatalogo(marca, tipo) };
    })();
    cache.set(productoId, p);
    p.then((x) => { if (!x.tipo) cache.delete(productoId); }, () => cache.delete(productoId));
  }
  return p;
}
