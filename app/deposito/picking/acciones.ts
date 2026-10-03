"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp, motivoErp } from "@/lib/erp/base";
import { intentar, entero, id } from "@/lib/erp/acciones";
import { crearLote, escanear, corregirItem, terminarLote, cancelarLote, marcarPreparado, pedidoDelLotePorCodigo, empacar, esModoLote, type FaltaEmpacar } from "@/lib/deposito/picking";

const LISTA = "/deposito/picking";

/** "Preparar este" (botón con name=solo), "Recorrer escaneando" o "Empacar
 *  escaneando (alternativo)" (casillas p; el botón trae name=modo). */
export async function accionCrearLote(fd: FormData) {
  const s = await entrarErp("picking_ver");
  const deposito = id(fd, "d");
  await intentar(`${LISTA}?d=${deposito}`, async () => {
    const solo = id(fd, "solo");
    const ids = solo ? [solo] : [...new Set(fd.getAll("p").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!deposito) throw new ErrorErp("Elegí un depósito.");
    const modo = esModoLote(fd.get("modo")) ? (fd.get("modo") as "recorrido" | "empacar") : "recorrido";
    const lote = await crearLote(s.org.id, deposito, ids, s.usuario.id, modo === "empacar" ? "empacar" : "recorrido");
    revalidatePath(LISTA);
    return { ir: `${LISTA}/${lote}` };
  });
}

export type ResultadoEscaneo = { ok: true; mensaje: string } | { ok: false; mensaje: string };

/** Un escaneo desde la pantalla de trabajo: devuelve el resultado (no redirige). */
export async function accionEscanear(loteId: number, codigo: string): Promise<ResultadoEscaneo> {
  const s = await entrarErp("picking_ver");
  try {
    const { item, completo } = await escanear(s.org.id, Number(loteId), String(codigo ?? ""));
    const resto = item.cantidad - item.escaneado - item.faltante;
    return { ok: true, mensaje: completo ? `${item.sku}: listo (${item.escaneado} de ${item.cantidad}).` : `${item.sku}: ${item.escaneado} de ${item.cantidad}, faltan ${resto}.` };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}

export async function accionCorregirItem(fd: FormData) {
  const s = await entrarErp("picking_ver");
  const lote = id(fd, "lote");
  await intentar(`${LISTA}/${lote}`, async () => {
    await corregirItem(s.org.id, id(fd), entero(fd, "escaneado") ?? 0, entero(fd, "faltante") ?? 0);
    revalidatePath(`${LISTA}/${lote}`);
    return "Corregido.";
  });
}

export async function accionTerminarLote(fd: FormData) {
  const s = await entrarErp("picking_ver");
  const lote = id(fd, "lote");
  await intentar(`${LISTA}/${lote}`, async () => {
    const r = await terminarLote(s.org.id, lote, s.usuario.id);
    revalidatePath(LISTA);
    return `Picking terminado: ${r.preparados.length} preparado(s)${r.incompletos.length ? `, ${r.incompletos.length} incompleto(s)` : ""}${r.enEspera.length ? `. ${r.enEspera.length === 1 ? "El pedido" : "Los pedidos"} ${r.enEspera.join(", ")} ${r.enEspera.length === 1 ? "es un carrito" : "son carritos"} de Mercado Libre que recibió un cambio hace menos de 10 min: vuelve a la lista para prepararlo de nuevo pasada la espera` : ""}.`;
  });
}

export async function accionCancelarLote(fd: FormData) {
  const s = await entrarErp("picking_ver");
  const lote = id(fd, "lote");
  const d = id(fd, "d");
  await intentar(`${LISTA}/${lote}`, async () => {
    await cancelarLote(s.org.id, lote);
    revalidatePath(LISTA);
    return { ir: `${LISTA}?d=${d}&ok=${encodeURIComponent(`Picking #${lote} cancelado: sus pedidos vuelven a la lista.`)}` };
  });
}

/** "Preparado" en la fila de un pedido del lote. */
export async function accionPreparado(fd: FormData) {
  const s = await entrarErp("picking_ver");
  const lote = id(fd, "lote");
  const pedido = id(fd, "pedido");
  const ver = String(fd.get("ver") ?? "");
  await intentar(`${LISTA}/${lote}${ver ? `?ver=${encodeURIComponent(ver)}` : ""}`, async () => {
    const r = await marcarPreparado(s.org.id, lote, pedido, s.usuario.id);
    revalidatePath(LISTA);
    revalidatePath(`${LISTA}/${lote}`);
    return r.loteTerminado ? `Pedido ${pedido} preparado. Era el último: el lote quedó terminado.` : `Pedido ${pedido} preparado.`;
  });
}

export type PedidoEscaneado = { ok: true; id: number; cliente: string | null; unidades: number; preparado: boolean; enEspera: boolean } | { ok: false; mensaje: string };

/** El código de barras de una hoja: qué pedido es (la pantalla pregunta antes de cerrarlo). */
export async function accionBuscarPedidoLote(loteId: number, codigo: string): Promise<PedidoEscaneado> {
  const s = await entrarErp("picking_ver");
  try {
    const p = await pedidoDelLotePorCodigo(s.org.id, Number(loteId), String(codigo ?? ""));
    return { ok: true, id: p.id, cliente: p.apodo ? `${p.cliente ?? ""} (${p.apodo})`.trim() : p.cliente, unidades: p.unidades, preparado: !!p.preparado_ts, enEspera: p.en_espera };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}

/** El "Sí" después de escanear una hoja. */
export async function accionPreparadoPorCodigo(loteId: number, pedidoId: number): Promise<ResultadoEscaneo> {
  const s = await entrarErp("picking_ver");
  try {
    const r = await marcarPreparado(s.org.id, Number(loteId), Number(pedidoId), s.usuario.id);
    revalidatePath(LISTA);
    return { ok: true, mensaje: r.loteTerminado ? `Pedido ${pedidoId} preparado. Era el último: el lote quedó terminado.` : `Pedido ${pedidoId} preparado.` };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}

export type ResultadoEmpaque =
  | { ok: true; pedidoId: number; sku: string; titulo: string; completo: boolean; preparado: boolean; aviso: string | null; faltan: FaltaEmpacar[]; loteTerminado: boolean }
  | { ok: false; mensaje: string };

/** Un escaneo en la mesa de empaque. */
export async function accionEmpacar(loteId: number, codigo: string): Promise<ResultadoEmpaque> {
  const s = await entrarErp("picking_ver");
  try {
    const r = await empacar(s.org.id, Number(loteId), String(codigo ?? ""), s.usuario.id);
    if (r.preparado) revalidatePath(LISTA);
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}
