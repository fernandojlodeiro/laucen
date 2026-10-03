"use server";

// Acciones de la cuenta de Mercado Libre de un canal (sesión 2).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, id } from "@/lib/erp/acciones";
import { cuentaDelCanal } from "@/lib/mercadolibre/api";
import { barrerOrdenes } from "@/lib/mercadolibre/pedidos";
import { barrerPreguntas } from "@/lib/mercadolibre/preguntas";
import { sincronizarStockMl } from "@/lib/mercadolibre/stock";

const volver = (canal: number) => `/config/canales?c=${canal}`;

async function canalMl(org: string, fd: FormData) {
  const canal = id(fd, "canal");
  if (!canal || !(await una("select 1 from canal where id = $1 and organizacion_id = $2 and tipo = 'mercadolibre'", [canal, org]))) {
    throw new ErrorErp("Ese canal no es de Mercado Libre.");
  }
  return canal;
}

/** Cuelga del canal una cuenta ya conectada (la que se conectó en /admin/meli). */
export async function accionUsarCuenta(fd: FormData) {
  const s = await entrarErp("canales_ver");
  const canal = id(fd, "canal");
  await intentar(volver(canal), async () => {
    await canalMl(s.org.id, fd);
    const cuenta = id(fd, "cuenta");
    await consulta("update meli_cuenta set canal_id = null where organizacion_id = $1 and canal_id = $2", [s.org.id, canal]);
    const r = await consulta("update meli_cuenta set canal_id = $3 where id = $2 and organizacion_id = $1 returning id", [s.org.id, cuenta, canal]);
    if (!r.length) throw new ErrorErp("Esa cuenta no existe.");
    revalidatePath("/config/canales");
    return "Cuenta asignada al canal. Desde ahora entran sus pedidos y preguntas.";
  });
}

export async function accionSoltarCuenta(fd: FormData) {
  const s = await entrarErp("canales_ver");
  const canal = id(fd, "canal");
  await intentar(volver(canal), async () => {
    await consulta("update meli_cuenta set canal_id = null where organizacion_id = $1 and canal_id = $2", [s.org.id, canal]);
    revalidatePath("/config/canales");
    return "La cuenta quedó sin canal: ya no entran sus pedidos.";
  });
}

/** Prende o apaga que Laucen mande el stock y pause en ML. */
export async function accionSincronizarStock(fd: FormData) {
  const s = await entrarErp("canales_ver");
  const canal = id(fd, "canal");
  await intentar(volver(canal), async () => {
    await canalMl(s.org.id, fd);
    const prender = fd.get("valor") === "1";
    await consulta(`update canal set config = config || jsonb_build_object('sincronizar_stock', $3::boolean) where id = $2 and organizacion_id = $1`,
      [s.org.id, canal, prender]);
    revalidatePath("/config/canales");
    if (!prender) return "Laucen ya no toca el stock ni las pausas en Mercado Libre.";
    const r = await sincronizarStockMl(s.org.id);
    return `Prendido. Primera pasada: ${r.revisadas} publicaciones revisadas; quedaron en la cola para mandar a ML ${r.cantidades} cantidades, ${r.pausadas} pausas y ${r.reactivadas} reactivaciones${r.errores.length ? ` (${r.errores.length} con error: ${r.errores.slice(0, 2).join("; ")})` : ""}. Salen solas en los próximos minutos (Configuración → Cola de Mercado Libre).`;
  });
}

/** Trae ya los pedidos y preguntas (sin esperar el barrido de 2 minutos). */
export async function accionTraerAhora(fd: FormData) {
  const s = await entrarErp("canales_ver");
  const canal = id(fd, "canal");
  await intentar(volver(canal), async () => {
    await canalMl(s.org.id, fd);
    const cuenta = await cuentaDelCanal(s.org.id, canal);
    if (!cuenta) throw new ErrorErp("El canal no tiene una cuenta de Mercado Libre.");
    const pedidos = await barrerOrdenes(cuenta, Date.now() + 200_000);
    const preguntas = await barrerPreguntas(cuenta);
    revalidatePath("/config/canales");
    return `Listo: ${pedidos} pedidos revisados, ${preguntas} preguntas sin responder.`;
  });
}
