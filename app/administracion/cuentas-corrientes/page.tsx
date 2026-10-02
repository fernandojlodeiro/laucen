// Cuentas corrientes de clientes (la pestaña de proveedores está en ./proveedores).

import { redirect } from "next/navigation";
import { entrarErp } from "@/app/componentes/erp";
import { VistaCc, type SP } from "./Vista";

export const dynamic = "force-dynamic";

export default async function CuentasCorrientes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("cuentas_corrientes_ver");
  const sp = await searchParams;
  // ?tercero=proveedor&id=N (link desde otra pantalla) → la pestaña de proveedores.
  if (sp.tercero === "proveedor") redirect(`/administracion/cuentas-corrientes/proveedores${sp.id ? `?id=${encodeURIComponent(sp.id)}` : ""}`);
  return <VistaCc org={s.org.id} tercero="cliente" sp={sp} />;
}
