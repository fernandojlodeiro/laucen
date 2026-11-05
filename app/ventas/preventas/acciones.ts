"use server";

// Ventas › Preventas: resolver cada pedido de preventa (pasar a otra orden, dejar en espera, cancelar, más plazo para el
// saldo) y la configuración general (lib/preventa).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, id, numero, entero, tildado, texto } from "@/lib/erp/acciones";
import { cambiarEstado } from "@/lib/pedidos";
import { configPreventa, dejarEnEspera, extenderSaldo, guardarConfigPreventa, pasarAOtraOrden } from "@/lib/preventa";
import { avisarStockMl } from "@/lib/tienda/pagos/confirmar";

const LISTA = "/ventas/preventas";
const volver = (fd: FormData) => {
  const v = texto(fd, "volver");
  return v && v.startsWith(LISTA) ? v : LISTA;
};

export async function accionPasarAOtraOrden(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  await intentar(volver(fd), async () => {
    const codigo = await pasarAOtraOrden(s.org.id, id(fd), id(fd, "orden"), s.usuario.id);
    revalidatePath(LISTA);
    return `Pedido #${id(fd)} pasado a la orden ${codigo}: avisale al cliente la fecha nueva.`;
  });
}

export async function accionDejarEnEspera(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  await intentar(volver(fd), async () => {
    await dejarEnEspera(s.org.id, id(fd), s.usuario.id);
    revalidatePath(LISTA);
    return `Pedido #${id(fd)} en espera sin orden: lo cubre primero la próxima orden que traiga sus productos.`;
  });
}

export async function accionCancelarPreventa(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  await intentar(volver(fd), async () => {
    await cambiarEstado(s.org.id, id(fd), "cancelado", s.usuario.id, "preventa cancelada desde Preventas (la devolución de la seña se hace aparte)");
    await avisarStockMl(s.org.id, id(fd)).catch(() => {});
    revalidatePath(LISTA);
    return `Pedido #${id(fd)} cancelado. Si había seña, devolvela desde el pedido.`;
  });
}

export async function accionExtenderSaldo(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  await intentar(volver(fd), async () => {
    const hasta = await extenderSaldo(s.org.id, id(fd), entero(fd, "dias") ?? 0, s.usuario.id);
    revalidatePath(LISTA);
    return `Plazo del saldo hasta el ${hasta.split("-").reverse().join("/")}.`;
  });
}

export async function accionGuardarConfigPreventa(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  await intentar(`${LISTA}?ver=config`, async () => {
    const actual = await configPreventa(s.org.id);
    await guardarConfigPreventa(s.org.id, {
      ...actual,
      admiteWeb: tildado(fd, "admite_web"), admiteMl: tildado(fd, "admite_ml"),
      margenUnidades: entero(fd, "margen_unidades"), margenPct: numero(fd, "margen_pct"), margenModo: fd.get("margen_modo") === "mayor" ? "mayor" : "menor",
      descuentoPct: numero(fd, "descuento_pct") ?? 0, senaPct: numero(fd, "sena_pct") ?? 30, plazoSaldoDias: entero(fd, "plazo_saldo") ?? 7, mlMaxDias: entero(fd, "ml_max_dias") ?? 45,
    });
    revalidatePath(LISTA);
    return { ir: `${LISTA}?ver=config&ok=${encodeURIComponent("Grabado.")}` };
  });
}
