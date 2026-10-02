"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { una, ErrorErp, motivoErp } from "@/lib/erp/base";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { crearRecepcion, recibir, cerrarRecepcion, variacionPorCodigo, type TipoRecepcion } from "@/lib/deposito/recepcion";

const LISTA = "/deposito/recepcion";

export async function accionCrearRecepcion(fd: FormData) {
  const s = await entrarErp("recepcion_ver");
  await intentar(LISTA, async () => {
    const t = fd.get("tipo");
    const tipo: TipoRecepcion = t === "devolucion" ? "devolucion" : t === "otro" ? "otro" : "compra";
    // El nº de pedido puede ser el nuestro o el de Mercado Libre / la tienda.
    let pedidoId: number | null = null;
    const nro = texto(fd, "pedido")?.replace(/^#/, "");
    if (nro) {
      const p = await una<{ id: number }>(`select id::int from pedido where organizacion_id = $1 and (id::text = $2 or id_externo = $2)
                                            order by (id::text = $2) desc limit 1`, [s.org.id, nro]);
      if (!p) throw new ErrorErp(`No hay ningún pedido con el número ${nro}.`);
      pedidoId = p.id;
    }
    if (tipo === "devolucion" && !pedidoId) throw new ErrorErp("En una devolución poné el número del pedido que vuelve.");
    const r = await crearRecepcion(s.org.id, {
      tipo, depositoId: id(fd, "d"), proveedorId: id(fd, "proveedor") || null, pedidoId,
      documento: texto(fd, "documento"), nota: texto(fd, "nota"),
    }, s.usuario.id);
    revalidatePath(LISTA);
    return { ir: `${LISTA}/${r}` };
  });
}

export type ProductoLeido = { ok: true; id: number; sku: string; titulo: string; foto: string | null } | { ok: false; mensaje: string };

/** El producto de un código escaneado (para mostrarlo antes de recibir). */
export async function accionBuscarProducto(codigo: string): Promise<ProductoLeido> {
  const s = await entrarErp("recepcion_ver");
  try {
    const v = await variacionPorCodigo(s.org.id, String(codigo ?? ""));
    const f = await una<{ foto: string | null }>(`
      select coalesce((select url from variacion_foto where variacion_id = v.id order by orden limit 1),
                      (select url from producto_foto where producto_id = v.producto_id order by orden limit 1)) foto
        from variacion v where v.id = $1 and v.organizacion_id = $2`, [v.id, s.org.id]);
    return { ok: true, id: v.id, sku: v.sku, titulo: v.titulo, foto: f?.foto ?? null };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}

export type ResultadoRecibir = { ok: boolean; mensaje: string };

export async function accionRecibir(recepcionId: number, d: { codigo: string; cantidad: number; ubicacion: string; condicion: "nuevo" | "caja_abierta" }): Promise<ResultadoRecibir> {
  const s = await entrarErp("recepcion_ver");
  try {
    const r = await recibir(s.org.id, Number(recepcionId), {
      codigo: String(d.codigo ?? ""), cantidad: Number(d.cantidad), ubicacion: d.ubicacion?.trim() || null,
      condicion: d.condicion === "caja_abierta" ? "caja_abierta" : "nuevo",
    }, s.usuario.id);
    revalidatePath(`${LISTA}/${recepcionId}`);
    return { ok: true, mensaje: `Recibido: ${r.cantidad} × ${r.variacion.sku} en ${r.ubicacion}${r.condicion === "caja_abierta" ? " (caja abierta)" : ""}.` };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}

export async function accionCerrarRecepcion(fd: FormData) {
  const s = await entrarErp("recepcion_ver");
  const r = id(fd);
  await intentar(`${LISTA}/${r}`, async () => {
    await cerrarRecepcion(s.org.id, r, s.usuario.id);
    revalidatePath(LISTA);
    return "Recepción cerrada.";
  });
}
