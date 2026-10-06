"use server";

// Emitir la nota de crédito de una factura hecha fuera de Laucen
// (lib/arca/nota-credito-externa.ts). Rechazada o no, se va a su ficha.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, texto, entero, numero } from "@/lib/erp/acciones";
import { emitir } from "@/lib/arca/facturar";
import { prepararNotaCreditoExterna, LINEAS_NC, type LineaNc } from "@/lib/arca/nota-credito-externa";
import { url } from "@/app/componentes/erp";

export async function accionNotaCreditoExterna(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  const factura = { rs: texto(fd, "rs"), tipo: texto(fd, "tipo"), pv: texto(fd, "pv"), nro: texto(fd, "nro") };
  await intentar(url("/administracion/facturacion/nota-credito", { ...factura, reclamo: texto(fd, "reclamo") }), async () => {
    const lineas: LineaNc[] = [];
    for (let i = 0; i < LINEAS_NC; i++) {
      lineas.push({ descripcion: texto(fd, `desc${i}`) ?? "", cantidad: numero(fd, `cant${i}`) ?? 0, precio: numero(fd, `precio${i}`) ?? 0, ivaPct: numero(fd, `iva${i}`) ?? 21 });
    }
    const nc = await prepararNotaCreditoExterna(s.org.id, {
      emisorId: Number(factura.rs), tipo: Number(factura.tipo), puntoVenta: Number(factura.pv), numero: Number(factura.nro),
      clienteId: entero(fd, "cliente"), receptorNombre: texto(fd, "receptor"), condicionIva: entero(fd, "condicion"), lineas, usuarioId: s.usuario.id,
    });
    const r = await emitir(s.org.id, nc);
    revalidatePath("/administracion/facturacion");
    const destino = `/administracion/facturacion/${nc}`;
    return { ir: `${destino}?${r.estado === "autorizado" ? "ok" : "error"}=${encodeURIComponent(r.mensaje)}` };
  });
}
