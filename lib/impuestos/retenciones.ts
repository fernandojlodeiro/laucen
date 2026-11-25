// Percepciones y retenciones sufridas, de «Mis Retenciones» de ARCA (Fer, 25/11). Es lo que el contador toma como pagos
// a cuenta de IVA (impuesto 767): por la FECHA DE LA PERCEPCIÓN o retención, no la de la factura (una percepción de
// Telecom del 1/10 de una factura del 8/9 va en octubre). Las facturas de compra no traen todas las percepciones (las de
// servicios, bancos o Mercado Libre muchas veces no se cargan una por una), así que un mes cubierto por lo importado
// usa esto en vez de las percepciones de las facturas (lib/impuestos/posicion.ts). Tabla retencion_arca (db/impuestos.sql).

import { consulta, una, ErrorErp } from "@/lib/erp/base";

export const IMPUESTO_IVA = 767;

export type RetencionArca = {
  cuit_agente: string; agente: string | null; impuesto: number; impuesto_texto: string | null; regimen: number | null; regimen_texto: string | null;
  fecha: string; certificado: string; operacion: string | null; importe: number; comprobante: string; fecha_comprobante: string | null;
  tipo_comprobante: string | null; fecha_dj_agente: string | null;
};

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const fechaIso = (v: unknown): string | null => {
  const t = String(v ?? "").trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
};
const importe = (v: unknown): number | null => {
  if (typeof v === "number") return v;
  let t = String(v ?? "").trim().replace(/\$/g, "");
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && t !== "" ? Math.round(n * 100) / 100 : null;
};

/** La tabla de «Mis Retenciones» (encabezados como los pone ARCA) → filas. */
export function leerMisRetenciones(tabla: (string | number | null)[][]): { filas: RetencionArca[]; errores: string[] } {
  const i0 = tabla.findIndex((f) => f.some((c) => /cuit agente/i.test(String(c ?? ""))));
  if (i0 < 0) throw new ErrorErp("No parece el listado de «Mis Retenciones» de ARCA: falta la columna «CUIT Agente Ret./Perc.».");
  const enc = tabla[i0].map((c) => sinAcentos(String(c ?? "")));
  const col = (re: RegExp) => enc.findIndex((c) => re.test(c));
  const k = {
    cuit: col(/^cuit agente/), agente: col(/denominacion|razon social/), impuesto: col(/^impuesto$/), impTexto: col(/descripcion impuesto/),
    regimen: col(/^regimen$/), regTexto: col(/descripcion regimen/), fecha: col(/^fecha ret/), certificado: col(/certificado/),
    operacion: col(/descripcion operacion/), importe: col(/^importe/), comprobante: col(/^numero comprobante/), fechaCbte: col(/^fecha comprobante/),
    tipoCbte: col(/descripcion comprobante/), fechaDj: col(/registracion/),
  };
  for (const [n, i] of [["CUIT Agente Ret./Perc.", k.cuit], ["Impuesto", k.impuesto], ["Fecha Ret./Perc.", k.fecha], ["Importe Ret./Perc.", k.importe]] as const)
    if (i < 0) throw new ErrorErp(`Al listado le falta la columna «${n}».`);
  const filas: RetencionArca[] = [], errores: string[] = [];
  const t = (f: (string | number | null)[], i: number) => (i < 0 ? null : String(f[i] ?? "").trim() || null);
  tabla.slice(i0 + 1).forEach((f, j) => {
    if (f.every((c) => c == null || String(c).trim() === "")) return;
    const fecha = fechaIso(f[k.fecha]), monto = importe(f[k.importe]), imp = Number(t(f, k.impuesto));
    const cuit = (t(f, k.cuit) ?? "").replace(/\D/g, "");
    if (!fecha || monto == null || !imp || cuit.length !== 11) { errores.push(`Renglón ${i0 + j + 2}: no se entiende (fecha, importe, impuesto o CUIT del agente).`); return; }
    filas.push({
      cuit_agente: cuit, agente: t(f, k.agente), impuesto: imp, impuesto_texto: t(f, k.impTexto), regimen: Number(t(f, k.regimen)) || null, regimen_texto: t(f, k.regTexto),
      fecha, certificado: t(f, k.certificado) ?? "", operacion: t(f, k.operacion), importe: monto, comprobante: t(f, k.comprobante) ?? "",
      fecha_comprobante: fechaIso(f[k.fechaCbte]), tipo_comprobante: t(f, k.tipoCbte), fecha_dj_agente: fechaIso(f[k.fechaDj]),
    });
  });
  return { filas, errores };
}

