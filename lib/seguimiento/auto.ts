// Seguimiento automático (Fer, 13/10): con lo que trajo una búsqueda de un producto, la IA marca cuáles son comparables
// (lib/seguimiento/comparables.ts), la búsqueda queda guardada con esa marca (se ve en la pestaña Seguimiento del
// producto) y, si se pide, las comparables más baratas se siguen solas, sin confirmar, hasta lo que diga
// Configuración › Seguimiento de publicaciones («Seguir solas por producto»).

import { una } from "@/lib/erp/base";
import { configSeguimiento, descartadas, guardarBusqueda, seguirAutomaticas, type PubEncontrada } from "@/lib/seguimiento";
import { analizar, type Analisis } from "@/lib/seguimiento/comparables";

export type Resultado = Analisis & { seguidas: number };

/** Analiza la búsqueda de un producto, la guarda con la marca de la IA y (con `seguir`) sigue las comparables. */
export async function analizarBusqueda(org: string, productoId: number, texto: string, lista: PubEncontrada[], o: { seguir: boolean; ts?: Date }): Promise<Resultado> {
  const [p, conf, fuera] = await Promise.all([
    // Con la Clásica de hoy de la variación principal: las de precio muy distinto no se comparan.
    una<{ titulo: string; descripcion: string | null; clasica: number | null }>(`
      select p.titulo, p.descripcion,
             (select pd.lista_ars::float8 from lista_precios l, precio_de(p.organizacion_id, va.id, l.id) pd
               where l.organizacion_id = p.organizacion_id
               order by lower(l.nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') desc, l.orden, l.id limit 1) clasica
        from producto p left join variacion va on va.producto_id = p.id and va.es_default
       where p.id = $1 and p.organizacion_id = $2`, [productoId, org]),
    configSeguimiento(org),
    descartadas(org, productoId),
  ]);
  // Las excluidas a mano (caja «Excluir» de la búsqueda) no se juzgan ni cuentan para el precio de mercado (Fer, 22/10).
  const a = await analizar({ titulo: p?.titulo ?? texto, descripcion: p?.descripcion, clasica: p?.clasica ?? null }, lista.filter((x) => !fuera.has(x.itemId)), conf.demoraDias);
  await guardarBusqueda(org, productoId, texto, [...a.lista, ...lista.filter((x) => fuera.has(x.itemId)).map((x) => ({ ...x, comparable: false, motivoIa: "Excluida a mano" }))]);
  const seguidas = o.seguir && conf.autoMax > 0 ? await seguirAutomaticas(org, productoId, a.comparables.slice(0, conf.autoMax), o.ts) : 0;
  return { ...a, seguidas };
}
