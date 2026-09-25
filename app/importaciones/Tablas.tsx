// Tablas que se usan en Buscar y en las fichas de NCM e importador.

import { periodoLindo } from "@/lib/arca/filtro";
import { VIAS, nombre, type Refs, type items, type marcasVistas, type serieMensual } from "@/lib/arca/consultas";
import { BotonCsv, CAJA_TABLA, Col, LinkImportador, LinkNcm, TABLA, TD, TDN, THEAD, TR, cant, usd, usd2 } from "./Piezas";

/** "IVA (415): 2.339,01 · 010: 1.826,36 …" para el cartelito al pasar el mouse. */
function detalleImpuestos(imp: Record<string, number> | null, refs: Refs): string | undefined {
  if (!imp) return undefined;
  return Object.entries(imp)
    .map(([c, m]) => `${refs.concepto.has(c) ? `${refs.concepto.get(c)} (${c})` : c}: ${usd2(Number(m))}`)
    .join(" · ");
}

export function Barra({ total, mostrados, csv }: { total: number; mostrados: number; csv: string }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2 text-xs text-[#5C6B76]">
      <span>{total === 0 ? "Nada para este filtro." : mostrados < total ? `Se muestran ${mostrados} de ${total}.` : `${total} en total.`}</span>
      {total > 0 && <BotonCsv href={csv} />}
    </div>
  );
}

export function Serie({ filas, csv }: { filas: Awaited<ReturnType<typeof serieMensual>>; csv?: string }) {
  const max = Math.max(1, ...filas.map((x) => x.fob ?? 0));
  return (
    <>
      {csv && <Barra total={filas.length} mostrados={filas.length} csv={csv} />}
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr>
            <Col texto="Mes" derecha={false} /><Col texto="FOB USD" derecha={false} /><Col texto="Cantidad" /><Col texto="Ítems" /><Col texto="Importadores" />
            {VIAS.map((v) => <Col key={v.clave} texto={`FOB ${v.texto}`} />)}<Col texto="FOB otros" />
          </tr></thead>
          <tbody>
            {filas.map((x) => (
              <tr key={x.periodo} className={TR}>
                <td className={TD}>{periodoLindo(x.periodo)}</td>
                <td className={`${TD} min-w-40`}>
                  <div className="flex items-center gap-2">
                    <div className="h-2 rounded bg-[#16577F]" style={{ width: `${Math.max(2, ((x.fob ?? 0) / max) * 120)}px` }} />
                    <span className="tabular-nums">{usd(x.fob)}</span>
                  </div>
                </td>
                <td className={TDN}>{cant(x.cantidad)}</td><td className={TDN}>{x.items}</td><td className={TDN}>{x.importadores}</td>
                {VIAS.map((v) => <td key={v.clave} className={TDN}>{usd(x.porVia[v.clave])}</td>)}
                <td className={TDN}>{usd(x.porVia.otros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Items({ datos, refs, csv }: { datos: Awaited<ReturnType<typeof items>>; refs: Refs; csv?: string }) {
  const { filas, total } = datos;
  const conSoftrade = filas.some((x) => x.enriquecido);
  return (
    <>
      {csv && <Barra total={total} mostrados={filas.length} csv={csv} />}
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr>
            <Col texto="" /><Col texto="Mes" derecha={false} /><Col texto="Despacho / ítem" derecha={false} /><Col texto="Importador" derecha={false} />
            <Col texto="NCM" derecha={false} /><Col texto="Origen" derecha={false} /><Col texto="Transporte" derecha={false} />
            <Col texto="Cantidad" /><Col texto="FOB USD" /><Col texto="FOB unit." /><Col texto="Impuestos USD" />
            {conSoftrade && <><Col texto="Marca" derecha={false} /><Col texto="Cód. artículo" derecha={false} /><Col texto="Kg netos" /><Col texto="CIF USD" /><Col texto="Fecha" derecha={false} /></>}
          </tr></thead>
          <tbody>
            {filas.map((x) => (
              <tr key={`${x.destinacion}-${x.num_item}`} className={TR}>
                <td className={TD} title={x.enriquecido ? "Con datos de Softrade" : undefined}>{x.enriquecido ? "✦" : ""}</td>
                <td className={TD}>{periodoLindo(x.periodo)}</td>
                <td className={`${TD} whitespace-nowrap`}>{x.destinacion} / {x.num_item}</td>
                <td className={TD}><LinkImportador nombre={x.importador} />{x.importador_completo && x.importador_completo !== x.importador && <span className="block text-[10px] text-[#5C6B76]">{x.importador_completo}</span>}</td>
                <td className={TD}><LinkNcm ncm={x.ncm} /></td>
                <td className={TD}>{nombre(refs.pais, x.pais_origen)}</td>
                <td className={TD}>{nombre(refs.transporte, x.transporte)}</td>
                <td className={TDN}>{cant(x.cantidad)} {x.unidad ? <span className="text-[10px] text-[#5C6B76]">{nombre(refs.unidad, x.unidad)}</span> : null}</td>
                <td className={TDN}>{usd(x.fob_item)}</td><td className={TDN}>{usd2(x.fob_unit)}</td>
                <td className={TDN} title={detalleImpuestos(x.impuestos, refs)}>{usd(x.impuestos_total_usd)}</td>
                {conSoftrade && <>
                  <td className={TD}>{x.marcas?.join(", ") ?? ""}</td><td className={TD}>{x.codigos_articulo?.join(", ") ?? ""}</td>
                  <td className={TDN}>{x.kg_netos == null ? "" : cant(x.kg_netos)}</td><td className={TDN}>{x.usd_cif == null ? "" : usd(x.usd_cif)}</td>
                  <td className={TD}>{x.fecha ?? ""}</td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function MarcasVistas({ marcas }: { marcas: Awaited<ReturnType<typeof marcasVistas>> }) {
  if (!marcas.length) return <p className="text-xs text-[#5C6B76]">No hay datos de Softrade para esto todavía.</p>;
  return (
    <div className={CAJA_TABLA}>
      <table className={TABLA}>
        <thead className={THEAD}><tr><Col texto="Marca" derecha={false} /><Col texto="Subítems" /><Col texto="Ítems" /><Col texto="FOB divisa" /><Col texto="Moneda" derecha={false} /></tr></thead>
        <tbody>{marcas.map((x) => (
          <tr key={x.marca} className={TR}>
            <td className={TD}>{x.marca}</td><td className={TDN}>{x.subitems}</td><td className={TDN}>{x.items}</td>
            <td className={TDN}>{usd(x.fob_divisa)}</td><td className={TD}>{x.monedas}</td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}
