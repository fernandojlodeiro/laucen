"use server";

// Órdenes de compra al exterior (lib/compras/ordenes.ts): crear desde el Excel del proveedor, corregir, confirmar,
// publicar en la web o en Mercado Libre, subir el packing list y recibir.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { motivoErp, ErrorErp } from "@/lib/erp/base";
import { intentar, id, numero, texto, entero } from "@/lib/erp/acciones";
import { supabaseServer } from "@/lib/supabase";
import {
  agregarLinea, borrarLinea, borrarOrden, confirmarOrden, crearOrdenDesdeExcel, esViaOrden, guardarCabecera, guardarLinea, guardarPacking,
  leerArchivoPacking, publicarOrden, volverABorrador, avisarCambioPreventa,
} from "@/lib/compras/ordenes";
import { crearRecepcion } from "@/lib/deposito/recepcion";
import { una } from "@/lib/erp/base";

const LISTA = "/compras/ordenes";
const ficha = (n: number) => `${LISTA}/${n}`;

async function bajar(org: string, ruta: string, archivo: string): Promise<ArrayBuffer> {
  if (!ruta?.startsWith(`${org}/`) || ruta.includes("..")) throw new ErrorErp("El archivo no es de esta organización.");
  const { data, error } = await (await supabaseServer()).storage.from("importaciones").download(ruta);
  if (error || !data) throw new ErrorErp(`No se pudo bajar «${archivo}». Probá de nuevo.`);
  return data.arrayBuffer();
}

/** Lee el Excel ya subido y crea la orden (la llama SubirOrden.tsx). */
export async function accionCrearOrden(a: { ruta: string; archivo: string; proveedorId: number | null; via: string }): Promise<{ id: number; codigo: string; renglones: number } | { motivo: string }> {
  const s = await entrarErp("compras_ver");
  try {
    if (!a.proveedorId) throw new ErrorErp("Elegí el proveedor.");
    if (!esViaOrden(a.via)) throw new ErrorErp("Elegí si es aéreo, marítimo o courier.");
    if (!/\.xlsx$/i.test(a.archivo)) throw new ErrorErp("Tiene que ser el Excel del proveedor (.xlsx).");
    const r = await crearOrdenDesdeExcel(s.org.id, { contenido: await bajar(s.org.id, a.ruta, a.archivo), archivo: a.archivo, ruta: a.ruta, proveedorId: a.proveedorId, via: a.via, usuarioId: s.usuario.id });
    revalidatePath(LISTA);
    return r;
  } catch (e) {
    return { motivo: motivoErp(e) };
  }
}

/** Lee el packing list ya subido y lo guarda en la orden (lo llama SubirPacking.tsx). */
export async function accionSubirPacking(a: { ordenId: number; ruta: string; archivo: string }): Promise<{ cajas: number; unidades: number; avisos: string[] } | { motivo: string }> {
  const s = await entrarErp("compras_ver");
  try {
    if (!/\.xlsx$/i.test(a.archivo)) throw new ErrorErp("Tiene que ser el packing list en Excel (.xlsx).");
    const leido = await leerArchivoPacking(await bajar(s.org.id, a.ruta, a.archivo));
    const r = await guardarPacking(s.org.id, Number(a.ordenId), a.archivo, leido);
    revalidatePath(ficha(Number(a.ordenId)));
    return r;
  } catch (e) {
    return { motivo: motivoErp(e) };
  }
}

export async function accionGuardarOrden(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const oid = id(fd);
  await intentar(ficha(oid), async () => {
    await guardarCabecera(s.org.id, oid, {
      via: String(fd.get("via") ?? ""), anio: entero(fd, "anio") ?? 0, numero: entero(fd, "numero") ?? 0, proveedorId: entero(fd, "proveedor_id"),
      fecha: texto(fd, "fecha"), llegada: texto(fd, "llegada"), llegadaMl: texto(fd, "llegada_ml"), notas: texto(fd, "notas"),
      margenUnidades: entero(fd, "margen_unidades"), margenPct: numero(fd, "margen_pct"), margenModo: texto(fd, "margen_modo"), descuentoPct: numero(fd, "descuento_pct"),
    });
    await avisarCambioPreventa(s.org.id, oid);
    revalidatePath(ficha(oid));
    return { ir: `${ficha(oid)}?ok=${encodeURIComponent("Grabado.")}` };
  });
}

export async function accionGuardarLineaOrden(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const oid = id(fd, "orden_id");
  await intentar(ficha(oid), async () => {
    await guardarLinea(s.org.id, id(fd), { sku: texto(fd, "sku") ?? "", cantidad: entero(fd, "cantidad") ?? 0, precio: numero(fd, "precio") });
    await avisarCambioPreventa(s.org.id, oid);
    revalidatePath(ficha(oid));
    return { ir: `${ficha(oid)}?ok=${encodeURIComponent("Renglón grabado.")}` };
  });
}

