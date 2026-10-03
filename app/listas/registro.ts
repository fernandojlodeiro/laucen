// Todas las listas configurables (lib/listas/tipos.ts), por su clave de
// pantalla: las usan "Descargar Excel" (/listas/<pantalla>/excel) y la
// configuración (/listas/<pantalla>/configurar). Una lista nueva se suma acá.

import type { Lista } from "@/lib/listas/tipos";
import { LISTA_PRODUCTOS } from "@/app/catalogo/productos/lista";
import { LISTA_PEDIDOS } from "@/app/ventas/pedidos/lista";
import { LISTA_CLIENTES } from "@/app/ventas/clientes/lista";
import { LISTA_FACTURAS_COMPRA } from "@/app/compras/facturas/lista";
import { LISTA_FACTURACION } from "@/app/administracion/facturacion/lista";
import { LISTA_CUCARDAS } from "@/app/catalogo/cucardas/lista";
import { LISTA_FAMILIAS } from "@/app/catalogo/familias/lista";
import { LISTA_PUBLICACIONES } from "@/app/catalogo/publicaciones/lista";

export const LISTAS: Record<string, Lista> = Object.fromEntries(
  [
    LISTA_PRODUCTOS, LISTA_FAMILIAS, LISTA_CUCARDAS, LISTA_PUBLICACIONES,
    LISTA_PEDIDOS, LISTA_CLIENTES,
    LISTA_FACTURAS_COMPRA,
    LISTA_FACTURACION,
  ].map((l) => [l.pantalla, l]),
);
