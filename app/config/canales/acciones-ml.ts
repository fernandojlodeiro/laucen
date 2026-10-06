"use server";

// Acciones de la cuenta de Mercado Libre de un canal (sesión 2).

import { deFondo } from "@/lib/tareas-fondo";
import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, id } from "@/lib/erp/acciones";
import { cuentaDelCanal } from "@/lib/mercadolibre/api";
import { barrerOrdenes } from "@/lib/mercadolibre/pedidos";
import { barrerPreguntas } from "@/lib/mercadolibre/preguntas";
import { sincronizarStockMl } from "@/lib/mercadolibre/stock";
import { fijarInterruptor } from "@/lib/precios-ml/datos";
import { sincronizarPreciosMl } from "@/lib/precios-ml/preparar";
import { asegurarCuentasDeCanalesSinFallar } from "@/lib/administracion/contabilidad";

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
    // Su cuenta de Mercado Pago (fondos y contable), si todavía no la tiene.
    await asegurarCuentasDeCanalesSinFallar(s.org.id);
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
/** Con qué razón social se factura lo que vende este canal (obligatoria: no hay "principal"). */
export async function accionAsignarRazonSocial(fd: FormData) {
  const s = await entrarErp("canales_ver");
  const canal = id(fd, "canal");
  await intentar(volver(canal), async () => {
    await canalMl(s.org.id, fd);
    const emisor = id(fd, "emisor") || null;
    if (!emisor) throw new ErrorErp("Elegí con qué razón social factura el canal.");
    if (!(await una("select 1 from emisor where id = $1 and organizacion_id = $2", [emisor, s.org.id]))) throw new ErrorErp("Esa razón social no existe.");
    await consulta("update canal set emisor_id = $3 where id = $2 and organizacion_id = $1", [s.org.id, canal, emisor]);
    // La cuenta de Mercado Pago del canal es de la razón social que factura el canal.
    await consulta("update cuenta_fondos set emisor_id = coalesce($3::bigint, emisor_principal($1)) where canal_id = $2 and organizacion_id = $1", [s.org.id, canal, emisor]);
    revalidatePath("/config/canales");
    return "Listo: este canal factura con esa razón social.";
  });
}

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

/** Prende o apaga que Laucen suba sola a la venta de ML cada factura (y
 *  nota de crédito) que ARCA autoriza. Prenderlo es el clic de Fer. */
export async function accionSubirFacturas(fd: FormData) {
  const s = await entrarErp("canales_ver");
  const canal = id(fd, "canal");
  await intentar(volver(canal), async () => {
    await canalMl(s.org.id, fd);
    const prender = fd.get("valor") === "1";
    await consulta(`update canal set config = config || jsonb_build_object('subir_facturas', $3::boolean) where id = $2 and organizacion_id = $1`,
      [s.org.id, canal, prender]);
    revalidatePath("/config/canales");
    return prender
      ? "Prendido: cada factura o nota de crédito de este canal que autorice ARCA se sube sola a su venta en Mercado Libre. Las que ya estaban se suben con «Subir a ML las facturas que faltan» (Facturación)."
      : "Apagado: las facturas ya no se suben solas a Mercado Libre (se puede subir una a mano desde su ficha).";
  });
}

/** Trae ya los pedidos y preguntas (sin esperar el barrido de 2 minutos). */
export async function accionTraerAhora(fd: FormData) {
  const s = await entrarErp("canales_ver");
  const canal = id(fd, "canal");
  return deFondo(s, `traer-ml:${canal}`, "Pedidos y preguntas de Mercado Libre", async () => {
    await canalMl(s.org.id, fd);
    const cuenta = await cuentaDelCanal(s.org.id, canal);
    if (!cuenta) throw new ErrorErp("El canal no tiene una cuenta de Mercado Libre.");
    const pedidos = await barrerOrdenes(cuenta, Date.now() + 200_000);
    const preguntas = await barrerPreguntas(cuenta);
    revalidatePath("/config/canales");
    return `Listo: ${pedidos} pedidos revisados, ${preguntas} preguntas sin responder.`;
  });
}

/** Prende o apaga que Laucen mande los precios a Mercado Libre solo (el
 *  mismo interruptor que "Sincronizar precios" de Precios en ML). Apagado,
 *  ningún precio sale salvo lo que Fer prepare y mande con su clic. */
export async function accionSincronizarPrecios(fd: FormData) {
  const s = await entrarErp("canales_ver");
  const canal = id(fd, "canal");
  await intentar(volver(canal), async () => {
    await canalMl(s.org.id, fd);
    const prender = fd.get("valor") === "1";
    await fijarInterruptor(s.org.id, canal, "sincronizar_precios", prender);
    revalidatePath("/config/canales");
    if (!prender) return "Apagado: Laucen no manda precios solo a esta cuenta (lo preparado sigue esperando tu clic).";
    const r = await sincronizarPreciosMl(s.org.id, { canal });
    return `Prendido. Primera pasada: ${r.revisadas} variaciones revisadas, ${r.encoladas} cambios de precio a la cola de ML.`;
  });
}
