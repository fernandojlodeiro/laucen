// Encabezado del detalle de una cuenta de fondos: nombre, saldo y las
// pestañas Movimientos / Conciliación.

import Link from "next/link";
import { notFound } from "next/navigation";
import { una } from "@/lib/erp/base";
import { formatear, type Moneda } from "@/lib/moneda";
import { Pestanas } from "@/app/radar/Cliente";

export type CuentaDetalle = { id: number; nombre: string; tipo: string; moneda: Moneda; activa: boolean; saldo: number; sin_conciliar: number; movimientos: number };

/** La cuenta de la organización (o 404), con su saldo. */
export async function cargarCuenta(org: string, idTexto: string): Promise<CuentaDetalle> {
  const cuentaId = Number(idTexto);
  if (!Number.isInteger(cuentaId) || cuentaId <= 0) notFound();
  const c = await una<CuentaDetalle>(`
    select f.id::int, f.nombre, f.tipo, f.moneda, f.activa,
           (f.saldo_inicial + coalesce((select sum(m.importe) from movimiento_fondos m where m.cuenta_id = f.id), 0))::float saldo,
           (select count(*) from movimiento_fondos m where m.cuenta_id = f.id and m.conciliado_ts is null)::int sin_conciliar,
           (select count(*) from movimiento_fondos m where m.cuenta_id = f.id)::int movimientos
      from cuenta_fondos f where f.id = $1 and f.organizacion_id = $2`, [cuentaId, org]);
  if (!c) notFound();
  return c;
}

export function Encabezado({ c }: { c: CuentaDetalle }) {
  const base = `/administracion/tesoreria/${c.id}`;
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3 text-xs">
        <p className="text-sm font-bold">
          <Link href="/administracion/tesoreria" className="text-[#16577F] font-normal hover:underline">Caja y bancos</Link> › {c.nombre}
          {!c.activa && <span className="ml-2 text-[11px] font-normal text-[#8a6100]">(desactivada)</span>}
        </p>
        <p>Saldo: <b className="tabular-nums">{formatear(c.saldo, c.moneda)}</b> · Sin conciliar: <b className="tabular-nums">{c.sin_conciliar}</b></p>
      </div>
      <Pestanas items={[
        { href: base, texto: "Movimientos", cuenta: c.movimientos },
        { href: `${base}/conciliacion`, texto: "Conciliación", cuenta: c.sin_conciliar },
      ]} />
    </>
  );
}