/** Guarda lo leído para una razón social. Lo que ya estaba (mismo agente, impuesto, régimen, fecha, certificado,
 *  comprobante e importe) no se duplica; lo de un mes ya liquidado se saltea. */
export async function importarRetenciones(org: string, emisorId: number, archivo: string, filas: RetencionArca[]) {
  if (!filas.length) throw new ErrorErp("El listado no tiene percepciones ni retenciones.");
  const e = await una<{ id: number }>("select id::int from emisor where organizacion_id = $1 and id = $2", [org, emisorId]);
  if (!e) throw new ErrorErp("Elegí la razón social.");
  const cerrados = new Set((await consulta<{ periodo: string }>("select distinct periodo from ddjj where organizacion_id = $1 and emisor_id = $2 and impuesto = 'iva'",
    [org, emisorId])).map((x) => x.periodo));
  const aGrabar = filas.filter((f) => !cerrados.has(f.fecha.slice(0, 7)));
  let nuevas = 0;
  for (let i = 0; i < aGrabar.length; i += 500) {
    const r = await consulta<{ id: number }>(`
      insert into retencion_arca (organizacion_id, emisor_id, cuit_agente, agente, impuesto, impuesto_texto, regimen, regimen_texto, fecha, certificado, operacion,
                                  importe, comprobante, fecha_comprobante, tipo_comprobante, fecha_dj_agente, archivo)
      select $1, $2, x.cuit_agente, x.agente, x.impuesto, x.impuesto_texto, x.regimen, x.regimen_texto, x.fecha, x.certificado, x.operacion,
             x.importe, x.comprobante, x.fecha_comprobante, x.tipo_comprobante, x.fecha_dj_agente, $4
        from jsonb_to_recordset($3::jsonb) as x(cuit_agente text, agente text, impuesto int, impuesto_texto text, regimen int, regimen_texto text, fecha date,
             certificado text, operacion text, importe numeric, comprobante text, fecha_comprobante date, tipo_comprobante text, fecha_dj_agente date)
      on conflict (emisor_id, cuit_agente, impuesto, regimen, fecha, certificado, comprobante, importe) do nothing
      returning id`, [org, emisorId, JSON.stringify(aGrabar.slice(i, i + 500)), archivo]);
    nuevas += r.length;
  }
  const fechas = filas.map((f) => f.fecha).sort();
  return { nuevas, yaEstaban: aGrabar.length - nuevas, liquidadas: filas.length - aGrabar.length, desde: fechas[0], hasta: fechas.at(-1)! };
}

/** Los pagos a cuenta de IVA de un mes según lo importado de ARCA. `cubierto`: el mes está entre la primera y la última
 *  fecha importadas de la razón social (si no, no se sabe y se usan las percepciones de las facturas). */
export async function pagosACuentaArca(org: string, emisorId: number, desde: string, hasta: string) {
  const r = await una<{ cubierto: boolean; importe: number; cantidad: number }>(`
    with rango as (select min(fecha) d, max(fecha) h from retencion_arca where organizacion_id = $1 and emisor_id = $2 and impuesto = $5)
    select coalesce(date_trunc('month', rango.d) <= $3::date and rango.h >= date_trunc('month', $4::date)::date, false) cubierto,
           coalesce((select sum(importe) from retencion_arca where organizacion_id = $1 and emisor_id = $2 and impuesto = $5 and fecha between $3::date and $4::date), 0)::float importe,
           (select count(*)::int from retencion_arca where organizacion_id = $1 and emisor_id = $2 and impuesto = $5 and fecha between $3::date and $4::date) cantidad
      from rango`, [org, emisorId, desde, hasta, IMPUESTO_IVA]);
  return r ?? { cubierto: false, importe: 0, cantidad: 0 };
}

/** Lo importado de cada razón social (para mostrar qué hay). */
export function resumenRetenciones(org: string) {
  return consulta<{ emisor_id: number; n: number; desde: string; hasta: string }>(`
    select emisor_id::int, count(*)::int n, to_char(min(fecha), 'YYYY-MM-DD') desde, to_char(max(fecha), 'YYYY-MM-DD') hasta
      from retencion_arca where organizacion_id = $1 group by emisor_id order by emisor_id`, [org]);
}