export async function accionAgregarLineaOrden(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const oid = id(fd, "orden_id");
  await intentar(ficha(oid), async () => {
    await agregarLinea(s.org.id, oid, { sku: texto(fd, "sku") ?? "", cantidad: entero(fd, "cantidad") ?? 0, precio: numero(fd, "precio"), descripcion: texto(fd, "descripcion") });
    await avisarCambioPreventa(s.org.id, oid);
    revalidatePath(ficha(oid));
    return { ir: `${ficha(oid)}?nuevo=nuevo-renglon&ok=${encodeURIComponent("Renglón agregado.")}` };
  });
}

export async function accionBorrarLineaOrden(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const oid = id(fd, "orden_id");
  await intentar(ficha(oid), async () => {
    await borrarLinea(s.org.id, id(fd));
    await avisarCambioPreventa(s.org.id, oid);
    revalidatePath(ficha(oid));
    return "Renglón borrado.";
  });
}

export async function accionConfirmarOrden(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const oid = id(fd);
  await intentar(ficha(oid), async () => {
    const r = await confirmarOrden(s.org.id, oid);
    revalidatePath(LISTA);
    return `Confirmada: ya cuenta como mercadería en camino. FOB actualizado en ${r.fob} producto${r.fob === 1 ? "" : "s"}.${r.courier ? ` Se armó la compra por courier ${r.courier}.` : ""}`;
  });
}

export async function accionVolverABorrador(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const oid = id(fd);
  await intentar(ficha(oid), async () => {
    await volverABorrador(s.org.id, oid);
    await avisarCambioPreventa(s.org.id, oid);
    revalidatePath(LISTA);
    return "Volvió a «A revisar»: no cuenta como mercadería en camino hasta confirmarla de nuevo.";
  });
}

export async function accionBorrarOrden(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await intentar(LISTA, async () => {
    await borrarOrden(s.org.id, id(fd));
    revalidatePath(LISTA);
    return "Orden borrada.";
  });
}

/** «Publicar en la web» / «Publicar en Mercado Libre» (interruptores de la orden). */
export async function accionPublicarOrden(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const oid = id(fd);
  const canal = fd.get("canal") === "ml" ? "ml" : "web";
  const prender = fd.get("valor") === "1";
  await intentar(ficha(oid), async () => {
    await publicarOrden(s.org.id, oid, canal, prender);
    revalidatePath(ficha(oid));
    return prender
      ? canal === "web" ? "Publicada en la web: los productos de la orden sin stock se ofrecen en preventa." : "Publicada en Mercado Libre: las publicaciones de esos productos sin stock pasan a preventa (si el canal tiene prendida la preventa automática)."
      : "Se dejó de ofrecer en preventa en ese canal (lo ya vendido sigue esperando su orden).";
  });
}

/** «Recibir»: abre (o retoma) la recepción de la orden en el depósito elegido. */
export async function accionRecibirOrden(fd: FormData) {
  const s = await entrarErp("recepcion_ver");
  const oid = id(fd);
  await intentar(ficha(oid), async () => {
    const o = await una<{ codigo: string; proveedor_id: number | null }>("select codigo, proveedor_id::int from orden_compra where id = $1 and organizacion_id = $2", [oid, s.org.id]);
    if (!o) throw new ErrorErp("Esa orden no existe.");
    const r = await crearRecepcion(s.org.id, { tipo: "compra", depositoId: id(fd, "deposito"), proveedorId: o.proveedor_id, documento: o.codigo, ordenCompraId: oid }, s.usuario.id);
    return { ir: `/deposito/recepcion/${r}` };
  });
}

/** «Preparar el lote para Mercado Libre»: en las cuentas sin la preventa automática, arma el lote con el pase a preventa
 *  de las publicaciones sin stock de esta orden, para mandarlo con el botón de la cola. */
export async function accionPrepararPreventaMl(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const oid = id(fd);
  await intentar(ficha(oid), async () => {
    const o = await una<{ publicar_ml: boolean }>("select publicar_ml from orden_compra where id = $1 and organizacion_id = $2", [oid, s.org.id]);
    if (!o?.publicar_ml) throw new ErrorErp("Primero prendé «Publicar en Mercado Libre».");
    const { prepararPreventaMl } = await import("@/lib/mercadolibre/stock");
    const lotes = await prepararPreventaMl(s.org.id, oid, s.usuario.id);
    if (!lotes.length) return "No hay publicaciones para pasar a preventa en las cuentas sin la preventa automática (o ya están).";
    return `Lotes preparados: ${lotes.map((l) => `${l.canal} (lote ${l.loteId}, ${l.cambios} publicaciones)`).join("; ")}. Mandalos desde Configuración › Cola de Mercado Libre, pestaña Lotes preparados.`;
  });
}
