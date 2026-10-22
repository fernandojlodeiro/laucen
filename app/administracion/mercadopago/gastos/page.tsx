// Tablero de gastos de la empresa en Mercado Pago (pedido de Fer, 18/10): los
// gastos de las cuentas de la empresa de los últimos 12 meses, por mes y por
// tipo de gasto, con filtro por sociedad. Los pagos marcados como personales
// van aparte y no se suman; lo que no es gasto (transferencias entre cuentas
// propias, retiros, ingresos) tampoco.

import Link from "next/link";
import { SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, TituloSeccion } from "@/app/componentes/erp";
import { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import TableroGastos from "@/app/componentes/TableroGastos";
import { espacioDe } from "@/lib/personal/espacio";
import { gastosEmpresa, sociedadesEmpresa } from "@/lib/mercadopago/gastos-datos";
import { armarTablero } from "@/lib/mercadopago/gastos";
import { formatear } from "@/lib/moneda";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function GastosEmpresa({ searchParams }: { searchParams: Promise<{ sociedad?: string; ok?: string; error?: string }> }) {
  const s = await entrarErp("mercadopago_ver");
  const sp = await searchParams;
  // Si quien mira es el dueño con espacio personal, sus cuentas personales cuentan como propias (y dan pistas de gasto personal).
  const espacio = s.dueno ? await espacioDe(s.usuario.id).catch(() => null) : null;
  const [todos, sociedades] = await Promise.all([gastosEmpresa(s.org.id, { espacioPersonal: espacio?.esDueno && espacio.id ? espacio.id : null }), sociedadesEmpresa(s.org.id)]);
  const titulares = [...new Set(sociedades.map((x) => x.titular ?? x.cuenta))];
  const deSociedad = (cuentaMpId: number) => { const x = sociedades.find((y) => y.cuenta_mp_id === Number(cuentaMpId)); return x?.titular ?? x?.cuenta ?? ""; };
  const filtrados = sp.sociedad ? todos.filter((x) => deSociedad(x.cuenta_mp_id) === sp.sociedad) : todos;
  const t = armarTablero(filtrados, (x) => x.ambito_gasto !== "personal");
  const personales = armarTablero(filtrados, (x) => x.ambito_gasto === "personal");
  const extra = personales.totalAnio > 0 && (
    <section className="mb-5">
      <TituloSeccion titulo="Gastos personales pagados por la empresa (aparte)" />
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Tipo de gasto</th><th className={THN}>12 meses</th></tr></thead>
          <tbody>
            {personales.porCategoria.filter((c) => c.total).map((c) => <tr key={c.categoria} className={TR}><td className={TD}>{c.categoria}</td><td className={TDN}>{formatear(c.total, "ARS")}</td></tr>)}
            <tr className={`${TR} font-semibold`}><td className={TD}>Total</td><td className={TDN}>{formatear(personales.totalAnio, "ARS")}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5C6B76] mt-1">No están sumados en los gastos de la empresa de arriba.</p>
    </section>
  );
  return (
    <Pantalla titulo="Gastos de Mercado Pago" subtitulo="Lo que salió de las cuentas de Mercado Pago de la empresa en los últimos 12 meses, por tipo de gasto."
      acciones={<Link href="/administracion/mercadopago/gastos/revisar" className={SUAVE}>Revisar y clasificar</Link>}>
      <Avisos sp={sp} />
      {titulares.length > 1 && (
        <div className="mb-3">
          <FiltroVivo parametro="sociedad" valor={sp.sociedad ?? ""} etiqueta="Sociedad">
            <option value="">Todas las sociedades</option>
            {titulares.map((x) => <option key={x} value={x}>{x}</option>)}
          </FiltroVivo>
        </div>
      )}
      <TableroGastos t={t} enlaceRevisar="/administracion/mercadopago/gastos/revisar" extra={extra} />
    </Pantalla>
  );
}
