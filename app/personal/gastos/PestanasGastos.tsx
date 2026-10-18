// Las pestañas de Mis gastos: el tablero, revisar movimiento por movimiento, las cuentas destino de las
// transferencias y los proveedores (lib/personal/destinatarios.ts).

import Pestanas from "@/app/componentes/Pestanas";
import { agruparDestinatarios } from "@/lib/personal/destinatarios";
import type { Clasificado } from "@/lib/mercadopago/gastos";

export type ActivaGastos = "tablero" | "revisar" | "destinatarios" | "proveedores";

/** Las cuentas de cada pestaña, a partir de los movimientos ya clasificados y los proveedores. */
export function cuentasGastos(todos: Clasificado[], proveedores: number) {
  const propios = todos.filter((x) => x.ambito_cuenta === "personal" || x.ambito_gasto === "personal");
  return {
    sinClasificar: propios.filter((f) => f.es_gasto && f.categoria === "Sin clasificar").length,
    destinatarios: agruparDestinatarios(todos).lista.length,
    proveedores,
  };
}

export default function PestanasGastos({ activa, cuentas }: { activa: ActivaGastos; cuentas: ReturnType<typeof cuentasGastos> }) {
  return (
    <Pestanas items={[
      { href: "/personal/gastos", texto: "Tablero", activa: activa === "tablero" },
      { href: "/personal/gastos/revisar", texto: "Sin clasificar", cuenta: cuentas.sinClasificar, activa: activa === "revisar" },
      { href: "/personal/gastos/destinatarios", texto: "Destinatarios", cuenta: cuentas.destinatarios, activa: activa === "destinatarios" },
      { href: "/personal/gastos/proveedores", texto: "Proveedores", cuenta: cuentas.proveedores, activa: activa === "proveedores" },
    ]} />
  );
}
