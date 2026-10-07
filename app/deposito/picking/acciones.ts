"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp, motivoErp, enTransaccion } from "@/lib/erp/base";
import { intentar, entero, id } from "@/lib/erp/acciones";
import { crearLote, escanear, corregirItem, terminarLote, cancelarLote, marcarPreparado, pedidosDelLotePorEtiqueta, empacar, esModoLote, pedidoPorNumero, prepararRapido, motivoNoPreparable, type FaltaEmpacar, type CargaKit } from "@/lib/deposito/picking";
import { tienePermiso } from "@/lib/permisos";

const LISTA = "/deposito/picking";

const SIN_PERMISO = "Para dar un pedido por preparado sin escanear sus productos hace falta el permiso «Preparar sin escanear».";
/** Cerrar un pedido sin escanear cada producto (provisorio, con permiso). */
const exigirSinEscanear = (s: { permisos: Parameters<typeof tienePermiso>[0] }) => {
  if (!tienePermiso(s.permisos, "picking_sin_escanear")) throw new ErrorErp(SIN_PERMISO);
};
/** Una cantidad que llega de la pantalla (vacía = 1). */
const cant = (x: unknown) => { const n = Number(x ?? 1); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1; };

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
export async function accionEscanear(loteId: number, codigo: string, cantidad = 1): Promise<ResultadoEscaneo> {
  const s = await entrarErp("picking_ver");
  try {
    const { item, completo, kit } = await escanear(s.org.id, Number(loteId), String(codigo ?? ""), cant(cantidad));
    if (kit) return { ok: true, mensaje: `${kit.sku} × ${kit.cantidad}: ${kit.unidades} unidad${kit.unidades === 1 ? "" : "es"} cargada${kit.unidades === 1 ? "" : "s"} (pedido ${kit.pedidoId}).` };
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
    await cancelarLote(s.org.id, lote, s.usuario.id);
    revalidatePath(LISTA);
    return { ir: `${LISTA}?d=${d}&ok=${encodeURIComponent(`Lote #${lote} desarmado: sus pedidos volvieron a la lista como estaban.`)}` };
  });
}

/** "Preparado" en la fila de un pedido del lote. */
export async function accionPreparado(fd: FormData) {
  const s = await entrarErp("picking_ver");
  const lote = id(fd, "lote");
  const pedido = id(fd, "pedido");
  const ver = String(fd.get("ver") ?? "");
  await intentar(`${LISTA}/${lote}${ver ? `?ver=${encodeURIComponent(ver)}` : ""}`, async () => {
    exigirSinEscanear(s);
    const r = await marcarPreparado(s.org.id, lote, pedido, s.usuario.id);
    revalidatePath(LISTA);
    revalidatePath(`${LISTA}/${lote}`);
    return r.loteTerminado ? `Pedido ${pedido} preparado. Era el último: el lote quedó terminado.` : `Pedido ${pedido} preparado.`;
  });
}

export type PedidoEscaneado = {
  ok: true; id: number; cliente: string | null; unidades: number; preparado: boolean; enEspera: boolean;
  /** Todos los pedidos de esa etiqueta (un carrito de ML lleva una sola) y de quién es la etiqueta. */
  ids: number[]; etiqueta: "ml" | "oca" | null;
} | { ok: false; mensaje: string };

/** El código de barras de la etiqueta (ML u OCA): qué pedido es (la pantalla pregunta antes de cerrarlo). */
export async function accionBuscarPedidoLote(loteId: number, codigo: string): Promise<PedidoEscaneado> {
  const s = await entrarErp("picking_ver");
  try {
    const { pedidos, etiqueta } = await pedidosDelLotePorEtiqueta(s.org.id, Number(loteId), String(codigo ?? ""));
    const pendientes = pedidos.filter((p) => !p.preparado_ts);
    const p = pendientes[0] ?? pedidos[0];
    return {
      ok: true, id: p.id, cliente: p.apodo ? `${p.cliente ?? ""} (${p.apodo})`.trim() : p.cliente,
      unidades: pendientes.reduce((t, x) => t + x.unidades, 0) || p.unidades,
      preparado: !pendientes.length, enEspera: pendientes.some((x) => x.en_espera), ids: pendientes.map((x) => x.id), etiqueta,
    };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}

/** El "Sí" después de escanear una etiqueta (todos los pedidos que van en ella). */
export async function accionPreparadoPorCodigo(loteId: number, pedidoIds: number[]): Promise<ResultadoEscaneo> {
  const s = await entrarErp("picking_ver");
  try {
    exigirSinEscanear(s);
    const ids = pedidoIds.map(Number);
    const r = await enTransaccion(async (c) => {
      let ultimo = { loteTerminado: false };
      for (const id of ids) ultimo = await marcarPreparado(s.org.id, Number(loteId), id, s.usuario.id, c);
      return ultimo;
    });
    revalidatePath(LISTA);
    const cuales = ids.length === 1 ? `Pedido ${ids[0]} preparado` : `Pedidos ${ids.join(", ")} preparados`;
    return { ok: true, mensaje: r.loteTerminado ? `${cuales}. Era el último: el lote quedó terminado.` : `${cuales}.` };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}

export type ResultadoEmpaque =
  | { ok: true; pedidoId: number; sku: string; titulo: string; completo: boolean; preparado: boolean; aviso: string | null; faltan: FaltaEmpacar[]; loteTerminado: boolean; kit?: CargaKit | null }
  | { ok: false; mensaje: string };

/** Un escaneo en la mesa de empaque. */
export async function accionEmpacar(loteId: number, codigo: string, cantidad = 1): Promise<ResultadoEmpaque> {
  const s = await entrarErp("picking_ver");
  try {
    const r = await empacar(s.org.id, Number(loteId), String(codigo ?? ""), s.usuario.id, cant(cantidad));
    if (r.preparado) revalidatePath(LISTA);
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}

export type PedidoRapido = { ok: true; id: number; cliente: string | null; unidades: number; estado: string; lote: number | null } | { ok: false; mensaje: string };

/** «Preparado rápido»: qué pedido es ese número (la pantalla pregunta antes). */
export async function accionBuscarRapido(codigo: string): Promise<PedidoRapido> {
  const s = await entrarErp("picking_ver");
  try {
    exigirSinEscanear(s);
    const p = await pedidoPorNumero(s.org.id, String(codigo ?? ""));
    if (p.estado === "preparado" && !p.lote) return { ok: false, mensaje: `El pedido ${p.id} ya está preparado.` };
    if (!p.lote && !p.preparable) return { ok: false, mensaje: motivoNoPreparable({ ...p, estado: p.estado.replace("_", " ") }) };
    return { ok: true, id: p.id, cliente: p.cliente, unidades: p.unidades, estado: p.estado, lote: p.lote };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}

/** El "Sí" del «preparado rápido»: queda preparado con todo tildado. */
export async function accionPreparadoRapido(codigo: string): Promise<ResultadoEscaneo> {
  const s = await entrarErp("picking_ver");
  try {
    exigirSinEscanear(s);
    const r = await prepararRapido(s.org.id, String(codigo ?? ""), s.usuario.id);
    revalidatePath(LISTA);
    return { ok: true, mensaje: `Pedido ${r.pedidoId} preparado (lote #${r.loteId}).` };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}
