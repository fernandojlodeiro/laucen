"use server";

// Clasificar un gasto de las cuentas de Mercado Pago de la empresa (con el permiso de Mercado Pago).

import { redirect } from "next/navigation";
import { motivoErp } from "@/lib/erp/base";
import { sesionRequerida } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { marcarEmpresa, leerMarca } from "@/lib/mercadopago/gastos-datos";
import { OPCIONES_CATEGORIA } from "@/app/componentes/RevisarGastos";

export async function accionClasificarEmpresa(fd: FormData) {
  const s = await sesionRequerida();
  const volver = String(fd.get("volver") ?? "/administracion/mercadopago/gastos/revisar");
  let error: string | null = null;
  try {
    if (!tienePermiso(s.permisos, "mercadopago_ver")) throw new Error("No tenés permiso para clasificar los gastos de Mercado Pago.");
    await marcarEmpresa(s.org.id, s.usuario.id, leerMarca(fd, OPCIONES_CATEGORIA));
  } catch (e) { error = motivoErp(e); }
  redirect(`${volver}${volver.includes("?") ? "&" : "?"}${error ? `error=${encodeURIComponent(error)}` : `ok=${encodeURIComponent("Clasificado.")}`}`);
}
