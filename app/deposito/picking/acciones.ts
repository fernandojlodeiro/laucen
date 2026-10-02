"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp, motivoErp } from "@/lib/erp/base";
import { intentar, entero, id } from "@/lib/erp/acciones";
import { crearLote, escanear, corregirItem, terminarLote, cancelarLote } from "@/lib/deposito/picking";

const LISTA = "/deposito/picking";

/** "Preparar este" (botón con name=solo) o "Armar lote con los tildados" (casillas p). */
export async function accionCrearLote(fd: FormData) {
  const s = await entrarErp("picking_ver");
  const deposito = id(fd, "d");
  await intentar(`${LISTA}?d=${deposito}`, async () => {
    const solo = id(fd, "solo");
    const ids = solo ? [solo] : [...new Set(fd.getAll("p").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!deposito) throw new ErrorErp("Elegí un depósito.");
    const lote = await crearLote(s.org.id, deposito, ids, s.usuario.id);
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
    return `Picking terminado: ${r.preparados.length} preparado(s)${r.incompletos.length ? `, ${r.incompletos.length} incompleto(s)` : ""}.`;
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
