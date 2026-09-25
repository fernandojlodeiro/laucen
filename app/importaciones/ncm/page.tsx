// Ficha de una NCM: qué es (nomenclador), y juntos el FOB histórico (ARCA),
// las alícuotas vigentes (nomenclador) y CIF + kg cuando hay Softrade. Sin
// montos de impuestos. Después: serie mensual, importadores, países, marcas.

import Link from "next/link";
import { pool } from "@/db";
import { aParams, leerFiltro, periodoLindo, periodosCargados, type Params } from "@/lib/arca/filtro";
import {
  alicuotasDeNcm, marcasVistas, nombre, nombresAlicuotas, rankingImportadores, rankingPaises, referencias, resumenSoftrade,
  serieMensual, tituloAlicuota,
} from "@/lib/arca/consultas";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { CAJA_TABLA, CAMPO, Col, ETIQUETA, LinkImportador, SinDatos, TABLA, TD, TDN, THEAD, TR, cant, entrar, pct, usd } from "../Piezas";
import { Alicuotas, MarcasVistas, Serie } from "../Tablas";

export const dynamic = "force-dynamic";

export default async function FichaNcm({ searchParams }: { searchParams: Promise<Params> }) {
  const sesion = await entrar();
  const org = sesion.org.id;
  const sp = await searchParams;
  const codigo = String(sp.c ?? "").trim();
  const periodos = await periodosCargados();
  if (!periodos.length) return <SinDatos />;

  // Por defecto, los últimos 12 meses cargados.
  const f = { ...leerFiltro(sp), ncm: [codigo] };
  f.hasta ??= periodos.at(-1);
  f.desde ??= periodos[Math.max(0, periodos.indexOf(f.hasta!) - 11)] ?? periodos[0];

  const [refs, info, aperturas, alicNombres, soft, serie, imps, paises, marcas] = await Promise.all([
    referencias(),
    pool.query("select *, to_char(vigencia, 'DD/MM/YYYY') vig from ref_ncm_vigente where codigo = $1", [codigo]).then((r) => r.rows[0]),
    alicuotasDeNcm(codigo), nombresAlicuotas(), resumenSoftrade(f, org),
    serieMensual(f, org), rankingImportadores(f, org, "fob", 50), rankingPaises(f, org), marcasVistas(f, org),
  ]);
  const vigencia = aperturas[0]?.vigencia ?? info?.vig;

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-base font-bold font-mono">{codigo}</h2>
        <p className="text-xs text-[#5C6B76]">{info?.descripcion_completa ?? "No está en el nomenclador (o todavía no se cargó)."}</p>
      </section>

      <form className="flex flex-wrap gap-2 items-end">
        <input type="hidden" name="c" value={codigo} />
        <label className={ETIQUETA}>Desde
          <select name="desde" defaultValue={f.desde} className={CAMPO}>{periodos.map((p) => <option key={p} value={p}>{periodoLindo(p)}</option>)}</select>
        </label>
        <label className={ETIQUETA}>Hasta
          <select name="hasta" defaultValue={f.hasta} className={CAMPO}>{periodos.map((p) => <option key={p} value={p}>{periodoLindo(p)}</option>)}</select>
        </label>
        <button className={SUAVE}>Ver</button>
        <Link href={`/importaciones?${aParams({ ...f, ncm: [codigo] }, { ver: "items" })}`} className={PRIMARIO}>Ver ítems en Buscar</Link>
      </form>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="bg-white border border-[#E3E9F0] rounded-xl p-3">
          <p className="text-[11px] text-[#5C6B76]">FOB {periodoLindo(f.desde!)}–{periodoLindo(f.hasta!)} (ARCA)</p>
          <p className="text-lg font-bold tabular-nums">USD {usd(soft.fob)}</p>
          <p className="text-[11px] text-[#5C6B76]">{soft.items} ítems</p>
          <p className="text-[11px] text-[#5C6B76] mt-1">
            Derechos pagados sobre FOB: {soft.derechosProm == null
              ? "sin dato (el concepto de derechos todavía no está confirmado)"
              : <b className="text-[#1B2A35]">{cant(soft.derechosProm)}% promedio ({soft.conDerechos} ítems)</b>}
          </p>
        </div>
        <div className="bg-white border border-[#E3E9F0] rounded-xl p-3">
          <p className="text-[11px] text-[#5C6B76]">Alícuotas vigentes (nomenclador{vigencia ? ` del ${vigencia}` : ""})</p>
          {aperturas.length === 0 ? (
            <p className="text-xs text-[#5C6B76] mt-1">El nomenclador todavía no está cargado.</p>
          ) : (
            <ul className="text-xs mt-1 space-y-0.5">
              {[0, 1, 2, 3, 4].map((i) => {
                const vals = [...new Set(aperturas.map((a) => a.alic[i]))];
                return (
                  <li key={i} className="flex justify-between gap-2">
                    <span className={alicNombres[i] ? "font-bold" : "text-[#5C6B76]"}>{tituloAlicuota(alicNombres, i)}</span>
                    <span className="tabular-nums">{vals.length === 1 ? `${cant(vals[0])}%` : `${cant(Math.min(...vals.map((v) => v ?? 0)))}–${cant(Math.max(...vals.map((v) => v ?? 0)))}%`}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="bg-white border border-[#E3E9F0] rounded-xl p-3">
          <p className="text-[11px] text-[#5C6B76]">CIF y kilos (Softrade)</p>
          {soft.conSoftrade === 0 ? (
            <p className="text-xs text-[#5C6B76] mt-1">No hay datos de Softrade para esta NCM en el período.</p>
          ) : (
            <ul className="text-xs mt-1 space-y-0.5">
              <li className="flex justify-between"><span>Ítems con Softrade</span><span className="tabular-nums">{soft.conSoftrade} de {soft.items}</span></li>
              <li className="flex justify-between"><span>CIF USD</span><span className="tabular-nums">{usd(soft.cif)}</span></li>
              <li className="flex justify-between"><span>Kg netos</span><span className="tabular-nums">{cant(soft.kgNetos)}</span></li>
              <li className="flex justify-between"><span>FOB por kg</span><span className="tabular-nums">{soft.kgNetos && soft.fobSoftrade ? `USD ${cant(soft.fobSoftrade / soft.kgNetos)}` : "—"}</span></li>
              <li className="flex justify-between"><span>CIF / FOB</span><span className="tabular-nums">{soft.cif && soft.fobSoftrade ? `${cant(soft.cif / soft.fobSoftrade)}×` : "—"}</span></li>
            </ul>
          )}
        </div>
      </section>

      {aperturas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[#16577F] font-semibold">Aperturas SIM y sus alícuotas ({aperturas.length})</summary>
          <div className={`${CAJA_TABLA} mt-2`}>
            <table className={TABLA}>
              <thead className={THEAD}><tr>
                <Col texto="Apertura" derecha={false} /><Col texto="Descripción" derecha={false} />
                <Col texto={`Alícuotas: ${[0, 1, 2, 3, 4].map((i) => tituloAlicuota(alicNombres, i)).join(" · ")}`} derecha={false} />
              </tr></thead>
              <tbody>{aperturas.map((a) => (
                <tr key={a.codigo} className={TR}>
                  <td className={`${TD} font-mono whitespace-nowrap`}>{a.codigo}</td>
                  <td className={TD}>{a.descripcion}</td>
                  <td className={TD}><Alicuotas alic={a.alic} nombres={alicNombres} /></td>
                </tr>))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <section>
        <h3 className="text-sm font-bold mb-2">Serie mensual</h3>
        <Serie filas={serie} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-bold mb-2">Importadores ({imps.total})</h3>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><Col texto="Importador" derecha={false} /><Col texto="FOB USD" /><Col texto="%" /><Col texto="Cantidad" /><Col texto="Vía" derecha={false} /></tr></thead>
              <tbody>{imps.filas.map((x) => (
                <tr key={x.importador} className={TR}>
                  <td className={TD}><LinkImportador nombre={x.importador} /></td><td className={TDN}>{usd(x.fob)}</td>
                  <td className={TDN}>{pct(x.pct)}</td><td className={TDN}>{cant(x.cantidad)}</td><td className={TD}>{nombre(refs.transporte, x.via)}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h3 className="text-sm font-bold mb-2">Países de origen</h3>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><Col texto="País" derecha={false} /><Col texto="FOB USD" /><Col texto="%" /><Col texto="Importadores" /></tr></thead>
              <tbody>{paises.map((x) => (
                <tr key={x.pais} className={TR}>
                  <td className={TD}>{nombre(refs.pais, x.pais)}</td><td className={TDN}>{usd(x.fob)}</td>
                  <td className={TDN}>{pct(x.pct)}</td><td className={TDN}>{x.importadores}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
          <h3 className="text-sm font-bold mb-2 mt-5">Marcas vistas (Softrade)</h3>
          <MarcasVistas marcas={marcas} />
        </section>
      </div>
    </div>
  );
}
