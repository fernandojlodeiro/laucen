// El tablero de gastos de Mercado Pago (lib/mercadopago/gastos.ts): lo usan el
// espacio personal y Administración › Mercado Pago › Gastos. Números grandes
// arriba, el gasto por mes (barras), por categoría (barras y tabla por mes), a
// quién se le pagó más, lo que no es gasto (aparte) y, si hay, los gastos
// personales pagados con cuentas de la empresa. Sin JavaScript: cada barra
// muestra su valor al pasar el mouse.

import Link from "next/link";
import { formatear } from "@/lib/moneda";
import { CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, TituloSeccion } from "@/app/componentes/erp";
import type { Tablero } from "@/lib/mercadopago/gastos";

const AZUL = "#16577F", AZUL_SUAVE = "#9DB8CC";
const plata = (n: number) => formatear(Math.round(n), "ARS").replace(/,00$/, "");
const nombreMes = (m: string, corto = false) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("es-AR", { month: corto ? "short" : "long", year: corto ? "2-digit" : "numeric", timeZone: "UTC" });

function Numero({ titulo, valor, ayuda, alerta }: { titulo: string; valor: string; ayuda?: string; alerta?: boolean }) {
  return (
    <div className={`${CAJA} min-w-[160px] flex-1`}>
      <p className="text-[11px] text-[#5C6B76]">{titulo}</p>
      <p className={`text-xl font-bold tabular-nums ${alerta ? "text-[#8a5a00]" : ""}`}>{valor}</p>
      {ayuda && <p className="text-[11px] text-[#5C6B76]">{ayuda}</p>}
    </div>
  );
}

