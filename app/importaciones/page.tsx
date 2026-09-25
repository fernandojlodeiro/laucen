// Buscar: filtros combinables + cinco salidas (importadores, NCM, países,
// serie mensual, ítems). El filtro vive en la dirección: se puede guardar
// como link y el CSV exporta exactamente lo mismo que se ve.

import Link from "next/link";
import { pool } from "@/db";
import { aParams, hayFiltro, leerFiltro, periodoLindo, periodosCargados, usaResumen, type Filtro, type Params } from "@/lib/arca/filtro";
import {
  cobertura, codigosVistos, items, nombre, rankingImportadores, rankingNcm, rankingPaises, referencias, serieMensual, type Refs,
} from "@/lib/arca/consultas";
import { PRIMARIO, SUAVE } from "@/app/botones";
import {
  CAJA_TABLA, CAMPO, Col, ETIQUETA, LinkImportador, LinkNcm, SinDatos, TABLA, TD, TDN, THEAD, TR,
  cant, entrar, pct, usd,
} from "./Piezas";
import { Barra, Items, Serie } from "./Tablas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VISTAS = [
  { clave: "importadores", texto: "Importadores" },
  { clave: "ncm", texto: "NCM" },
  { clave: "paises", texto: "Países" },
  { clave: "serie", texto: "Serie mensual" },
  { clave: "items", texto: "Ítems" },
] as const;
type Vista = (typeof VISTAS)[number]["clave"];

const LIMITE = 200;

