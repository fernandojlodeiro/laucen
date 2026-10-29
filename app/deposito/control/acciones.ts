"use server";

// Control de stock (lib/deposito/control.ts): lo que tocan en el celular. Devuelven el resultado para el cartel de
// abajo (no redirigen): la tarjeta siguiente la trae la pantalla al refrescarse.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { motivoErp } from "@/lib/erp/base";
import { sincronizarStockMl } from "@/lib/mercadolibre/stock";
import { registrarControl, resolverBusqueda, saltar, pedidosQueLaReservan, type Registro } from "@/lib/deposito/control";

export type Respuesta = { ok: boolean; texto: string; pedidos?: { id: number; cantidad: number }[] };

/** Que Mercado Libre y la tienda se enteren ya (además del aviso automático de la base). */
const avisarCanales = (org: string, variacionId: number) =>
  sincronizarStockMl(org, [variacionId]).catch((e) => console.error("[control] stock a ML", e));

export async function accionRegistrar(r: Registro): Promise<Respuesta> {
  const s = await entrarErp("control_stock");
  try {
    const x = await registrarControl(s.org.id, s.usuario.id, r);
    if (x.resultado !== "ok") await avisarCanales(s.org.id, r.variacionId);
    revalidatePath("/deposito/control");
    const texto = x.resultado === "ok" ? `${x.sku}: está. Anotado.`
      : x.resultado === "sobrante" ? `${x.sku}: había ${x.diferencia} de más; se sumaron en ${x.codigo}.`
      : x.resultado === "faltante" ? `${x.sku}: se descontaron ${x.diferencia} por faltante.`
      : `${x.sku}: ${x.diferencia} pasaron a «En búsqueda». Se resuelve en la pestaña «A buscar».`;
    // Lo que quedó no alcanza para lo que ya está vendido y sin despachar: hay que resolverlo ya.
    if (x.resultado !== "ok" && x.resultado !== "sobrante" && x.quedan < x.reservado) {
      const pedidos = await pedidosQueLaReservan(s.org.id, r.variacionId);
      return { ok: false, texto: `${texto} ¡Ojo! Hay ventas esperando este producto y en el depósito no alcanza:`, pedidos };
    }
    return { ok: true, texto };
  } catch (e) {
    revalidatePath("/deposito/control");
    return { ok: false, texto: motivoErp(e) };
  }
}

export async function accionSaltar(variacionId: number, ubicacionId: number): Promise<Respuesta> {
  const s = await entrarErp("control_stock");
  try {
    await saltar(s.org.id, s.usuario.id, variacionId, ubicacionId);
    revalidatePath("/deposito/control");
    return { ok: true, texto: "Salteado: te vuelve a aparecer más tarde." };
  } catch (e) {
    return { ok: false, texto: motivoErp(e) };
  }
}

export async function accionResolver(controlId: number, aparecieron: number, ubicacionId: number | null): Promise<Respuesta> {
  const s = await entrarErp("control_stock");
  try {
    const x = await resolverBusqueda(s.org.id, s.usuario.id, controlId, aparecieron, ubicacionId);
    await avisarCanales(s.org.id, x.variacionId);
    revalidatePath("/deposito/control");
    revalidatePath("/deposito/control/a-buscar");
    const partes = [x.aparecieron ? `${x.aparecieron} apareció${x.aparecieron > 1 ? "eron" : ""} y volvi${x.aparecieron > 1 ? "eron" : "ó"} al stock` : "",
      x.perdidas ? `${x.perdidas} se descont${x.perdidas > 1 ? "aron" : "ó"} por faltante` : ""].filter(Boolean);
    return { ok: true, texto: `${x.sku}: ${partes.join("; ")}.` };
  } catch (e) {
    return { ok: false, texto: motivoErp(e) };
  }
}
