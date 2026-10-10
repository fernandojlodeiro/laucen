// Marcas como lista configurable (lib/listas/tipos.ts): "Descargar Excel" con
// los mismos filtros que la pantalla.

import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import type { Lista } from "@/lib/listas/tipos";

export const PRODUCTOS_MARCA = "(select count(*) from producto p where p.marca_id = m.id)";

export const LISTA_MARCAS: Lista = {
  pantalla: "marcas",
  titulo: "Marcas",
  ruta: "/catalogo/marcas",
  permiso: "productos_ver",
  campos: [
    { clave: "id", titulo: "N.º", sql: "m.id::int", formato: "entero" },
    { clave: "nombre", titulo: "Marca", sql: "m.nombre", orden: "lower(m.nombre)", ancho: 30 },
    { clave: "productos", titulo: "Productos", sql: `${PRODUCTOS_MARCA}::int`, orden: PRODUCTOS_MARCA, formato: "entero" },
  ],
  enPantalla: ["id", "nombre", "productos"],
  consulta: async (ctx, sp) => ({
    desde: "marca m",
    donde: `m.organizacion_id = $1 and ${sqlBusqueda("$2", ["m.id::text", "m.nombre"])}`,
    valores: [ctx.org, parametroBusqueda(sp.q, sp.contiene !== "1")],
    orden: "lower(m.nombre)",
  }),
};
