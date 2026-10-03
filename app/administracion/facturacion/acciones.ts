"use server";

// Reintentar un comprobante rechazado o con error (lo vuelve a mandar a ARCA),
// y subir facturas a la venta de Mercado Libre (por la cola).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { una, ErrorErp } from "@/lib/erp/base";
import { intentar, id, texto } from "@/lib/erp/acciones";
import { emitir } from "@/lib/arca/facturar";
import { subirFacturaConBoton, prepararLoteFacturasFaltantes } from "@/lib/mercadolibre/facturas";

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

/** "Subir factura a Mercado Libre" (clic de Fer): a la cola, aunque el
 *  interruptor del canal esté apagado. */
export async function accionSubirFacturaMl(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  const volver = volverDe(fd);
  await intentar(volver, async () => {
    const r = await subirFacturaConBoton(s.org.id, id(fd), s.usuario.id);
    revalidatePath(LISTADO);
    return r;
  });
}

/** "Subir a ML las facturas que faltan": prepara un lote por canal; sale
 *  cuando Fer aprieta "Mandar a Mercado Libre" en la cola. */
export async function accionPrepararFacturasMl() {
  const s = await entrarErp("facturacion_ver");
  await intentar(LISTADO, async () => {
    const r = await prepararLoteFacturasFaltantes(s.org.id, s.usuario.id);
    const destino = r.lotes.length === 1 ? `/config/canales/cola?ver=lotes&lote=${r.lotes[0]}` : "/config/canales/cola?ver=lotes";
    const aviso = `Preparado: ${r.facturas} factura${r.facturas === 1 ? "" : "s"} para subir a Mercado Libre. Revisalas y apretá «Mandar a Mercado Libre».`;
    return { ir: `${destino}&ok=${encodeURIComponent(aviso)}` };
  });
}
