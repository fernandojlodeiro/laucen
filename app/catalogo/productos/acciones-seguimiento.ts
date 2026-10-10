"use server";

// La pestaña «Seguimiento» de la ficha del producto (lib/seguimiento/).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { deFondo } from "@/lib/tareas-fondo";
import { buscarParaSeguir, seguirDeBusqueda, seguirPorNumero, dejarDeSeguir, leerSeguidas } from "@/lib/seguimiento";

const volver = (pid: number) => `/catalogo/productos/${pid}?seccion=seguimiento`;

/** «Buscar en Mercado Libre» (de fondo: tarda uno o dos minutos). */
export async function accionBuscarSeguimiento(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  const q = texto(fd, "q") ?? "";
  return deFondo(s, `seguimiento-buscar-${pid}`, "Búsqueda en Mercado Libre", async () => {
    const r = await buscarParaSeguir(s.org.id, pid, q);
    revalidatePath(`/catalogo/productos/${pid}`);
    return `Encontradas ${r.cantidad} publicaciones${r.costoUsd != null ? ` (costó US$ ${r.costoUsd.toFixed(2)})` : ""}.`;
  });
}

export async function accionSeguir(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(volver(pid), async () => {
    await seguirDeBusqueda(s.org.id, pid, texto(fd, "item") ?? "");
    revalidatePath(`/catalogo/productos/${pid}`);
    return "Agregada al seguimiento.";
  });
}

export async function accionSeguirPorNumero(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(volver(pid), async () => {
    const r = await seguirPorNumero(s.org.id, pid, texto(fd, "numeros") ?? "");
    revalidatePath(`/catalogo/productos/${pid}`);
    return `${r.nuevas} agregada${r.nuevas === 1 ? "" : "s"}${r.repetidas ? ` (${r.repetidas} ya estaba${r.repetidas === 1 ? "" : "n"})` : ""}. Se leen con «Leer ahora» o en la próxima vuelta.`;
  });
}

export async function accionDejarDeSeguir(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(volver(pid), async () => {
    await dejarDeSeguir(s.org.id, id(fd));
    revalidatePath(`/catalogo/productos/${pid}`);
    return "Ya no se sigue.";
  });
}

/** «Leer ahora»: las seguidas de este producto, sin esperar la vuelta (de fondo). */
export async function accionLeerSeguimiento(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  return deFondo(s, `seguimiento-leer-${pid}`, "Leer las publicaciones seguidas", async () => {
    const r = await leerSeguidas(s.org.id, { productoId: pid, todas: true });
    revalidatePath(`/catalogo/productos/${pid}`);
    return `Leídas: ${r.catalogo} de catálogo (gratis) y ${r.comunes} comunes.${r.sinPresupuesto ? ` ${r.sinPresupuesto} quedaron sin leer: se llegó al tope de gasto del mes.` : ""}`;
  });
}
