// Tablero de gastos personales (pedido de Fer, 18/10): los gastos de las
// cuentas personales de Mercado Pago de los últimos 12 meses, por mes y por
// tipo de gasto, más los pagos de las cuentas de la empresa que se marcaron
// como personales (sólo para el dueño). Lo que no es gasto va aparte.

import Link from "next/link";
import { SUAVE } from "@/app/botones";
import { Pantalla, Avisos, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, TituloSeccion } from "@/app/componentes/erp";
import TableroGastos from "@/app/componentes/TableroGastos";
import { entrarPersonal } from "@/lib/personal/espacio";
import { gastosPersonales } from "@/lib/mercadopago/gastos-datos";
import { armarTablero } from "@/lib/mercadopago/gastos";
import { formatear } from "@/lib/moneda";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function GastosPersonales({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { sesion, espacio } = await entrarPersonal();
  const todos = await gastosPersonales(espacio.id, sesion.usuario.id, espacio.esDueno);
  // Personal: lo de las cuentas personales que no se marcó como de la empresa, y lo de la empresa marcado como personal.
  const t = armarTablero(todos, (x) => (x.ambito_cuenta === "personal" ? x.ambito_gasto !== "empresa" : x.ambito_gasto === "personal"));
  const extra = t.personalesDeEmpresa.length > 0 && (
    <section className="mb-5">
      <TituloSeccion titulo={`Gastos personales pagados con cuentas de la empresa (${t.personalesDeEmpresa.length})`} />
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Cuenta de la empresa</th><th className={THN}>Pagos</th><th className={THN}>12 meses</th></tr></thead>
          <tbody>{t.personalesDeEmpresa.map((p) => <tr key={p.cuenta} className={TR}><td className={TD}>{p.cuenta}</td><td className={TDN}>{p.cantidad}</td><td className={TDN}>{formatear(p.total, "ARS")}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5C6B76] mt-1">Están sumados en los números de arriba: es lo que gastaste vos aunque lo haya pagado una cuenta de la empresa.</p>
    </section>
  );
  return (
    <Pantalla titulo="Mis gastos" camino={[{ texto: "Espacio personal", href: "/personal" }, { texto: "Mis gastos" }]}
      subtitulo="Lo que salió de tus cuentas personales de Mercado Pago en los últimos 12 meses, más lo personal pagado por la empresa."
      acciones={<Link href="/personal/gastos/revisar" className={SUAVE}>Revisar y clasificar</Link>}>
      <Avisos sp={sp} />
      <TableroGastos t={t} enlaceRevisar="/personal/gastos/revisar" extra={extra} />
    </Pantalla>
  );
}
