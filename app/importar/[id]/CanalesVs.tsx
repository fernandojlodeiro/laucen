// Historial de ventas de Virtual Seller: a qué canal del sistema va cada nombre de canal de VS que trae el archivo
// (tabla venta_vs_canal). Se asocian solos al importar (mismo nombre, o la cuenta de ML donde ya están leídas sus
// ventas); acá se ven y se cambian. Sin canal = "canal histórico" (una cuenta que ya no está): se muestra con el
// nombre de VS. Abre en vista; el lápiz del título pasa a edición (?editar=canales).

import { consulta } from "@/lib/erp/base";
import { BotonesFicha, TituloSeccion, ValorVista, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO } from "@/app/componentes/erp";
import { accionCanalesVs } from "./acciones";

export const EDITAR_CANALES = "canales";

export default async function CanalesVs({ iid, org, columna, editando }: { iid: number; org: string; columna: string; editando: boolean }) {
  const [nombres, canales] = await Promise.all([
    consulta<{ nombre: string; filas: number; canal_id: number | null; canal: string | null; asociado: boolean }>(`
      select x.nombre, x.filas, m.canal_id::int, c.nombre canal, m.organizacion_id is not null asociado
        from (select datos ->> $3 nombre, count(*)::int filas from importacion_fila
               where importacion_id = $1 and organizacion_id = $2 and datos ->> $3 is not null group by 1) x
        left join venta_vs_canal m on m.organizacion_id = $2 and m.nombre_vs = x.nombre
        left join canal c on c.id = m.canal_id
       order by x.filas desc`, [iid, org, columna]),
    consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 order by nombre", [org]),
  ]);
  if (!nombres.length) return null;
  const ver = `/importar/${iid}`;
  return (
    <section className="mb-4">
      <TituloSeccion titulo={`Canales de Virtual Seller (${nombres.length})`}>
        <BotonesFicha editando={editando} ver={ver} editar={`${ver}?editar=${EDITAR_CANALES}`} form="canales-vs" />
      </TituloSeccion>
      <p className="text-[11px] text-[#5C6B76] mb-2">
        Cada canal de Virtual Seller va al canal del sistema elegido. Los que quedan en «Canal histórico» (una cuenta que ya no está) se ven con su nombre de Virtual Seller.
      </p>
      <form id="canales-vs" action={accionCanalesVs}>
        <input type="hidden" name="id" value={iid} />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>En Virtual Seller</th><th className={THN}>Renglones</th><th className={TH}>Canal del sistema</th></tr></thead>
            <tbody>
              {nombres.map((n, i) => (
                <tr key={n.nombre} className={TR} data-canal={n.canal_id ?? undefined}>
                  <td className={TD}>{n.nombre}</td>
                  <td className={TDN}>{n.filas.toLocaleString("es-AR")}</td>
                  <td className={TD}>
                    {editando ? (
                      <>
                        <input type="hidden" name={`nombre_${i}`} value={n.nombre} />
                        <select name={`canal_${i}`} defaultValue={n.canal_id ?? ""} className={`${CAMPO} w-64`} aria-label={`Canal para ${n.nombre}`}>
                          <option value="">Canal histórico (sin canal del sistema)</option>
                          {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </>
                    ) : (
                      <ValorVista className="w-64">{n.canal ?? (n.asociado ? "Canal histórico (sin canal del sistema)" : "Se asocia solo al importar")}</ValorVista>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </form>
    </section>
  );
}
