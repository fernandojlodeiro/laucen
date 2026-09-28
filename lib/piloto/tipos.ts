// Parámetros de un piloto y formas de los datos que se guardan en jsonb.

export type Parametros = {
  categorias: { id: string; ruta: string }[];
  precioMin: number | null;       // precio de venta en Mercado Libre, en pesos
  precioMax: number | null;
  porCategoria: number;           // productos por lado y por categoría (3)
  vendidosMin?: number;           // no se busca en China lo que vendió menos (Fer, 28/9, #123; sin dato de ventas, entra)
  listado: number;                // publicaciones que se leen del listado de la categoría (50)
  modo: Modo;                     // buscar productos para traer en barco o en avión
  fleteM3Usd: number;             // barco: costo del flete por m³ (o por tonelada, lo que dé más)
  fleteKgUsd: number;             // avión: costo del flete por kilo (real o volumétrico, lo que dé más)
  dolar: number;                  // pesos por dólar
  // Flete como % del precio de venta. Barco: "seguro" desde seguroPct para
  // arriba (el avión no compite), "gris" entre grisPct y seguroPct, abajo
  // de grisPct no se busca. Avión: al revés (seguro hasta seguroPct, gris
  // hasta grisPct, más caro no se busca).
  seguroPct: number;
  grisPct: number;
  yuanPorDolar: number;           // para pasar los precios de 1688 a dólares
  minimoMax: number;              // pedido mínimo "razonable" (unidades)
  topeApifyUsd: number;           // tope de gasto de Apify de todo el piloto
  desdeCorrida?: number;          // usa los mismos productos de Mercado Libre de ese piloto (para comparar IAs)
  rehacerCaja?: boolean;          // con desdeCorrida: vuelve a leer medidas y caja de Mercado Libre (reglas nuevas)
  ia?: import("@/lib/ia").Proveedor; // qué IA busca, filtra y juzga (sin dato = Anthropic); para comparar (Fer, 28/9)
  dobleModelo?: boolean;          // la segunda mirada la hace Anthropic en vez de la IA del piloto (Fer, 28/9)
  sitios?: Sitio[];               // dónde buscar en China (sin dato = 1688 + Alibaba, pilotos viejos)
  soloListado?: boolean;          // (28/9) sólo los primeros del listado de la categoría, sin tendencias ni cruce
  soloLocal?: boolean;            // sólo publicaciones con envío local (sin compra internacional)
};

export type Sitio = "aliexpress" | "1688" | "alibaba";
export const SITIOS: Record<Sitio, string> = { aliexpress: "AliExpress", "1688": "1688", alibaba: "Alibaba" };

export const POR_DEFECTO: Omit<Parametros, "categorias"> = {
  precioMin: null, precioMax: null, porCategoria: 3, vendidosMin: 50, listado: 50,
  modo: "barco", fleteM3Usd: 140, fleteKgUsd: 8, dolar: 1500, seguroPct: 20, grisPct: 15,
  yuanPorDolar: 7.1, minimoMax: 500, topeApifyUsd: 10, sitios: ["aliexpress"], soloListado: true, soloLocal: true,
};

export type Modo = "barco" | "avion";
/** Dónde cae un producto según el flete: seguro (se busca), gris (se busca
 *  marcado "puede no ser rentable"), fuera (no se busca). */
export type Franja = "seguro" | "gris" | "fuera";

export type Caja = { largo: number; ancho: number; alto: number; kg: number; fuente: "mercadolibre" | "descripcion" | "web" | "claude" | "china"; nota?: string };

/** Lo que dice la publicación de China por dentro (Fer, 28/9: el precio de la
 *  búsqueda no coincide con el de la página; ahí están los precios por
 *  cantidad y la caja de envío). */
export type Tramo = { desde: number; hasta: number | null; usd: number };
export type Ficha = { ok: boolean; tramos?: Tramo[]; variantes?: { nombre: string; usd: number }[]; cajaDudosa?: string; caja?: { largo: number; ancho: number; alto: number; kg: number } | null; error?: string; muestra?: string };

