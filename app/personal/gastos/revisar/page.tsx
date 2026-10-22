// Revisar y clasificar los gastos personales (lib/mercadopago/gastos.ts): los
// movimientos de las cuentas personales y los pagos de la empresa marcados
// como personales, con su tipo de gasto; el lápiz de la fila los reclasifica.

import { Pantalla, Avisos } from "@/app/componentes/erp";
import RevisarGastos, { type SpRevisar } from "@/app/componentes/RevisarGastos";
import { entrarPersonal } from "@/lib/personal/espacio";
import { gastosPersonales } from "@/lib/mercadopago/gastos-datos";
import { accionClasificarPersonal } from "../acciones";
import { proveedoresDelEspacio } from "@/lib/personal/destinatarios";
import PestanasGastos, { cuentasGastos } from "../PestanasGastos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function RevisarGastosPersonales({ searchParams }: { searchParams: Promise<SpRevisar> }) {
  const sp = await searchParams;
  const { sesion, espacio } = await entrarPersonal();
  const [todos, proveedores] = await Promise.all([gastosPersonales(espacio.id, sesion.usuario.id, espacio.esDueno), proveedoresDelEspacio(espacio.id)]);
  const filas = todos.filter((x) => x.ambito_cuenta === "personal" || x.ambito_gasto === "personal");
  return (
    <Pantalla titulo="Revisar mis gastos" camino={[{ texto: "Espacio personal", href: "/personal" }, { texto: "Mis gastos", href: "/personal/gastos" }, { texto: "Revisar" }]}
      subtitulo="Clasificá lo que quedó sin clasificar; si marcás «Aplicar a todo…», de ahí en adelante se clasifica solo.">
      <PestanasGastos activa="revisar" cuentas={cuentasGastos(todos, proveedores.length)} />
      <Avisos sp={sp} />
      <RevisarGastos filas={filas} sp={sp} base="/personal/gastos/revisar" accion={accionClasificarPersonal} empresa={false} />
    </Pantalla>
  );
}
