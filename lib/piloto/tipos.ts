// Parámetros de un piloto y formas de los datos que se guardan en jsonb.

export type Parametros = {
  categorias: { id: string; ruta: string }[];
  precioMin: number | null;       // precio de venta en Mercado Libre, en pesos
  precioMax: number | null;
  porCategoria: number;           // productos por lado y por categoría (3)
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
};

export const POR_DEFECTO: Omit<Parametros, "categorias"> = {
  precioMin: null, precioMax: null, porCategoria: 3, listado: 50,
  modo: "barco", fleteM3Usd: 140, fleteKgUsd: 8, dolar: 1500, seguroPct: 20, grisPct: 15,
  yuanPorDolar: 7.1, minimoMax: 500, topeApifyUsd: 10,
};

export type Modo = "barco" | "avion";
/** Dónde cae un producto según el flete: seguro (se busca), gris (se busca
 *  marcado "puede no ser rentable"), fuera (no se busca). */
export type Franja = "seguro" | "gris" | "fuera";

export type Caja = { largo: number; ancho: number; alto: number; kg: number; fuente: "claude" | "china"; nota?: string };

export type Candidato = {
  sitio: "1688" | "alibaba";
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

export type Veredicto = { n: number; v: "si" | "dudoso" | "no"; motivo: string };
export type Juicio = { veredictos: Veredicto[]; elegido: number | null; motivo: string; error?: string };

/** Una publicación de Mercado Libre, normalizada (venga de donde venga). */
export type PubML = {
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

export type ListadoActor = { actor: string; url: string; ok: boolean; cantidad: number; costoUsd: number | null; error?: string };

/** Lo que se guarda por categoría en piloto_corridas.avance. */
export type AvanceCategoria = {
  hecho: boolean;
  urlListado?: string;
  actores?: ListadoActor[];
  listado?: PubML[];              // las publicaciones del listado, ordenadas por vendidos
  palabras?: { palabra: string; encontrada: boolean; motivo?: string }[];
  cruce?: { buscado: string; vendido: string; como: "mismo producto" | "equivalente" }[];
  errores?: string[];
};
