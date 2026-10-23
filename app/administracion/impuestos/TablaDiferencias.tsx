// Las diferencias de una declaración contra lo cargado (la pestaña Diferencias y la ficha de la declaración).

import { CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import type { Diferencia } from "@/lib/impuestos/posicion";

const n2 = (x: number) => x.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TablaDiferencias({ difs }: { difs: Diferencia[] }) {
  return (
    <div className={CAJA_TABLA}>
      <table className={TABLA}>
        <thead className={THEAD}><tr><th className={TH}>Concepto</th><th className={THN}>Declaración</th><th className={THN}>Laucen</th><th className={THN}>Diferencia</th></tr></thead>
        <tbody>
          {difs.map((x, i) => (
            <tr key={i} className={TR}>
              <td className={TD}>{x.concepto}</td><td className={TDN}>{n2(x.ddjj)}</td><td className={TDN}>{n2(x.laucen)}</td>
              <td className={`${TDN} font-semibold text-[#8a6100]`}>{n2(x.dif)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
