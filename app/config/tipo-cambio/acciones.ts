"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, ErrorErp } from "@/lib/erp/base";
import { intentar, numero, texto, id } from "@/lib/erp/acciones";
import { cargarHistoria, elegirFuente, esFuente, levantarTipoCambio, FUENTES } from "@/lib/tipo-cambio";
import { formatear } from "@/lib/moneda";

const VOLVER = "/config/tipo-cambio";

export async function accionLevantarAhora() {
  await entrarErp("tipo_cambio_ver");
  await intentar(VOLVER, async () => {
    const r = await levantarTipoCambio();
    revalidatePath("/", "layout");
    if (!r.ok) throw new ErrorErp("No respondió ninguna de las fuentes. Probá en un rato o cargalo a mano.");
    return `Listo: ${formatear(r.cotizacion.venta, "ARS")} del ${r.cotizacion.fecha.split("-").reverse().join("/")} (${FUENTES[r.fuente].nombre}).`;
  });
}

export async function accionCargarHistoria() {
  await entrarErp("tipo_cambio_ver");
  await intentar(VOLVER, async () => {
    const n = await cargarHistoria();
    return n ? `Se agregaron ${n.toLocaleString("es-AR")} días de historia.` : "La historia ya estaba completa.";
  });
}

export async function accionElegirFuente(fd: FormData) {
  await entrarErp("tipo_cambio_ver");
  await intentar(VOLVER, async () => {
    const f = fd.get("fuente");
    if (!esFuente(f)) throw new ErrorErp("Fuente desconocida.");
    await elegirFuente(f);
    return `Fuente: ${FUENTES[f].nombre}.`;
  });
}

/** Un tipo de cambio cargado a mano: vale sólo para esta organización y, ese
 *  día, gana al que levanta el cron. */
export async function accionCargarAMano(fd: FormData) {
  const s = await entrarErp("tipo_cambio_ver");
  await intentar(VOLVER, async () => {
    const fecha = texto(fd, "fecha");
    const venta = numero(fd, "venta");
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ErrorErp("Falta la fecha.");
    if (!venta || venta <= 0) throw new ErrorErp("El dólar de venta tiene que ser mayor que cero.");
    await consulta(`
      insert into tipo_cambio (organizacion_id, fecha, tipo, compra, venta, origen) values ($1, $2::date, 'oficial', $3, $4, 'manual')
      on conflict (coalesce(organizacion_id, ''), fecha, tipo) do update set compra = excluded.compra, venta = excluded.venta, origen = 'manual', creado_ts = now()`,
      [s.org.id, fecha, numero(fd, "compra"), venta]);
    revalidatePath("/", "layout");
    return "Guardado.";
  });
}

export async function accionBorrarManual(fd: FormData) {
  const s = await entrarErp("tipo_cambio_ver");
  await intentar(VOLVER, async () => {
    await consulta("delete from tipo_cambio where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    revalidatePath("/", "layout");
    return "Borrado.";
  });
}
