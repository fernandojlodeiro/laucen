"use server";

// Reintentar un comprobante rechazado o con error (lo vuelve a mandar a ARCA).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { una, ErrorErp } from "@/lib/erp/base";
import { intentar, id, texto } from "@/lib/erp/acciones";
import { emitir } from "@/lib/arca/facturar";

const LISTADO = "/administracion/facturacion";

/** Vuelve a la pantalla de donde vino (listado o detalle), nunca afuera de facturación. */
const volverDe = (fd: FormData) => {
  const v = texto(fd, "volver");
  return v && v.startsWith(LISTADO) ? v : LISTADO;
};

export async function accionReintentar(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  const volver = volverDe(fd);
  await intentar(volver, async () => {
    const cid = id(fd);
    const c = await una<{ estado: string }>("select estado from comprobante where id = $1 and organizacion_id = $2", [cid, s.org.id]);
    if (!c) throw new ErrorErp("El comprobante no existe.");
    if (c.estado === "autorizado") return "Ya estaba autorizado.";
    const r = await emitir(s.org.id, cid);
    revalidatePath(LISTADO);
    if (r.estado !== "autorizado") throw new ErrorErp(r.mensaje);
    return r.mensaje;
  });
}
