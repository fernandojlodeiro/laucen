"use server";

import { deFondo } from "@/lib/tareas-fondo";
import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, id } from "@/lib/erp/acciones";
import { cuentasDe } from "@/lib/mercadolibre/api";
import { barrerReclamos, actualizarReclamo, encolarAccionReclamo, ACCIONES_RECLAMO } from "@/lib/mercadolibre/reclamos";
import {
  crearReclamoManual, editarReclamoManual, cambiarEstadoReclamo, registrarReembolso, anotarNota, recibirDevolucion,
  esEstadoReclamo, esTipoReclamo,
} from "@/lib/reclamos";

const LISTA = "/ventas/reclamos";
const ficha = (r: number) => `${LISTA}/${r}`;

/** Trae ahora los reclamos de todas las cuentas de ML con canal (sólo lectura). */
export async function accionTraerReclamos() {
  const s = await entrarErp("reclamos_ver");
  return deFondo(s, "reclamos-ml", "Reclamos de Mercado Libre", async () => {
    const cuentas = (await cuentasDe(s.org.id)).filter((c) => c.canalId && c.estado === "activa");
    if (cuentas.length === 0) throw new ErrorErp("No hay ninguna cuenta de Mercado Libre conectada a un canal.");
    // Las cuentas en paralelo; cada una dice qué le pasó, sin esconder el motivo.
    let importados = 0;
    const problemas: string[] = [];
    let fallaronTodas = true;
    await Promise.all(cuentas.map(async (c) => {
      const nombre = c.nickname ?? `cuenta ${c.id}`;
      try {
        const r = await barrerReclamos(c, Date.now() + 45_000);
        importados += r.importados;
        fallaronTodas = false;
        if (r.errores.length) problemas.push(`${nombre}: ${r.errores.length} reclamo${r.errores.length === 1 ? "" : "s"} no se pudo traer (${r.errores[0]})`);
      } catch (e) {
        console.error("[reclamos] barrido", c.id, e);
        problemas.push(`${nombre}: ${(e as Error).message}`);
      }
    }));
    revalidatePath(LISTA);
    if (fallaronTodas) throw new ErrorErp(`No se pudieron traer los reclamos. ${problemas.join(" · ")}`);
    if (problemas.length) {
      return `Traídos ${importados} reclamo${importados === 1 ? "" : "s"} nuevo${importados === 1 ? "" : "s"} o con cambios. Con problemas: ${problemas.join(" · ")}`;
    }
    return importados ? `Listo: ${importados} reclamo${importados === 1 ? "" : "s"} nuevo${importados === 1 ? "" : "s"} o con cambios.` : "Listo: no hay reclamos nuevos.";
  });
}

export async function accionNuevoReclamo(fd: FormData) {
  const s = await entrarErp("reclamos_ver");
  await intentar(LISTA, async () => {
    let pedidoId: number | null = null;
    const nro = texto(fd, "pedido")?.replace(/^#/, "");
    if (nro) {
      const p = await una<{ id: number }>(`select id::int from pedido where organizacion_id = $1 and (id::text = $2 or id_externo = $2)
                                            order by (id::text = $2) desc limit 1`, [s.org.id, nro]);
      if (!p) throw new ErrorErp(`No hay ningún pedido con el número ${nro}.`);
      pedidoId = p.id;
    }
    const tipo = fd.get("tipo");
    const r = await crearReclamoManual(s.org.id, {
      pedidoId, clienteId: id(fd, "cliente") || null, origen: fd.get("origen") === "local" ? "local" : "web",
      tipo: esTipoReclamo(tipo) ? tipo : "reclamo", motivo: texto(fd, "motivo"), notas: texto(fd, "notas"), monto: numero(fd, "monto"),
    }, s.usuario.id);
    revalidatePath(LISTA);
    return { ir: ficha(r) };
  });
}

export async function accionEditarReclamo(fd: FormData) {
  const s = await entrarErp("reclamos_ver");
  const r = id(fd);
  await intentar(ficha(r), async () => {
    const tipo = fd.get("tipo"), estado = fd.get("estado");
    await editarReclamoManual(s.org.id, r, {
      tipo: esTipoReclamo(tipo) ? tipo : null, estado: esEstadoReclamo(estado) ? estado : null,
      motivo: texto(fd, "motivo"), notas: texto(fd, "notas"), monto: numero(fd, "monto"),
    }, s.usuario.id);
    revalidatePath(LISTA);
    return "Reclamo grabado.";
  });
}

export async function accionEstadoReclamo(fd: FormData) {
  const s = await entrarErp("reclamos_ver");
  const r = id(fd);
  await intentar(ficha(r), async () => {
    const e = fd.get("estado");
    if (!esEstadoReclamo(e)) throw new ErrorErp("Estado desconocido.");
    await cambiarEstadoReclamo(s.org.id, r, e, s.usuario.id);
    revalidatePath(LISTA);
    return "Estado cambiado.";
  });
}

export async function accionReembolso(fd: FormData) {
  const s = await entrarErp("reclamos_ver");
  const r = id(fd);
  await intentar(ficha(r), async () => {
    await registrarReembolso(s.org.id, r, numero(fd, "monto") ?? 0, s.usuario.id);
    return "Reembolso anotado.";
  });
}

export async function accionNota(fd: FormData) {
  const s = await entrarErp("reclamos_ver");
  const r = id(fd);
  await intentar(ficha(r), async () => {
    await anotarNota(s.org.id, r, texto(fd, "texto"), s.usuario.id);
    return "Nota anotada.";
  });
}

export async function accionRecibirDevolucion(fd: FormData) {
  const s = await entrarErp("reclamos_ver");
  const r = id(fd);
  await intentar(ficha(r), async () => {
    const recepcion = await recibirDevolucion(s.org.id, r, s.usuario.id);
    return { ir: `/deposito/recepcion/${recepcion}` };
  });
}

/** "Actualizar": vuelve a leer el reclamo de ML (sólo lectura). */
export async function accionActualizarReclamo(fd: FormData) {
  const s = await entrarErp("reclamos_ver");
  const r = id(fd);
  return deFondo(s, `reclamo:${r}`, "Reclamo actualizado desde Mercado Libre", async () => {
    await actualizarReclamo(s.org.id, r);
    return "Actualizado desde Mercado Libre.";
  });
}

/** El clic de Fer en una acción de ML: va a la cola y sale enseguida. */
export async function accionReclamoMl(fd: FormData) {
  const s = await entrarErp("reclamos_ver");
  const r = id(fd);
  await intentar(ficha(r), async () => {
    const accion = String(fd.get("accion") ?? "");
    if (!Object.hasOwn(ACCIONES_RECLAMO, accion)) throw new ErrorErp("Esa acción no se puede hacer desde Laucen.");
    const d = await encolarAccionReclamo(s.org.id, r, accion, { mensaje: texto(fd, "mensaje"), porcentaje: numero(fd, "porcentaje") }, s.usuario.id);
    revalidatePath(LISTA);
    return `En la cola para Mercado Libre: ${d}. Sale en un momento; el resultado queda en la historia del reclamo.`;
  });
}
