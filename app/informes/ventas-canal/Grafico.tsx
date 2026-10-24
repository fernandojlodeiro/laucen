// El gráfico del informe de ventas por canal (lib/informes/ventas-canal.ts): barras apiladas o líneas, un color fijo
// por canal o razón social (en el orden de los grupos, nunca por ranking), sin JavaScript: el valor de cada barra o
// punto aparece al pasar el mouse. Arriba, la leyenda con el total de cada uno.

import { formatearNumero } from "@/lib/numeros";
import type { Grafico as TipoGrafico, Grupo, Medida, Paso, Punto } from "@/lib/informes/ventas-canal";

/** Colores por orden de grupo (paleta categórica validada para daltonismo); del noveno en adelante, gris. */
export const COLORES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const colorDe = (i: number) => COLORES[i] ?? "#8A97A3";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function etiquetaPeriodo(p: string, paso: Paso, largo = false): string {
  const [a, m, d] = p.split("-");
  if (paso === "mes") return `${MESES[Number(m) - 1]} ${largo ? a : a.slice(2)}`;
  return largo && paso === "semana" ? `semana del ${d}/${m}/${a}` : `${d}/${m}`;
}
export const valorTexto = (v: number, medida: Medida) => (medida === "monto" ? `$ ${formatearNumero(Math.round(v), "pesos")}` : formatearNumero(v, "entero"));
/** Un número corto para el eje: 1,2 M, 350 k. */
function corto(v: number, medida: Medida): string {
  const pre = medida === "monto" ? "$ " : "";
  if (v >= 1e6) return `${pre}${formatearNumero(Math.round(v / 1e5) / 10, "decimal")} M`;
  if (v >= 1e3 && medida === "monto") return `${pre}${formatearNumero(Math.round(v / 1e3), "entero")} k`;
  return `${pre}${formatearNumero(Math.round(v), "entero")}`;
}
/** Un tope "redondo" para el eje (1, 2 o 5 por una potencia de 10). */
function tope(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= max) ?? 10 * p);
}

export default function Grafico({ grupos, puntos, periodos, medida, grafico, paso }: {
  grupos: Grupo[]; puntos: Punto[]; periodos: string[]; medida: Medida; grafico: TipoGrafico; paso: Paso;
}) {
  const valor = new Map(puntos.map((p) => [`${p.periodo}|${p.clave}`, medida === "monto" ? p.monto : p.pedidos]));
  const v = (per: string, clave: string) => valor.get(`${per}|${clave}`) ?? 0;
  const totales = periodos.map((per) => grupos.reduce((t, g) => t + v(per, g.clave), 0));
  const max = tope(grafico === "barras" ? Math.max(0, ...totales) : Math.max(0, ...periodos.flatMap((per) => grupos.map((g) => v(per, g.clave)))));
  const W = 900, H = 260, izq = 64, der = 8, arriba = 10, abajo = 26;
  const ancho = W - izq - der, alto = H - arriba - abajo;
  const paso_x = ancho / Math.max(1, periodos.length);
  const y = (x: number) => arriba + alto - (x / max) * alto;
  const cadaEtiqueta = Math.max(1, Math.ceil(periodos.length / 12));
  const barra = Math.max(2, Math.min(36, paso_x - 4));
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs">
        {grupos.map((g, i) => (
          <span key={g.clave} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: colorDe(i) }} aria-hidden />
            {g.nombre} <span className="text-[#5C6B76] tabular-nums">{valorTexto(medida === "monto" ? g.monto : g.pedidos, medida)}</span>
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${medida === "monto" ? "Monto" : "Pedidos"} por período`}>
        {[0, 0.25, 0.5, 0.75, 1].map((k) => (
          <g key={k}>
            <line x1={izq} x2={W - der} y1={y(max * k)} y2={y(max * k)} stroke={k === 0 ? "#C9D3DD" : "#EEF2F6"} />
            <text x={izq - 6} y={y(max * k) + 3} textAnchor="end" fontSize="10" fill="#5C6B76">{corto(max * k, medida)}</text>
          </g>
        ))}
        {periodos.map((per, i) => i % cadaEtiqueta === 0 && (
          <text key={per} x={izq + i * paso_x + paso_x / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#5C6B76">{etiquetaPeriodo(per, paso)}</text>
        ))}
        {grafico === "barras" ? periodos.map((per, i) => {
          let base = 0;
          const x = izq + i * paso_x + (paso_x - barra) / 2;
          return (
            <g key={per}>
              {grupos.map((g, j) => {
                const val = v(per, g.clave);
                if (!val) return null;
                const y1 = y(base + val), y0 = y(base);
                base += val;
                // 2 px de separación entre tramos apilados.
                const h = Math.max(1, y0 - y1 - 2);
                return (
                  <rect key={g.clave} x={x} y={y1} width={barra} height={h} rx={base >= totales[i] ? 3 : 0} fill={colorDe(j)}>
                    <title>{`${etiquetaPeriodo(per, paso, true)} · ${g.nombre}: ${valorTexto(val, medida)} (total ${valorTexto(totales[i], medida)})`}</title>
                  </rect>
                );
              })}
            </g>
          );
        }) : grupos.map((g, j) => {
          const pts = periodos.map((per, i) => [izq + i * paso_x + paso_x / 2, y(v(per, g.clave))] as const);
          return (
            <g key={g.clave}>
              <polyline points={pts.map(([a, b]) => `${a},${b}`).join(" ")} fill="none" stroke={colorDe(j)} strokeWidth="2" strokeLinejoin="round" />
              {pts.map(([a, b], i) => (
                <g key={periodos[i]}>
                  {periodos.length <= 45 && <circle cx={a} cy={b} r="4" fill={colorDe(j)} stroke="#fff" strokeWidth="2" />}
                  <circle cx={a} cy={b} r="9" fill="transparent">
                    <title>{`${etiquetaPeriodo(periodos[i], paso, true)} · ${g.nombre}: ${valorTexto(v(periodos[i], g.clave), medida)}`}</title>
                  </circle>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
