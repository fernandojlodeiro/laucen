// Ficha de un importador: todo lo que importa (NCM, país, vía, FOB,
// cantidad, serie mensual). Es el "mapeo inverso": sus NCM se pueden
// agregar de una a un rubro.

import Link from "next/link";
import { pool } from "@/db";
import { aParams, leerFiltro, periodoLindo, periodosCargados, type Params } from "@/lib/arca/filtro";
import { marcasVistas, nombre, rankingNcm, rankingPaises, referencias, serieMensual } from "@/lib/arca/consultas";
import { tienePermiso } from "@/lib/permisos";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { accionAgregarNcm, accionCrearRubro } from "../actions";
import { CAJA_TABLA, CAMPO, Col, ETIQUETA, LinkNcm, SinDatos, TABLA, TD, TDN, THEAD, TR, cant, entrar, pct, usd } from "../Piezas";
import { MarcasVistas, Serie } from "../Tablas";

export const dynamic = "force-dynamic";

export default async function FichaImportador({ searchParams }: { searchParams: Promise<Params> }) {
  const sesion = await entrar();
  const org = sesion.org.id;
  const puedeRubros = tienePermiso(sesion.permisos, "importaciones_rubros");
  const sp = await searchParams;
  const imp = String(sp.n ?? "").trim();
  const periodos = await periodosCargados();
  if (!periodos.length) return <SinDatos />;

  const f = { ...leerFiltro(sp), importadorExacto: imp, importador: undefined };
  f.hasta ??= periodos.at(-1);
  f.desde ??= periodos[Math.max(0, periodos.indexOf(f.hasta!) - 11)] ?? periodos[0];

  const [refs, ncms, paises, serie, marcas, nombresCompletos, rubros] = await Promise.all([
    referencias(), rankingNcm(f, org, "fob", 500), rankingPaises(f, org), serieMensual(f, org), marcasVistas(f, org),
    pool.query<{ importador: string }>("select distinct importador from softrade_items where left(importador, 30) = $1 limit 3", [imp]).then((r) => r.rows),
    pool.query<{ id: number; nombre: string }>("select id::int, nombre from rubros where organizacion_id = $1 order by nombre", [org]).then((r) => r.rows),
  ]);
  const volver = `/importaciones/importador?${new URLSearchParams({ n: imp, desde: f.desde!, hasta: f.hasta! })}`;

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-base font-bold">{imp}</h2>
        <p className="text-xs text-[#5C6B76]">
          ARCA trae el nombre cortado a 30 caracteres.
          {nombresCompletos.length > 0 && <> Completo según Softrade: {nombresCompletos.map((x) => x.importador).join(" / ")}.</>}
        </p>
      </section>

      <form className="flex flex-wrap gap-2 items-end">
        <input type="hidden" name="n" value={imp} />
        <label className={ETIQUETA}>Desde
          <select name="desde" defaultValue={f.desde} className={CAMPO}>{periodos.map((p) => <option key={p} value={p}>{periodoLindo(p)}</option>)}</select>
        </label>
        <label className={ETIQUETA}>Hasta
          <select name="hasta" defaultValue={f.hasta} className={CAMPO}>{periodos.map((p) => <option key={p} value={p}>{periodoLindo(p)}</option>)}</select>
        </label>
        <button className={SUAVE}>Ver</button>
        <Link href={`/importaciones?${aParams(f, { ver: "items" })}`} className={PRIMARIO}>Ver ítems en Buscar</Link>
      </form>

      <section>
        <h3 className="text-sm font-bold mb-2">Serie mensual</h3>
        <Serie filas={serie} />
      </section>

      <section>
        <h3 className="text-sm font-bold mb-2">Sus NCM ({ncms.total})</h3>
        <form action={rubros.length ? accionAgregarNcm : accionCrearRubro}>
          <input type="hidden" name="volver" value={volver} />
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr>
                {puedeRubros && <Col texto="" />}<Col texto="NCM" derecha={false} /><Col texto="Descripción" derecha={false} />
                <Col texto="FOB USD" /><Col texto="%" /><Col texto="Cantidad" /><Col texto="Ítems" />
              </tr></thead>
              <tbody>{ncms.filas.map((x) => (
                <tr key={x.ncm} className={TR}>
                  {puedeRubros && <td className={`${TD} w-6`}><input type="checkbox" name="ncm" value={x.ncm} defaultChecked className="h-4 w-4 accent-[#16577F]" aria-label={`Tildar ${x.ncm}`} /></td>}
                  <td className={TD}><LinkNcm ncm={x.ncm} /></td>
                  <td className={`${TD} text-[#5C6B76] max-w-md`}>{x.descripcion ?? "—"}</td>
                  <td className={TDN}>{usd(x.fob)}</td><td className={TDN}>{pct(x.pct)}</td>
                  <td className={TDN}>{cant(x.cantidad)}</td><td className={TDN}>{x.items}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
          {puedeRubros && ncms.filas.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2 items-center">
              {rubros.length ? (
                <>
                  <select name="rubro" className={CAMPO}>{rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select>
                  <button className={VERDE}>Agregar las tildadas a este rubro</button>
                  <Link href="/importaciones/rubros" className={SUAVE}>Crear otro rubro</Link>
                </>
              ) : (
                <>
                  <input name="nombre" placeholder="Nombre del rubro nuevo" className={CAMPO} />
                  <button className={VERDE}>Crear rubro con las tildadas</button>
                </>
              )}
            </div>
          )}
        </form>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-bold mb-2">Países de origen</h3>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><Col texto="País" derecha={false} /><Col texto="FOB USD" /><Col texto="%" /><Col texto="Ítems" /></tr></thead>
              <tbody>{paises.map((x) => (
                <tr key={x.pais} className={TR}>
                  <td className={TD}>{nombre(refs.pais, x.pais)}</td><td className={TDN}>{usd(x.fob)}</td>
                  <td className={TDN}>{pct(x.pct)}</td><td className={TDN}>{x.items}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h3 className="text-sm font-bold mb-2">Marcas vistas (Softrade)</h3>
          <MarcasVistas marcas={marcas} />
        </section>
      </div>
    </div>
  );
}
