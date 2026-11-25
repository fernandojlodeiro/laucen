// Ventas por provincia (Fer, 25/11; para la liquidación de Ingresos Brutos): los comprobantes de venta del Libro de IVA
// de un mes de una razón social, agrupados por la provincia a la que se vendió. Neto sin IVA, total con IVA y cantidad
// de comprobantes por provincia; las notas de crédito restan y lo que está en dólares va a la cotización del comprobante.
//
// La provincia de cada comprobante:
//   1. la dirección de entrega del pedido (la de Mercado Libre, o la que se cargó en el envío del pedido);
//   2. si no tiene, la dirección cargada del cliente (la principal; si no, la última);
//   3. las ventas facturadas con otro sistema (Virtual Seller) no tienen pedido: se busca el cliente por su CUIT o DNI;
//   4. si no hay ninguna, Córdoba (se cuenta aparte: «Sin provincia, asignados a Córdoba»).
// El neto sin IVA es la misma base de Ingresos Brutos de la posición del mes (baseVentas, lib/impuestos/posicion.ts).

import { consulta } from "@/lib/erp/base";
import { filaLibro, type CbteIva } from "@/lib/administracion/libro-iva";
import { baseVentas } from "@/lib/impuestos/posicion";
import { excelBuffer, type ColumnaExcel } from "@/lib/informes/excel";

export const PROVINCIA_POR_DEFECTO = "Córdoba";
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export type FilaProvincia = { provincia: string; comprobantes: number; asignados: number; neto: number; total: number; pct: number };

export async function ventasPorProvincia(org: string, ventas: CbteIva[]): Promise<FilaProvincia[]> {
  const propias = ventas.filter((c) => c.id > 0).map((c) => c.id);
  const docs = [...new Set(ventas.filter((c) => c.id < 0 && c.docTipo !== 99 && /^\d{7,11}$/.test(c.docNro)).map((c) => c.docNro))];
  const [deComprobantes, deDocumentos] = await Promise.all([
    propias.length ? consulta<{ id: number; prov: string | null }>(`
      with c as (
        select c.id, coalesce(c.cliente_id, p.cliente_id) cliente_id, nullif(trim(p.envio->'direccion'->>'provincia'), '') envio
          from comprobante c left join pedido p on p.id = c.pedido_id
         where c.organizacion_id = $1 and c.id = any($2::bigint[]))
      select c.id::int, provincia_normal(coalesce(c.envio,
               (select d.provincia from cliente_direccion d where d.cliente_id = c.cliente_id and nullif(trim(d.provincia), '') is not null
                 order by d.principal desc, d.id desc limit 1))) prov
        from c`, [org, propias]) : Promise.resolve([]),
    docs.length ? consulta<{ doc: string; prov: string | null }>(`
      select distinct on (m.doc) m.doc, provincia_normal(d.provincia) prov
        from (select cl.id, v.doc from cliente cl
                cross join lateral (values (regexp_replace(coalesce(cl.cuit, ''), '\\D', '', 'g')), (regexp_replace(coalesce(cl.documento_numero, ''), '\\D', '', 'g'))) v(doc)
               where cl.organizacion_id = $1 and v.doc = any($2::text[])) m
        join cliente_direccion d on d.cliente_id = m.id and nullif(trim(d.provincia), '') is not null
       order by m.doc, d.principal desc, d.id desc`, [org, docs]) : Promise.resolve([]),
  ]);
  const porId = new Map(deComprobantes.map((x) => [x.id, x.prov]));
  const porDoc = new Map(deDocumentos.map((x) => [x.doc, x.prov]));

  const m = new Map<string, FilaProvincia>();
  for (const c of ventas) {
    const prov = (c.id > 0 ? porId.get(c.id) : porDoc.get(c.docNro)) ?? null;
    const nombre = prov?.trim() || PROVINCIA_POR_DEFECTO;
    const f = m.get(nombre) ?? { provincia: nombre, comprobantes: 0, asignados: 0, neto: 0, total: 0, pct: 0 };
    f.comprobantes++;
    if (!prov?.trim()) f.asignados++;
    f.neto = r2(f.neto + baseVentas([c]));
    f.total = r2(f.total + filaLibro(c).total);
    m.set(nombre, f);
  }
  const filas = [...m.values()].sort((a, b) => b.neto - a.neto || a.provincia.localeCompare(b.provincia));
  const total = filas.reduce((s, f) => s + f.neto, 0);
  for (const f of filas) f.pct = total ? r2((100 * f.neto) / total) : 0;
  return filas;
}

export const nombreArchivoProvincias = (periodo: string) => `VENTAS_POR_PROVINCIA_${periodo}.xlsx`;

const COLUMNAS: ColumnaExcel<FilaProvincia>[] = [
  { titulo: "Provincia", valor: (f) => f.provincia, ancho: 24, formato: "texto" },
  { titulo: "Comprobantes", valor: (f) => f.comprobantes, ancho: 14, formato: "entero" },
  { titulo: `Sin provincia, asignados a ${PROVINCIA_POR_DEFECTO}`, valor: (f) => f.asignados, ancho: 18, formato: "entero" },
  { titulo: "Neto sin IVA", valor: (f) => f.neto, ancho: 18, formato: "importe" },
  { titulo: "Total con IVA", valor: (f) => f.total, ancho: 18, formato: "importe" },
  { titulo: "% del neto", valor: (f) => f.pct, ancho: 11, formato: "pct" },
];

export function excelProvincias(filas: FilaProvincia[], hoja: string) {
  const t = (k: "comprobantes" | "asignados" | "neto" | "total") => r2(filas.reduce((s, f) => s + f[k], 0));
  return excelBuffer(hoja, COLUMNAS, filas, [["Total", t("comprobantes"), t("asignados"), t("neto"), t("total"), filas.length ? 100 : 0]]);
}
