// Familias como lista configurable (lib/listas/tipos.ts), en modo memoria (es
// un árbol con lo heredado calculado): "Descargar Excel" con la misma
// búsqueda que la pantalla. Sin elegir orden, en el orden del árbol.

import { coincideBusqueda } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import type { Lista } from "@/lib/listas/tipos";
import { familiasConDatos } from "./datos";

export const LISTA_FAMILIAS: Lista = {
  pantalla: "familias",
  titulo: "Familias",
  ruta: "/catalogo/familias",
  permiso: "familias_ver",
  campos: [
    { clave: "nombre", titulo: "Familia", ancho: 28 },
    { clave: "etiqueta", titulo: "Camino completo", ancho: 50 },
    { clave: "nivel", titulo: "Nivel", valor: (f) => f.nivel + 1, formato: "entero" },
    { clave: "padre", titulo: "Familia padre", ancho: 28 },
    { clave: "origen", titulo: "Origen", valor: (f) => (f.deMl ? "Mercado Libre" : "Propia") },
    { clave: "ml_categoria", titulo: "Categoría de ML" },
    { clave: "descuento", titulo: "Descuento %", valor: (f) => f.descuento_pct ?? f.heredado, formato: "pct" },
    { clave: "descuento_propio", titulo: "Descuento propio %", valor: (f) => f.descuento_pct, formato: "pct" },
    { clave: "cucardas", titulo: "Cucardas", ancho: 30 },
    { clave: "productos", titulo: "Productos", formato: "entero" },
    { clave: "total_productos", titulo: "Productos con las subfamilias", valor: (f) => f.totalProductos, formato: "entero" },
    { clave: "descripcion", titulo: "Descripción", ancho: 40 },
  ],
  enPantalla: ["nombre", "origen", "descuento", "cucardas", "productos"],
  filas: async (ctx, sp) => {
    const q = sp.q?.trim() ?? "";
    const comienza = sp.contiene !== "1";
    const [{ arbol }, cucardas] = await Promise.all([
      familiasConDatos(ctx.org),
      consulta<{ familia_id: number; nombres: string }>(`
        select fc.familia_id::int, string_agg(c.nombre, ', ' order by c.orden, c.nombre) nombres
          from familia_cucarda fc join cucarda c on c.id = fc.cucarda_id
         where fc.organizacion_id = $1 group by fc.familia_id`, [ctx.org]),
    ]);
    const nombre = new Map(arbol.map((f) => [f.id, f.nombre]));
    const deCucardas = new Map(cucardas.map((c) => [c.familia_id, c.nombres]));
    return arbol.filter((f) => coincideBusqueda([String(f.id), f.nombre, f.descripcion, f.ml_categoria], q, comienza)).map((f) => ({
      ...f, padre: f.padre_id != null ? nombre.get(f.padre_id) ?? null : null, cucardas: deCucardas.get(f.id) ?? null,
    }));
  },
};
