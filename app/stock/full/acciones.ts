"use server";

// Envíos a Full (lib/full/envios.ts) y la lectura de Full (lib/full/lectura.ts).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, id, entero, numero, texto } from "@/lib/erp/acciones";
import { deFondo } from "@/lib/tareas-fondo";
import { ErrorErp } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import {
  crearEnvio, guardarCabecera, guardarFlete, borrarEnvio, agregarLinea, cambiarLinea, vaciarEnvio, borrarLinea, agregarVarios, despachar,
  recibirAMano, cerrarEnvio, esCriterio,
} from "@/lib/full/envios";
import { leerFull } from "@/lib/full/lectura";

const ficha = (envio: number, extra = "") => `/stock/full/${envio}${extra}`;
const n = (x: number) => formatearNumero(x, "entero");

export async function accionNuevoEnvio(fd: FormData) {
  const s = await entrarErp("full_ver");
  await intentar("/stock/full", async () => {
    const canal = id(fd, "canal"), origen = id(fd, "origen");
    if (!canal) throw new ErrorErp("Elegí la cuenta de Mercado Libre.");
    const nuevo = await crearEnvio(s.org.id, s.usuario.id, canal, origen);
    revalidatePath("/stock/full");
    return { ir: ficha(nuevo, "?ok=" + encodeURIComponent("Envío creado. Sumale los productos.")) };
  });
}

export async function accionGuardarEnvio(fd: FormData) {
  const s = await entrarErp("full_ver");
  const e = id(fd);
  await intentar(ficha(e, "?editar=ficha"), async () => {
    const fecha = texto(fd, "fecha_entrega");
    await guardarCabecera(s.org.id, e, { numero_ml: texto(fd, "numero_ml"), fecha_entrega: fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null, notas: texto(fd, "notas") });
    return { ir: ficha(e, "?ok=" + encodeURIComponent("Grabado.")) };
  });
}

export async function accionGuardarFlete(fd: FormData) {
  const s = await entrarErp("full_ver");
  const e = id(fd);
  await intentar(ficha(e, "?editar=flete"), async () => {
    const criterio = String(fd.get("criterio") ?? "");
    await guardarFlete(s.org.id, e, { monto: numero(fd, "monto"), facturaId: id(fd, "factura") || null, criterio: esCriterio(criterio) ? criterio : "volumen" });
    revalidatePath("/informes/rentabilidad");
    return { ir: ficha(e, "?ok=" + encodeURIComponent("Flete grabado y repartido entre los productos.")) };
  });
}

export async function accionBorrarEnvio(fd: FormData) {
  const s = await entrarErp("full_ver");
  const e = id(fd);
  await intentar(ficha(e), async () => {
    await borrarEnvio(s.org.id, e);
    return { ir: "/stock/full?ok=" + encodeURIComponent(`Envío ${e} borrado.`) };
  });
}

export async function accionAgregarLinea(fd: FormData) {
  const s = await entrarErp("full_ver");
  const e = id(fd, "envio");
  await intentar(ficha(e), async () => {
    const aviso = await agregarLinea(s.org.id, e, id(fd, "variacion"), entero(fd, "cantidad") ?? 0);
    return { ir: ficha(e, `?${aviso ? "error" : "ok"}=` + encodeURIComponent(aviso ?? "Agregado.")) };
  });
}

export async function accionCantidadLinea(fd: FormData) {
  const s = await entrarErp("full_ver");
  const e = id(fd, "envio");
  await intentar(ficha(e), async () => {
    const [item, variacion = ""] = String(fd.get("publicacion") ?? "").split("~");
    await cambiarLinea(s.org.id, e, id(fd, "linea"), entero(fd, "cantidad") ?? 0, item ? { item, variacion } : null);
    return "Grabado.";
  });
}

export async function accionBorrarLinea(fd: FormData) {
  const s = await entrarErp("full_ver");
  const e = id(fd, "envio");
  await intentar(ficha(e), async () => {
    await borrarLinea(s.org.id, e, id(fd, "linea"));
    return "Sacado del envío.";
  });
}

/** «Agregar los tildados» de la sugerencia: cada fila tildada (s_<variación>) con su cantidad (c_<variación>). */
export async function accionAgregarTildados(fd: FormData) {
  const s = await entrarErp("full_ver");
  const e = id(fd, "envio");
  await intentar(ficha(e), async () => {
    const items = [...fd.keys()].filter((k) => /^s_\d+$/.test(k) && fd.get(k) === "on")
      .map((k) => { const v = Number(k.slice(2)); return { variacion: v, cantidad: entero(fd, `c_${v}`) ?? 0 }; });
    const r = await agregarVarios(s.org.id, e, items);
    return { ir: ficha(e, "?ok=" + encodeURIComponent(`Se sumaron ${n(r.agregados)} productos (${n(r.unidades)} unidades).`)) };
  });
}

export async function accionVaciarEnvio(fd: FormData) {
  const s = await entrarErp("full_ver");
  const e = id(fd);
  await intentar(ficha(e), async () => {
    const t = await vaciarEnvio(s.org.id, e);
    return `Se sacaron ${n(t)} productos del envío.`;
  });
}

export async function accionDespachar(fd: FormData) {
  const s = await entrarErp("full_ver");
  const e = id(fd);
  await intentar(ficha(e), async () => {
    const r = await despachar(s.org.id, e, s.usuario.id);
    revalidatePath("/stock/consulta");
    return `Despachado: ${n(r.unidades)} unidades de ${n(r.productos)} productos pasaron a «En camino a Full».`;
  });
}

export async function accionRecibirAMano(fd: FormData) {
  const s = await entrarErp("full_ver");
  const e = id(fd, "envio");
  await intentar(ficha(e), async () => {
    await recibirAMano(s.org.id, e, id(fd, "linea"), entero(fd, "cantidad") ?? 0, s.usuario.id);
    return "Recibido en Full.";
  });
}

export async function accionCerrarEnvio(fd: FormData) {
  const s = await entrarErp("full_ver");
  const e = id(fd);
  await intentar(ficha(e), async () => {
    const como = fd.get("faltantes") === "perdido" ? "perdido" : "volver";
    const t = await cerrarEnvio(s.org.id, e, como, s.usuario.id);
    if (!t) return "Envío cerrado: llegó todo.";
    return como === "volver" ? `Envío cerrado: ${n(t)} unidades que no llegaron volvieron al depósito.` : `Envío cerrado: ${n(t)} unidades que no llegaron se dieron por perdidas.`;
  });
}

/** «Leer Full ahora»: de fondo (lee de ML y concilia). */
export async function accionLeerFull(fd: FormData) {
  const s = await entrarErp("full_ver");
  const canal = id(fd, "canal") || undefined;
  return deFondo(s, "full-lectura", "Leer Full de Mercado Libre", async () => {
    const r = await leerFull(s.org.id, Date.now() + 50_000, canal);
    if (!r.cuentas) return "No hay ninguna cuenta con depósito Full (se crea con el primer envío).";
    const partes = [`Leídos ${n(r.leidos)} códigos de ML`];
    if (r.recibidas) partes.push(`${n(r.recibidas)} unidades recibidas en Full`);
    if (r.envios_recibidos) partes.push(`${n(r.envios_recibidos)} envíos completos`);
    if (r.ajustes) partes.push(`${n(r.ajustes)} productos igualados con ML`);
    if (r.errores.length) partes.push(`${n(r.errores.length)} con error (ver la columna «Lectura»)`);
    return partes.join(" · ") + ".";
  });
}
