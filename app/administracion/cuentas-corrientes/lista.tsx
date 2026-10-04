// Saldos de cuentas corrientes (clientes y proveedores) como listas
// configurables (lib/listas/tipos.ts), en modo memoria: "Descargar Excel"
// con los mismos saldos que la pantalla.

import { saldos, type Tercero } from "@/lib/administracion/cc";
import type { Lista } from "@/lib/listas/tipos";

function listaCc(tercero: Tercero): Lista {
  return {
    pantalla: tercero === "cliente" ? "cc_clientes" : "cc_proveedores",
    titulo: tercero === "cliente" ? "Cuentas corrientes de clientes" : "Cuentas corrientes de proveedores",
    ruta: tercero === "cliente" ? "/administracion/cuentas-corrientes" : "/administracion/cuentas-corrientes/proveedores",
    permiso: "cuentas_corrientes_ver",
    campos: [
      { clave: "id", titulo: "N.º", formato: "entero" },
      { clave: "nombre", titulo: tercero === "cliente" ? "Cliente" : "Proveedor", ancho: 30 },
      { clave: "saldo", titulo: "Saldo $", formato: "pesos" },
      { clave: "vencido", titulo: "Vencido $", formato: "pesos" },
      { clave: "ultimo", titulo: "Último movimiento", formato: "fecha" },
    ],
    enPantalla: ["nombre", "saldo", "vencido", "ultimo"],
    filas: (ctx, sp) => saldos(ctx.org, tercero, Number(sp.rs) || null),
  };
}

export const LISTA_CC_CLIENTES = listaCc("cliente");
export const LISTA_CC_PROVEEDORES = listaCc("proveedor");
