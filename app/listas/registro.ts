// Todas las listas configurables (lib/listas/tipos.ts), por su clave de
// pantalla: las usan "Descargar Excel" (/listas/<pantalla>/excel) y la
// configuración (/listas/<pantalla>/configurar). Una lista nueva se suma acá.

import type { Lista } from "@/lib/listas/tipos";
import { LISTA_PRODUCTOS } from "@/app/catalogo/productos/lista";
import { LISTA_FAMILIAS } from "@/app/catalogo/familias/lista";
import { LISTA_CUCARDAS } from "@/app/catalogo/cucardas/lista";
import { LISTA_PRECIOS, LISTA_LISTAS_PRECIOS } from "@/app/catalogo/precios/lista";
import { LISTA_PUBLICACIONES } from "@/app/catalogo/publicaciones/lista";
import { LISTA_VINCULAR_ML } from "@/app/catalogo/publicaciones/ml/lista";
import { LISTA_PEDIDOS } from "@/app/ventas/pedidos/lista";
import { LISTA_CLIENTES } from "@/app/ventas/clientes/lista";
import { LISTA_ENVIOS } from "@/app/ventas/envios/lista";
import { LISTA_PROVEEDORES } from "@/app/compras/proveedores/lista";
import { LISTA_FACTURAS_COMPRA } from "@/app/compras/facturas/lista";
import { LISTA_DESPACHOS } from "@/app/compras/despachos/lista";
import { LISTA_FACTURACION } from "@/app/administracion/facturacion/lista";
import { LISTA_TESORERIA } from "@/app/administracion/tesoreria/lista";
import { LISTA_CC_CLIENTES, LISTA_CC_PROVEEDORES } from "@/app/administracion/cuentas-corrientes/lista";
import { LISTA_DEPOSITOS, LISTA_UBICACIONES } from "@/app/stock/depositos/lista";
import { LISTA_RECEPCIONES } from "@/app/deposito/recepcion/lista";
import { LISTA_CANALES } from "@/app/config/canales/lista";
import { LISTA_COLA } from "@/app/config/canales/cola/lista";
import { LISTA_METODOS_ENVIO } from "@/app/config/envios/lista";
import { LISTA_REGLAS } from "@/app/config/reglas/lista";
import { LISTA_PRECIOS_ML, LISTA_EXCEPCIONES_ML, LISTA_VOLUMEN_ML } from "@/app/catalogo/precios-ml/lista";

export const LISTAS: Record<string, Lista> = Object.fromEntries(
  [
    LISTA_PRODUCTOS, LISTA_FAMILIAS, LISTA_CUCARDAS, LISTA_LISTAS_PRECIOS, LISTA_PRECIOS, LISTA_PUBLICACIONES, LISTA_VINCULAR_ML,
    LISTA_PEDIDOS, LISTA_CLIENTES, LISTA_ENVIOS,
    LISTA_PROVEEDORES, LISTA_FACTURAS_COMPRA, LISTA_DESPACHOS,
    LISTA_FACTURACION, LISTA_TESORERIA, LISTA_CC_CLIENTES, LISTA_CC_PROVEEDORES,
    LISTA_DEPOSITOS, LISTA_UBICACIONES, LISTA_RECEPCIONES,
    LISTA_CANALES, LISTA_COLA, LISTA_METODOS_ENVIO, LISTA_REGLAS,
    LISTA_PRECIOS_ML, LISTA_EXCEPCIONES_ML, LISTA_VOLUMEN_ML,
  ].map((l) => [l.pantalla, l]),
);
