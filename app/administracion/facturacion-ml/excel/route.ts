// Retenciones y percepciones de Mercado Libre / Mercado Pago de un período,
// en Excel (para el contador), con el total por impuesto al pie.

import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { respuestaExcel, type ColumnaExcel } from "@/lib/informes/excel";
import { impuestosPeriodo, periodosLeidos, IMPUESTOS, type Impuesto } from "@/lib/mercadolibre/facturacion";

export const dynamic = "force-dynamic";

type Fila = Awaited<ReturnType<typeof impuestosPeriodo>>[number];

export async function GET(req: NextRequest) {
  const s = await entrarErp("facturacion_ml_ver");
  const pedido = req.nextUrl.searchParams.get("periodo");
  const periodos = await periodosLeidos(s.org.id);
  const periodo = periodos.find((p) => p.clave === pedido) ?? periodos[0];
  const filas = periodo ? await impuestosPeriodo(s.org.id, periodo.clave) : [];
  // El día argentino, como fecha de Excel (sin zona).
  const ar = (d: Date | null) => (d ? new Date(`${d.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })}T00:00:00Z`) : null);
  const columnas: ColumnaExcel<Fila>[] = [
    { titulo: "Fecha", valor: (f) => ar(f.fecha), formato: "fecha", ancho: 12 },
    { titulo: "Cobra", valor: (f) => (f.grupo === "MP" ? "Mercado Pago" : "Mercado Libre"), ancho: 14 },
    { titulo: "Impuesto", valor: (f) => IMPUESTOS[f.impuesto ?? "otro"], ancho: 16 },
    { titulo: "Concepto", valor: (f) => f.concepto, ancho: 50 },
    { titulo: "Orden de ML", valor: (f) => f.order_id, formato: "texto", ancho: 18 },
    { titulo: "Pedido Laucen", valor: (f) => f.pedido_id, formato: "entero", ancho: 12 },
    { titulo: "Comprobante de ML", valor: (f) => f.documento, formato: "texto", ancho: 20 },
    { titulo: "Importe", valor: (f) => f.monto, formato: "importe", ancho: 14 },
  ];
  const pie = (Object.keys(IMPUESTOS) as Impuesto[])
    .map((i) => [`Total ${IMPUESTOS[i]}`, null, null, null, null, null, null, filas.filter((f) => (f.impuesto ?? "otro") === i).reduce((a, f) => a + f.monto, 0)])
    .filter((r) => r[7] !== 0);
  return respuestaExcel(`Retenciones y percepciones ML ${periodo?.clave ?? ""}`.trim(), "Retenciones", columnas, filas, pie);
}
