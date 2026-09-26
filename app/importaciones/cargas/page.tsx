// Cargas: qué meses de ARCA hay, cuáles faltan, qué Excel de Softrade se
// cargaron y si están los nomencladores. La carga en sí no se hace desde
// acá: los archivos están en la PC de Fer (ver scripts/arca/LEEME.md).

import Link from "next/link";
import { pool } from "@/db";
import { sosVos } from "@/lib/admin";
import { SUAVE } from "@/app/botones";
import { periodoLindo, sumarMeses } from "@/lib/arca/filtro";
import { CAJA_TABLA, Col, TABLA, TD, TDN, THEAD, TR, entrar } from "../Piezas";

export const dynamic = "force-dynamic";

const PRIMERO = "201701"; // ARCA publica desde enero de 2017

const fecha = (d: Date | null) => (d ? d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }) : "—");

export default async function Cargas() {
  await entrar();
  const esFer = await sosVos();
  const [arca, softrade, refs, tamano] = await Promise.all([
    pool.query<{ periodo: string; cargado_en: Date; filas_crudas: string | null; items: string | null; filas_impuestos: string | null }>(
      "select * from arca_cargas order by periodo desc").then((r) => r.rows),
    pool.query<{ archivo: string; cargado_en: Date; parametros: string | null; filas: number; items: number; subitems: number }>(
      "select * from softrade_cargas order by cargado_en desc").then((r) => r.rows),
    pool.query<{ t: string; n: number }>(`
      select 'ref_ncm (versión vigente)' t, count(*)::int n from ref_ncm_vigente
      union all select 'ref_ncm: versiones cargadas', count(distinct vigencia)::int from ref_ncm
      union all select 'ref_sufijo', count(*)::int from ref_sufijo
      union all select 'NCM con IVA y estadística deducidos', count(*)::int from ncm_tasas where iva_pct is not null
      union all select 'ref_pais (con nombre)', count(*)::int from ref_pais where nombre is not null
      union all select 'ref_transporte (con nombre)', count(*)::int from ref_transporte where nombre is not null
      union all select 'ref_concepto (con nombre)', count(*)::int from ref_concepto where nombre is not null`).then((r) => r.rows),
    pool.query<{ total: string }>("select pg_size_pretty(pg_database_size(current_database())) total").then((r) => r.rows[0]?.total),
  ]);

  // Meses que faltan entre enero 2017 y el último publicado que se conoce
  // (el mes anterior al actual: ARCA publica con ~1 mes de atraso).
  const hoy = new Date();
  const ultimoPosible = sumarMeses(`${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, "0")}`, -1);
  const cargados = new Set(arca.map((a) => a.periodo));
  const faltan: string[] = [];
  for (let p = PRIMERO; p <= ultimoPosible; p = sumarMeses(p, 1)) if (!cargados.has(p)) faltan.push(p);
  const porAnio = new Map<string, string[]>();
  for (const p of faltan) porAnio.set(p.slice(0, 4), [...(porAnio.get(p.slice(0, 4)) ?? []), p]);

  return (
    <div className="space-y-6">
      {esFer && (
        <section className="flex items-center justify-between gap-2 bg-white border border-[#E3E9F0] rounded-xl p-3 text-xs">
          <span>Sacar de la base los capítulos y partidas que no vas a estudiar.</span>
          <Link href="/importaciones/depurar" className={SUAVE}>🧹 Depurar posiciones</Link>
        </section>
      )}
      <section>
        <h2 className="text-sm font-bold mb-2">Meses de ARCA cargados ({arca.length})</h2>
        {arca.length === 0 ? (
          <p className="text-xs text-[#5C6B76]">Ninguno todavía.</p>
        ) : (
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><Col texto="Mes" derecha={false} /><Col texto="Filas crudas" /><Col texto="Ítems" /><Col texto="Filas con concepto de impuesto" /><Col texto="Cargado" derecha={false} /></tr></thead>
              <tbody>{arca.map((a) => (
                <tr key={a.periodo} className={TR}>
                  <td className={TD}>{periodoLindo(a.periodo)}</td>
                  <td className={TDN}>{a.filas_crudas ? Number(a.filas_crudas).toLocaleString("es-AR") : "—"}</td>
                  <td className={TDN}>{a.items ? Number(a.items).toLocaleString("es-AR") : "—"}</td>
                  <td className={TDN}>{a.filas_impuestos ? Number(a.filas_impuestos).toLocaleString("es-AR") : "—"}</td>
                  <td className={TD}>{fecha(a.cargado_en)}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
        {faltan.length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-[#16577F] font-semibold">Faltan {faltan.length} meses (hasta {periodoLindo(ultimoPosible)})</summary>
            <ul className="mt-1 space-y-0.5 text-[#5C6B76]">
              {[...porAnio.entries()].reverse().map(([anio, ps]) => (
                <li key={anio}><b>{anio}</b>: {ps.length === 12 ? "todo el año" : ps.map((p) => p.slice(4)).join(", ")}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold mb-2">Excel de Softrade cargados ({softrade.length})</h2>
        {softrade.length === 0 ? (
          <p className="text-xs text-[#5C6B76]">Ninguno todavía.</p>
        ) : (
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><Col texto="Archivo" derecha={false} /><Col texto="Filas" /><Col texto="Ítems" /><Col texto="Subítems" /><Col texto="Filtros usados" derecha={false} /><Col texto="Cargado" derecha={false} /></tr></thead>
              <tbody>{softrade.map((s) => (
                <tr key={s.archivo} className={TR}>
                  <td className={TD}>{s.archivo}</td><td className={TDN}>{s.filas}</td><td className={TDN}>{s.items}</td><td className={TDN}>{s.subitems}</td>
                  <td className={`${TD} whitespace-pre-line text-[#5C6B76]`}>{s.parametros ?? "—"}</td><td className={TD}>{fecha(s.cargado_en)}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold mb-2">Tablas de referencia</h2>
        <ul className="text-xs text-[#5C6B76] space-y-0.5">
          {refs.map((r) => <li key={r.t}>{r.t}: <b className="text-[#1B2A35]">{r.n.toLocaleString("es-AR")}</b></li>)}
          <li>Tamaño de la base: <b className="text-[#1B2A35]">{tamano}</b></li>
        </ul>
      </section>

      <section className="text-xs text-[#5C6B76] bg-[#FAFBFC] border border-[#E3E9F0] rounded-xl p-3">
        <h2 className="text-sm font-bold text-[#1B2A35] mb-1">Cómo se carga</h2>
        <p>Desde la PC donde están los archivos, con una sesión de Claude Code en el repo (ver <code>scripts/arca/LEEME.md</code>):</p>
        <ul className="list-disc ml-5 mt-1 space-y-0.5">
          <li>ZIP mensuales de ARCA (<code>AAAAMM.zip</code>) en <code>C:\Laucen\arca\raw\</code></li>
          <li><code>arancel.zip</code> en <code>C:\Laucen\arca\ref\</code></li>
          <li>Excel de Softrade en <code>C:\Laucen\softrade\in\</code></li>
        </ul>
      </section>
    </div>
  );
}
