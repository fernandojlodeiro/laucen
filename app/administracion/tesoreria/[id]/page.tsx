// Movimientos de una cuenta de fondos (con saldo acumulado y filtro de
// fechas), carga de un movimiento suelto y transferencia a otra cuenta.

import Link from "next/link";
import RangoFechas from "@/app/componentes/RangoFechas";
import { consulta } from "@/lib/erp/base";
import { formatear, hoyAR } from "@/lib/moneda";
import { movimientosDeCuenta } from "@/lib/administracion/tesoreria";
import { asegurarPlan, cuentasImputables } from "@/lib/administracion/contabilidad";
import { VERDE } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import {
  entrarErp, Pantalla, Avisos, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, CAJA,
} from "@/app/componentes/erp";
import { fecha } from "@/app/ventas/formato";
import { cargarCuenta, Encabezado } from "./Encabezado";
import { accionMovimiento, accionTransferir, accionBorrarMovimiento } from "../acciones";

export const dynamic = "force-dynamic";

type SP = { desde?: string; hasta?: string; ok?: string; error?: string };
const esFecha = (x?: string) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);

export default async function MovimientosCuenta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("tesoreria_ver");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await cargarCuenta(s.org.id, id);
  await asegurarPlan(s.org.id);
  const desde = esFecha(sp.desde) ? sp.desde! : null, hasta = esFecha(sp.hasta) ? sp.hasta! : null;
  const [movs, contables, otras] = await Promise.all([
    movimientosDeCuenta(s.org.id, c.id, desde, hasta),
    cuentasImputables(s.org.id),
    consulta<{ id: number; nombre: string; moneda: string }>(
      "select id::int, nombre, moneda from cuenta_fondos where organizacion_id = $1 and activa and id <> $2 order by tipo, nombre", [s.org.id, c.id]),
  ]);
  const hoy = hoyAR();
  const oculto = <input type="hidden" name="c" value={c.id} />;

  return (
    <Pantalla titulo="Caja y bancos" camino={[{ texto: c.nombre }]} subtitulo={`Movimientos en ${c.moneda === "USD" ? "dólares" : "pesos"}`}>
      <Encabezado c={c} />
      <Avisos sp={sp} />

      <div className="grid gap-3 md:grid-cols-2 mb-4">
        <form action={accionMovimiento} className={`${CAJA} flex flex-wrap items-end gap-2`}>
          {oculto}
          <p className="w-full text-xs font-bold">Movimiento</p>
          <label><span className={ETIQUETA}>Fecha</span><input type="date" name="fecha" defaultValue={hoy} className={CAMPO} /></label>
          <fieldset className="flex items-center gap-3 text-xs pb-1.5">
            <label className="flex items-center gap-1"><input type="radio" name="signo" value="entra" /> Entra</label>
            <label className="flex items-center gap-1"><input type="radio" name="signo" value="sale" defaultChecked /> Sale</label>
          </fieldset>
          <label><span className={ETIQUETA}>Importe ({c.moneda === "USD" ? "US$" : "$"})</span>
            <CampoNumero name="importe" valor={null} tipo="pesos" className={`${CAMPO} w-28`} /></label>
          <label className="flex-1 min-w-40"><span className={ETIQUETA}>Concepto</span>
            <input name="concepto" placeholder="Ej. Comisión del banco" className={`${CAMPO} w-full`} /></label>
          <label className="w-full sm:w-auto"><span className={ETIQUETA}>Cuenta contable (contrapartida)</span>
            <select name="cuenta_contable_id" defaultValue="" className={`${CAMPO} w-64`}>
              <option value="">— Sin elegir —</option>
              {contables.map((x) => <option key={x.id} value={x.id}>{x.codigo} {x.nombre}</option>)}
            </select></label>
          <button className={VERDE}>Cargar</button>
        </form>

        <form action={accionTransferir} className={`${CAJA} flex flex-wrap items-end gap-2`}>
          {oculto}
          <p className="w-full text-xs font-bold">Transferencia</p>
          <label><span className={ETIQUETA}>Fecha</span><input type="date" name="fecha" defaultValue={hoy} className={CAMPO} /></label>
          <label><span className={ETIQUETA}>A la cuenta</span>
            <select name="destino" defaultValue="" className={`${CAMPO} w-48`}>
              <option value="">—</option>
              {otras.map((o) => <option key={o.id} value={o.id}>{o.nombre} ({o.moneda === "USD" ? "US$" : "$"})</option>)}
            </select></label>
          <label><span className={ETIQUETA}>Sale ({c.moneda === "USD" ? "US$" : "$"})</span>
            <CampoNumero name="importe" valor={null} tipo="pesos" className={`${CAMPO} w-28`} /></label>
          <label><span className={ETIQUETA}>Entra (si es otra moneda)</span>
            <CampoNumero name="importe_destino" valor={null} tipo="pesos" className={`${CAMPO} w-28`} placeholder="Al TC del día" /></label>
          <button className={VERDE}>Transferir</button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <RangoFechas desde={desde ?? ""} hasta={hasta ?? ""} vacio="Todas las fechas" />
      </div>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Fecha</th><th className={TH}>Concepto</th><th className={THN}>Importe</th><th className={THN}>Saldo</th><th className={TH}>Conciliado</th><th /></tr>
          </thead>
          <tbody>
            {movs.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Sin movimientos{desde || hasta ? " en esas fechas" : ""}.</td></tr>}
            {movs.map((m) => (
              <tr key={m.id} className={TR}>
                <td className={TD}>{fecha(m.fecha)}</td>
                <td className={TD}>{m.referencia_tipo === "pedido" && m.referencia_id
                  ? <Link href={`/ventas/pedidos/${m.referencia_id}`} className="hover:text-[#16577F] hover:underline">{m.concepto}</Link>
                  : m.concepto}</td>
                <td className={`${TDN} ${m.importe < 0 ? "text-[#C03420]" : "text-[#1F6E4A]"}`}>{m.importe > 0 ? "+" : ""}{formatear(m.importe, c.moneda)}</td>
                <td className={TDN}>{formatear(m.saldo, c.moneda)}</td>
                <td className={`${TD} text-[#1F6E4A]`}>{m.conciliado ? "✓" : ""}</td>
                <td className={`${TD} text-right`}>
                  {(m.referencia_tipo === "manual" || m.referencia_tipo === "transferencia") && !m.conciliado && (
                    <span className="inline-flex justify-end">
                      <TachoConfirmar accion={accionBorrarMovimiento} campos={{ id: String(m.id), c: String(c.id) }}
                        pregunta={m.referencia_tipo === "transferencia" ? "¿Borrar las dos patas?" : "¿Borrar?"} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {movs.length >= 500 && <p className="text-[11px] text-[#5C6B76] mt-2">Se muestran los últimos 500: usá el filtro de fechas para ver más atrás.</p>}
    </Pantalla>
  );
}
