// Libro IVA Ventas o Compras en Excel: las mismas columnas que la pantalla
// (todas las alícuotas), la fila de totales y, abajo, el resumen del mes
// (base e IVA por alícuota, débito, crédito y saldo técnico).

import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { respuestaExcel, type ColumnaExcel } from "@/lib/informes/excel";
import { ALICUOTAS, armarLibro, resumenIva, textoComprobante, type FilaLibro, type ImportesLibro } from "@/lib/administracion/libro-iva";
import { libroIvaPeriodo } from "@/lib/administracion/libro-iva-base";
import { elegirRazonSocial } from "@/lib/razon-social";
import { periodoDe, canalDe, type SPLibro } from "../comun";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DOC: Record<number, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI", 99: "Sin identificar" };
const pct = (k: number) => `${String(k).replace(".", ",")} %`;

export async function GET(req: NextRequest) {
  const s = await entrarErp("libros_iva_ver");
  const sp = Object.fromEntries(req.nextUrl.searchParams) as SPLibro;
  const { desde, hasta, periodo } = periodoDe(sp);
  const compras = sp.libro === "compras";
  const canal = canalDe(sp);
  // El libro de IVA es de una razón social: la de la dirección o, sin elegir, la principal.
  const rs = await elegirRazonSocial(s.org.id, sp.rs, { todas: false });
  const datos = await libroIvaPeriodo(s.org.id, desde, hasta, rs.id);
  const libroV = armarLibro(datos.ventas);
  const libroC = armarLibro(datos.compras);
  const libro = compras ? libroC : canal ? armarLibro(datos.ventas.filter((v) => v.canalId === canal)) : libroV;

  const imp = (f: (x: ImportesLibro) => number): ((x: FilaLibro) => number) => (x) => f(x);
  const columnas: ColumnaExcel<FilaLibro>[] = [
    { titulo: "Fecha", valor: (f) => new Date(`${f.c.fecha}T00:00:00Z`), formato: "fecha", ancho: 11 },
    { titulo: "Código", valor: (f) => String(f.c.tipo).padStart(3, "0"), formato: "texto", ancho: 7 },
    { titulo: "Comprobante", valor: (f) => textoComprobante(f.c), formato: "texto", ancho: 26 },
    { titulo: "Tipo doc.", valor: (f) => DOC[f.c.docTipo] ?? String(f.c.docTipo), ancho: 10 },
    { titulo: "Nº doc.", valor: (f) => (f.c.docTipo === 99 ? "" : f.c.docNro), formato: "texto", ancho: 14 },
    { titulo: compras ? "Proveedor" : "Cliente", valor: (f) => f.c.nombre, ancho: 32 },
    { titulo: "Condición IVA", valor: (f) => f.c.condicionIva, ancho: 22 },
    ...(compras ? [] : [{ titulo: "Canal", valor: (f: FilaLibro) => f.c.canal ?? null, ancho: 16 }]),
    { titulo: "Moneda", valor: (f) => f.c.moneda, ancho: 7 },
    { titulo: "Cotización", valor: (f) => f.c.cotizacion, formato: "decimal", ancho: 10 },
    ...ALICUOTAS.map((k): ColumnaExcel<FilaLibro> => ({ titulo: `Neto ${pct(k)}`, valor: imp((x) => x.neto[k]), formato: "importe", ancho: 14 })),
    { titulo: "No gravado", valor: imp((x) => x.noGravado), formato: "importe", ancho: 13 },
    { titulo: "Exento", valor: imp((x) => x.exento), formato: "importe", ancho: 13 },
    ...(compras ? [{ titulo: "B / C sin crédito", valor: imp((x) => x.sinDiscriminar), formato: "importe" as const, ancho: 14 }] : []),
    ...ALICUOTAS.map((k): ColumnaExcel<FilaLibro> => ({ titulo: `IVA ${pct(k)}`, valor: imp((x) => x.iva[k]), formato: "importe", ancho: 13 })),
    { titulo: "Perc. IVA", valor: imp((x) => x.percepcionIva), formato: "importe", ancho: 13 },
    { titulo: "Perc. IIBB", valor: imp((x) => x.percepcionIibb), formato: "importe", ancho: 13 },
    { titulo: "Otros impuestos", valor: imp((x) => x.otros), formato: "importe", ancho: 13 },
    { titulo: "Total", valor: imp((x) => x.total), formato: "importe", ancho: 15 },
  ];
  // La fila de totales: los importes en sus columnas, el resto vacío.
  // (las columnas de importes sólo miran los importes: se les pasa el total como si fuera una fila).
  const comoFila = { ...libro.totales, signo: 1, c: libro.filas[0]?.c } as FilaLibro;
  const valoresTotales: (string | number | null)[] = columnas.map((c, i) =>
    i === 0 ? `Total (${libro.filas.length} comprobantes)` : c.formato === "importe" ? (c.valor(comoFila) as number) : null);
  const r = resumenIva(libroV.totales, libroC.totales);
  const resumen: (string | number | null)[][] = [
    [],
    ["Resumen del período (ventas de todos los canales)"],
    ["Alícuota", "Base ventas", "Débito fiscal", "Base compras", "Crédito fiscal"],
    ...r.alicuotas.map((a) => [pct(a.pct), a.baseVentas, a.debito, a.baseCompras, a.credito]),
    ["Débito fiscal", r.debito],
    ["Crédito fiscal", r.credito],
    ["Saldo técnico (+ a pagar / − a favor)", r.saldoTecnico],
    ["Percepciones de IVA sufridas", r.percepciones],
    ["Saldo después de percepciones", r.saldoConPercepciones],
  ];
  const nombre = `Libro IVA ${compras ? "Compras" : "Ventas"} ${periodo ?? `${desde} a ${hasta}`}`;
  return respuestaExcel(nombre, compras ? "IVA Compras" : "IVA Ventas", columnas, libro.filas, [valoresTotales, ...resumen]);
}
