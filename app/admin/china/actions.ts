"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { meliPruebas } from "@/db/meli";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { correrActor, type ResultadoActor } from "@/lib/apify";
import { esFalla, traducir } from "@/lib/china/traducir";
import { guardarFoto, probarLink } from "@/lib/china/fotos";
import { ACTORES, MAX, actorLibre, urlBusqueda, type Actor } from "./config";

const CORRIENDO = { estado: "corriendo" };

export type PruebaChina = {
  texto: string;
  en: string;
  zh: string;
  traducidoPor: "claude" | "a mano" | null;
  imagen: string;
  corridas: (ResultadoActor & { plataforma: string; tipo: string; busqueda: string; titulos_es?: string[] })[];
};

function volver(p: Record<string, string>): never {
  const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v));
  redirect(`/admin/china${q.size ? `?${q}` : ""}`);
}

/** La foto del formulario: el archivo subido (se guarda y da un link) o, si
 *  no hay archivo, el link pegado. Mercado Libre da cada foto también en
 *  .jpg; los buscadores por foto de China no siempre aceptan .webp. */
async function fotoDelFormulario(formData: FormData, organizacionId: string): Promise<{ link: string; motivo?: string }> {
  const archivo = formData.get("archivo");
  if (archivo instanceof File && archivo.size > 0) {
    const r = await guardarFoto(organizacionId, archivo);
    return "link" in r ? { link: r.link } : { link: "", motivo: r.motivo };
  }
  const link = String(formData.get("imagen") ?? "").trim().replace(/^(https?:\/\/[^/]*mlstatic\.com\/.+)\.webp$/i, "$1.jpg");
  return { link };
}

/** "Probar la foto": no busca ni gasta. Guarda la foto si es un archivo,
 *  prueba desde el servidor que el link se pueda bajar y vuelve a mostrarla. */
export async function accionProbarFoto(formData: FormData) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const texto = String(formData.get("texto") ?? "").trim();
  const en = String(formData.get("en") ?? "").trim();
  const zh = String(formData.get("zh") ?? "").trim();
  const foto = await fotoDelFormulario(formData, sesion.org.id);
  const prueba = foto.link ? await probarLink(foto.link) : { ok: false, detalle: foto.motivo ?? "no llegó ningún link ni archivo" };
  volver({ texto, en, zh, imagen: foto.link, fotook: prueba.ok ? "1" : "0", fotodet: prueba.detalle });
}

/** "Traducir con Claude": sólo traduce y vuelve con los campos llenos, para
 *  poder corregir la traducción antes de gastar en Apify. */
export async function accionTraducir(formData: FormData) {
  if (!(await sosVos())) redirect("/panel");
  const texto = String(formData.get("texto") ?? "").trim();
  const imagen = String(formData.get("imagen") ?? "").trim();
  const sesion = await sesionRequerida();
  const r = texto ? await traducir(texto) : null;
  const falla = esFalla(r) ? r : null;
  const t = esFalla(r) ? null : r;
  // El detalle técnico queda guardado (no se muestra): para que Code lo lea.
  if (falla) {
    await db.insert(meliPruebas).values({ organizacionId: sesion.org.id, consulta: "china traducción: falló", resultados: falla });
  }
  volver({ texto, imagen, en: t?.en ?? "", zh: t?.zh ?? "", tr: t ? "ok" : texto ? "fallo" : "", motivo: falla?.motivo ?? "" });
}

/** Corre los actores elegidos. Sólo con el botón; si hay una corrida de
 *  China en curso de hace menos de 5 minutos, manda a verla. */
export async function accionCorrerChina(formData: FormData) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const texto = String(formData.get("texto") ?? "").trim();
  let en = String(formData.get("en") ?? "").trim();
  let zh = String(formData.get("zh") ?? "").trim();
  const imagen = (await fotoDelFormulario(formData, sesion.org.id)).link;
  const ids = formData.getAll("actor").map(String);
  const elegidos: Actor[] = ACTORES.filter((a) => ids.includes(a.id));
  const libre = actorLibre(String(formData.get("otro") ?? ""));
  if (libre && !elegidos.some((a) => a.id === libre.id)) elegidos.push(libre);
  if ((!texto && !en && !zh && !imagen) || !elegidos.length) volver({ texto, en, zh, imagen });

  const [enCurso] = await db.select({ id: meliPruebas.id }).from(meliPruebas).where(and(
    eq(meliPruebas.organizacionId, sesion.org.id),
    like(meliPruebas.consulta, "china:%"),
    sql`${meliPruebas.resultados} = ${JSON.stringify(CORRIENDO)}::jsonb`,
    gt(meliPruebas.ts, sql`now() - interval '5 minutes'`),
  )).limit(1);
  if (enCurso) volver({ prueba: String(enCurso.id) });

  let traducidoPor: PruebaChina["traducidoPor"] = en || zh ? "a mano" : null;
  if (texto && (!en || !zh)) {
    const t = await traducir(texto);
    if (t && !esFalla(t)) {
      en ||= t.en;
      zh ||= t.zh;
      traducidoPor = traducidoPor ?? "claude";
    }
  }

  const [fila] = await db.insert(meliPruebas)
    .values({ organizacionId: sesion.org.id, consulta: `china: ${texto || en || zh || imagen}`, resultados: CORRIENDO })
    .returning({ id: meliPruebas.id });

  const corridas = await Promise.all(elegidos.map(async (a) => {
    const actor = a.id.replace("/", "~");
    if (a.tipo === "imagen") {
      if (!imagen) return { actor: a.id, ok: false, error: "Falta la URL de la foto", plataforma: a.plataforma, tipo: a.tipo, busqueda: "" };
      const r = await correrActor(actor, "", MAX, 240, { imagen, plataforma: a.plataforma });
      return { ...r, actor: a.id, plataforma: a.plataforma, tipo: a.tipo, busqueda: imagen };
    }
    const q = a.plataforma === "1688" ? zh || en || texto : en || texto;
    if (!q) return { actor: a.id, ok: false, error: "Falta el texto a buscar", plataforma: a.plataforma, tipo: a.tipo, busqueda: "" };
    const r = await correrActor(actor, q, MAX, 240, { plataforma: a.plataforma, urlBusqueda: urlBusqueda(a.plataforma, q) });
    return { ...r, actor: a.id, plataforma: a.plataforma, tipo: a.tipo, busqueda: q };
  }));

  const resultados: PruebaChina = { texto, en, zh, traducidoPor, imagen, corridas };
  await db.update(meliPruebas).set({ resultados }).where(eq(meliPruebas.id, fila.id));
  volver({ prueba: String(fila.id) });
}
