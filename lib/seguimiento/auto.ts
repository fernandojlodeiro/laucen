// Seguimiento automático (Fer, 13/10): con lo que trajo una búsqueda de un producto, la IA marca cuáles son comparables
// (lib/seguimiento/comparables.ts), la búsqueda queda guardada con esa marca (se ve en la pestaña Seguimiento del
// producto) y, si se pide, las comparables más baratas se siguen solas, sin confirmar, hasta lo que diga
// Configuración › Seguimiento de publicaciones («Seguir solas por producto»).

import { una } from "@/lib/erp/base";
import { configSeguimiento, guardarBusqueda, seguirAutomaticas, type PubEncontrada } from "@/lib/seguimiento";
import { analizar, type Analisis } from "@/lib/seguimiento/comparables";

export type Resultado = Analisis & { seguidas: number };

/** Analiza la búsqueda de un producto, la guarda con la marca de la IA y (con `seguir`) sigue las comparables. */
export async function analizarBusqueda(org: string, productoId: number, texto: string, lista: PubEncontrada[], o: { seguir: boolean; ts?: Date }): Promise<Resultado> {
  const [p, conf] = await Promise.all([
    una<{ titulo: string; descripcion: string | null }>("select titulo, descripcion from producto where id = $1 and organizacion_id = $2", [productoId, org]),
    configSeguimiento(org),
  ]);
  const a = await analizar({ titulo: p?.titulo ?? texto, descripcion: p?.descripcion }, lista, conf.demoraDias);
  await guardarBusqueda(org, productoId, texto, a.lista);
  const seguidas = o.seguir && conf.autoMax > 0 ? await seguirAutomaticas(org, productoId, a.comparables.slice(0, conf.autoMax), o.ts) : 0;
  return { ...a, seguidas };
}
