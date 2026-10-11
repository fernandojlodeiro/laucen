"use server";

// La pestaña «Seguimiento» de la ficha del producto (lib/seguimiento/).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, texto, id, numero } from "@/lib/erp/acciones";
import { deFondo, lanzarTarea } from "@/lib/tareas-fondo";
import { buscarParaSeguir, seguirDeBusqueda, seguirPorNumero, dejarDeSeguir, leerSeguidas } from "@/lib/seguimiento";
import { guardarRegla, revisarRegla, aplicarPropuesta, descartarPropuesta } from "@/lib/seguimiento/regla";

const volver = (pid: number) => `/catalogo/productos/${pid}?seccion=seguimiento`;

/** «Buscar en Mercado Libre» (de fondo: tarda uno o dos minutos). */
export async function accionBuscarSeguimiento(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  const q = texto(fd, "q") ?? "";
  return deFondo(s, `seguimiento-buscar-${pid}`, "Búsqueda en Mercado Libre", async () => {
    const r = await buscarParaSeguir(s.org.id, pid, q);
    revalidatePath(`/catalogo/productos/${pid}`);
    return `Encontradas ${r.cantidad} publicaciones${r.costoUsd != null ? ` (costó unos US$ ${r.costoUsd.toFixed(2).replace(".", ",")})` : ""}.`;
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
    // Las nuevas se leen ya, de fondo (Fer, 11/10): al terminar aparecen con sus datos.
    if (r.ids.length) {
      await lanzarTarea(s.org.id, s.usuario.id, `seguimiento-leer-${pid}`, "Leer las publicaciones agregadas", async () => {
        const l = await leerSeguidas(s.org.id, { productoId: pid, todas: true, ids: r.ids });
        revalidatePath(`/catalogo/productos/${pid}`);
        return `Leídas las agregadas: ${l.catalogo} de catálogo y ${l.comunes} comunes.${l.sinPresupuesto ? " Alguna quedó sin leer: se llegó al tope de gasto del mes." : ""}`;
      });
    }
    revalidatePath(`/catalogo/productos/${pid}`);
    return `${r.nuevas} agregada${r.nuevas === 1 ? "" : "s"}${r.repetidas ? ` (${r.repetidas} ya estaba${r.repetidas === 1 ? "" : "n"})` : ""}.${r.nuevas ? " Se están leyendo: en un minuto aparecen con sus datos." : ""}`;
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

// ── La regla de precio (lib/seguimiento/regla.ts) ──

/** «Grabar» de la caja «Regla de precio». Al grabarla prendida, se revisa enseguida con lo último leído. */
export async function accionGuardarRegla(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(volver(pid), async () => {
    const modo = texto(fd, "modo");
    const como = texto(fd, "como");
    const contra = texto(fd, "contra") ?? "mas_barato";
    await guardarRegla(s.org.id, pid, {
      modo: modo === "propuesta" || modo === "automatico" ? modo : "apagada",
      contra: contra === "mas_barato" ? "mas_barato" : "una",
      seguimientoId: contra === "mas_barato" ? null : Number(contra) || null,
      como: como === "igual" || como === "pct" ? como : "pesos",
      diferencia: numero(fd, "diferencia") ?? 0,
      piso: numero(fd, "piso"),
    });
    const r = await revisarRegla(s.org.id, pid, s.usuario.id);
    revalidatePath(`/catalogo/productos/${pid}`);
    return `Regla grabada. ${r}`;
  });
}

/** «Revisar ahora»: con lo último leído, sin volver a leer. */
export async function accionRevisarRegla(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(volver(pid), async () => {
    const r = await revisarRegla(s.org.id, pid, s.usuario.id);
    revalidatePath(`/catalogo/productos/${pid}`);
    return r;
  });
}

export async function accionAplicarPropuesta(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(volver(pid), async () => {
    const n = await aplicarPropuesta(s.org.id, pid, s.usuario.id);
    revalidatePath(`/catalogo/productos/${pid}`);
    return `Listo: se cambió la lista Clásicas (${n} variaci${n === 1 ? "ón" : "ones"}). Desde ahí, el esquema de precios lo lleva a todas las cuentas y planes.`;
  });
}

export async function accionDescartarPropuesta(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(volver(pid), async () => {
    await descartarPropuesta(s.org.id, pid, s.usuario.id);
    revalidatePath(`/catalogo/productos/${pid}`);
    return "Propuesta descartada: la lista queda como estaba.";
  });
}
