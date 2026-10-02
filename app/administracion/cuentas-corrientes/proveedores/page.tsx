// Cuentas corrientes de proveedores.

import { entrarErp } from "@/app/componentes/erp";
import { VistaCc, type SP } from "../Vista";

export const dynamic = "force-dynamic";

export default async function CuentasCorrientesProveedores({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("cuentas_corrientes_ver");
  return <VistaCc org={s.org.id} tercero="proveedor" sp={await searchParams} />;
}
