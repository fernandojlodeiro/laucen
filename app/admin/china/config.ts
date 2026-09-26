// Actores de Apify que se comparan en el banco de China. `plataforma` decide
// qué búsqueda recibe (1688 → chino; Alibaba → inglés) y `tipo` si busca por
// texto o por foto.
export type Plataforma = "1688" | "alibaba";
export type Actor = { id: string; plataforma: Plataforma; tipo: "texto" | "imagen" };

export const ACTORES: Actor[] = [
  { id: "crawleast/1688-product-scraper", plataforma: "1688", tipo: "texto" },
  { id: "dami_studio/1688-wholesale-scraper", plataforma: "1688", tipo: "texto" },
  { id: "parseforge/1688-scraper", plataforma: "1688", tipo: "texto" },
  { id: "datahamster/alibaba-products", plataforma: "alibaba", tipo: "texto" },
  { id: "dami_studio/alibaba-com-scraper", plataforma: "alibaba", tipo: "texto" },
  { id: "memo23/alibaba-scraper", plataforma: "alibaba", tipo: "texto" },
  { id: "crawleast/1688-image-search-scraper", plataforma: "1688", tipo: "imagen" },
  { id: "devcake/scraper-by-image", plataforma: "1688", tipo: "imagen" },
];

/** Un actor escrito a mano ("usuario/nombre"): por el nombre se adivina
 *  para qué sirve (alibaba → Alibaba; image → por foto; si no, 1688). */
export function actorLibre(id: string): Actor | null {
  const limpio = id.trim().replace("~", "/");
  if (!/^[\w.-]+\/[\w.-]+$/.test(limpio)) return null;
  return {
    id: limpio,
    plataforma: /alibaba/i.test(limpio) ? "alibaba" : "1688",
    tipo: /image|photo|foto/i.test(limpio) ? "imagen" : "texto",
  };
}

export const MAX = 20;
export const TOPE_USD = 0.25;

export function urlBusqueda(plataforma: Plataforma, q: string) {
  return plataforma === "1688"
    ? `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(q)}&charset=utf8`
    : `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(q)}`;
}
