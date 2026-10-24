// Ventas facturadas con otro sistema (Fer, 23/10): hasta el 3/10/2026 se facturó con Virtual Seller, con el mismo
// punto de venta que sigue usando Laucen. Se importan los dos TXT del Libro de IVA Digital de ventas (comprobantes, 266
// posiciones; alícuotas, 62) que exporta ese sistema, y quedan en venta_externa: el libro de IVA ventas, sus TXT, el
// Excel y la posición de impuestos los suman como si los hubiera emitido Laucen. Lo que también está en Laucen (mismo
// tipo, punto de venta y número) no se importa. El lector es puro; el formato es el mismo que escribe
// lineaVentaCbte / lineasVentaAlicuotas (lib/administracion/libro-iva.ts).

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import type { CbteIva } from "@/lib/administracion/libro-iva";

const PCT_DE_CODIGO: Record<number, number> = { 3: 0, 4: 10.5, 5: 21, 6: 27, 8: 5, 9: 2.5 };
const TIPOS_C = [11, 12, 13];

export type CbteExterno = Omit<CbteIva, "id" | "origen" | "enlace">;

const imp = (s: string) => (Number(s) || 0) / 100;
const fecha = (s: string) => (/^\d{8}$/.test(s) && s !== "00000000" ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
const clave = (tipo: number, pv: number, numero: string | number) => `${tipo}|${pv}|${Number(numero)}`;

/** Los dos TXT → los comprobantes del libro, con sus alícuotas. Pura. */
export function leerLibroVentas(textoCbte: string, textoAlicuotas: string): { cbtes: CbteExterno[]; errores: string[] } {
  const errores: string[] = [];
  const alic = new Map<string, { pct: number; base: number; iva: number }[]>();
  textoAlicuotas.split(/\r?\n/).forEach((l, i) => {
    if (!l.trim()) return;
    if (l.length < 62) { errores.push(`Alícuotas, renglón ${i + 1}: tiene ${l.length} posiciones y debería tener 62.`); return; }
    const codigo = Number(l.slice(43, 47));
    const pct = PCT_DE_CODIGO[codigo];
    if (pct == null) { errores.push(`Alícuotas, renglón ${i + 1}: código de alícuota ${codigo} desconocido.`); return; }
    const k = clave(Number(l.slice(0, 3)), Number(l.slice(3, 8)), l.slice(8, 28));
    alic.set(k, [...(alic.get(k) ?? []), { pct, base: imp(l.slice(28, 43)), iva: imp(l.slice(47, 62)) }]);
  });
  const cbtes: CbteExterno[] = [];
  textoCbte.split(/\r?\n/).forEach((l, i) => {
    if (!l.trim()) return;
    if (l.length < 266) { errores.push(`Comprobantes, renglón ${i + 1}: tiene ${l.length} posiciones y debería tener 266. ¿Es el TXT de ventas?`); return; }
    const f = fecha(l.slice(0, 8));
    const tipo = Number(l.slice(8, 11)), pv = Number(l.slice(11, 16)), numero = String(Number(l.slice(16, 36)));
    if (!f || !tipo || !Number(numero)) { errores.push(`Comprobantes, renglón ${i + 1}: fecha, tipo o número ilegibles.`); return; }
    const total = imp(l.slice(108, 123));
    const letraC = TIPOS_C.includes(tipo);
    const alicuotas = letraC ? [] : (alic.get(clave(tipo, pv, numero)) ?? []).filter((a) => a.base || a.iva);
    const moneda = l.slice(228, 231) === "PES" ? "PES" : "DOL";
    cbtes.push({
      fecha: f, tipo, puntoVenta: pv, numero,
      docTipo: Number(l.slice(56, 58)), docNro: String(Number(l.slice(58, 78)) || 0), nombre: l.slice(78, 108).trim() || "Consumidor final",
      condicionIva: null, moneda, cotizacion: moneda === "PES" ? 1 : (Number(l.slice(231, 241)) || 0) / 1e6,
      nc: [3, 8, 13, 21, 53].includes(tipo), alicuotas,
      noGravado: imp(l.slice(123, 138)), exento: imp(l.slice(153, 168)), sinDiscriminar: letraC ? total : 0,
      percepcionIva: 0, percepcionNacionales: imp(l.slice(138, 153)) + imp(l.slice(168, 183)), percepcionIibb: imp(l.slice(183, 198)),
      percepcionMunicipal: imp(l.slice(198, 213)), impuestosInternos: imp(l.slice(213, 228)), otros: imp(l.slice(243, 258)), total,
      vencimientoPago: fecha(l.slice(258, 266)),
    });
  });
  // Un comprobante que discrimina IVA sin alícuotas en el otro archivo: casi seguro que falta ese archivo.
  const sinAlic = cbtes.filter((c) => !TIPOS_C.includes(c.tipo) && !c.alicuotas.length && c.total && !c.noGravado && !c.exento).length;
  if (sinAlic) errores.push(`${sinAlic} comprobante(s) A o B sin ninguna alícuota en el archivo de alícuotas: revisá que sea el de este mismo período.`);
  return { cbtes, errores };
}

/** Los huecos de numeración de una lista de comprobantes, por tipo y punto de venta (ordenados). Pura. */
export function huecosDeNumeracion(cbtes: Pick<CbteIva, "tipo" | "puntoVenta" | "numero">[]) {
  const grupos = new Map<string, number[]>();
  for (const c of cbtes) {
    const k = `${c.tipo}|${c.puntoVenta}`;
    grupos.set(k, [...(grupos.get(k) ?? []), Number(c.numero)]);
  }
  const huecos: { tipo: number; puntoVenta: number; desde: number; hasta: number }[] = [];
  for (const [k, ns] of grupos) {
    const [tipo, pv] = k.split("|").map(Number);
    const orden = [...new Set(ns)].sort((a, b) => a - b);
    for (let i = 1; i < orden.length; i++) if (orden[i] - orden.at(i - 1)! > 1) huecos.push({ tipo, puntoVenta: pv, desde: orden.at(i - 1)! + 1, hasta: orden[i] - 1 });
  }
  return huecos;
}

/** Guarda lo leído para una razón social: reemplaza lo que ya estaba con el mismo número y saltea lo que está en Laucen. */
export async function importarVentasExternas(org: string, emisorId: number, sistema: string, archivo: string, cbtes: CbteExterno[]) {
  if (!cbtes.length) throw new ErrorErp("Los archivos no tienen comprobantes.");
  const e = await una<{ id: number }>("select id::int from emisor where organizacion_id = $1 and id = $2", [org, emisorId]);
  if (!e) throw new ErrorErp("Elegí la razón social.");
  const enLaucen = new Set((await consulta<{ k: string }>(`
    select tipo_cbte || '|' || punto_venta || '|' || numero k from comprobante
     where organizacion_id = $1 and emisor_id = $2 and estado = 'autorizado' and ambiente = 'produccion'`, [org, emisorId])).map((x) => x.k));
  const aGrabar = cbtes.filter((c) => !enLaucen.has(clave(c.tipo, c.puntoVenta, c.numero)));
  const yaEnLaucen = cbtes.length - aGrabar.length;
  let nuevos = 0, reemplazados = 0;
  // De a 500 por consulta: un año son un par de miles de comprobantes.
  for (let i = 0; i < aGrabar.length; i += 500) {
    const filas = aGrabar.slice(i, i + 500).map((c) => ({ fecha: c.fecha, tipo: c.tipo, punto_venta: c.puntoVenta, numero: Number(c.numero), datos: c }));
    const r = await consulta<{ nuevo: boolean }>(`
      insert into venta_externa (organizacion_id, emisor_id, sistema, fecha, tipo, punto_venta, numero, datos, archivo)
      select $1, $2, $3, x.fecha, x.tipo, x.punto_venta, x.numero, x.datos, $5
        from jsonb_to_recordset($4::jsonb) as x(fecha date, tipo int, punto_venta int, numero bigint, datos jsonb)
      on conflict (emisor_id, tipo, punto_venta, numero) do update set sistema = excluded.sistema, fecha = excluded.fecha, datos = excluded.datos, archivo = excluded.archivo, importado_ts = now()
      returning (xmax = 0) nuevo`, [org, emisorId, sistema, JSON.stringify(filas), archivo]);
    for (const x of r) if (x.nuevo) nuevos++; else reemplazados++;
  }
  return { nuevos, reemplazados, yaEnLaucen, desde: cbtes.reduce((m, c) => (c.fecha < m ? c.fecha : m), cbtes[0].fecha), hasta: cbtes.reduce((m, c) => (c.fecha > m ? c.fecha : m), cbtes[0].fecha) };
}

/** Las ventas de otro sistema de un período, como comprobantes del libro (id negativo: no chocan con los de Laucen). */
export async function ventasExternasDelPeriodo(org: string, desde: string, hasta: string, emisorId: number | null): Promise<CbteIva[]> {
  const filas = await consulta<{ id: number; sistema: string; datos: CbteExterno }>(`
    select id::int, sistema, datos from venta_externa where organizacion_id = $1 and fecha between $2::date and $3::date and ($4::bigint is null or emisor_id = $4)`,
    [org, desde, hasta, emisorId]);
  return filas.map((f) => ({ ...f.datos, origen: "venta", id: -f.id, canal: f.sistema, canalId: null }));
}

/** Resumen de lo importado de una razón social, para mostrar. */
export function resumenVentasExternas(org: string) {
  return consulta<{ emisor_id: number; sistema: string; n: number; desde: string; hasta: string }>(`
    select emisor_id::int, sistema, count(*)::int n, to_char(min(fecha), 'YYYY-MM-DD') desde, to_char(max(fecha), 'YYYY-MM-DD') hasta
      from venta_externa where organizacion_id = $1 group by 1, 2 order by 1, 2`, [org]);
}
