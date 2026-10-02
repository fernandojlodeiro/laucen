"use server";

// Anular una factura autorizada con una nota de crédito total.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, id } from "@/lib/erp/acciones";
import { prepararNotaCredito, emitir } from "@/lib/arca/facturar";

export async function accionAnular(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  const fid = id(fd);
  await intentar(`/administracion/facturacion/${fid}`, async () => {
    const nc = await prepararNotaCredito(s.org.id, fid, s.usuario.id);
    const r = await emitir(s.org.id, nc);
    revalidatePath("/administracion/facturacion");
    // Rechazada o no: se va a ver la nota de crédito (ahí se reintenta).
    const destino = `/administracion/facturacion/${nc}`;
    if (r.estado !== "autorizado") return { ir: `${destino}?error=${encodeURIComponent(r.mensaje)}` };
    return { ir: `${destino}?ok=${encodeURIComponent(r.mensaje)}` };
  });
}
