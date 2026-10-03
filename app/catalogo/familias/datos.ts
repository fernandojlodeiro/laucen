// Los datos de la lista de familias, compartidos por la pantalla y su Excel:
// el árbol con lo que hereda cada una (descuento) y si es propia o viene de
// Mercado Libre. Las de ML (ml_categoria) no se editan ni se borran, y las
// propias sólo cuelgan de una raíz propia: "propia" = ella y todas las de
// arriba son propias.

import { consulta } from "@/lib/erp/base";
import { ordenarArbol } from "@/app/catalogo/productos/comun";

export type FilaFamilia = {
  id: number; padre_id: number | null; nombre: string; descripcion: string | null; descuento_pct: number | null; productos: number;
  ml_categoria: string | null;
};

export async function familiasConDatos(org: string) {
  const filas = await consulta<FilaFamilia>(`
    select f.id::int, f.padre_id::int, f.nombre, f.descripcion, f.descuento_pct::float8, f.ml_categoria,
           (select count(*) from producto p where p.familia_id = f.id)::int productos
      from familia f where f.organizacion_id = $1`, [org]);
  const porId = new Map(filas.map((f) => [f.id, f]));
  const arriba = (f: FilaFamilia) => {
    const salida: FilaFamilia[] = [];
    let p = f.padre_id != null ? porId.get(f.padre_id) : undefined;
    for (let i = 0; p && i < 50; i++) { salida.push(p); p = p.padre_id != null ? porId.get(p.padre_id) : undefined; }
    return salida;
  };
  /** Ella y todas las que cuelgan de ella. */
  const debajo = (id: number) => {
    const salida = new Set([id]);
    let crecio = true;
    while (crecio) {
      crecio = false;
      for (const f of filas) if (f.padre_id != null && salida.has(f.padre_id) && !salida.has(f.id)) { salida.add(f.id); crecio = true; }
    }
    return salida;
  };
  const arbol = ordenarArbol(filas).map((f) => {
    const ancestros = arriba(f);
    return {
      ...f,
      /** Descuento que hereda (el de la primera de arriba que tenga uno). */
      heredado: ancestros.find((a) => a.descuento_pct != null)?.descuento_pct ?? 0,
      deMl: f.ml_categoria != null,
      propia: f.ml_categoria == null && ancestros.every((a) => a.ml_categoria == null),
      totalProductos: [...debajo(f.id)].reduce((t, x) => t + (porId.get(x)?.productos ?? 0), 0),
    };
  });
  return { filas, arbol, debajo };
}
