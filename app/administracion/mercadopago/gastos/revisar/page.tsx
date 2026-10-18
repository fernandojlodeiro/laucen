// Revisar y clasificar los gastos de las cuentas de Mercado Pago de la empresa:
// sobre todo, los posibles gastos personales pagados por la empresa (mismo
// destinatario que un pago personal, categorías personales, fines de semana).
// El lápiz de la fila los reclasifica; «Aplicar a todo…» guarda la regla.

import { entrarErp, Pantalla, Avisos } from "@/app/componentes/erp";
import RevisarGastos, { type SpRevisar } from "@/app/componentes/RevisarGastos";
import { espacioDe } from "@/lib/personal/espacio";
import { gastosEmpresa } from "@/lib/mercadopago/gastos-datos";
import { accionClasificarEmpresa } from "../acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function RevisarGastosEmpresa({ searchParams }: { searchParams: Promise<SpRevisar> }) {
  const s = await entrarErp("mercadopago_ver");
  const sp = await searchParams;
  const espacio = s.dueno ? await espacioDe(s.usuario.id).catch(() => null) : null;
  const filas = await gastosEmpresa(s.org.id, { espacioPersonal: espacio?.esDueno && espacio.id ? espacio.id : null });
  return (
    <Pantalla titulo="Revisar gastos de Mercado Pago" camino={[{ texto: "Revisar" }]}
      subtitulo="Marcá lo que es personal (no se suma al gasto de la empresa) y clasificá lo que quedó sin clasificar.">
      <Avisos sp={sp} />
      <RevisarGastos filas={filas} sp={sp} base="/administracion/mercadopago/gastos/revisar" accion={accionClasificarEmpresa} empresa />
    </Pantalla>
  );
}
