"use server";

// La pestaña «Seguimiento» de la ficha del producto (lib/seguimiento/).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, texto, id, numero } from "@/lib/erp/acciones";
import { deFondo, lanzarTarea } from "@/lib/tareas-fondo";
import { reanudarSeguida, descartar, buscarParaSeguir, seguirDeBusqueda, seguirPorNumero, dejarDeSeguir, leerSeguidas, listarCatalogo, cerrarCatalogo, excluirDeRegla, marcarInternacionales, confirmarSeguidas, ultimaBusqueda } from "@/lib/seguimiento";
import { analizarBusqueda } from "@/lib/seguimiento/auto";
import { guardarRegla, revisarRegla, aplicarPropuesta, descartarPropuesta } from "@/lib/seguimiento/regla";

const volver = (pid: number) => `/catalogo/productos/${pid}?seccion=seguimiento`;

/** «Buscar en Mercado Libre» (de fondo: tarda uno o dos minutos). */
export async function accionBuscarSeguimiento(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  const q = texto(fd, "q") ?? "";
  return deFondo(s, `seguimiento-buscar-${pid}`, "Búsqueda en Mercado Libre", async () => {
    const r = await buscarParaSeguir(s.org.id, pid, q);
    // La IA marca cuáles son el mismo producto (en una búsqueda a mano no sigue ninguna sola: se elige con «+ Seguir»).
    const b = await ultimaBusqueda(s.org.id, pid);
    const a = b ? await analizarBusqueda(s.org.id, pid, b.texto, b.resultados, { seguir: false }).catch(() => null) : null;
    revalidatePath(`/catalogo/productos/${pid}`);
    return `Encontradas ${r.cantidad} publicaciones${a ? `, ${a.comparables.length} comparables` : ""}${r.costoUsd != null ? ` (costó unos US$ ${r.costoUsd.toFixed(2).replace(".", ",")})` : ""}.`;
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
    // Las nuevas se leen ya y los catálogos pegados se abren en sus vendedores, de fondo (Fer, 11/10 y 12/10).
    if (r.ids.length || r.catalogos.length) {
      await lanzarTarea(s.org.id, s.usuario.id, `seguimiento-leer-${pid}`, "Leer lo agregado", async () => {
        const partes: string[] = [];
        for (const c of r.catalogos) partes.push(`catálogo ${c}: ${await listarCatalogo(s.org.id, pid, c)} vendedores para elegir`);
        if (r.ids.length) {
          const l = await leerSeguidas(s.org.id, { productoId: pid, todas: true, ids: r.ids });
          partes.push(`leídas ${l.catalogo} de catálogo y ${l.comunes} comunes${l.sinPresupuesto ? " (alguna quedó sin leer: tope de gasto del mes)" : ""}`);
        }
        revalidatePath(`/catalogo/productos/${pid}`);
        return `Listo: ${partes.join("; ")}.`;
      });
    }
    revalidatePath(`/catalogo/productos/${pid}`);
    const t: string[] = [];
    if (r.nuevas || r.repetidas) t.push(`${r.nuevas} agregada${r.nuevas === 1 ? "" : "s"}${r.repetidas ? ` (${r.repetidas} ya estaba${r.repetidas === 1 ? "" : "n"})` : ""}`);
    if (r.catalogos.length) t.push(`${r.catalogos.length === 1 ? "el catálogo" : `${r.catalogos.length} catálogos`} se está${r.catalogos.length === 1 ? "" : "n"} abriendo en sus vendedores`);
    return `${t.join("; ")}.${r.ids.length || r.catalogos.length ? " En un momento aparece todo." : ""}`;
  });
}

export async function accionCerrarCatalogo(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(volver(pid), async () => {
    await cerrarCatalogo(s.org.id, pid, texto(fd, "catalogo") ?? "");
    revalidatePath(`/catalogo/productos/${pid}`);
    return "Listo: se sacó la lista de ese catálogo (lo que seguís de ahí sigue igual).";
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
    // De paso, las internacionales de la búsqueda guardada (las de antes no traían el dato).
    await marcarInternacionales(s.org.id, pid).catch((e) => console.error("[seguimiento] internacionales", e));
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
      subir: fd.get("subir") === "1",
      techo: numero(fd, "techo"),
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

/** La casilla «Excluir de la regla» de cada publicación seguida: la sigue, pero no cuenta para la regla de precio. */
export async function accionExcluirDeRegla(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(volver(pid), async () => {
    const excluido = fd.get("valor") === "1";
    await excluirDeRegla(s.org.id, id(fd), excluido);
    // Con la referencia cambiada, la regla se vuelve a revisar con lo último leído.
    const r = await revisarRegla(s.org.id, pid, s.usuario.id);
    revalidatePath(`/catalogo/productos/${pid}`);
    return `${excluido ? "Excluida de la regla: se sigue, pero no cuenta para comparar." : "Vuelve a contar para la regla."} ${r}`;
  });
}

/** «Revisada»: una persona confirma (o no) una seguida que agregó sola la búsqueda de precio de mercado. */
export async function accionConfirmarSeguida(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(volver(pid), async () => {
    const confirmada = fd.get("valor") === "1";
    await confirmarSeguidas(s.org.id, pid, { ids: [id(fd)], confirmada, usuario: s.usuario.email });
    const r = await revisarRegla(s.org.id, pid, s.usuario.id);
    revalidatePath(`/catalogo/productos/${pid}`);
    return `${confirmada ? "Confirmada: cuenta como revisada por una persona." : "Vuelve a quedar sin confirmar."} ${r}`;
  });
}

/** «Confirmar todas»: todas las sin confirmar del producto. */
export async function accionConfirmarTodas(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  await intentar(volver(pid), async () => {
    const n = await confirmarSeguidas(s.org.id, pid, { confirmada: true, usuario: s.usuario.email });
    const r = await revisarRegla(s.org.id, pid, s.usuario.id);
    revalidatePath(`/catalogo/productos/${pid}`);
    return `Confirmada${n === 1 ? "" : "s"} ${n}. ${r}`;
  });
}

/** «Reanudar» una pausada que dejó de releerse sola (Fer, 22/10): vuelve a contar los meses desde hoy y la lee ya. */
export async function accionReanudarSeguida(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id"), sid = id(fd);
  return deFondo(s, `seguimiento-reanudar-${sid}`, "Reanudar el seguimiento", async () => {
    await reanudarSeguida(s.org.id, sid);
    const l = await leerSeguidas(s.org.id, { productoId: pid, todas: true, ids: [sid] });
    revalidatePath(`/catalogo/productos/${pid}`);
    return l.catalogo + l.comunes ? "Reanudada y leída." : l.sinPresupuesto ? "Reanudada; no se leyó porque se llegó al tope de gasto del mes." : "Reanudada; Mercado Libre no devolvió la publicación.";
  });
}

/** «Excluir» de la búsqueda (Fer, 22/10): no la quiero seguir nunca en este producto; no vuelve a aparecer. */
export async function accionDescartarEncontrada(fd: FormData) {
  const s = await entrarErp("productos_ver");
  const pid = id(fd, "producto_id");
  const si = fd.get("valor") === "1";
  await intentar(`${volver(pid)}${si ? "" : "&excluidas=1"}`, async () => {
    await descartar(s.org.id, pid, texto(fd, "item") ?? "", si, s.usuario.id);
    revalidatePath(`/catalogo/productos/${pid}`);
    return si ? "Excluida: no vuelve a aparecer en las búsquedas de este producto." : "Vuelve a aparecer en las búsquedas.";
  });
}
