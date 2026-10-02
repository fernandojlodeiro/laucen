// La configuración de facturación se mudó a Configuración → Facturación (ARCA);
// los datos fiscales, a Configuración → Empresa.

import { redirect } from "next/navigation";

export default function ConfigFacturacionVieja() {
  redirect("/config/arca");
}