export type Candidato = {
  sitio: Sitio;
  titulo: string;
  precioTexto: string | null;
  usd: number | null;             // precio unitario más bajo, en dólares
  minimo: number | null;
  foto: string | null;
  url: string | null;
  proveedor: string | null;
  fabrica: boolean | null;
  anios: number | null;
  ventas: string | null;
};

/** Del juez nuevo (piloto #5 en adelante) sólo vienen los "si" y "dudoso";
 *  los demás quedaron afuera en el prefiltro o el juez los descartó. */
export type Veredicto = { n: number; v: "si" | "dudoso" | "no"; motivo: string; unidades?: number; falta?: string; variante?: string };
export type Juicio = {
  veredictos: Veredicto[]; elegido: number | null; motivo: string; error?: string; nota?: string;
  componentes?: string;           // cómo el juez desarmó el producto de Mercado Libre ("2 colchones dobles + inflador + 2 almohadas")
  costoUsd?: number | null;       // costo en China de armar lo mismo (unidades × precio + faltantes estimados)
  preseleccion?: number[];        // los candidatos que pasaron el prefiltro barato
  ncm?: string;                   // la NCM que propone el juez para el producto de Mercado Libre
  descartes?: Record<string, string>; // motivo de cada candidato que dejó afuera el filtro previo (por número)
  ncmAlternativa?: string;        // otra NCM posible, si el juez duda
  fichas?: Record<string, Ficha>; // lo leído de la publicación de China de los "si" (por número)
  elegidoJuez?: number | null;    // el que eligió el juez con el precio de la búsqueda, antes de leer las fichas
  verificacion?: { n: number; igual: boolean; variante?: string; usdVariante?: number | null; usdMedida?: number | null; motivo?: string; extrasUsd?: number;
    medidas?: { largo: number; ancho: number; alto: number } | null;
    caja?: { largo: number; ancho: number; alto: number; kg: number } | null }[]; // segunda mirada con las fichas
  precioIncierto?: boolean;
  precioEstimado?: { usd: number; desde: number; hasta: number; posicion: number; de: number; variante: string };
  modelo?: string;                // el modelo de IA que juzgó       // el elegido no muestra precios por cantidad (precio por variante)
  incoherente?: string;           // la cuenta da menos de 50% sobre el costo aun después de replantear la búsqueda
  busquedaPrevia?: { en: string; motivo: string }; // la búsqueda que no encontró nada y se replanteó
};

/** Una publicación de Mercado Libre, normalizada (venga de donde venga). */
export type PubML = {
  publicidad?: boolean;           // publicación paga (aparece primera por publicidad, no por ventas)
  internacional?: boolean;        // compra internacional
  categoriaId?: string | null;    // si el actor la informa (karamelo sí, scrapesage no)
  itemId: string | null;
  productoId: string | null;
  titulo: string;
  url: string | null;
  foto: string | null;
  precio: number | null;
  vendidos: number | null;
  vendidosTexto: string | null;
  opiniones: number | null;
};

export type ListadoActor = { actor: string; url: string; ok: boolean; cantidad: number; costoUsd: number | null; runId?: string; error?: string; muestra?: string; descartadas?: number; publicidad?: number };

/** Lo que se guarda por categoría en piloto_corridas.avance. */
export type AvanceCategoria = {
  hecho: boolean;
  urlListado?: string;
  actores?: ListadoActor[];
  listado?: PubML[];              // las publicaciones del listado, ordenadas por vendidos
  palabras?: { palabra: string; encontrada: boolean; motivo?: string }[];
  cruce?: { buscado: string; vendido: string; como: "mismo producto" | "equivalente" }[];
  salteados?: { titulo: string; motivo: string }[];
  sinVendidos?: number;           // publicaciones del listado sin el dato de vendidos (Cowork #127) // del listado, los que no se buscan (no importables, pocas ventas)
  errores?: string[];
};
