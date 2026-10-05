"use server";

// Publicar en ML copiando una publicación parecida: preparar el lote (queda
// esperando el clic de Fer en la cola). Si ML lo rechaza, vuelve al formulario
// con el error y sin perder lo escrito.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { motivoErp } from "@/lib/erp/base";
import { texto, numero, entero, id } from "@/lib/erp/acciones";
import { prepararPublicacion } from "@/lib/mercadolibre/publicar-similar";
import { prepararPublicacionCatalogo } from "@/lib/mercadolibre/catalogo-similar";
import { prepararPublicacionNueva } from "@/lib/mercadolibre/publicar-nueva";

export type ResultadoPreparar = { error: string } | null;

/** Los campos "prefijo:ID" del formulario (atributos o garantía), como { ID: valor }. */
const conPrefijo = (fd: FormData, prefijo: string) => Object.fromEntries(
  [...fd.entries()].filter(([k, v]) => k.startsWith(prefijo) && typeof v === "string").map(([k, v]) => [k.slice(prefijo.length), String(v)]));

export async function accionPrepararPublicacion(_antes: ResultadoPreparar, fd: FormData): Promise<ResultadoPreparar> {
  const s = await entrarErp("publicaciones_ver");
  let destino: string;
  try {
    const itemId = texto(fd, "item") ?? "";
    if (!/^MLA\d+$/.test(itemId)) return { error: "Falta la publicación de modelo." };
    const r = await prepararPublicacion(s.org.id, {
      productoId: id(fd, "producto"), itemId, canal: id(fd, "canal"), variacion: id(fd, "variacion"),
      titulo: String(fd.get("titulo") ?? ""), precio: numero(fd, "precio"), cantidad: entero(fd, "cantidad"),
      tipo: texto(fd, "tipo") ?? "", condicion: texto(fd, "condicion") ?? "",
      fotos: fd.getAll("foto").map(String), atributos: conPrefijo(fd, "attr:"), garantia: conPrefijo(fd, "term:"),
      descripcion: String(fd.get("descripcion") ?? ""),
    }, s.usuario.id);
    revalidatePath("/config/canales/cola");
    const avisos = r.avisos ? ` Mercado Libre dejó avisos (no frenan; los resuelve al crearla): ${r.avisos}` : "";
    destino = `/config/canales/cola?ver=lotes&lote=${r.loteId}&ok=${encodeURIComponent(`Publicación preparada. Todavía no salió nada: revisala y apretá "Mandar a Mercado Libre".${avisos}`)}`;
  } catch (e) {
    return { error: motivoErp(e) };
  }
  redirect(destino);
}

/** Publicar en el catálogo de ML: preparar el lote (queda esperando el clic). */
export async function accionPrepararCatalogo(_antes: ResultadoPreparar, fd: FormData): Promise<ResultadoPreparar> {
  const s = await entrarErp("publicaciones_ver");
  let destino: string;
  try {
    const catalogoId = texto(fd, "catalogo") ?? "";
    if (!/^MLA\d+$/.test(catalogoId)) return { error: "Falta el producto de catálogo." };
    const r = await prepararPublicacionCatalogo(s.org.id, {
      productoId: id(fd, "producto"), catalogoId, canal: id(fd, "canal"), variacion: id(fd, "variacion"),
      precio: numero(fd, "precio"), cantidad: entero(fd, "cantidad"), tipo: texto(fd, "tipo") ?? "",
      garantiaTipo: texto(fd, "garantia_tipo") ?? "", garantiaTiempo: texto(fd, "garantia_tiempo") ?? "",
    }, s.usuario.id);
    revalidatePath("/config/canales/cola");
    const avisos = r.avisos ? ` Mercado Libre dejó avisos (no frenan; los resuelve al crearla): ${r.avisos}` : "";
    destino = `/config/canales/cola?ver=lotes&lote=${r.loteId}&ok=${encodeURIComponent(`Publicación en el catálogo preparada. Todavía no salió nada: revisala y apretá "Mandar a Mercado Libre".${avisos}`)}`;
  } catch (e) {
    return { error: motivoErp(e) };
  }
  redirect(destino);
}

/** Publicación nueva desde los datos de Laucen, en una o varias cuentas a la vez: preparar el
 *  lote (queda esperando el clic). Cada cuenta elegida manda su título, su precio y sus fotos
 *  ("titulo:<canal>", "precio:<canal>", "foto:<canal>"). */
export async function accionPrepararNueva(_antes: ResultadoPreparar, fd: FormData): Promise<ResultadoPreparar> {
  const s = await entrarErp("publicaciones_ver");
  let destino: string;
  try {
    const canales = [...new Set(fd.getAll("cuenta").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    const r = await prepararPublicacionNueva(s.org.id, {
      productoId: id(fd, "producto"), categoria: texto(fd, "categoria") ?? "", variacion: id(fd, "variacion"),
      cantidad: entero(fd, "cantidad"), tipo: texto(fd, "tipo") ?? "", condicion: texto(fd, "condicion") ?? "",
      atributos: conPrefijo(fd, "attr:"), garantiaTipo: texto(fd, "garantia_tipo") ?? "", garantiaTiempo: texto(fd, "garantia_tiempo") ?? "",
      descripcion: String(fd.get("descripcion") ?? ""),
      cuentas: canales.map((c) => ({ canal: c, titulo: String(fd.get(`titulo:${c}`) ?? ""), precio: numero(fd, `precio:${c}`), fotos: fd.getAll(`foto:${c}`).map(String) })),
    }, s.usuario.id);
    revalidatePath("/config/canales/cola");
    const rech = r.rechazadas.length ? ` No entraron: ${r.rechazadas.map((x) => `${x.cuenta} (${x.motivo})`).join("; ")}.` : "";
    const avisos = r.avisos.length ? ` Mercado Libre dejó avisos (no frenan; los resuelve al crearlas): ${r.avisos.join("; ")}` : "";
    destino = `/config/canales/cola?ver=lotes&lote=${r.loteId}&ok=${encodeURIComponent(`Preparadas ${r.preparadas.length} publicaciones nuevas (${r.preparadas.join(", ")}). Todavía no salió nada: revisalas y apretá "Mandar a Mercado Libre".${rech}${avisos}`)}`;
  } catch (e) {
    return { error: motivoErp(e) };
  }
  redirect(destino);
}
