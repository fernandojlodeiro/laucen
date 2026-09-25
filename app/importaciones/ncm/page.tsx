// Ficha de una NCM: qué es (nomenclador), serie mensual, quién la importa,
// de dónde, por qué vía, y las marcas vistas en Softrade.

import Link from "next/link";
import { pool } from "@/db";
import { aParams, leerFiltro, periodoLindo, periodosCargados, type Params } from "@/lib/arca/filtro";
import { marcasVistas, nombre, rankingImportadores, rankingPaises, referencias, serieMensual } from "@/lib/arca/consultas";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { CAJA_TABLA, CAMPO, Col, ETIQUETA, LinkImportador, SinDatos, TABLA, TD, TDN, THEAD, TR, cant, entrar, pct, usd } from "../Piezas";
import { MarcasVistas, Serie } from "../Tablas";

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

  const [refs, info, hijas, serie, imps, paises, marcas] = await Promise.all([
    referencias(),
    pool.query("select * from ref_ncm where codigo = $1", [codigo]).then((r) => r.rows[0]),
    pool.query("select codigo, descripcion, nivel from ref_ncm where padre = $1 or (codigo like $2 and tipo = 'sim') order by codigo limit 100",
      [codigo, `${codigo}.%`]).then((r) => r.rows),
    serieMensual(f, org), rankingImportadores(f, org, "fob", 50), rankingPaises(f, org), marcasVistas(f, org),
  ]);

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-base font-bold font-mono">{codigo}</h2>
        <p className="text-xs text-[#5C6B76]">{info?.descripcion_completa ?? "No está en el nomenclador (o todavía no se cargó)."}</p>
        {info && (info.alic_1 != null) && (
          <p className="text-[11px] text-[#5C6B76] mt-1">
            Alícuotas del nomenclador (cuál es cuál: sin verificar): {[info.alic_1, info.alic_2, info.alic_3, info.alic_4, info.alic_5].map((a) => a ?? "—").join(" · ")}
          </p>
        )}
        {hijas.length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-[#16577F] font-semibold">Aperturas SIM ({hijas.length})</summary>
            <ul className="mt-1 space-y-0.5">
              {hijas.map((h) => <li key={h.codigo}><span className="font-mono">{h.codigo}</span> — {h.descripcion}</li>)}
            </ul>
          </details>
        )}
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
