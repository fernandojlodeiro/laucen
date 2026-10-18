"use server";

// Clasificar un gasto desde el espacio personal. Un movimiento de una cuenta de la empresa (marcado
// como personal) se puede reclasificar desde acá sólo si quien lo hace es el dueño de la organización.

import { redirect } from "next/navigation";
import { motivoErp } from "@/lib/erp/base";
import { entrarPersonal } from "@/lib/personal/espacio";
import { marcarPersonal, marcarEmpresa, leerMarca, orgsDelDueno } from "@/lib/mercadopago/gastos-datos";
import { OPCIONES_CATEGORIA } from "@/app/componentes/RevisarGastos";
import { consulta } from "@/lib/erp/base";

export async function accionClasificarPersonal(fd: FormData) {
  const { sesion, espacio } = await entrarPersonal();
  const volver = String(fd.get("volver") ?? "/personal/gastos/revisar");
  let error: string | null = null;
  try {
    const m = leerMarca(fd, OPCIONES_CATEGORIA);
    if (fd.get("lado") === "empresa") {
      if (!espacio.esDueno) throw new Error("Sólo el dueño reclasifica un pago de la empresa desde acá.");
      const orgs = await orgsDelDueno(sesion.usuario.id);
      const c = await consulta<{ organizacion_id: string }>("select organizacion_id from mp_conexion where id = $1", [m.conexionId]);
      if (!c[0] || !orgs.includes(c[0].organizacion_id)) throw new Error("Esa cuenta no es de una organización tuya.");
      await marcarEmpresa(c[0].organizacion_id, sesion.usuario.id, m);
    } else await marcarPersonal(espacio.id, sesion.usuario.id, m);
  } catch (e) { error = motivoErp(e); }
  redirect(`${volver}${volver.includes("?") ? "&" : "?"}${error ? `error=${encodeURIComponent(error)}` : `ok=${encodeURIComponent("Clasificado.")}`}`);
}
