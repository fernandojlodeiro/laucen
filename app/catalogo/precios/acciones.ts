"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, entero, numero, id } from "@/lib/erp/acciones";
import { guardarPrecio, precioMasivoPorPorcentaje } from "@/lib/precios";
import { esMoneda } from "@/lib/moneda";

const BASE = "/catalogo/precios";

/** A dónde volver: la dirección que manda el formulario (lista, búsqueda,
 *  página), siempre dentro de esta pantalla. */
function volverDe(fd: FormData) {
  const v = texto(fd, "volver");
  return v && (v === BASE || v.startsWith(`${BASE}?`)) ? v : BASE;
}

const moneda = (fd: FormData, k = "moneda") => {
  const m = fd.get(k);
  return esMoneda(m) ? m : "ARS";
};

// ── Listas ────────────────────────────────────────────────

export async function accionCrearLista(fd: FormData) {
  const s = await entrarErp("precios_ver");
  await intentar(volverDe(fd), async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("La lista necesita un nombre.");
    const [l] = await consulta<{ id: number }>(
      "insert into lista_precios (organizacion_id, nombre, moneda_base, orden) values ($1, $2, $3, $4) returning id::int",
      [s.org.id, nombre, moneda(fd), entero(fd, "orden") ?? 0]);
    revalidatePath(BASE);
    return { ir: `${BASE}?lista=${l.id}&ok=${encodeURIComponent("Lista creada.")}` };
  });
}

export async function accionGuardarLista(fd: FormData) {
  const s = await entrarErp("precios_ver");
  await intentar(volverDe(fd), async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("La lista necesita un nombre.");
    await consulta(`update lista_precios set nombre = $3, moneda_base = $4, orden = $5, estado = $6
                     where id = $2 and organizacion_id = $1`,
      [s.org.id, id(fd), nombre, moneda(fd), entero(fd, "orden") ?? 0, fd.get("estado") === "archivada" ? "archivada" : "activa"]);
    revalidatePath(BASE);
    return "Guardado.";
  });
}

export async function accionBorrarLista(fd: FormData) {
  const s = await entrarErp("precios_ver");
  await intentar(BASE, async () => {
    // Los precios de la lista se van con ella (cascade); los canales y
    // clientes que la usaban quedan sin lista.
    await consulta("delete from lista_precios where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    revalidatePath(BASE);
    return "Lista borrada, con sus precios.";
  });
}

// ── Precios ───────────────────────────────────────────────

export async function accionGuardarPrecio(fd: FormData) {
  const s = await entrarErp("precios_ver");
  await intentar(volverDe(fd), async () => {
    const importe = numero(fd, "importe");
    if (importe == null) throw new ErrorErp("Falta el precio.");
    await guardarPrecio(s.org.id, {
      listaId: id(fd, "lista"), variacionId: id(fd, "variacion"), importe, moneda: moneda(fd), usuarioId: s.usuario.id,
    });
    revalidatePath(BASE);
    return "Precio guardado (rige desde hoy).";
  });
}

/** "Mayorista = Web − 25 %": carga desde hoy los precios de la lista destino. */
export async function accionMasivo(fd: FormData) {
  const s = await entrarErp("precios_ver");
  await intentar(volverDe(fd), async () => {
    const pct = numero(fd, "porcentaje");
    if (pct == null) throw new ErrorErp("Falta el porcentaje.");
    const n = await precioMasivoPorPorcentaje(s.org.id, {
      listaDestinoId: id(fd, "destino"), listaOrigenId: id(fd, "origen"), porcentaje: pct,
      redondeo: entero(fd, "redondeo") ?? undefined, usuarioId: s.usuario.id,
    });
    revalidatePath(BASE);
    return { ir: `${BASE}?lista=${id(fd, "destino")}&ok=${encodeURIComponent(n ? `Listo: se cargaron ${n} precios.` : "La lista de origen no tiene precios: no se cargó nada.")}` };
  });
}
