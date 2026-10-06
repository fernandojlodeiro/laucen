// Cucardas como lista configurable (lib/listas/tipos.ts): "Descargar Excel"
// con los mismos filtros que la pantalla.

import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import type { Lista } from "@/lib/listas/tipos";

const USOS = "((select count(*) from producto_cucarda pc where pc.cucarda_id = c.id) + (select count(*) from familia_cucarda fc where fc.cucarda_id = c.id))";

export const LISTA_CUCARDAS: Lista = {
  pantalla: "cucardas",
  titulo: "Cucardas",
  ruta: "/catalogo/cucardas",
  permiso: "cucardas_ver",
  campos: [
    { clave: "nombre", titulo: "Cucarda", sql: "c.nombre", ancho: 24 },
    { clave: "color", titulo: "Color", sql: "c.color" },
    { clave: "orden", titulo: "Orden", sql: "c.orden", formato: "entero" },
    { clave: "estado", titulo: "Estado", sql: "c.estado", valor: (f) => (f.estado === "activa" ? "Activa" : "Archivada") },
    { clave: "usos", titulo: "Usos", sql: `${USOS}::int`, orden: USOS, formato: "entero" },
    { clave: "productos", titulo: "Productos", sql: "(select count(*) from producto_cucarda pc where pc.cucarda_id = c.id)::int", formato: "entero" },
    { clave: "familias", titulo: "Familias", sql: "(select count(*) from familia_cucarda fc where fc.cucarda_id = c.id)::int", formato: "entero" },
  ],
  enPantalla: ["nombre", "color", "orden", "estado", "usos"],
  consulta: async (ctx, sp) => ({
    desde: "cucarda c",
    donde: `c.organizacion_id = $1 and ${sqlBusqueda("$2", ["c.id::text", "c.nombre", "c.color"])}`,
    valores: [ctx.org, parametroBusqueda(sp.q, sp.contiene !== "1")],
    orden: "c.orden, c.nombre",
  }),
};
