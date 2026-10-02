"use server";

// Facturar un pedido desde su detalle: arma la factura y la manda a ARCA.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp } from "@/lib/erp/base";
import { intentar, id } from "@/lib/erp/acciones";
import { prepararFactura, emitir } from "@/lib/arca/facturar";

export async function accionFacturar(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  const pid = id(fd, "pedido_id");
  const volver = `/ventas/pedidos/${pid}`;
  await intentar(volver, async () => {
    if (!pid) throw new ErrorErp("El pedido no existe.");
    // prepararFactura verifica que el pedido sea de la organización.
    const cid = await prepararFactura(s.org.id, pid, s.usuario.id);
    const r = await emitir(s.org.id, cid);
    revalidatePath(volver);
    revalidatePath("/administracion/facturacion");
    if (r.estado !== "autorizado") throw new ErrorErp(r.mensaje);
    return r.mensaje;
  });
}
