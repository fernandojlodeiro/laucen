// Conciliación de una cuenta contra su extracto: subir el CSV, unir solo lo
// que coincide, y a mano lo demás (unir con un movimiento o crear el
// movimiento desde la línea). Las ya unidas, abajo, se pueden desunir.

import { consulta } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { extracto } from "@/lib/administracion/tesoreria";
import { asegurarPlan, cuentasImputables } from "@/lib/administracion/contabilidad";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import {
  entrarErp, Pantalla, Avisos, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, CAJA,
} from "@/app/componentes/erp";
import { fecha } from "@/app/ventas/formato";
import { cargarCuenta, Encabezado } from "../Encabezado";
import {
  accionImportarExtracto, accionConciliarAutomatico, accionConciliar, accionDesconciliar, accionCrearDesdeExtracto,
} from "../../acciones";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

export default async function Conciliacion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("tesoreria_ver");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await cargarCuenta(s.org.id, id);
  await asegurarPlan(s.org.id);
  const [lineas, sinConciliar, contables] = await Promise.all([
    extracto(s.org.id, c.id, false),
    consulta<{ id: number; fecha: string; importe: number; concepto: string }>(`
      select id::int, to_char(fecha, 'YYYY-MM-DD') fecha, importe::float, concepto from movimiento_fondos
       where organizacion_id = $1 and cuenta_id = $2 and conciliado_ts is null order by fecha desc, id desc limit 500`, [s.org.id, c.id]),
    cuentasImputables(s.org.id),
  ]);
  const pendientes = lineas.filter((l) => !l.movimiento_id), unidas = lineas.filter((l) => l.movimiento_id);
  const plata = (n: number) => formatear(n, c.moneda);
  const oculto = <input type="hidden" name="c" value={c.id} />;

  return (
    <Pantalla titulo="Caja y bancos" subtitulo="Conciliación con el extracto">
      <Encabezado c={c} />
      <Avisos sp={sp} />

      <div className={`${CAJA} mb-4 flex flex-wrap items-end justify-between gap-3`}>
        <form action={accionImportarExtracto} className="flex flex-wrap items-end gap-2">
          {oculto}
          <label className="text-xs">
            <span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Extracto (CSV)</span>
            <input type="file" name="archivo" accept=".csv,.txt,text/csv" className="text-xs" />
          </label>
          <BotonEnviar clase={PRIMARIO} corriendo="Leyendo…">Subir extracto</BotonEnviar>
        </form>
        <form action={accionConciliarAutomatico}>
          {oculto}
          <BotonEnviar clase={VERDE} corriendo="Conciliando…">Conciliar automático</BotonEnviar>
        </form>
        <p className="w-full text-[11px] text-[#5C6B76]">
          El CSV tiene que tener columnas de fecha, descripción e importe (o débito y crédito separados). Lo automático une mismo importe con fecha a ±5 días.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 mb-4">
        <section>
          <h2 className="text-sm font-bold mb-2">Extracto sin conciliar ({pendientes.length})</h2>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Fecha</th><th className={TH}>Descripción</th><th className={THN}>Importe</th></tr></thead>
              <tbody>
                {pendientes.length === 0 && <tr><td colSpan={3} className={`${TD} text-[#5C6B76]`}>Nada pendiente.</td></tr>}
                {pendientes.map((l) => {
                  const candidatos = sinConciliar.filter((m) => Math.sign(m.importe) === Math.sign(l.importe));
                  return [
                    <tr key={l.id} className={TR}>
                      <td className={TD}>{fecha(l.fecha)}</td>
                      <td className={TD}>{l.descripcion || "—"}{l.referencia && <span className="block text-[10px] text-[#5C6B76]">{l.referencia}</span>}</td>
                      <td className={`${TDN} ${l.importe < 0 ? "text-[#C03420]" : "text-[#1F6E4A]"}`}>{plata(l.importe)}</td>
                    </tr>,
                    <tr key={`${l.id}-acciones`}>
                      <td colSpan={3} className="px-2 pb-2">
                        <div className="flex flex-wrap gap-2">
                          <form action={accionConciliar} className="flex items-center gap-1">
                            {oculto}<input type="hidden" name="id" value={l.id} />
                            <select name="movimiento" defaultValue="" className={`${CAMPO} w-56`} aria-label="Movimiento para unir">
                              <option value="">{candidatos.length ? "— Elegí el movimiento —" : "— No hay del mismo signo —"}</option>
                              {candidatos.map((m) => <option key={m.id} value={m.id}>{fecha(m.fecha)} · {plata(m.importe)} · {m.concepto}</option>)}
                            </select>
                            <button className={SUAVE} disabled={!candidatos.length}>Unir</button>
                          </form>
                          <form action={accionCrearDesdeExtracto} className="flex items-center gap-1">
                            {oculto}<input type="hidden" name="id" value={l.id} />
                            <select name="cuenta_contable_id" defaultValue="" className={`${CAMPO} w-48`} aria-label="Cuenta contable">
                              <option value="">— Cuenta contable —</option>
                              {contables.map((x) => <option key={x.id} value={x.id}>{x.codigo} {x.nombre}</option>)}
                            </select>
                            <button className={SUAVE}>Crear movimiento</button>
                          </form>
                        </div>
                      </td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-bold mb-2">Movimientos sin conciliar ({sinConciliar.length})</h2>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Fecha</th><th className={TH}>Concepto</th><th className={THN}>Importe</th></tr></thead>
              <tbody>
                {sinConciliar.length === 0 && <tr><td colSpan={3} className={`${TD} text-[#5C6B76]`}>Todo conciliado.</td></tr>}
                {sinConciliar.map((m) => (
                  <tr key={m.id} className={TR}>
                    <td className={TD}>{fecha(m.fecha)}</td>
                    <td className={TD}>{m.concepto}</td>
                    <td className={`${TDN} ${m.importe < 0 ? "text-[#C03420]" : "text-[#1F6E4A]"}`}>{plata(m.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <h2 className="text-sm font-bold mb-2">Ya conciliadas ({unidas.length})</h2>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Fecha</th><th className={TH}>Línea del extracto</th><th className={TH}>Movimiento</th><th className={THN}>Importe</th><th /></tr></thead>
          <tbody>
            {unidas.length === 0 && <tr><td colSpan={5} className={`${TD} text-[#5C6B76]`}>Todavía ninguna.</td></tr>}
            {unidas.map((l) => (
              <tr key={l.id} className={TR}>
                <td className={TD}>{fecha(l.fecha)}</td>
                <td className={TD}>{l.descripcion || "—"}</td>
                <td className={`${TD} text-[#5C6B76]`}>{l.movimiento ?? "—"}</td>
                <td className={TDN}>{plata(l.importe)}</td>
                <td className={`${TD} text-right`}>
                  <form action={accionDesconciliar}>
                    {oculto}<input type="hidden" name="id" value={l.id} />
                    <button className={SUAVE}>Desunir</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
