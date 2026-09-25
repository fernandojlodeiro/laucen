// Descubrir: las consultas que sólo se pueden hacer con todo el universo
// cargado (docs, sección 7.1). Cada una: 2-3 parámetros y una tabla
// ordenable con link a la ficha de la NCM y del importador.

import Link from "next/link";
import { pool } from "@/db";
import { periodoLindo, periodosCargados, sumarMeses } from "@/lib/arca/filtro";
import { VIAS, nombre, referencias, type Refs } from "@/lib/arca/consultas";
import { densidadVias, importadoresNuevos, ncmQueCrecen, nichos } from "@/lib/arca/descubrir";
import { PRIMARIO } from "@/app/botones";
import { CAJA_TABLA, CAMPO, Col, ETIQUETA, LinkImportador, LinkNcm, SinDatos, TABLA, TD, TDN, THEAD, TR, entrar, pct, usd, usd2, variacion } from "../Piezas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = Record<string, string | undefined>;

const CONSULTAS = [
  { clave: "crecen", texto: "NCM que crecen" },
  { clave: "nuevos", texto: "Importadores nuevos" },
  { clave: "nicho", texto: "Pocos importadores, mucho FOB" },
  { clave: "vias", texto: "Marítimo / aéreo por NCM" },
] as const;

const num = (v: string | undefined) => {
  const n = v ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export default async function Descubrir({ searchParams }: { searchParams: Promise<Params> }) {
  const sesion = await entrar();
  const org = sesion.org.id;
  const sp = await searchParams;
  const consulta = CONSULTAS.some((c) => c.clave === sp.q) ? sp.q! : "crecen";
  const periodos = await periodosCargados();
  if (!periodos.length) return <SinDatos />;

  const [refs, rubros] = await Promise.all([
    referencias(),
    pool.query<{ id: number; nombre: string }>("select id::int, nombre from rubros where organizacion_id = $1 order by nombre", [org]).then((r) => r.rows),
  ]);
  const ultimo = periodos.at(-1)!;
  const href = (extra: Params) => `/importaciones/descubrir?${new URLSearchParams(
    Object.entries({ ...sp, ...extra }).filter(([, v]) => v !== undefined && v !== "") as [string, string][])}`;

  const Periodo = ({ name, valor }: { name: string; valor: string }) => (
    <label className={ETIQUETA}>{name === "desde" ? "Desde" : "Hasta"}
      <select name={name} defaultValue={valor} className={CAMPO}>{periodos.map((p) => <option key={p} value={p}>{periodoLindo(p)}</option>)}</select>
    </label>
  );
  const Pais = ({ valor }: { valor?: string }) => (
    <label className={ETIQUETA}>País de origen
      <select name="pais" defaultValue={valor ?? ""} className={CAMPO}>
        <option value="">Todos</option>
        {[...refs.pais.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        {valor && !refs.pais.has(valor) && <option value={valor}>{valor}</option>}
      </select>
    </label>
  );
  const Rubro = ({ valor }: { valor?: string }) => (
    <label className={ETIQUETA}>Rubro
      <select name="rubro" defaultValue={valor ?? ""} className={CAMPO}>
        <option value="">Ninguno</option>
        {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
      </select>
    </label>
  );
  const Prefijo = ({ valor }: { valor?: string }) => (
    <label className={ETIQUETA}>Capítulo / prefijo NCM<input name="prefijo" defaultValue={valor} className={`${CAMPO} w-32`} placeholder="85 9403" /></label>
  );
  const Enviar = () => <button className={PRIMARIO}>Consultar</button>;
  const FORM = "bg-white border border-[#E3E9F0] rounded-xl p-3 mb-3 flex flex-wrap gap-3 items-end";

  let cuerpo: React.ReactNode;
  if (consulta === "crecen") {
    const p = {
      hasta: sp.hasta ?? ultimo, meses: Math.min(60, Math.max(1, num(sp.meses) ?? 12)),
      pais: sp.pais ?? "310", transporte: sp.tr ?? "8", prefijo: sp.prefijo, rubro: num(sp.rubro),
      fobMin: num(sp.fobmin), impMin: num(sp.impmin), orden: sp.o ?? "dif_fob",
    };
    const filas = await ncmQueCrecen(p, org);
    const ord = (o: string) => href({ o });
    const desdeAct = sumarMeses(p.hasta, -(p.meses - 1));
    cuerpo = (
      <>
        <form className={FORM}>
          <input type="hidden" name="q" value="crecen" />
          <Periodo name="hasta" valor={p.hasta} />
          <label className={ETIQUETA}>Ventana (meses)<input name="meses" defaultValue={p.meses} className={`${CAMPO} w-20`} inputMode="numeric" /></label>
          <Pais valor={p.pais} />
          <TransporteSel refs={refs} valor={p.transporte} />
          <Prefijo valor={p.prefijo} /><Rubro valor={sp.rubro} />
          <label className={ETIQUETA}>FOB mínimo (USD)<input name="fobmin" defaultValue={sp.fobmin} className={`${CAMPO} w-28`} inputMode="decimal" /></label>
          <label className={ETIQUETA}>Mín. importadores<input name="impmin" defaultValue={sp.impmin} className={`${CAMPO} w-20`} inputMode="numeric" /></label>
          <Enviar />
        </form>
        <p className="text-[11px] text-[#5C6B76] mb-2">
          {periodoLindo(desdeAct)}–{periodoLindo(p.hasta)} contra {periodoLindo(sumarMeses(desdeAct, -p.meses))}–{periodoLindo(sumarMeses(desdeAct, -1))}.
          {" "}Si el período anterior no está cargado, todo aparece como “nuevo”.
        </p>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr>
              <Col texto="NCM" derecha={false} /><Col texto="Descripción" derecha={false} />
              <Col texto="FOB actual" clave="fob_act" orden={p.orden} href={ord} /><Col texto="FOB anterior" />
              <Col texto="Diferencia USD" clave="dif_fob" orden={p.orden} href={ord} />
              <Col texto="Var. FOB" clave="var_fob" orden={p.orden} href={ord} />
              <Col texto="Var. cantidad" clave="var_cant" orden={p.orden} href={ord} />
              <Col texto="Importadores" clave="imp_act" orden={p.orden} href={ord} />
            </tr></thead>
            <tbody>{filas.map((x) => (
              <tr key={x.ncm} className={TR}>
                <td className={TD}><LinkNcm ncm={x.ncm} /></td><td className={`${TD} text-[#5C6B76] max-w-sm`}>{x.descripcion ?? "—"}</td>
                <td className={TDN}>{usd(x.fob_act)}</td><td className={TDN}>{usd(x.fob_ant)}</td><td className={TDN}>{usd(x.dif_fob)}</td>
                <td className={TDN}>{variacion(x.var_fob)}</td><td className={TDN}>{variacion(x.var_cant)}</td>
                <td className={TDN}>{x.imp_act} <span className="text-[#9AA7B3]">(antes {x.imp_ant})</span></td>
              </tr>))}
            </tbody>
          </table>
          {filas.length === 0 && <p className={`${TD} text-xs text-[#5C6B76]`}>Nada para estos parámetros.</p>}
        </div>
      </>
    );
  } else if (consulta === "nuevos") {
    const p = {
      desde: sp.desde ?? ultimo, hasta: sp.hasta ?? ultimo, mesesAntes: Math.min(120, Math.max(1, num(sp.antes) ?? 12)),
      pais: sp.pais, prefijo: sp.prefijo, rubro: num(sp.rubro),
    };
    const filas = await importadoresNuevos(p, org);
    cuerpo = (
      <>
        <form className={FORM}>
          <input type="hidden" name="q" value="nuevos" />
          <Periodo name="desde" valor={p.desde} /><Periodo name="hasta" valor={p.hasta} />
          <label className={ETIQUETA}>Sin actividad en los N meses anteriores<input name="antes" defaultValue={p.mesesAntes} className={`${CAMPO} w-20`} inputMode="numeric" /></label>
          <Pais valor={p.pais} /><Prefijo valor={p.prefijo} /><Rubro valor={sp.rubro} />
          <Enviar />
        </form>
        <p className="text-[11px] text-[#5C6B76] mb-2">
          Importadores con despachos en el período (y el filtro) que no importaron nada, de ningún rubro, entre {periodoLindo(sumarMeses(p.desde, -p.mesesAntes))} y {periodoLindo(sumarMeses(p.desde, -1))}.
          {" "}Si esos meses no están cargados, todos parecen nuevos.
        </p>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><Col texto="Importador" derecha={false} /><Col texto="Desde" derecha={false} /><Col texto="FOB USD" /><Col texto="Ítems" /><Col texto="Sus NCM principales" derecha={false} /></tr></thead>
            <tbody>{filas.map((x) => (
              <tr key={x.importador} className={TR}>
                <td className={TD}><LinkImportador nombre={x.importador} /></td><td className={TD}>{periodoLindo(x.primer_periodo)}</td>
                <td className={TDN}>{usd(x.fob)}</td><td className={TDN}>{x.items}</td>
                <td className={TD}>{x.ncms?.split(" · ").map((c, i) => <span key={c}>{i > 0 && " · "}<LinkNcm ncm={c} /></span>)}</td>
              </tr>))}
            </tbody>
          </table>
          {filas.length === 0 && <p className={`${TD} text-xs text-[#5C6B76]`}>Nada para estos parámetros.</p>}
        </div>
      </>
    );
  } else if (consulta === "nicho") {
    const p = {
      desde: sp.desde ?? periodos[Math.max(0, periodos.length - 12)], hasta: sp.hasta ?? ultimo,
      fobMin: num(sp.fobmin) ?? 500000, impMax: num(sp.impmax) ?? 3, pais: sp.pais ?? "310", prefijo: sp.prefijo, rubro: num(sp.rubro),
    };
    const filas = await nichos(p, org);
    cuerpo = (
      <>
        <form className={FORM}>
          <input type="hidden" name="q" value="nicho" />
          <Periodo name="desde" valor={p.desde} /><Periodo name="hasta" valor={p.hasta} />
          <label className={ETIQUETA}>FOB total mínimo (USD)<input name="fobmin" defaultValue={p.fobMin} className={`${CAMPO} w-28`} inputMode="decimal" /></label>
          <label className={ETIQUETA}>Máx. importadores<input name="impmax" defaultValue={p.impMax} className={`${CAMPO} w-20`} inputMode="numeric" /></label>
          <Pais valor={p.pais} /><Prefijo valor={p.prefijo} /><Rubro valor={sp.rubro} />
          <Enviar />
        </form>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><Col texto="NCM" derecha={false} /><Col texto="Descripción" derecha={false} /><Col texto="FOB USD" /><Col texto="Ítems" /><Col texto="Importadores" /><Col texto="El principal" derecha={false} /><Col texto="Su %" /></tr></thead>
            <tbody>{filas.map((x) => (
              <tr key={x.ncm} className={TR}>
                <td className={TD}><LinkNcm ncm={x.ncm} /></td><td className={`${TD} text-[#5C6B76] max-w-sm`}>{x.descripcion ?? "—"}</td>
                <td className={TDN}>{usd(x.fob)}</td><td className={TDN}>{x.items}</td><td className={TDN}>{x.importadores}</td>
                <td className={TD}>{x.principal && <LinkImportador nombre={x.principal} />}</td><td className={TDN}>{pct(x.pct_principal)}</td>
              </tr>))}
            </tbody>
          </table>
          {filas.length === 0 && <p className={`${TD} text-xs text-[#5C6B76]`}>Nada para estos parámetros.</p>}
        </div>
      </>
    );
  } else {
    const p = {
      desde: sp.desde ?? periodos[Math.max(0, periodos.length - 12)], hasta: sp.hasta ?? ultimo,
      pais: sp.pais ?? "310", prefijo: sp.prefijo, rubro: num(sp.rubro), fobMin: num(sp.fobmin), orden: sp.o ?? "fob",
    };
    const filas = await densidadVias(p, org);
    const ord = (o: string) => href({ o });
    const todas = [...VIAS.map((v) => ({ clave: v.clave, texto: v.texto })), { clave: "otros", texto: "Otros" }];
    cuerpo = (
      <>
        <form className={FORM}>
          <input type="hidden" name="q" value="vias" />
          <Periodo name="desde" valor={p.desde} /><Periodo name="hasta" valor={p.hasta} />
          <Pais valor={p.pais} /><Prefijo valor={p.prefijo} /><Rubro valor={sp.rubro} />
          <label className={ETIQUETA}>FOB mínimo (USD)<input name="fobmin" defaultValue={sp.fobmin} className={`${CAMPO} w-28`} inputMode="decimal" /></label>
          <Enviar />
        </form>
        <p className="text-[11px] text-[#5C6B76] mb-2">Por vía: % de ítems · % de FOB · FOB unitario promedio (USD por unidad declarada).</p>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr>
              <Col texto="NCM" derecha={false} /><Col texto="Descripción" derecha={false} />
              <Col texto="FOB USD" clave="fob" orden={p.orden} href={ord} /><Col texto="Ítems" />
              {todas.map((v) => <Col key={v.clave} texto={v.texto} clave={v.clave === "otros" ? undefined : v.clave} orden={p.orden} href={ord} />)}
            </tr></thead>
            <tbody>{filas.map((x) => (
              <tr key={x.ncm} className={TR}>
                <td className={TD}><LinkNcm ncm={x.ncm} /></td><td className={`${TD} text-[#5C6B76] max-w-xs`}>{x.descripcion ?? "—"}</td>
                <td className={TDN}>{usd(x.fob)}</td><td className={TDN}>{x.items}</td>
                {todas.map((v) => {
                  const d = x.porVia[v.clave];
                  return (
                    <td key={v.clave} className={TDN}>
                      {d.pctItems ? <>{pct(d.pctItems)} · {pct(d.pctFob)}<span className="block text-[10px] text-[#5C6B76]">{usd2(d.unit)}/u</span></> : <span className="text-[#C9D3DD]">—</span>}
                    </td>
                  );
                })}
              </tr>))}
            </tbody>
          </table>
          {filas.length === 0 && <p className={`${TD} text-xs text-[#5C6B76]`}>Nada para estos parámetros.</p>}
        </div>
      </>
    );
  }

  return (
    <>
      <nav className="flex gap-1 border-b border-[#E3E9F0] mb-3 overflow-x-auto">
        {CONSULTAS.map((c) => (
          <Link key={c.clave} href={`/importaciones/descubrir?q=${c.clave}`}
            className={`px-3 py-1.5 text-xs font-bold -mb-px border-b-2 rounded-t-lg whitespace-nowrap ${consulta === c.clave ? "border-[#16577F] text-[#16577F] bg-white" : "border-transparent text-[#5C6B76] hover:text-[#16577F]"}`}>
            {c.texto}
          </Link>
        ))}
      </nav>
      {cuerpo}
    </>
  );
}

function TransporteSel({ refs, valor }: { refs: Refs; valor?: string }) {
  return (
    <label className={ETIQUETA}>Transporte
      <select name="tr" defaultValue={valor ?? ""} className={CAMPO}>
        <option value="">Todos</option>
        {[...refs.transporte.keys()].map((t) => <option key={t} value={t}>{nombre(refs.transporte, t)}</option>)}
        <option value="-">(vacío)</option>
      </select>
    </label>
  );
}

