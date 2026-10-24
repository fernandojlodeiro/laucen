// Compras de períodos anteriores a Laucen (Fer, 24/10): las facturas recibidas de antes de empezar a cargar las compras en
// Laucen entran al libro de IVA desde "Mis Comprobantes – Recibidos" de ARCA, que es de donde el contador armó lo que se
// declaró (el TXT de compras de Virtual Seller tenía notas de crédito informadas como facturas). Quedan en compra_externa:
// el libro IVA compras, sus TXT, el Excel y la posición las suman, pero no son facturas de compra (no hay deuda con el
// proveedor, ni asiento, ni cuenta de gasto). Lo que ya está cargado en Laucen como factura de compra no se importa.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import type { CbteIva } from "@/lib/administracion/libro-iva";
import { armarFactura, type CbteArca } from "@/lib/administracion/arca-mc-leer";

export type CompraExterna = Omit<CbteIva, "id" | "origen" | "enlace"> & { cuit: string };

/** Un comprobante de Mis Comprobantes como lo lleva el libro (igual que una factura de compra importada de ARCA). Pura. */
export function deMisComprobantes(c: CbteArca): CompraExterna | { error: string } {
  const a = armarFactura(c);
  if (a.error) return { error: `${c.tipoTexto} ${c.puntoVenta}-${c.numero} de ${c.denominacion}: ${a.error}` };
  const discrimina = c.letra === "A" || c.letra === "M";
  const usd = c.moneda === "USD";
  return {
    cuit: c.cuit, fecha: c.fecha, tipo: c.tipo, puntoVenta: c.puntoVenta, numero: String(c.numero),
    docTipo: c.cuit.length === 11 ? 80 : 99, docNro: c.cuit.length === 11 ? c.cuit : "0", nombre: c.denominacion,
    condicionIva: null, moneda: usd ? "DOL" : "PES", cotizacion: usd ? c.cotizacion || 1 : 1, nc: c.nc,
    alicuotas: discrimina ? a.lineas.map((l) => ({ pct: l.ivaPct, base: l.neto, iva: l.iva })) : [],
    noGravado: discrimina ? a.noGravado : 0, exento: 0, sinDiscriminar: discrimina ? 0 : a.total,
    percepcionIva: a.percepcionIva, percepcionNacionales: 0, percepcionIibb: a.percepcionIibb, percepcionMunicipal: 0,
    impuestosInternos: 0, otros: a.otrosImpuestos, total: a.total,
  };
}

const clave = (cuit: string, tipo: number, pv: number, numero: string | number) => `${cuit}|${tipo}|${pv}|${Number(numero)}`;

/** Guarda las compras de una razón social: reemplaza lo que ya estaba con el mismo número y saltea lo que está en Laucen. */
export async function importarComprasExternas(org: string, emisorId: number, sistema: string, archivo: string, cbtes: CompraExterna[]) {
  if (!cbtes.length) throw new ErrorErp("El archivo no tiene comprobantes.");
  const e = await una<{ id: number }>("select id::int from emisor where organizacion_id = $1 and id = $2", [org, emisorId]);
  if (!e) throw new ErrorErp("Elegí la razón social.");
  // Las facturas de compra de Laucen, con el código de ARCA que tendrían en el libro (tipo_cbte o el de su letra).
  const enLaucen = new Set((await consulta<{ k: string }>(`
    select regexp_replace(coalesce(p.cuit, ''), '\\D', '', 'g') || '|' || coalesce(f.tipo_cbte, case f.letra
             when 'A' then case when f.es_nota_credito then 3 when f.es_nota_debito then 2 else 1 end
             when 'B' then case when f.es_nota_credito then 8 when f.es_nota_debito then 7 else 6 end
             when 'C' then case when f.es_nota_credito then 13 when f.es_nota_debito then 12 else 11 end
             when 'M' then case when f.es_nota_credito then 53 when f.es_nota_debito then 52 else 51 end end) || '|' || coalesce(f.punto_venta, 0) || '|' || coalesce(f.numero, 0) k
      from factura_compra f join proveedor p on p.id = f.proveedor_id
     where f.organizacion_id = $1 and f.emisor_id = $2 and f.estado = 'registrada'`, [org, emisorId])).map((x) => x.k));
  const aGrabar = cbtes.filter((c) => !enLaucen.has(clave(c.cuit, c.tipo, c.puntoVenta, c.numero)));
  let nuevos = 0, reemplazados = 0;
  for (let i = 0; i < aGrabar.length; i += 500) {
    const filas = aGrabar.slice(i, i + 500).map((c) => ({ fecha: c.fecha, cuit: c.cuit, tipo: c.tipo, punto_venta: c.puntoVenta, numero: Number(c.numero), datos: c }));
    const r = await consulta<{ nuevo: boolean }>(`
      insert into compra_externa (organizacion_id, emisor_id, sistema, fecha, cuit, tipo, punto_venta, numero, datos, archivo)
      select $1, $2, $3, x.fecha, x.cuit, x.tipo, x.punto_venta, x.numero, x.datos, $5
        from jsonb_to_recordset($4::jsonb) as x(fecha date, cuit text, tipo int, punto_venta int, numero bigint, datos jsonb)
      on conflict (emisor_id, cuit, tipo, punto_venta, numero) do update set sistema = excluded.sistema, fecha = excluded.fecha, datos = excluded.datos, archivo = excluded.archivo, importado_ts = now()
      returning (xmax = 0) nuevo`, [org, emisorId, sistema, JSON.stringify(filas), archivo]);
    for (const x of r) if (x.nuevo) nuevos++; else reemplazados++;
  }
  const fechas = cbtes.map((c) => c.fecha).sort();
  return { nuevos, reemplazados, yaEnLaucen: cbtes.length - aGrabar.length, desde: fechas[0], hasta: fechas.at(-1)! };
}

/** Las compras de períodos anteriores de un período, como comprobantes del libro (id negativo: no chocan con los de Laucen). */
export async function comprasExternasDelPeriodo(org: string, desde: string, hasta: string, emisorId: number | null): Promise<CbteIva[]> {
  const filas = await consulta<{ id: number; datos: CompraExterna }>(`
    select id::int, datos from compra_externa where organizacion_id = $1 and fecha between $2::date and $3::date and ($4::bigint is null or emisor_id = $4)`,
    [org, desde, hasta, emisorId]);
  return filas.map((f) => {
    const { cuit: _c, ...d } = f.datos;
    return { ...d, origen: "compra" as const, id: -f.id, canal: "anterior a Laucen (Mis Comprobantes)" };
  });
}

/** Resumen de lo importado, para mostrar. */
export function resumenComprasExternas(org: string) {
  return consulta<{ emisor_id: number; sistema: string; n: number; desde: string; hasta: string }>(`
    select emisor_id::int, sistema, count(*)::int n, to_char(min(fecha), 'YYYY-MM-DD') desde, to_char(max(fecha), 'YYYY-MM-DD') hasta
      from compra_externa where organizacion_id = $1 group by 1, 2 order by 1, 2`, [org]);
}
