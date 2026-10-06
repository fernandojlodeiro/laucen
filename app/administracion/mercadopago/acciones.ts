"use server";

// Mercado Pago: la llave propia de Mercado Pago de una cuenta (opcional; se
// usa si la conexión de Mercado Libre no alcanza para leer Mercado Pago).
// Nunca se muestra: sólo si hay o no.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, id, texto } from "@/lib/erp/acciones";

const BASE = "/administracion/mercadopago";

async function canalMl(org: string, canal: number) {
  if (!canal || !(await una("select 1 from canal where id = $1 and organizacion_id = $2 and tipo = 'mercadolibre'", [canal, org]))) {
    throw new ErrorErp("Esa cuenta no es de Mercado Libre.");
  }
}

export async function accionGuardarLlaveMp(fd: FormData) {
  const s = await entrarErp("mercadopago_ver");
  const canal = id(fd, "canal");
  await intentar(BASE, async () => {
    await canalMl(s.org.id, canal);
    const t = (texto(fd, "access_token") ?? "").trim();
    if (!/^APP_USR-[\w-]{20,}$/.test(t)) throw new ErrorErp("La llave tiene que ser el Access Token de producción de Mercado Pago (empieza con APP_USR-).");
    await consulta(`insert into mp_credencial (canal_id, organizacion_id, access_token) values ($1, $2, $3)
                    on conflict (canal_id) do update set access_token = excluded.access_token, actualizado_ts = now()`, [canal, s.org.id, t]);
    revalidatePath(BASE);
    return "Llave de Mercado Pago grabada. Se usa en la próxima lectura.";
  });
}

export async function accionBorrarLlaveMp(fd: FormData) {
  const s = await entrarErp("mercadopago_ver");
  const canal = id(fd, "canal");
  await intentar(BASE, async () => {
    await consulta("delete from mp_credencial where canal_id = $1 and organizacion_id = $2", [canal, s.org.id]);
    revalidatePath(BASE);
    return "Llave de Mercado Pago borrada.";
  });
}