function Formulario({ f, periodos, refs, vistos, rubros, vista }: {
  f: Filtro; periodos: string[]; refs: Refs; vistos: { paises: string[]; transportes: string[] };
  rubros: { id: number; nombre: string }[]; vista: Vista;
}) {
  const desde = f.desde ?? periodos[0];
  const hasta = f.hasta ?? periodos.at(-1);
  const paises = [...new Set([...refs.pais.keys(), ...vistos.paises])].filter(Boolean)
    .sort((a, b) => nombre(refs.pais, a).localeCompare(nombre(refs.pais, b)));
  const transportes = [...new Set([...refs.transporte.keys(), ...vistos.transportes.filter(Boolean)])].sort();
  const Periodo = ({ name, valor }: { name: string; valor?: string }) => (
    <select name={name} defaultValue={valor} className={CAMPO}>
      {periodos.map((p) => <option key={p} value={p}>{periodoLindo(p)}</option>)}
    </select>
  );
  const Pais = ({ name, valor }: { name: string; valor?: string }) => (
    <select name={name} defaultValue={valor ?? ""} className={CAMPO}>
      <option value="">Todos</option>
      {paises.map((p) => <option key={p} value={p}>{nombre(refs.pais, p)}{refs.pais.has(p) ? ` (${p})` : ""}</option>)}
    </select>
  );
  return (
    <form className="bg-white border border-[#E3E9F0] rounded-xl p-3 mb-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
      <input type="hidden" name="ver" value={vista} />
      <label className={ETIQUETA}>Desde<Periodo name="desde" valor={desde} /></label>
      <label className={ETIQUETA}>Hasta<Periodo name="hasta" valor={hasta} /></label>
      <label className={`${ETIQUETA} col-span-2`}>NCM (una o varias, o prefijo: 85, 8516, 9403.20)
        <input name="ncm" defaultValue={f.ncm.join(" ")} className={CAMPO} placeholder="8516.29.00 9403" />
      </label>
      <label className={ETIQUETA}>Rubro
        <select name="rubro" defaultValue={f.rubro ?? ""} className={CAMPO}>
          <option value="">Ninguno</option>
          {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </label>
      <label className={ETIQUETA}>Importador (texto)<input name="imp" defaultValue={f.importador} className={CAMPO} /></label>
      <label className={ETIQUETA}>País de origen<Pais name="po" valor={f.paisOrigen} /></label>
      <label className={ETIQUETA}>País de procedencia<Pais name="pp" valor={f.paisProc} /></label>
      <label className={ETIQUETA}>Transporte
        <select name="tr" defaultValue={f.transporte ?? ""} className={CAMPO}>
          <option value="">Todos</option>
          {transportes.map((t) => <option key={t} value={t}>{nombre(refs.transporte, t)}{refs.transporte.has(t) ? "" : " (sin nombre)"}</option>)}
          <option value="-">(vacío)</option>
        </select>
      </label>
      <label className={ETIQUETA}>Aduana (código)<input name="adu" defaultValue={f.aduana} className={CAMPO} /></label>
      <label className={ETIQUETA}>FOB unitario (USD)
        <span className="flex gap-1">
          <input name="fumin" defaultValue={f.fobUnitMin} className={`${CAMPO} w-full`} placeholder="mín" inputMode="decimal" />
          <input name="fumax" defaultValue={f.fobUnitMax} className={`${CAMPO} w-full`} placeholder="máx" inputMode="decimal" />
        </span>
      </label>
      <label className={ETIQUETA}>Cantidad
        <span className="flex gap-1">
          <input name="cmin" defaultValue={f.cantMin} className={`${CAMPO} w-full`} placeholder="mín" inputMode="decimal" />
          <input name="cmax" defaultValue={f.cantMax} className={`${CAMPO} w-full`} placeholder="máx" inputMode="decimal" />
        </span>
      </label>
      <label className={ETIQUETA}>Marca (Softrade)<input name="marca" defaultValue={f.marca} className={CAMPO} /></label>
      <label className={ETIQUETA}>Cód. artículo (Softrade)<input name="cod" defaultValue={f.codigo} className={CAMPO} /></label>
      {f.importadorExacto && <input type="hidden" name="impx" value={f.importadorExacto} />}
      <div className="flex gap-2 col-span-2">
        <button className={PRIMARIO}>Buscar</button>
        <Link href={`/importaciones?ver=${vista}`} className={SUAVE}>Limpiar</Link>
      </div>
    </form>
  );
}

function SubPestanas({ f, vista }: { f: Filtro; vista: Vista }) {
  return (
    <nav className="flex gap-1 border-b border-[#E3E9F0] mb-3 overflow-x-auto">
      {VISTAS.map((v) => (
        <Link key={v.clave} href={`/importaciones?${aParams(f, { ver: v.clave })}`}
          className={`px-3 py-1.5 text-xs font-bold -mb-px border-b-2 rounded-t-lg whitespace-nowrap ${vista === v.clave ? "border-[#16577F] text-[#16577F] bg-white" : "border-transparent text-[#5C6B76] hover:text-[#16577F]"}`}>
          {v.texto}
        </Link>
      ))}
    </nav>
  );
}

export default async function Buscar({ searchParams }: { searchParams: Promise<Params> }) {
  const sesion = await entrar();
  const org = sesion.org.id;
  const sp = await searchParams;
  const vista: Vista = VISTAS.some((v) => v.clave === sp.ver) ? (sp.ver as Vista) : "importadores";
  const orden = typeof sp.o === "string" ? sp.o : "fob";

  const periodos = await periodosCargados();
  if (!periodos.length) return <SinDatos />;

  const f = leerFiltro(sp);
  f.desde ??= periodos.at(-1);
  f.hasta ??= periodos.at(-1);
  const [refs, vistos, rubros, cob] = await Promise.all([
    referencias(), codigosVistos(),
    pool.query<{ id: number; nombre: string }>("select id::int, nombre from rubros where organizacion_id = $1 order by nombre", [org]).then((r) => r.rows),
    hayFiltro(f) ? cobertura(f, org) : Promise.resolve(null),
  ]);
  const qs = (extra: Record<string, string | undefined> = {}) => aParams(f, { ver: vista, ...extra });
  const ordenar = (o: string) => `/importaciones?${qs({ o })}`;
  const csv = `/importaciones/csv?${qs({ o: orden })}`;

  let contenido: React.ReactNode;
  if (vista === "importadores") {
    const { filas, total } = await rankingImportadores(f, org, orden, LIMITE);
    contenido = (
      <>
        <Barra total={total} mostrados={filas.length} csv={csv} />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr>
              <Col texto="Importador" clave="importador" orden={orden} href={ordenar} derecha={false} />
              <Col texto="FOB USD" clave="fob" orden={orden} href={ordenar} />
              <Col texto="% del total" />
              <Col texto="Cantidad" clave="cantidad" orden={orden} href={ordenar} />
              <Col texto="Ítems" clave="items" orden={orden} href={ordenar} />
              <Col texto="NCM" clave="ncms" orden={orden} href={ordenar} />
              <Col texto="Transporte principal" derecha={false} />
            </tr></thead>
            <tbody>
              {filas.map((x) => (
                <tr key={x.importador} className={TR}>
                  <td className={TD}><LinkImportador nombre={x.importador} /></td>
                  <td className={TDN}>{usd(x.fob)}</td><td className={TDN}>{pct(x.pct)}</td>
                  <td className={TDN}>{cant(x.cantidad)}</td><td className={TDN}>{x.items}</td><td className={TDN}>{x.ncms}</td>
                  <td className={TD}>{nombre(refs.transporte, x.via)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  } else if (vista === "ncm") {
    const { filas, total } = await rankingNcm(f, org, orden, LIMITE);
    contenido = (
      <>
        <Barra total={total} mostrados={filas.length} csv={csv} />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr>
              <Col texto="NCM" clave="ncm" orden={orden} href={ordenar} derecha={false} />
              <Col texto="Descripción" derecha={false} />
              <Col texto="FOB USD" clave="fob" orden={orden} href={ordenar} />
              <Col texto="% del total" />
              <Col texto="Cantidad" clave="cantidad" orden={orden} href={ordenar} />
              <Col texto="Ítems" clave="items" orden={orden} href={ordenar} />
              <Col texto="Importadores" clave="importadores" orden={orden} href={ordenar} />
            </tr></thead>
            <tbody>
              {filas.map((x) => (
                <tr key={x.ncm} className={TR}>
                  <td className={TD}><LinkNcm ncm={x.ncm} /></td>
                  <td className={`${TD} text-[#5C6B76] max-w-md`}>{x.descripcion ?? "—"}</td>
                  <td className={TDN}>{usd(x.fob)}</td><td className={TDN}>{pct(x.pct)}</td>
                  <td className={TDN}>{cant(x.cantidad)}</td><td className={TDN}>{x.items}</td><td className={TDN}>{x.importadores}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  } else if (vista === "paises") {
    const filas = await rankingPaises(f, org);
    contenido = (
      <>
        <Barra total={filas.length} mostrados={filas.length} csv={csv} />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr>
              <Col texto="País de origen" derecha={false} /><Col texto="FOB USD" /><Col texto="% del total" />
              <Col texto="Cantidad" /><Col texto="Ítems" /><Col texto="Importadores" />
            </tr></thead>
            <tbody>
              {filas.map((x) => (
                <tr key={x.pais} className={TR}>
                  <td className={TD}>{nombre(refs.pais, x.pais)}{refs.pais.has(x.pais) ? "" : " (sin nombre)"}</td>
                  <td className={TDN}>{usd(x.fob)}</td><td className={TDN}>{pct(x.pct)}</td>
                  <td className={TDN}>{cant(x.cantidad)}</td><td className={TDN}>{x.items}</td><td className={TDN}>{x.importadores}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  } else if (vista === "serie") {
    contenido = <Serie filas={await serieMensual(f, org)} csv={csv} />;
  } else {
    contenido = <Items datos={await items(f, org, LIMITE)} refs={refs} csv={csv} />;
  }

  return (
    <>
      <Formulario f={f} periodos={periodos} refs={refs} vistos={vistos} rubros={rubros} vista={vista} />
      <p className="text-[11px] text-[#5C6B76] mb-2">
        {periodoLindo(f.desde!)}{f.hasta !== f.desde ? ` a ${periodoLindo(f.hasta!)}` : ""} ·{" "}
        {usaResumen(f) ? "desde el resumen mensual" : "desde el detalle ítem por ítem (filtro fino: puede tardar más)"}
        {cob && <> · Softrade cubre {cob.con} de {cob.total} ítems ({pct(cob.total ? cob.con / cob.total : null)})</>}
      </p>
      <SubPestanas f={f} vista={vista} />
      {contenido}
    </>
  );
}
