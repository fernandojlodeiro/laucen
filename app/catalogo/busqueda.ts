// Dónde busca lo escrito cada pantalla del catálogo (regla de lib/busqueda.ts: todos los datos de
// texto del producto y de sus variaciones, y el número interno).

import type { CampoBusqueda } from "@/lib/busqueda";

/** Los datos de texto de un producto (alias `p`). */
export const camposProducto = (p = "p"): string[] => [
  `${p}.id::text`, `${p}.sku_base`, `${p}.titulo`, `${p}.descripcion`, `${p}.marca`, `${p}.codigo_barras`,
  `${p}.modelo`, `${p}.linea`, `${p}.garantia`, `${p}.condicion`, `${p}.categoria_ml`,
];

/** Los datos de texto de una variación (alias `v`). */
export const camposVariacion = (v = "v"): string[] => [`${v}.id::text`, `${v}.sku`, `${v}.titulo`, `${v}.codigo_barras`];

/** Para una fila de producto `p`: sus datos y los de cualquiera de sus variaciones. */
export const camposProductoConVariaciones = (p = "p"): CampoBusqueda[] => [
  ...camposProducto(p),
  { de: `select 1 from variacion vb where vb.producto_id = ${p}.id`, campos: camposVariacion("vb") },
];

/** Para una fila de variación `v` con su producto `p`: los datos de los dos. */
export const camposVariacionYProducto = (v = "v", p = "p"): string[] => [...camposVariacion(v), ...camposProducto(p)];