/** Barras verticales de un solo color (el mes en curso, más claro). */
function BarrasMes({ datos, enCurso }: { datos: { mes: string; total: number }[]; enCurso: string }) {
  const max = Math.max(1, ...datos.map((d) => d.total));
  const ancho = 640, alto = 180, abajo = 22, arriba = 14, paso = ancho / datos.length, barra = Math.max(8, paso - 10);
  return (
    <svg viewBox={`0 0 ${ancho} ${alto + abajo + arriba}`} className="w-full h-auto" role="img" aria-label="Gasto por mes">
      <line x1="0" x2={ancho} y1={alto + arriba} y2={alto + arriba} stroke="#E3E9F0" />
      {datos.map((d, i) => {
        const h = (d.total / max) * alto, x = i * paso + (paso - barra) / 2, y = arriba + alto - h;
        const parcial = d.mes === enCurso;
        return (
          <g key={d.mes}>
            <title>{`${nombreMes(d.mes)}${parcial ? " (parcial)" : ""}: ${plata(d.total)}`}</title>
            <rect x={i * paso} y={0} width={paso} height={alto + arriba} fill="transparent" />
            {h > 0 && <path d={`M${x},${y + alto * 0 + h} V${y + 4} Q${x},${y} ${x + 4},${y} H${x + barra - 4} Q${x + barra},${y} ${x + barra},${y + 4} V${y + h} Z`} fill={parcial ? AZUL_SUAVE : AZUL} />}
            <text x={x + barra / 2} y={alto + arriba + 15} textAnchor="middle" fontSize="10" fill="#5C6B76">{nombreMes(d.mes, true)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function TableroGastos({ t, enlaceRevisar, extra }: { t: Tablero; enlaceRevisar: string; extra?: React.ReactNode }) {
  const cerradosCats = t.porCategoria.filter((c) => c.total > 0);
  const maxCat = Math.max(1, ...cerradosCats.map((c) => c.total));
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <Numero titulo="Gasto de los últimos 12 meses" valor={plata(t.totalAnio)} ayuda={`${nombreMes(t.meses[0])} a ${nombreMes(t.meses[11])}`} />
        <Numero titulo="Promedio por mes" valor={plata(t.promedioMensual)} />
        {t.recurrenteVsEventual.map((r) => <Numero key={r.recurrencia} titulo={`Gasto ${r.recurrencia}`} valor={plata(r.total)} />)}
        <Numero titulo="Sin clasificar" valor={plata(t.sinClasificar)} ayuda={`${t.sinClasificarCant} movimientos`} alerta={t.sinClasificarCant > 0} />
      </div>
      {(t.sinClasificarCant > 0 || t.candidatosPersonales > 0) && (
        <p className="text-xs mb-4">
          {t.sinClasificarCant > 0 && <>Hay {t.sinClasificarCant} gastos sin clasificar. </>}
          {t.candidatosPersonales > 0 && <>Hay {t.candidatosPersonales} pagos de la empresa que podrían ser personales. </>}
          <Link href={enlaceRevisar} className="text-[#16577F] font-semibold hover:underline">Revisarlos</Link>
        </p>
      )}

      <section className="mb-5">
        <TituloSeccion titulo="Gasto por mes" />
        <div className={CAJA}><BarrasMes datos={t.porMes} enCurso={t.enCurso} /></div>
        <p className="text-[11px] text-[#5C6B76] mt-1">La última barra, más clara, es el mes en curso (hasta hoy). Pasando el mouse se ve el monto.</p>
      </section>

      <section className="mb-5">
        <TituloSeccion titulo={`Por tipo de gasto (${cerradosCats.length})`} />
        <div className={CAJA}>
          {cerradosCats.map((c) => (
            <div key={c.categoria} className="flex items-center gap-2 text-xs py-0.5">
              <span className="w-56 shrink-0 truncate" title={c.categoria}>{c.categoria}</span>
              <span className="flex-1 h-3 bg-[#F2F5F8] rounded-sm overflow-hidden" title={`${c.categoria}: ${plata(c.total)}`}>
                <span className="block h-full rounded-r-[4px]" style={{ width: `${(c.total / maxCat) * 100}%`, background: AZUL }} />
              </span>
              <span className="w-28 text-right tabular-nums">{plata(c.total)}</span>
              <span className="w-12 text-right tabular-nums text-[#5C6B76]">{t.totalAnio ? `${((c.total / t.totalAnio) * 100).toFixed(1)} %` : ""}</span>
            </div>
          ))}
          {!cerradosCats.length && <p className="text-xs text-[#5C6B76]">Todavía no hay gastos en el período.</p>}
        </div>
      </section>

      <section className="mb-5">
        <TituloSeccion titulo="Por tipo de gasto y mes" />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Tipo de gasto</th>{t.meses.map((m) => <th key={m} className={THN}>{nombreMes(m, true)}{m === t.enCurso ? "*" : ""}</th>)}<th className={THN}>12 meses</th></tr></thead>
            <tbody>
              {t.porCategoria.map((c) => (
                <tr key={c.categoria} className={TR}>
                  <td className={TD}>{c.categoria}</td>
                  {t.meses.map((m) => <td key={m} className={TDN}>{c.porMes[m] ? plata(c.porMes[m]) : "—"}</td>)}
                  <td className={`${TDN} font-semibold`}>{plata(c.total)}</td>
                </tr>
              ))}
              <tr className={`${TR} font-semibold`}>
                <td className={TD}>Total</td>
                {t.porMes.map((m) => <td key={m.mes} className={TDN}>{plata(m.total)}</td>)}
                <td className={TDN}>{plata(t.totalAnio)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#5C6B76] mt-1">* Mes en curso, hasta hoy (no entra en el total de 12 meses).</p>
      </section>

      {extra}

      <section className="mb-5">
        <TituloSeccion titulo={`A quién se le pagó más (${t.porDestinatario.length})`} />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Destinatario</th><th className={TH}>Tipo de gasto</th><th className={THN}>Pagos</th><th className={THN}>12 meses</th></tr></thead>
            <tbody>
              {t.porDestinatario.map((d) => (
                <tr key={d.contraparte} className={TR}>
                  <td className={TD}>{d.ejemplo || "—"}<span className="block text-[11px] text-[#5C6B76]">{/^\d+$/.test(d.contraparte) ? `cuenta ${d.contraparte}` : ""}</span></td>
                  <td className={TD}>{d.categoria}</td><td className={TDN}>{d.cantidad}</td><td className={TDN}>{plata(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-5">
        <TituloSeccion titulo={`Lo que no es gasto (${t.noGasto.length})`} />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Qué es</th><th className={THN}>Movimientos</th><th className={THN}>Entró</th><th className={THN}>Salió</th></tr></thead>
            <tbody>
              {t.noGasto.map((g) => <tr key={g.grupo} className={TR}><td className={TD}>{g.grupo}</td><td className={TDN}>{g.cantidad}</td><td className={TDN}>{plata(g.entradas)}</td><td className={TDN}>{plata(g.salidas)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#5C6B76] mt-1">Las transferencias entre cuentas propias, los retiros a banco, los ingresos, las devoluciones recibidas y los rendimientos nunca se suman al gasto.</p>
      </section>
    </div>
  );
}
