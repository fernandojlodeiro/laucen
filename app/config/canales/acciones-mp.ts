"use server";

// Mercado Pago de un canal: usar una cuenta ya conectada (la misma puede ir
// en varios canales) o sacarla del canal. Conectar una nueva va por
// /config/canales/mercadopago (la autorización de Mercado Pago).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { una, ErrorErp } from "@/lib/erp/base";
import { intentar, id } from "@/lib/erp/acciones";
import { ponerEnCanal, sacarDelCanal } from "@/lib/mercadopago/conexion";

const volver = (canal: number) => `/config/canales?c=${canal}`;

export async function accionUsarCuentaMp(fd: FormData) {
  const s = await entrarErp("canales_ver");
  const canal = id(fd, "canal");
  await intentar(volver(canal), async () => {
    const c = await una<{ nombre: string | null }>("select nombre from mp_conexion where id = $1 and organizacion_id = $2", [id(fd, "conexion"), s.org.id]);
    if (!c || !(await una("select 1 from canal where id = $1 and organizacion_id = $2", [canal, s.org.id]))) throw new ErrorErp("Esa cuenta de Mercado Pago no está conectada.");
    await ponerEnCanal(s.org.id, canal, id(fd, "conexion"));
    revalidatePath("/config/canales");
    return `Este canal usa la cuenta de Mercado Pago ${c.nombre ?? ""}.`.replace(" .", ".");
  });
}

export async function accionSacarCuentaMp(fd: FormData) {
  const s = await entrarErp("canales_ver");
  const canal = id(fd, "canal");
  await intentar(volver(canal), async () => {
    await sacarDelCanal(s.org.id, canal);
    revalidatePath("/config/canales");
    return "Cuenta de Mercado Pago sacada del canal.";
  });
}
