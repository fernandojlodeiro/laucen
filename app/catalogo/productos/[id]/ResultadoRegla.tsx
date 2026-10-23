// El cuadro con lo más importante de la regla de precio (pedido de Fer, 12/10), en letra grande:
//   · regla prendida: a cuánto llevaría cada Clásica (verde si sube, rojo si baja);
//   · regla apagada: qué % estás arriba (rojo) o abajo (verde) de la referencia.
// Sin base: lo usan el cuadro de arriba (servidor) y la vista previa mientras se edita (navegador).

import { formatearNumero } from "@/lib/numeros";
import type { Simulacion } from "@/lib/seguimiento/regla-calculo";

const $ = (n: number) => `$ ${formatearNumero(n, "entero")}`;
const pct = (n: number) => `${Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;
const VERDE = "text-[#1F6E4A]", ROJO = "text-[#C03420]";

export default function ResultadoRegla({ s, prendida, titulo }: { s: Simulacion; prendida: boolean; titulo?: string }) {
  if (!s.referencia) {
    return <div className="text-sm text-[#5C6B76]">{titulo && <b className="block text-xs mb-1">{titulo}</b>}Sin referencia: ninguna seguida activa con precio leído (sin las excluidas ni las internacionales).</div>;
  }
  const varias = s.filas.length > 1;
  return (
    <div className="grid gap-1">
      {titulo && <b className="text-xs">{titulo}</b>}
      <div className="text-xs text-[#5C6B76]">
        Referencia: <b className="text-[#1A2A36]">{s.referencia.nombre}</b> a <b className="text-[#1A2A36]">{$(s.referencia.precio!)}</b>
        {prendida && s.objetivo != null && <> · objetivo de la regla {$(s.objetivo)}</>}
      </div>
      {s.filas.map((f) => {
        if (f.actual == null) return <div key={f.sku} className="text-sm">{varias && <span className="font-mono mr-2">{f.sku}</span>}sin precio en la lista</div>;
        if (!prendida) {
          // Apagada: cuánto estás arriba o abajo de la referencia. «Igual» sólo si es el mismo precio (Fer, 22/10: $ 1 de
          // diferencia también se dice, en pesos).
          const dif = Math.round(f.actual - s.referencia!.precio!), d = (dif / s.referencia!.precio!) * 100;
          return (
            <div key={f.sku} className="text-lg leading-snug">
              {varias && <span className="font-mono text-sm mr-2">{f.sku}</span>}
              Tu Clásica {$(f.actual)}:{" "}
              {dif === 0 ? <b>igual que la referencia</b>
                : <b className={d > 0 ? ROJO : VERDE}>{$(Math.abs(dif))} {d > 0 ? "más arriba" : "más abajo"} ({Math.abs(d) < 0.1 ? "menos de 0,1 %" : pct(d)})</b>}
            </div>
          );
        }
        if (f.nuevo == null) {
          return (
            <div key={f.sku} className="text-lg leading-snug">
              {varias && <span className="font-mono text-sm mr-2">{f.sku}</span>}
              Se queda en {$(f.actual)} <span className="text-sm text-[#5C6B76]">({f.motivo})</span>
            </div>
          );
        }
        const d = f.nuevo - f.actual;
        return (
          <div key={f.sku} className="text-lg leading-snug">
            {varias && <span className="font-mono text-sm mr-2">{f.sku}</span>}
            {$(f.actual)} → <b className={d > 0 ? VERDE : ROJO}>{$(f.nuevo)}</b>{" "}
            <span className={`text-sm font-semibold ${d > 0 ? VERDE : ROJO}`}>{d > 0 ? "▲ sube" : "▼ baja"} {$(Math.abs(d))} ({pct((d / f.actual) * 100)})</span>
            {f.motivo && <span className="text-sm text-[#5C6B76]"> · {f.motivo}</span>}
          </div>
        );
      })}
    </div>
  );
}
